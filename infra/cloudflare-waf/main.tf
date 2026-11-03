resource "cloudflare_ruleset" "managed_waf" {
  zone_id     = var.cloudflare_zone_id
  name        = "OneMed managed WAF"
  description = "Cloudflare managed exploit detection for OneMed public traffic."
  kind        = "zone"
  phase       = "http_request_firewall_managed"

  rules = [
    {
      ref         = "execute_cloudflare_managed_ruleset"
      description = "Cloudflare managed WAF rules"
      expression  = "true"
      action      = "execute"
      action_parameters = {
        id = "efb7b8c949ac4650a09736fc376e9aee"
      }
      enabled = true
    },
    {
      ref         = "execute_owasp_core_ruleset"
      description = "OWASP Core Ruleset"
      expression  = "true"
      action      = "execute"
      action_parameters = {
        id = "4814384a9e5d4991b9815dcfc25d2f1f"
      }
      enabled = true
    }
  ]
}

resource "cloudflare_ruleset" "custom_waf" {
  zone_id     = var.cloudflare_zone_id
  name        = "OneMed request sanity rules"
  description = "Reject protocol abuse and probes for common secret/config files."
  kind        = "zone"
  phase       = "http_request_firewall_custom"

  rules = concat([
    {
      ref         = "block_unsupported_http_methods"
      description = "Block HTTP methods not used by OneMed or Supabase"
      expression  = "http.request.method in {\"TRACE\" \"CONNECT\"}"
      action      = "block"
      enabled     = true
    }
  ], var.enable_scanner_path_rule ? [
    {
      ref         = "block_common_sensitive_file_probes"
      description = "Block probes for repository, environment, and server config files"
      expression  = "lower(http.request.uri.path) matches \"(^|/)(\\.env|\\.git|wp-admin|wp-login\\.php|phpmyadmin|server-status)(/|$)|(^|/)(composer\\.(json|lock)|package-lock\\.json|id_rsa)(/|$)\""
      action      = "block"
      enabled     = true
    }
  ] : [])
}

locals {
  supabase_host_expression = length(var.supabase_api_hostnames) > 0 ? "http.host in {${join(" ", [for host in var.supabase_api_hostnames : jsonencode(host)])}}" : "false"
  suspicious_api_response  = "(${local.supabase_host_expression}) and http.response.code in {401 403 404 429}"
  supabase_api_paths       = "(http.request.uri.path starts_with \"/auth/v1/\" or http.request.uri.path starts_with \"/rest/v1/\" or http.request.uri.path starts_with \"/storage/v1/\" or http.request.uri.path starts_with \"/realtime/v1/\" or http.request.uri.path starts_with \"/functions/v1/\")"
}

resource "cloudflare_ruleset" "adaptive_api_rate_limits" {
  count       = length(var.supabase_api_hostnames) > 0 ? 1 : 0
  zone_id     = var.cloudflare_zone_id
  name        = "OneMed adaptive API abuse limits"
  description = "Count failed and suspicious Supabase API responses by source IP and apply escalating temporary mitigations."
  kind        = "zone"
  phase       = "http_ratelimit"

  rules = [
    {
      ref         = "adaptive_supabase_failure_burst"
      description = "Temporarily block an IP after a burst of failed or probing API requests"
      expression  = "(${local.supabase_host_expression}) and ${local.supabase_api_paths}"
      action      = "block"
      enabled     = true
      ratelimit = {
        characteristics     = ["cf.colo.id", "ip.src"]
        period              = 60
        requests_per_period = var.adaptive_rate_limit_short_threshold
        mitigation_timeout  = 60
        counting_expression = "(${local.suspicious_api_response}) and ${local.supabase_api_paths}"
      }
    },
    {
      ref         = "adaptive_supabase_failure_sustained"
      description = "Apply a longer block to sustained failed or probing API traffic"
      expression  = "(${local.supabase_host_expression}) and ${local.supabase_api_paths}"
      action      = "block"
      enabled     = true
      ratelimit = {
        characteristics     = ["cf.colo.id", "ip.src"]
        period              = 600
        requests_per_period = var.adaptive_rate_limit_sustained_threshold
        mitigation_timeout  = 600
        counting_expression = "(${local.suspicious_api_response}) and ${local.supabase_api_paths}"
      }
    }
  ]
}
