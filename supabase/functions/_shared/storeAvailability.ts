// ¿La tienda acepta pedidos para AHORA? Fuente única para agentes (WhatsApp/web chat).
//
// Misma regla que la tienda web (canOrderNow en src/components/public/CheckoutForm.jsx),
// evaluada en este orden:
//   1. force_closed     → cerrada manualmente desde el admin (gana sobre el horario)
//   2. instant_enabled  → pedidos inmediatos desactivados
//   3. business_hours   → horario del día, en la zona horaria del comercio
//
// Importante: las Edge Functions corren en UTC; la hora se calcula con `timezone`
// de la organización (por defecto America/Santiago).

export interface DayHours { open?: string; close?: string; closed?: boolean }
export type WeekHours = Partial<Record<DayKey, DayHours>>
type DayKey = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'

export interface StoreAvailabilityInput {
  force_closed?: boolean | null
  closed_message?: string | null
  instant_enabled?: boolean | null
  business_hours?: WeekHours | string | null
  pickup_hours?: WeekHours | string | null
  timezone?: string | null
}

export interface StoreAvailability {
  open: boolean
  reason: 'force_closed' | 'instant_disabled' | 'outside_hours' | null
  /** Texto listo para enviar al cliente cuando está cerrada. */
  message: string
  /** "Lunes: 12:00 a 22:00, Martes: Cerrado, ..." */
  hoursSummary: string
}

const DAY_KEYS: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const DAY_NAMES: Record<DayKey, string> = {
  mon: 'Lunes', tue: 'Martes', wed: 'Miércoles', thu: 'Jueves', fri: 'Viernes', sat: 'Sábado', sun: 'Domingo',
}
const SUMMARY_ORDER: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const DEFAULT_TZ = 'America/Santiago'

const parseHours = (value: WeekHours | string | null | undefined): WeekHours | null => {
  if (!value) return null
  if (typeof value === 'string') {
    try { return JSON.parse(value) } catch { return null }
  }
  return value
}

const isEmpty = (hours: WeekHours | null) => !hours || Object.keys(hours).length === 0

const toMinutes = (time?: string) => {
  if (!time) return 0
  const [h, m] = String(time).split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** Día y minuto actual en la zona horaria dada. */
export function nowInTimezone(timezone: string | null | undefined, now = new Date()) {
  const tz = timezone || DEFAULT_TZ
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  } catch {
    parts = new Intl.DateTimeFormat('en-US', { timeZone: DEFAULT_TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const dayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'))
  return { dayIndex: dayIndex < 0 ? 0 : dayIndex, minutes: Number(get('hour')) * 60 + Number(get('minute')) }
}

// Igual que la tienda web: soporta cruce de medianoche (close < open).
const isWithinDay = (day: DayHours | undefined, minutes: number) => {
  if (!day || day.closed) return false
  const open = toMinutes(day.open)
  const close = toMinutes(day.close)
  if (close < open) return minutes >= open || minutes <= close
  return minutes >= open && minutes <= close
}

/** Próxima apertura dentro de 7 días: "hoy a las 18:00", "mañana a las 12:00", "el martes a las 12:00". */
function nextOpening(hours: WeekHours, dayIndex: number, minutes: number): string | null {
  for (let offset = 0; offset < 7; offset++) {
    const key = DAY_KEYS[(dayIndex + offset) % 7]
    const day = hours[key]
    if (!day || day.closed || !day.open) continue
    if (offset === 0 && toMinutes(day.open) <= minutes) continue
    const when = offset === 0 ? 'hoy' : offset === 1 ? 'mañana' : `el ${DAY_NAMES[key].toLowerCase()}`
    return `${when} a las ${day.open}`
  }
  return null
}

export function summarizeHours(hours: WeekHours | null): string {
  if (isEmpty(hours)) return 'No especificado'
  return SUMMARY_ORDER
    .filter((key) => hours![key])
    .map((key) => {
      const day = hours![key]!
      return day.closed ? `${DAY_NAMES[key]}: Cerrado` : `${DAY_NAMES[key]}: ${day.open} a ${day.close}`
    })
    .join(', ')
}

export function getStoreAvailability(org: StoreAvailabilityInput, now = new Date()): StoreAvailability {
  const businessHours = parseHours(org.business_hours)
  const pickupHours = parseHours(org.pickup_hours)
  const hoursSummary = summarizeHours(businessHours)

  // 1. Cierre manual desde el admin: gana siempre sobre el horario.
  if (org.force_closed === true) {
    const custom = (org.closed_message || '').trim()
    return {
      open: false,
      reason: 'force_closed',
      // Siempre explícito que está cerrada; el mensaje del admin complementa.
      message: custom
        ? `Tienda cerrada - ${custom}`
        : 'Tienda cerrada - En este momento no estamos recibiendo pedidos. ¡Gracias por tu paciencia!',
      hoursSummary,
    }
  }

  // 2. Pedidos inmediatos desactivados.
  if (org.instant_enabled === false) {
    return {
      open: false,
      reason: 'instant_disabled',
      message: 'En este momento no estamos tomando pedidos para entrega inmediata.',
      hoursSummary,
    }
  }

  // 3. Horario. Sin horario comercial: abierta solo si tampoco hay horario de retiro (igual que la web).
  const { dayIndex, minutes } = nowInTimezone(org.timezone, now)
  const open = isEmpty(businessHours)
    ? isEmpty(pickupHours)
    : isWithinDay(businessHours![DAY_KEYS[dayIndex]], minutes)

  if (open) return { open: true, reason: null, message: '', hoursSummary }

  const next = businessHours ? nextOpening(businessHours, dayIndex, minutes) : null
  return {
    open: false,
    reason: 'outside_hours',
    message: next
      ? `En este momento estamos fuera de horario. Volvemos a recibir pedidos ${next}.`
      : 'En este momento estamos fuera de horario y no estamos recibiendo pedidos.',
    hoursSummary,
  }
}
