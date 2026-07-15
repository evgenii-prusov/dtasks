output "public_ip" {
  value = oci_core_public_ip.vm.ip_address
}

output "ssh_command" {
  value = "ssh -i ${trimsuffix(var.ssh_public_key_path, ".pub")} ubuntu@${oci_core_public_ip.vm.ip_address}"
}
