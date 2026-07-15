resource "oci_core_vcn" "vm" {
  compartment_id = var.compartment_ocid
  cidr_block     = "10.0.0.0/16"
  dns_label      = "dtasksvcn"
  display_name   = "${var.instance_name}-vcn"
}

resource "oci_core_internet_gateway" "vm" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.vm.id
  display_name   = "${var.instance_name}-igw"
  enabled        = true
}

# Rather than creating a separate route table, this adopts the VCN's
# auto-created default one -- the standard OCI/Terraform idiom for a
# single-subnet VCN with nothing else on it.
resource "oci_core_default_route_table" "vm" {
  manage_default_resource_id = oci_core_vcn.vm.default_route_table_id

  route_rules {
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
    network_entity_id = oci_core_internet_gateway.vm.id
  }
}

resource "oci_core_default_security_list" "vm" {
  manage_default_resource_id = oci_core_vcn.vm.default_security_list_id

  egress_security_rules {
    protocol    = "all"
    destination = "0.0.0.0/0"
  }

  ingress_security_rules {
    protocol = "6" # TCP
    source   = var.allow_ssh_cidr
    tcp_options {
      min = 22
      max = 22
    }
  }

  ingress_security_rules {
    protocol = "6"
    source   = "0.0.0.0/0"
    tcp_options {
      min = 80
      max = 80
    }
  }

  ingress_security_rules {
    protocol = "6"
    source   = "0.0.0.0/0"
    tcp_options {
      min = 443
      max = 443
    }
  }
}

resource "oci_core_subnet" "public" {
  compartment_id             = var.compartment_ocid
  vcn_id                     = oci_core_vcn.vm.id
  cidr_block                 = "10.0.0.0/24"
  dns_label                  = "dtaskssub"
  display_name               = "${var.instance_name}-subnet"
  route_table_id             = oci_core_vcn.vm.default_route_table_id
  security_list_ids          = [oci_core_vcn.vm.default_security_list_id]
  prohibit_public_ip_on_vnic = false
}
