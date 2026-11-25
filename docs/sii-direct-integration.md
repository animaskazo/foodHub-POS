# Integración directa con SII

## Primera entrega: configuración y simulación interna

Ruta: `/settings?tab=integrations`, desde Configuración → Integraciones → SII · Boletas electrónicas. Detalle en `/settings/integrations/sii`; `/sii` redirige al detalle. Disponible para owner, admin y manager activos del mismo negocio (sin privilegio global implícito para superadmin).

Aplicar `supabase/migrations/20261125120000_sii_simulation_foundation.sql` y `supabase/migrations/20261125123000_sii_emission_policy.sql` en un ambiente de desarrollo antes de usar la pantalla. Las migraciones no se han desplegado automáticamente a producción.

- `sii_issuer_profiles`: datos públicos tributarios por organización; ambiente fijo de certificación. No contiene certificados ni contraseñas.
- `sii_receipt_simulations`: pruebas internas inmutables, separadas de pedidos y documentos tributarios. Sin folio, XML firmado, track ID ni estado de aceptación del SII.
- `simulate_sii_receipt`: RPC autenticada que valida pertenencia y rol, recalcula montos en el servidor y devuelve la misma simulación para una misma organización y request UUID. Si cambia el contenido con la misma clave, rechaza la petición. Conserva los datos del emisor como snapshot.
- Alcance de cálculo inicial: productos afectos, IVA incluido al 19%, precios y cantidades enteros, CLP. Sin propinas, descuentos, pagos mixtos ni productos exentos en esta entrega.
- Reintentar guardar los mismos productos mantiene el UUID. Editar los productos crea otra prueba. No se actualizan ventas ni inventario.

## Reglas por canal y pago

El perfil guarda los canales seleccionados (`pos`, `online`, `whatsapp`), el modelo que el negocio declara tener registrado en el SII y quién cubre el documento tributario para pagos con terminal o pasarela. Al guardar en FoodHub no se modifica el registro del SII. Inicialmente ningún canal está seleccionado y el modelo está pendiente de confirmar.

`decideReceiptEmission` permite previsualizar la decisión en el formulario. Se usa solo como vista previa; no está conectada al cobro ni a envíos reales. La futura cola del servidor deberá recalcular sobre pedidos/pagos autoritativos y verificar cobertura efectiva del operador antes de emitir.

| Caso con canal seleccionado | Resultado de la vista previa |
| --- | --- |
| Pedido online pagado, sin voucher que cubra la boleta | FoodHub emitiría |
| Pago con tarjeta en terminal cuyo voucher cubre la venta, modelo voucher reemplaza boleta | No emitir otra boleta |
| Pasarela online con voucher válido, modelo voucher reemplaza boleta | No emitir otra boleta |
| Efectivo o transferencia, pago completo y modelo confirmado | FoodHub emitiría |
| Modelo “siempre emito boleta” | FoodHub emitiría incluso con pago electrónico |
| Pago pendiente o parcial | Esperar confirmación del pago completo |
| Modelo u operador sin confirmar | Revisión antes de emitir |
| Pago mixto, parcialmente cubierto por voucher | Revisión; no emitir automáticamente por el total |

Los tipos internos `table` y `pickup` se agrupan como punto de venta; `online` y `whatsapp` identifican los otros canales. Retiro/despacho no determinan por sí solos la cobertura tributaria. Desactivar un canal de FoodHub no exime al negocio de documentar esas ventas por el sistema que corresponda. La cobertura del operador es configuración declarada, aún no verificada por una integración con el terminal.

## Validación local

`npm ci`

`npm run test:sii`

`npm run build`

Las pruebas de base de datos usan PostgreSQL embebido (PGlite), aplican la migración real y verifican RLS, roles, validación de RUT, cálculo y reintentos sin conectarse a Supabase ni al SII. No reemplazan una prueba de migración en Supabase staging.

## Siguiente etapa: certificación real

El representante legal debe habilitar la empresa en certificación, descargar el set y obtener el CAF de certificación. Un certificado digital por sí solo no autoriza folios ni certifica el desarrollo.

Antes de habilitar envíos se debe implementar:

1. Custodia de certificado PFX/P12 y contraseña con cifrado y acceso exclusivo del servidor. Nunca en columnas públicas, bundle frontend, localStorage, repositorio o logs. Validar vigencia y firmante autorizado para cada emisor.
2. Importación y validación de CAF: RUT, tipo de documento, rango y ambiente de origen. El ambiente debe venir del proceso de importación; no asumir que el archivo por sí solo prueba su procedencia. Asignación atómica de folios por RUT/tipo/ambiente.
3. XML conforme a esquemas SII, TED/timbre y firmas XML; validar firmas y XSD antes del envío.
4. Autenticación específica de boletas (semilla firmada y token), envío y seguimiento de estados. No marcar aceptado por obtener un track ID ni reutilizar el pipeline SOAP de facturas sin validación.
5. Cola durable, reintentos y recuperación ante resultados inciertos sin duplicar folios/documentos; representación gráfica exigida por SII y trazabilidad.
6. Generar los casos exactos del set y reportes solicitados, enviarlos en certificación y solicitar revisión. Con visto bueno, el representante legal realiza la declaración de cumplimiento.
7. Habilitación explícita por emisor antes de producción. Revisar modelo de emisión y voucher para no duplicar ventas, además de notas de crédito, anulaciones y obligaciones de reportes vigentes.

No conectar aún la emisión a ventas reales del POS. Una configuración guardada no significa conexión validada ni autorización de producción.

## Fuentes oficiales

- [Proceso de certificación y solicitud de set](https://www.sii.cl/servicios_online/1039-guia_emitir_boleta_servicio-1184.html)
- [Instructivo técnico de boletas](https://www.sii.cl/servicios_online/3532-instructivo_tecnico_be-3811.html)
- [Documentación API](https://www4c.sii.cl/bolcoreinternetui/api/)
- [Boletas y voucher / modelo de emisión](https://www.sii.cl/destacados/boleta_electronica_voucher/)

Consultar el set e instrucciones vigentes al implementar: no usar CAF ni folios de producción para las pruebas.
