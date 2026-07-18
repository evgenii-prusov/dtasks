# Offsite backup storage (OCI Object Storage)

One private Object Storage bucket, shared by all personal projects, holding
mirrored copies of each project's local backups. Provisioned by Terraform in
`infra/storage.tf`; synced by `scripts/backup_sync.sh` (rclone).

Why it exists: local backups (e.g. `scripts/backup_db.py`'s GFS-pruned
snapshots on the dtasks VM) live on the same boot volume as the database.
`terraform destroy`, a lost instance, or a fat-fingered `rm` loses both the
data and every backup of it. This bucket is the copy that survives that.

## Design

**One bucket, per-project prefixes.** Bucket `backups` (name is
per-namespace, not global), with each project syncing into its own top-level
prefix:

```
backups/
  dtasks/db_backups/jedi_tracker.20260718_030000.sqlite
  otherproj/dumps/...
```

**Retention is owned locally, not in the bucket.** Each project prunes its
own local backup directory however it likes (dtasks: GFS in
`backup_db.py`); the sync just mirrors the result. One retention policy per
project, defined next to the thing being backed up, and what you see in the
bucket is exactly what you'd see on disk.

**Versioning is the deletion safety net.** Because `rclone sync` mirrors
deletions, a corrupted or emptied source directory would otherwise propagate
to the offsite copy. Two guards:

- `backup_sync.sh` refuses empty/missing sources and caps deletions per run
  (`--max-delete`, default 10).
- The bucket keeps overwritten/deleted objects as *previous versions* for
  30 days (lifecycle rule in `infra/storage.tf`), so even a bad sync that
  slips through is recoverable for a month.

**Standard tier only, no auto-tiering.** Archive/Infrequent Access add
restore latency and minimum-retention billing for at most a few cents of
theoretical savings — everything here fits in the free allowance anyway.

