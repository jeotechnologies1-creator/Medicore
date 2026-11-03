variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID for the public OneMed hostname."
  type        = string
}

variable "enable_scanner_path_rule" {
  description = "Block common exploit probes for files and services this app does not provide."
  type        = bool
  default     = true
}
