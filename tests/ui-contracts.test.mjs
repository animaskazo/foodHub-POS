import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';

let server, Button, IconButton, QuantityStepper, SettingsOptionRow, IngredientIcon, ingredientIcons, subscriptionService;
before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
  ({ Button } = await server.ssrLoadModule('/src/components/ui/button.jsx'));
  ({ IconButton } = await server.ssrLoadModule('/src/components/ui/IconButton.jsx'));
  ({ QuantityStepper } = await server.ssrLoadModule('/src/components/ui/QuantityStepper.jsx'));
  ({ SettingsOptionRow } = await server.ssrLoadModule('/src/components/ui/SettingsOptionRow.jsx'));
  ({ IngredientIcon } = await server.ssrLoadModule('/src/components/ui/IngredientIcon.jsx'));
  ingredientIcons = await server.ssrLoadModule('/src/utils/ingredientIcons.js');
  subscriptionService = await server.ssrLoadModule('/src/services/subscription.js');
});
after(async () => { await server?.close(); });
const render = (Component, props, children) => renderToStaticMarkup(React.createElement(Component, props, children));

test('actions do not submit their surrounding form unless explicitly requested', () => {
  assert.match(render(Button, {}, 'Cancelar'), /type="button"/);
  assert.match(render(Button, { type: 'submit' }, 'Guardar'), /type="submit"/);
});

test('loading actions are busy and disabled, and expose the progress label', () => {
  const html = render(Button, { loading: true, loadingText: 'Guardando…' }, 'Guardar');
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /disabled=""/);
  assert.match(html, /Guardando…/);
  assert.match(render(Button, { disabled: true }, 'Cobrar'), /disabled=""/);
});

test('icon actions expose an accessible name without depending on hover', () => {
  const html = render(IconButton, { label: 'Eliminar Hamburguesa' }, React.createElement('svg'));
  assert.match(html, /aria-label="Eliminar Hamburguesa"/);
  assert.match(html, /title="Eliminar Hamburguesa"/);
});

test('quantity controls identify the product and distinguish removal from decrement', () => {
  const html = render(QuantityStepper, { value: 1, label: 'Hamburguesa', removeOnDecrease: true });
  assert.match(html, /aria-label="Eliminar Hamburguesa"/);
  assert.match(html, /aria-label="Aumentar cantidad de Hamburguesa"/);
  const stock = render(QuantityStepper, { value: 0, label: 'Tomate', decreaseDisabled: true });
  assert.match(stock, /aria-label="Reducir cantidad de Tomate"[^>]*disabled=""|disabled=""[^>]*aria-label="Reducir cantidad de Tomate"/);
  assert.doesNotMatch(stock, /aria-label="Eliminar Tomate"/);
});

test('saved quantities disable both mutations', () => {
  const html = render(QuantityStepper, { value: 2, label: 'Pizza', disabled: true });
  assert.equal((html.match(/ disabled=""/g) || []).length, 2);
});


test('setting controls keep their title, description and disabled state connected', () => {
  const html = render(SettingsOptionRow, {
    title: 'Pedidos programados', description: 'Permite agendar para una hora futura.',
    control: (labelProps) => React.createElement('input', { ...labelProps, type: 'checkbox', disabled: true }),
  });
  const titleId = html.match(/id="([^"]+-title)"/)[1];
  const descriptionId = html.match(/id="([^"]+-description)"/)[1];
  assert.ok(html.includes(`aria-labelledby="${titleId}"`));
  assert.ok(html.includes(`aria-describedby="${descriptionId}"`));
  assert.match(html, / disabled=""/);
});


