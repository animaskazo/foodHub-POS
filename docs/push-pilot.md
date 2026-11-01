# Prueba de push de pedidos nuevos

Rama: `codex/new-order-push-pilot` en foodHub-POS y foodhub-mobile. No mezclar a main.

## Proyecto y alcance comprobados

Supabase conectado: `food`, referencia `fgvhbniauzjvzeuespmf`, PostgreSQL 17.
Coincide con las URLs presentes en el POS (webhooks de pagos y agentes).
El móvil no guarda una URL real en Git: su `lib/supabase.js` pide copiar la
configuración del POS. No se puede confirmar una instalación móvil ya compilada
sin conocer su configuración. No existen ramas de desarrollo Supabase conectadas.

No se aplicó DDL, no se desplegó la función y no se enviaron pushes al proyecto
remoto. La migración se probó en PostgreSQL embebido con un esquema mínimo que
reproduce las columnas utilizadas. Quedan pendientes pruebas en Supabase de
desarrollo, su gateway, Vault/cron y un dispositivo con firma válida.

Creación real:

- `src/services/publicOrderService.js`: INSERT de `orders` online, luego ítems y pagos.
- `src/services/orderService.js`: INSERT de `orders` del POS, luego ítems y pagos.
- `supabase/functions/food-agent/index.ts` y `food-agent-whatsapp/index.ts`: pedidos de agentes.
- Móvil `lib/pos.js`: INSERT en la misma tabla.

El trigger adicional es AFTER INSERT, sin backfill. Todos los canales de pedidos
nuevos quedan cubiertos. Un UPDATE de estado, pago o programación no crea aviso.
No se cambian `NewOrderAlert.jsx`, sonidos, email ni WhatsApp existentes.
El encabezado del pedido se crea antes que sus ítems; el worker espera al menos
5 segundos y hasta 5 minutos. Esto no convierte el checkout existente en una
transacción: una creación parcial también puede generar un aviso genérico. El
detalle se consulta de nuevo al tocarlo, sin depender del límite de 150 pedidos.

## Seguridad y límites

La inspección remota encontró políticas `dev_public_all_staff`,
`dev_public_all_orders` y `dev_public_all_branches` permisivas. No se modifican
en esta prueba. Son un bloqueo para un despliegue amplio seguro: con ellas,
`staff` no puede ser la fuente confiable de autorización.

Por eso `push_pilot_members` es una lista administrada por servidor, sin escrituras
ni lecturas directas desde clientes, y limita cada usuario a un negocio. Un
operador de confianza debe verificar la membresía fuera de esas tablas públicas
antes de inscribir una cuenta. La app no recibe ni envía un organization_id para
elegir dónde registrar su token. El backend valida usuario, sesión activa,
proyecto Expo y membresía. Los RPC públicos son invoker; los helpers definer
viven en `push_private`, con permisos explícitos y search_path vacío.

Tokens únicos entre dispositivos; no se puede sobrescribir un dispositivo de
otra cuenta. Rotación actualiza el token del dispositivo propio. Las entregas
guardan el token original y comprueban que siga vigente; un receipt viejo no
invalida un token nuevo. Registros caducan a las 24 h y se renuevan cada hora,
al volver al primer plano y al rotar el token. La app revoca antes de cerrar
sesión y bloquea el cierre si no logra revocar un registro activo; el worker
también comprueba que la sesión siga existiendo. Un aviso ya aceptado por Expo
no se puede retirar. El texto no incluye datos personales y el detalle vuelve
a comprobar autorización en el servidor.

La autorización push no corrige las políticas inseguras preexistentes del resto
de la aplicación. Resolverlas requiere un cambio separado y pruebas de checkout.

Cada (pedido, dispositivo) tiene una entrega única. `FOR UPDATE SKIP LOCKED`
reserva hasta 50 por invocación y cambia su estado a `attempted` antes del HTTP.
Los intentos no se reenvían, incluso con timeout o caída del worker: se prioriza
evitar duplicados sobre recuperar una entrega incierta. No se promete exactly-once
en el teléfono: Expo/APNs no ofrecen esa garantía. Tickets se consultan pasados
15 min; `delivered` significa receipt satisfactorio del proveedor, no que una
persona haya visto el aviso. Sin receipt en 24 h queda `unknown`. Dispositivos
no registrados se caducan. Historial de entregas se elimina tras 7 días.
Límite del piloto: 50 entregas/minuto; no usar como distribución masiva.

## Activación en un entorno de prueba

1. Elegir o crear un proyecto/branch Supabase de prueba, confirmar su referencia
   y verificar el esquema de pedidos. No ejecutar `db push` ciegamente: el repo
   contiene migraciones antiguas numeradas y hay que reconciliar su historial.
   Aplicar únicamente `20261101230534_new_order_push_pilot.sql` al destino confirmado
   y registrar esa migración. Ejecutar asesores de seguridad después.
