# Session-token auth: reads the profile written by `oci session authenticate`
# in ~/.oci/config, so there's no long-lived API key to generate or store.
# The token is short-lived (~1h) -- re-run `oci session authenticate` (or
# `oci session refresh --profile <profile>`) before `terraform apply` if it's
# been a while. See docs/provision-vm.md.
provider "oci" {
  auth                = "SecurityToken"
  config_file_profile = var.oci_profile
  region              = var.region
}
