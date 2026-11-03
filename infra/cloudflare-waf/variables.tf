variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID for the public OneMed hostname."
  type        = string
}

variable "enable_scanner_path_rule" {
  description = "Block common exploit probes for files and services this app does not provide."
  type        = bool
  default     = true
}

variable "supabase_api_hostnames" {
  description = "Cloudflare-proxied custom hostnames used for Supabase API, Auth, Storage, Realtime, or Edge Functions."
  type        = set(string)
  default     = []
}

variable "adaptive_rate_limit_short_threshold" {
  description = "Failed/suspicious API responses per IP in 60 seconds before a temporary block."
  type        = number
  default     = 20
}

variable "adaptive_rate_limit_sustained_threshold" {
  description = "Failed/suspicious API responses per IP in 10 minutes before a longer block."
  type        = number
  default     = 80
}
