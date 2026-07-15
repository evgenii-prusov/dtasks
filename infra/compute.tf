data "oci_identity_availability_domains" "ads" {
  compartment_id = var.compartment_ocid
}

data "oci_core_images" "ubuntu" {
  compartment_id           = var.compartment_ocid
  operating_system         = "Canonical Ubuntu"
  operating_system_version = "24.04"
  shape                    = "VM.Standard.A1.Flex"
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

resource "oci_core_instance" "vm" {
  compartment_id      = var.compartment_ocid
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[var.availability_domain_index].name
  display_name        = var.instance_name
  shape               = "VM.Standard.A1.Flex"

  shape_config {
    ocpus         = var.ocpus
    memory_in_gbs = var.memory_gbs
  }

  source_details {
    source_type = "image"
    source_id   = data.oci_core_images.ubuntu.images[0].id
  }

  # No ephemeral public IP -- a reserved one is attached separately below so
  # DNS doesn't have to change across a destroy/recreate cycle.
  create_vnic_details {
    subnet_id        = oci_core_subnet.public.id
    assign_public_ip = false
    hostname_label   = var.instance_name
  }

  metadata = {
    ssh_authorized_keys = file(pathexpand(var.ssh_public_key_path))
    # Installs Docker + opens 80/443 at the OS firewall level -- see
    # cloud-init.yaml for why the latter is needed on Oracle's stock images.
    user_data = filebase64("${path.module}/cloud-init.yaml")
  }

  # A1 Flex "out of host capacity" is common on Always Free. If apply fails
  # here, just `terraform apply` again later, or (in a multi-AD region)
  # override -var availability_domain_index to try a different AD.
  # See docs/provision-vm.md.
}

data "oci_core_private_ips" "vm" {
  ip_address = oci_core_instance.vm.private_ip
  subnet_id  = oci_core_subnet.public.id
}

resource "oci_core_public_ip" "vm" {
  compartment_id = var.compartment_ocid
  display_name   = "${var.instance_name}-ip"
  lifetime       = "RESERVED"
  private_ip_id  = data.oci_core_private_ips.vm.private_ips[0]["id"]
}
