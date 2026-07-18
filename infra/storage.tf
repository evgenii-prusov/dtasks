# Offsite backup storage: one private Object Storage bucket shared by all
# personal projects (dtasks and others), each syncing into its own top-level
# prefix (e.g. backups/dtasks/..., backups/otherproj/...). Stays within the
# Always Free allowance (20 GiB total Object Storage, 50k API requests/month).
# Design and runbook: docs/backup-storage.md.

data "oci_objectstorage_namespace" "ns" {
  compartment_id = var.compartment_ocid
}

resource "oci_objectstorage_bucket" "backups" {
  compartment_id = var.compartment_ocid
  namespace      = data.oci_objectstorage_namespace.ns.namespace
  name           = var.backup_bucket_name
  access_type    = "NoPublicAccess"

  # Standard tier only: Archive/Infrequent Access have restore latency and
  # minimum-retention charges, and everything fits in the free 20 GiB anyway.
  storage_tier = "Standard"
  auto_tiering = "Disabled"

  # Versioning is the safety net against a bad sync: `rclone sync` mirrors
  # deletions, so without it a wiped source dir (or a bug) could silently
  # destroy the offsite copy too. Overwritten/deleted objects become
  # "previous versions", purged after 30 days by the lifecycle rule below.
  versioning = "Enabled"
}

# Lifecycle rules need the Object Storage *service* itself to be authorized
# in the compartment -- without this policy the rules are accepted but the
# service gets permission errors when it tries to act on them.
resource "oci_identity_policy" "objectstorage_lifecycle" {
  compartment_id = var.compartment_ocid
  name           = "objectstorage-lifecycle"
  description    = "Let the Object Storage service execute lifecycle policies (version purge, multipart abort)"
  statements = [
    "Allow service objectstorage-${var.region} to manage object-family in compartment id ${var.compartment_ocid}",
  ]
}

resource "oci_objectstorage_object_lifecycle_policy" "backups" {
  namespace = data.oci_objectstorage_namespace.ns.namespace
  bucket    = oci_objectstorage_bucket.backups.name

  # 30 days to notice and recover from an accidental deletion/overwrite;
  # after that, previous versions are purged so they don't slowly eat the
  # 20 GiB free allowance.
  rules {
    name        = "purge-old-previous-versions"
    action      = "DELETE"
    target      = "previous-object-versions"
    is_enabled  = true
    time_amount = 30
    time_unit   = "DAYS"
  }

  # Interrupted uploads leave invisible parts that still count against
  # storage; abandon anything that hasn't completed within a week.
  rules {
    name        = "abort-stale-multipart-uploads"
    action      = "ABORT"
    target      = "multipart-uploads"
    is_enabled  = true
    time_amount = 7
    time_unit   = "DAYS"
  }

  depends_on = [oci_identity_policy.objectstorage_lifecycle]
}

# Instance-principal auth: the VM proves its identity to OCI by being the VM,
# so rclone on it needs no stored credentials at all. Dynamic groups are
# tenancy-level resources; var.compartment_ocid works here because on a
# personal tenancy it *is* the tenancy OCID (see variables.tf).
resource "oci_identity_dynamic_group" "backup_writers" {
  compartment_id = var.compartment_ocid
  name           = "backup-writers"
  description    = "Instances allowed to read/write the shared backups bucket"
  matching_rule  = "Any {instance.id = '${oci_core_instance.vm.id}'}"
}

resource "oci_identity_policy" "backup_writers" {
  compartment_id = var.compartment_ocid
  name           = "backup-writers"
  description    = "Backup writers may manage objects (and read bucket metadata) in the backups bucket only"
  statements = [
    "Allow dynamic-group ${oci_identity_dynamic_group.backup_writers.name} to read buckets in compartment id ${var.compartment_ocid} where target.bucket.name='${oci_objectstorage_bucket.backups.name}'",
    "Allow dynamic-group ${oci_identity_dynamic_group.backup_writers.name} to manage objects in compartment id ${var.compartment_ocid} where target.bucket.name='${oci_objectstorage_bucket.backups.name}'",
  ]
}
