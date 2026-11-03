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
