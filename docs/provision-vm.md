# Provisioning the VM

`docs/deploy.md` starts from "you already have a VM with Docker installed and
ports open." This doc covers the step before that: creating the Oracle Cloud
VM itself, reproducibly, via Terraform in `infra/`.

**This config has been `terraform validate`-checked against the real
`oracle/oci` provider schema (every argument/attribute name below is
confirmed correct), but never actually applied against a live account.**
Treat the first `terraform apply` as the real test.

## Prerequisites (one-time, local machine)

```sh
brew install terraform
```

(`oci` CLI is not required for the Terraform workflow itself, but the auth
bootstrap below uses it.)

## One-time auth bootstrap

The `oci` provider block in `infra/providers.tf` authenticates as a
**session-token profile** (browser SSO login) rather than a long-lived API
key, so there's no console "generate API key, upload public key" step:

```sh
brew install oci-cli   # one-off, just for this bootstrap command
oci session authenticate --profile-name dtasks
```

This opens a browser, you log in, and it writes a profile named `dtasks` to
`~/.oci/config` with your tenancy OCID, region, and a session token (default
lifetime ~1 hour — Terraform will fail with an auth error if it expires
mid-`apply`; re-run this command or `oci session refresh --profile dtasks`).

Grab your tenancy OCID for `terraform.tfvars` in the next step:

```sh
grep tenancy ~/.oci/config
```

For a personal tenancy with no sub-compartments, the tenancy OCID *is* your
root compartment OCID — that's what `compartment_ocid` should be.

## Configure

```sh
cd infra
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars: compartment_ocid, region
```

`terraform.tfvars` is gitignored — it's account-specific, not shared config.

## Provision

```sh
terraform init     # first time only, or after changing required_providers
terraform plan      # review what it's about to create
terraform apply
```

What it creates: a VCN with a public subnet, an internet gateway and default
route, a security list allowing inbound 22/80/443, a `VM.Standard.A1.Flex`
instance (2 OCPU / 12GB by default — the Always Free allocation per
dtask-y23.3, so it stays $0 even under PAYG billing) running Ubuntu 24.04
with Docker installed via `cloud-init.yaml`, and a **reserved** (static)
public IP attached to it.

State lives in `infra/terraform.tfstate` (gitignored — this is a solo hobby
project with one operator, so local state is fine; no remote backend). If
`apply` fails partway — most commonly "out of host capacity" on the instance,
which is a well-known Always Free / A1 Flex thing and not a config bug —
just re-run `terraform apply`. Terraform's plan/apply model means already-
created resources are left alone; only what's missing or changed gets
touched.

On success:

```sh
terraform output public_ip
terraform output ssh_command
```

## Verify

```sh
$(terraform output -raw ssh_command)
cloud-init status --wait   # blocks until first-boot provisioning finishes
docker version             # confirm Engine + Compose plugin are present
sudo iptables -L INPUT -n --line-numbers   # confirm 80/443 ACCEPT rules made it in
```

If `iptables` doesn't show the 80/443 rules (cloud-init failed partway, or
Oracle's image structured its default chain differently than expected),
add them manually and persist:

```sh
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

## Next step

Point your domain's DNS `A`/`AAAA` record at `terraform output public_ip`,
then follow `docs/deploy.md` starting at "First deploy". The security-list
and OS-firewall prerequisites it lists are already satisfied by this config.

## Recreating or tearing down

```sh
terraform destroy   # asks for confirmation; deletes instance + network + reserved IP
terraform apply     # creates everything fresh, same config
```

`terraform destroy` deletes the instance's boot volume along with it, which
deletes the database. Take a backup per `docs/deploy.md`'s Backup section
first if you care about the data — this is a hobby-beta setup, there's no
snapshot safety net beyond what you manually copy off the VM.

## Known rough edges

- **A1 Flex capacity**: most regions (including `eu-frankfurt-1`) have only
  one availability domain, so there's no in-region AD to retry against on a
  capacity error — just re-run `terraform apply` later. A handful of regions
  (`us-ashburn-1`, `us-phoenix-1`, others) have three; in those, override
  `-var availability_domain_index=1` (or `2`) to try a different one.
- **Session expiry mid-apply**: a session token profile is only good for
  about an hour. If a step fails with an auth error, `oci session refresh
  --profile dtasks` and re-run `terraform apply` — it'll pick up where the
  state file says it left off.
- **Local state, single operator**: `terraform.tfstate` is gitignored and
  lives only on whichever machine ran `apply`. Fine for one person; if that
  ever changes, move to a remote backend (e.g. an OCI Object Storage bucket)
  before a second person runs Terraform against the same infra.