test('all persisted ingredient icon IDs resolve to unfilled Lucide line icons', () => {
  for (const entry of ingredientIcons.FOOD_ICONS) {
    const html = render(IngredientIcon, { icon: entry.name });
    assert.match(html, /class="lucide /, entry.name);
    assert.match(html, /fill="none"/, entry.name);
    assert.match(html, /stroke-width="2"/, entry.name);
    assert.match(html, /stroke="#000"/, entry.name);
  }
  assert.equal(ingredientIcons.getIngredientIcon('Apple'), ingredientIcons.getIngredientIcon('Apple01Icon'));
  assert.equal(ingredientIcons.getIngredientIcon('unknown-saved-icon'), ingredientIcons.getIngredientIcon('KitchenUtensilsIcon'));
  assert.equal(ingredientIcons.recommendIngredientIcon('manzana'), 'Apple01Icon');
});

test('complimentary access is active only inside its configured date range', () => {
  const now = Date.parse('2026-11-10T12:00:00Z');
  const active = {
    free_access: true,
    free_access_starts_at: '2026-11-01T00:00:00Z',
    free_access_ends_at: '2026-12-01T00:00:00Z',
  };
  assert.equal(subscriptionService.isComplimentaryAccessActive(active, now), true);
  assert.equal(subscriptionService.isComplimentaryAccessActive({ ...active, free_access: false }, now), false);
  assert.equal(subscriptionService.isComplimentaryAccessActive({ ...active, free_access_starts_at: '2026-11-11T00:00:00Z' }, now), false);
  assert.equal(subscriptionService.isComplimentaryAccessActive({ ...active, free_access_ends_at: '2026-11-10T11:59:59Z' }, now), false);
});

test('super-admin can explicitly remove only incomplete billing requests', () => {
  const source = fs.readFileSync(new URL('../src/components/superadmin/OrgFreeAccess.jsx', import.meta.url), 'utf8');
  assert.match(source, /\['pending_card', 'pending_payment'\]\.includes\(record\?\.status\)/);
  assert.match(source, /Eliminar solicitud inconclusa/);
  assert.match(source, /cancel-incomplete-subscription/);
});

test('super-admin can cancel an active Flow subscription with an explicit mode', () => {
  const source = fs.readFileSync(new URL('../src/components/superadmin/OrgFreeAccess.jsx', import.meta.url), 'utf8');
  assert.match(source, /cancel-flow-subscription/);
  assert.match(source, /Cancelar al vencimiento/);
  assert.match(source, /Cancelar ahora/);
  assert.match(source, /body: \{ organizationId, atPeriodEnd \}/);
  assert.match(source, /activeCancellationMode === 'immediate'/);
});

test('complimentary plan remains visible beside paid Flow plans', () => {
  const source = fs.readFileSync(new URL('../src/pages/SubscriptionView.jsx', import.meta.url), 'utf8');
  assert.match(source, /Planes y facturación/);
  assert.match(source, /Revisa tu cortesía vigente o elige un plan pagado/);
  assert.match(source, /tu cortesía finalizará inmediatamente/);
  assert.match(source, /Contratar \$\{plan\.name\}/);
  assert.match(source, /onClick=\{\(\) => onSubscribe\(plan\.planId\)\}/);
});

test('paid plan cards expose the supplied Base, Premium and Restaurant Pro benefits', () => {
  const source = fs.readFileSync(new URL('../src/pages/SubscriptionView.jsx', import.meta.url), 'utf8');
  assert.match(source, /POS terminal con arqueo de caja/);
  assert.match(source, /Integración WhatsApp Business API/);
  assert.match(source, /Integración con Uber Direct/);
  assert.match(source, /Administración gráfica de mesas/);
  assert.match(source, /Más popular/);
});

test('legacy accounts are converted to the standard 15-day trial', () => {
  const migration = fs.readFileSync(new URL('../supabase/migrations/20261111011352_convert_legacy_accounts_to_trial.sql', import.meta.url), 'utf8');
  assert.match(migration, /status = 'trialing'/);
  assert.match(migration, /organization\.created_at/);
  assert.match(migration, /interval '15 days'/);
  assert.match(migration, /subscription\.status = 'legacy_active'/);
});

test('subscription announcement requires audience preview and explicit confirmation', () => {
  const source = fs.readFileSync(new URL('../src/pages/SubscriptionPlansAdmin.jsx', import.meta.url), 'utf8');
  assert.match(source, /Preparar envío/);
  assert.match(source, /Confirmar campaña/);
  assert.match(source, /Enviar a \{audience\.recipientCount\} clientes/);
  assert.match(source, /Reintentar fallidos/);
  assert.match(source, /invokeAnnouncement\('process'/);
});

test('announcement campaign data is private and auditable', () => {
  const migration = fs.readFileSync(new URL('../supabase/migrations/20261112021500_add_subscription_announcement_campaigns.sql', import.meta.url), 'utf8');
  assert.match(migration, /subscription_announcement_campaigns enable row level security/);
  assert.match(migration, /subscription_announcement_recipients enable row level security/);
  assert.match(migration, /revoke all .* from anon, authenticated/);
  assert.match(migration, /unique \(campaign_id, email\)/);
  assert.match(migration, /provider_message_id text/);
});

test('Flow recurring payments use token callbacks with durable reconciliation', () => {
  const callback = fs.readFileSync(new URL('../supabase/functions/flow-subscription-callback/index.ts', import.meta.url), 'utf8');
  const reconciliation = fs.readFileSync(new URL('../supabase/functions/reconcile-flow-subscriptions/index.ts', import.meta.url), 'utf8');
  const migration = fs.readFileSync(new URL('../supabase/migrations/20261112031101_stabilize_flow_subscriptions.sql', import.meta.url), 'utf8');
  assert.match(callback, /payment\/getStatus/);
  assert.match(callback, /record_flow_subscription_payment/);
  assert.doesNotMatch(callback, /form\?\.get\("invoiceId"\)/);
  assert.match(reconciliation, /subscription\/get/);
  assert.match(migration, /subscription_payment_events/);
  assert.match(migration, /reconcile-flow-subscriptions/);
});

test('the production QA plan is restricted to FastFood in listing and checkout', () => {
  const shared = fs.readFileSync(new URL('../supabase/functions/_shared/flow.ts', import.meta.url), 'utf8');
  const plans = fs.readFileSync(new URL('../supabase/functions/flow-subscription-plans/index.ts', import.meta.url), 'utf8');
  const start = fs.readFileSync(new URL('../supabase/functions/flow-subscription-start/index.ts', import.meta.url), 'utf8');
  assert.match(shared, /75caf8f2-d8ce-4ef3-833f-ad968cb9ebf1/);
  assert.match(shared, /plan qa produccion/);
  assert.match(plans, /isFlowQaPlan\(plan\)/);
  assert.match(start, /Este plan está reservado para las pruebas internas/);
});

test('paid subscriptions can only be cancelled safely at period end by business staff', () => {
  const edge = fs.readFileSync(new URL('../supabase/functions/cancel-flow-subscription/index.ts', import.meta.url), 'utf8');
  const view = fs.readFileSync(new URL('../src/pages/SubscriptionView.jsx', import.meta.url), 'utf8');
  const migration = fs.readFileSync(new URL('../supabase/migrations/20261112152905_add_subscription_cancellation.sql', import.meta.url), 'utf8');
  assert.match(edge, /subscription\/cancel/);
  assert.match(edge, /at_period_end: atPeriodEnd/);
  assert.match(edge, /requestedImmediate && !superAdmin/);
  assert.match(edge, /\["owner", "admin"\]\.includes\(staff\.role\)/);
  assert.match(view, /Cancelar al finalizar el período/);
  assert.match(view, /subscriptionRecord\?\.cancel_at_period_end/);
  assert.match(migration, /subscription_cancellation_events/);
  assert.match(migration, /enable row level security/);
});
