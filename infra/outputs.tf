output "public_ip" {
  value = oci_core_public_ip.vm.ip_address
}

output "ssh_command" {
  value = "ssh -i ${trimsuffix(var.ssh_public_key_path, ".pub")} ubuntu@${oci_core_public_ip.vm.ip_address}"
}

output "backup_bucket" {
  value = oci_objectstorage_bucket.backups.name
}

# Needed in every rclone remote config (see docs/backup-storage.md).
output "backup_namespace" {
  value = data.oci_objectstorage_namespace.ns.namespace
}
