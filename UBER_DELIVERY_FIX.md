# 🐛 Problema: Pedido sin Delivery de Uber Asignado

## 📋 Descripción del Problema

Un pedido se creó exitosamente con Uber Direct, **se cobró el despacho**, pero **NO se generó la orden en Uber**. Esto dejó el pedido en un estado inconsistente:

- ✅ Pedido creado en la BD
- ✅ Pago procesado (se cobró delivery fee)
- ❌ Sin `uber_delivery_id`
- ❌ Sin `uber_tracking_url`
- ❌ Sin repartidor asignado

## 🔍 Causa Raíz

El flujo de creación de Uber delivery tiene un **punto crítico de falla**:

```
1. Se crea la orden en BD ✅
2. Se calcula total con delivery fee ✅
3. Se llama a Uber API para crear delivery ❌ FALLA TRANSITORIA
   - Timeout de red
   - Error temporal de API de Uber
   - Problema de geocodificación
4. La excepción se captura silenciosamente 🤫
5. El pedido queda sin delivery asignado 💥
```

### Código Problemático (OrderView.jsx línea 598-621)

```javascript
// Offline (cash) flow: create the order directly
const order = await createPublicOrder({...});

// ⭐ AQUÍ FALLA: Sin reintentos
const uberInfo = await createUberDelivery(org, customerForm, cartItems, scheduledAt);
if (uberInfo) {
  // ... actualizar orden
} // ❌ Si falla, simplemente retorna null y continúa
```

**Problemas:**

1. **Sin reintentos**: Una falla temporal hace fallar todo
2. **Sin logging**: Imposible saber qué falló
3. **Sin rollback**: Dinero cobrado pero sin entrega
4. **Sin recuperación**: El admin no tiene forma de reintentar

---

## ✅ Solución Implementada

### 1️⃣ Reintentos con Backoff Exponencial

**Archivo:** `src/services/uberDirectService.js`

```javascript
export const createDeliveryWithRetry = async (
  customerId, 
  token, 
  deliveryData, 
  maxRetries = 3
) => {
  let lastError
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Uber Delivery] Attempt ${attempt}/${maxRetries}`)
      const result = await createDelivery(customerId, token, deliveryData)
      console.log(`[Uber Delivery] ✅ Success on attempt ${attempt}`)
      return result
    } catch (error) {
      lastError = error
      console.error(`[Uber Delivery] ❌ Attempt ${attempt} failed:`, error.message)
      
      // No reintentar errores de validación (son reales)
      const errorStr = error.message.toLowerCase()
      if (errorStr.includes('validation') || 
          errorStr.includes('invalid') ||
          errorStr.includes('not found') ||
          errorStr.includes('unauthorized')) {
        throw error
      }
      
      // Esperar con backoff: 1s, 2s, 4s
      if (attempt < maxRetries) {
        const delayMs = Math.pow(2, attempt - 1) * 1000
        console.log(`[Uber Delivery] ⏳ Retrying in ${delayMs}ms...`)
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    }
  }
  
  throw lastError
}
```

**Ventajas:**
- Maneja errores transitorios (timeout, rate limit, etc.)
- No reintentar errores reales (validación, auth)
- Logging detallado para debugging
- Backoff exponencial para no sobrecargar API

---

### 2️⃣ Usar Reintentos en OrderView

**Archivo:** `src/pages/OrderView.jsx` línea 463

```javascript
// ⭐ USE createDeliveryWithRetry INSTEAD OF createDelivery
const delivery = await createDeliveryWithRetry(
  orgData.uber_customer_id, 
  token, 
  deliveryData,
  3 // maxRetries
)
```

---

### 3️⃣ Deploy Automático de Functions

**Archivo:** `.github/workflows/deploy-supabase-functions.yml`

Ahora cualquier cambio en `supabase/functions/` se deploya automáticamente a Supabase.

**Setup:**
1. Ve a tu repo → **Settings** → **Secrets and variables** → **Actions**
2. Agrega:
   - `SUPABASE_ACCESS_TOKEN`: Token de acceso personal
   - `SUPABASE_PROJECT_ID`: ID del proyecto

---

### 4️⃣ Herramienta de Admin para Recuperación

**Archivo:** `src/components/admin/RetryUberDeliveryAdmin.jsx`

Componente para reintentar deliveries fallidos:

```javascript
import RetryUberDeliveryAdmin from '../components/admin/RetryUberDeliveryAdmin';

