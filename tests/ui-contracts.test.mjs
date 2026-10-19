import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

let server, Button, IconButton, QuantityStepper, SettingsOptionRow;
before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
  ({ Button } = await server.ssrLoadModule('/src/components/ui/button.jsx'));
  ({ IconButton } = await server.ssrLoadModule('/src/components/ui/IconButton.jsx'));
  ({ QuantityStepper } = await server.ssrLoadModule('/src/components/ui/QuantityStepper.jsx'));
  ({ SettingsOptionRow } = await server.ssrLoadModule('/src/components/ui/SettingsOptionRow.jsx'));
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
