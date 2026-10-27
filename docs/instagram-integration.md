# FoodHub Instagram integration — architecture

Status: foundation only. No production integration enabled.

## Principles
- One Meta application; each organization connects its own Instagram professional account via OAuth.
- Resolve organization by verified Instagram account ID, never by fallback slug.
- Keep existing WhatsApp/Kapso endpoint unchanged until parity tests pass.
- Separate channel adapters (webhooks, outbound messages) from shared order/session orchestration.
- Store tokens encrypted server-side; never expose them to React or logs.
- Verify Meta webhook challenge and X-Hub-Signature-256 over raw body.
- Deduplicate events by provider message ID and process asynchronously.
- Scope conversations, carts, order actions and staff access by organization_id.
- Do not infer phone number from Instagram sender ID. Request phone explicitly for checkout.
- Confirm orders idempotently with stable client-generated confirmation key; verify actual order persisted before responding.
- Outbound order updates must respect Meta messaging policy and eligible conversation windows.
- Human takeover pauses automation; resuming is explicit and auditable.
- Keep origin channel, account, customer and conversation identifiers on orders.
- Implement OAuth CSRF state, secure token exchange, expiry/refresh, disconnect, deletion requests and review requirements.

## Rollout
1. Database migration for connection and sessions (this branch).
2. OAuth authorization and callback with secure token storage.
3. Verified Instagram webhook, queue, idempotent event ingestion and outbound adapter.
4. Extract shared conversation/order engine from food-agent-whatsapp while preserving current behavior.
5. Instagram orders, delivery validation, customer data collection and notifications.
6. Staff inbox, human handoff, tenant RLS, observability, integration tests and Meta App Review.

## Acceptance criteria
- Tenant A cannot access tenant B messages or credentials.
- Duplicate inbound webhooks never create duplicate orders.
- Unknown Instagram account IDs are rejected, not routed to a default restaurant.
- Existing WhatsApp end-to-end flows remain unchanged.
- Messages outside permitted Instagram windows are not sent automatically.
- Disconnect prevents further processing and revokes access where supported.

## Production configuration required
META_APP_ID, META_APP_SECRET, META_VERIFY_TOKEN, encryption key, Instagram OAuth redirect URL, reviewed Meta permissions. Do not commit secrets.