2. Desplegar solo `new-order-push` a esa referencia. `verify_jwt=false` es
   deliberado: la función comprueba su propio Bearer secreto de servidor.
   Solicitudes sin él devuelven 401. Configurar `PUSH_WORKER_SECRET` aleatorio,
   `EXPO_ACCESS_TOKEN` y dejar `PUSH_ENABLED=false`. Activar Enhanced Push Security
   en el proyecto Expo asociado al access token. Nunca poner estas claves en `.env`
   del móvil ni en variables EXPO_PUBLIC/VITE.
3. Configurar las dos entradas de Vault descritas en
   `scripts/push-pilot-schedule.sql`. Ejecutar ese script solo en el destino de
   prueba. El trabajo cron usa Vault y llama al worker cada minuto.
4. Inscribir un negocio y un usuario de prueba verificados, desde servidor:

   ```sql
   insert into public.push_pilot_businesses(organization_id,expo_project_id)
     values ('<organization_uuid>', '<eas_project_uuid>'); -- enabled=false
   insert into public.push_pilot_members(user_id,organization_id)
     values ('<auth_user_uuid>','<organization_uuid>');
   ```

5. Configurar el móvil con la URL y clave pública del MISMO destino de prueba,
   `EXPO_PUBLIC_PUSH_PILOT=true`, `EXPO_PUBLIC_EAS_PROJECT_ID=<eas_project_uuid>`
   y los identificadores oficiales de la app. Compilar e instalar una nueva
   development build; un cambio OTA no instala módulos nativos.
6. Iniciar sesión y pulsar «Activar avisos de pedidos nuevos». Comprobar un solo
   registro, negocio correcto y sesión activa. No registrar tokens de terceros.
7. Solo entonces poner `PUSH_ENABLED=true` y habilitar el negocio con
   `update push_pilot_businesses set enabled=true where organization_id='<uuid>';`.
   Crear un pedido NUEVO de prueba por cada canal deseado. Reinvocar el worker
   y actualizar estados no debe generar otra entrega. Otro negocio no recibe nada.
8. Probar primer plano, segundo plano, arranque en frío, tocar sin sesión y
   autenticar después, cerrar sesión, revocar permisos, rotar token, cuenta de
   otro negocio, receipt `DeviceNotRegistered`, worker concurrente y caída entre
   reserva y respuesta. Verificar que el aviso abre exactamente el pedido y que
   siguen funcionando las alertas anteriores. No crear pedidos de prueba en producción.

## Detención y reversión

Poner `PUSH_ENABLED=false` detiene el worker antes de reservar o enviar.
`update push_pilot_businesses set enabled=false where organization_id='<uuid>';`
detiene encolado y reserva para ese negocio. Desactivar miembros con `enabled=false`
y revocar dispositivos también impide envíos nuevos. No volver a marcar `unknown`
o `attempted` como `pending`: podría duplicar un push ya aceptado por Expo.
Desactivar el cron con `select cron.unschedule('foodhub-new-order-push-pilot');`.
Para quitar el trigger: `drop trigger push_pilot_new_order on public.orders;`.
Conservar tablas para diagnóstico hasta decidir su eliminación por separado.

## Verificación local

`npm ci --ignore-scripts`, `npm run test:push`, `npm run test:ui`,
`npm run lint`, `npm run build`. `deno check supabase/functions/new-order-push/index.ts`.
`deno test --allow-env supabase/functions/new-order-push/handler.test.ts` comprueba
el secreto de servidor, el interruptor de apagado y el flujo HTTP simulado.
Las pruebas usan PostgreSQL PGlite local y Expo simulado; nunca llaman a Supabase
remoto ni envían notificaciones. La prueba SQL valida roles reales en el motor,
pero no sustituye la prueba concurrente en un Supabase de desarrollo.

El worker tiene SELECT limitado a id/user_id/not_after de `auth.sessions` para
validar sesiones desde RPC invoker. Se revalida antes de cada HTTP, además de
al reservar el lote. La fecha límite `not_after`, si existe, debe seguir vigente.

Asesores remotos consultados en modo lectura: problemas previos de search_path,
una tabla pública sin RLS, funciones definer ejecutables y protección de
contraseñas filtradas desactivada; no se corrigieron fuera del alcance del piloto.
Ver guías: https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public
y https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable

Referencias oficiales:
- https://docs.expo.dev/push-notifications/push-notifications-setup/
- https://docs.expo.dev/versions/v58.0.0/sdk/notifications/
- https://docs.expo.dev/push-notifications/sending-notifications/
- https://supabase.com/docs/guides/functions/schedule-functions
