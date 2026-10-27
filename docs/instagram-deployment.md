# Instagram deployment checklist (not yet deployed)

1. Create Meta Instagram Login application and obtain META_APP_ID / META_APP_SECRET. Request instagram_business_basic and instagram_business_manage_messages. Verify current Meta API version and account permissions.
2. Set Supabase secrets: META_APP_ID, META_APP_SECRET, META_VERIFY_TOKEN, META_GRAPH_VERSION, INSTAGRAM_OAUTH_REDIRECT_URI, FOODHUB_APP_URL, INSTAGRAM_TOKEN_ENCRYPTION_KEY (base64-encoded 32 random bytes), INSTAGRAM_WORKER_SECRET.
3. Apply migrations 029, 030 and 031 to a **staging database first**; verify existing staff(id, organization_id) schema and RLS. Do not apply to production without testing.
4. Deploy instagram-connection-status, instagram-oauth-start, instagram-send-message, instagram-set-mode and instagram-disconnect with JWT authentication.
5. Deploy instagram-oauth-callback and instagram-webhook with JWT verification disabled (Meta does not provide a Supabase JWT). Callback validates one-time OAuth state; webhook validates HMAC signature.
6. Deploy instagram-process-events with JWT verification disabled but require a long random x-worker-secret; never expose it in the browser. Trigger periodically using a secured scheduler. Validate error and retry policy before production.
7. Configure Meta callback URL to /functions/v1/instagram-oauth-callback and Webhooks URL to /functions/v1/instagram-webhook. Verify Meta permissions and app review.
8. Test: tenant isolation, duplicate webhook deliveries, signature tampering, OAuth state replay, token expiry, human handoff, outbound window, webhook echoes, mobile UI.
9. Review known limitations: no automatic order checkout (needs phone collection and idempotency), no Instagram status notifications, no token refresh job, failed event reconciliation, no live deployment or build verification.
10. Existing WhatsApp inbox stays embedded via Kapso; this branch does not migrate WhatsApp messages.