**Auth: no stored credentials on the VM.** The dtasks VM is in a dynamic
group with a policy scoped to exactly this bucket (`manage objects` + `read
buckets`, nothing else), so rclone authenticates by *being that VM*
(instance principal). Machines outside OCI (laptop, other projects' hosts)
use a long-lived API key profile — see setup below.

**Free-tier budget.** Always Free includes 20 GiB of Object Storage (total,
across all tiers) and 50,000 API requests/month. A daily sync of a few dozen
files uses a few hundred requests/day — nowhere near the cap. The script
prints bucket usage after every run and warns at 16 GiB; if that fires,
tighten some project's local retention.

## Provisioning (one-time)

The bucket, lifecycle rules, dynamic group, and IAM policies are part of the
existing Terraform:

```sh
oci session authenticate --profile-name dtasks   # if the session expired
cd infra
terraform plan    # expect: bucket, lifecycle policy, dynamic group, 2 IAM policies
terraform apply
terraform output backup_bucket backup_namespace
```

Note `backup_namespace` — every rclone remote config below needs it.

## VM setup (dtasks)

```sh
sudo apt-get install -y rclone
```

Create `~/.config/rclone/rclone.conf` for whichever user runs the backup
job (no keys — instance principal):

```ini
[ocibackup]
type = oracleobjectstorage
provider = instance_principal_auth
namespace = <backup_namespace output>
compartment = <compartment_ocid, same value as infra/terraform.tfvars>
region = <region, e.g. eu-frankfurt-1>
```

Smoke test, then first sync:

```sh
rclone lsd ocibackup:backups          # should list (or show empty) without auth errors
scripts/backup_sync.sh /path/to/db_backups dtasks/db_backups
```

Schedule it right after the local backup, in the same unit, so the offsite
copy can never silently drift from the local one (extends the systemd
example in `scripts/backup_db.py`'s docstring — a oneshot service runs its
`ExecStart` lines in order and stops at the first failure):

```ini
# dtasks-backup.service
[Service]
Type=oneshot
WorkingDirectory=/path/to/dtasks
ExecStart=/path/to/venv/bin/python scripts/backup_db.py
ExecStart=/path/to/dtasks/scripts/backup_sync.sh /path/to/db_backups dtasks/db_backups
```

In the Docker deployment (`docs/deploy.md`), `backup_db.py` runs *inside*
the container against the `/data` volume; run `backup_sync.sh` on the
**host** against that volume's backup directory — rclone and the instance
principal live on the host, not in the app image.

## Other machines / other projects

Instance principals only exist on OCI compute. Everywhere else, rclone needs
an API key (session tokens from `oci session authenticate` expire in ~1 h,
so they're unusable for cron):

1. OCI Console → Profile → **My profile** → **API keys** → *Add API key* →
   generate and download the key pair.
2. Paste the console's config snippet into `~/.oci/config` as a profile
   (say `[backup]`), fix `key_file=` to the downloaded key's path, and
   `chmod 600` both files.
3. Same rclone remote as above, but:

```ini
[ocibackup]
type = oracleobjectstorage
provider = user_principal_auth
config_file = ~/.oci/config
config_profile = backup
namespace = <backup_namespace output>
compartment = <compartment_ocid>
region = <region>
```

The API key authenticates as *you*, so it isn't restricted to the bucket
the way the VM is. Fine for a personal tenancy; keep the private key file
out of repos and dotfile syncs.

Onboarding a new project is then just: copy `scripts/backup_sync.sh` (it
has no dtasks dependencies), and schedule
`backup_sync.sh <its-backup-dir> <project>/<dataset>` after its local
backup job.

## Restore

List and pull whatever you need:

```sh
rclone lsf ocibackup:backups/dtasks/db_backups/
rclone copy ocibackup:backups/dtasks/db_backups/jedi_tracker.20260718_030000.sqlite /tmp/restore/
```

Then follow the normal restore path for the project (for dtasks:
`docs/deploy.md`, stop the app, swap the SQLite file, start).

**Deleted or overwritten within the last 30 days** (rclone can't list OCI
object versions; use the OCI CLI or the console's "Show Deleted Objects"
toggle):

```sh
oci os object list-object-versions -bn backups --prefix dtasks/ --profile backup
oci os object get -bn backups --name dtasks/db_backups/<file> --version-id <id> --file restored.sqlite --profile backup
```

## Verification

`backup_sync.sh` already fails loudly (non-zero exit, which makes the
systemd unit fail) on auth errors, the empty-source guard, or a tripped
`--max-delete`. Two checks worth doing by hand:

```sh
# After any config change: full checksum comparison of local vs bucket
rclone check /path/to/db_backups ocibackup:backups/dtasks/db_backups --checksum

# Quarterly restore drill: pull the latest backup and actually open it
rclone copy ocibackup:backups/dtasks/db_backups/<latest> /tmp/drill/
sqlite3 /tmp/drill/<latest> "PRAGMA integrity_check; SELECT count(*) FROM sqlite_master;"
```

A backup you've never restored is a hope, not a backup.

## Failure modes

- **`--max-delete` exceeded (rclone exit 7)**: more than `BACKUP_MAX_DELETE`
  remote files would be deleted. Usually a half-emptied source dir. Verify
  the local directory is healthy; if the deletions are legitimate (e.g. you
  manually purged old local backups), re-run once with a higher
  `BACKUP_MAX_DELETE`.
- **Instance-principal auth errors on the VM**: the dynamic group matches on
  the instance OCID, so a destroyed-and-recreated VM gets a new OCID and
  falls out of the group. `terraform apply` refreshes the matching rule;
  IAM changes can take a few minutes to propagate.
- **Usage warning fired (≥ 16 GiB)**: tighten the noisiest project's local
  retention (for dtasks: the constants at the top of `backup_db.py`) — the
  next sync mirrors the smaller set. Previous versions from the resulting
  deletions age out after 30 days, so usage dips ~a month later.
