# Payment webhook fixtures

These payloads are deterministic, sanitized test-mode-shaped examples used by
the adapter tests. They contain no merchant data or signing credentials. The
repository has not received a live or test merchant account capture, so these
files must not be described as captured sandbox deliveries. The Paystack and
Flutterwave field shapes and signature contracts were checked against the
vendor documentation linked in `supabase/DEPLOYMENT.md`.

The signature tests calculate request signatures at runtime with conspicuously
test-only secrets. Paystack stale timestamps are evaluated against a fixed
test clock. Flutterwave's documented HMAC format has no timestamp field; replay
protection therefore depends on the normalized event ID and inbox idempotency.
