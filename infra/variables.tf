variable "oci_profile" {
  description = "Profile name created by `oci session authenticate` (see ~/.oci/config)"
  type        = string
  default     = "dtasks"
}

variable "region" {
  description = "OCI region, e.g. us-ashburn-1"
  type        = string
}

variable "compartment_ocid" {
  description = "Compartment to create resources in. For a personal tenancy with no sub-compartments, this is your tenancy OCID (the `tenancy=` line under your profile in ~/.oci/config)."
  type        = string
}

variable "ssh_public_key_path" {
  description = "Public key installed on the VM for SSH"
  type        = string
  default     = "~/.ssh/id_ed25519.pub"
}

variable "instance_name" {
  description = "Used as the display-name / dns-label prefix for every resource"
  type        = string
  default     = "dtasks-vm"
}

variable "ocpus" {
  description = "Always Free Ampere A1 Flex allocation as of the June 2026 cap (dtask-y23.3): 2 OCPU / 12GB stays $0 even on PAYG billing."
  type        = number
  default     = 2
}

variable "memory_gbs" {
  type    = number
  default = 12
}

variable "availability_domain_index" {
  description = "Index (0-based) into the region's availability domain list. Most regions have only one AD; a few (e.g. us-ashburn-1) have three. If `terraform apply` fails with an out-of-capacity error and your region has more than one AD, override this to retry against a different one."
  type        = number
  default     = 0
}

variable "backup_bucket_name" {
  description = "Object Storage bucket holding offsite backups for all projects (see docs/backup-storage.md). Bucket names are unique per namespace, not globally, so a short name is fine."
  type        = string
  default     = "backups"
}

variable "allow_ssh_cidr" {
  description = "CIDR allowed to reach SSH (port 22). Tighten to \"<your-ip>/32\" if desired -- see docs/provision-vm.md for the tradeoff."
  type        = string
  default     = "0.0.0.0/0"
}