// En tu dashboard de admin:
<RetryUberDeliveryAdmin 
  organizationId={org.id}
  branchId={branch.id}
/>
```

**Funcionalidades:**
- Lista todos los pedidos sin `uber_delivery_id`
- Permite reintentar uno por uno
- Muestra resultado inmediato
- Logs detallados

---

## 🚀 Cómo Deploy

### Para el flujo web (OrderView):

```bash
# 1. Los cambios ya están en el commit
# 2. Build y deploy normal a Vercel/hosting
npm run build
```

### Para las Edge Functions (Supabase):

**Opción A: Automático (RECOMENDADO)**
```bash
# Solo pushear a main
git push origin main
# GitHub Actions hará el deploy automáticamente
```

**Opción B: Manual**
```bash
# Si necesitas deployar ahora sin esperar webhook
supabase login
supabase functions deploy uber-direct-proxy
```

---

## 🧪 Pruebas Recomendadas

### 1. Simular falla de Uber
```javascript
// En OrderView.jsx, temporalmente:
throw new Error('Simulated Uber timeout');
```

✅ Debe reintentar 3 veces y luego fallar apropiadamente

### 2. Verificar logs
```javascript
// Abre Console del navegador
// Deberías ver:
// [Uber Delivery] Attempt 1/3
// [Uber Delivery] ❌ Attempt 1 failed: ...
// [Uber Delivery] ⏳ Retrying in 1000ms...
```

### 3. Probar herramienta de admin
- Crear un pedido fallido (simular)
- Ir a admin → Reintentar Entregas
- Click "Reintentar"
- Debe crear el delivery

---

## 📊 Cambios Realizados

| Archivo | Cambio | Impacto |
|---------|--------|--------|
| `src/services/uberDirectService.js` | ➕ Función `createDeliveryWithRetry` | Reintentos con backoff |
| `src/pages/OrderView.jsx` | 🔄 Usar `createDeliveryWithRetry` en línea 463 | Recuperación automática |
| `src/components/admin/RetryUberDeliveryAdmin.jsx` | ➕ Nuevo componente | Recuperación manual |
| `.github/workflows/deploy-supabase-functions.yml` | ➕ Nuevo workflow | Deploy automático |

---

## 🛡️ Casos de Uso Cubiertos

| Caso | Antes | Después |
|------|-------|--------|
| Timeout transitorio de Uber | ❌ Falla | ✅ Reintentos automáticos |
| Rate limit de API | ❌ Falla | ✅ Reintentos con backoff |
| Geocodificación lenta | ❌ Falla | ✅ Reintentos |
| Error de validación real | ❌ Falla silenciosa | ✅ Error claro + logging |
| Pedido ya creado sin delivery | ❌ Huérfano | ✅ Admin puede reintentar |

---

## 🔍 Monitoreo Recomendado

Revisa estos logs para detectar problemas:

```javascript
// Console del navegador (Ctrl+Shift+K)
// Busca:
"[Uber Delivery]"

// Base de datos (Supabase):
SELECT * FROM orders 
WHERE uber_delivery_id IS NULL 
AND delivery_type = 'delivery'
AND created_at > NOW() - INTERVAL '1 day';
```

---

## ⚠️ Limitaciones y Casos Futuros

### No Cubierto:
- Si Uber API está completamente down (30+ min)
- Si las credenciales de Uber son inválidas
- Si la dirección es geocodificable

### Mejoras Futuras:
- Webhook que notifique al admin automáticamente
- Retry automático cada 5 minutos
- Integración con sistema de alertas
- Reembolso automático si no se crea delivery

---

## 📞 Soporte

Para pedidos huérfanos existentes:
1. Ve a Admin Dashboard
2. Busca "Reintentar Entregas Fallidas"
3. Selecciona el pedido
4. Click "Reintentar"
5. ✅ Se crea la entrega automáticamente

Si sigue fallando, revisa:
- Credenciales de Uber en `organizations` tabla
- Logs en Supabase → Logs
- Browser console para errores de red
