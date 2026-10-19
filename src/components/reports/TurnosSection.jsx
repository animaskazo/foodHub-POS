import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { ChevronDown, Banknote, CreditCard, ArrowLeftRight, Globe, CalendarClock } from 'lucide-react'

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

const fmt = (n) => {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—'
  const v = Number(n)
  return `${v < 0 ? '-' : ''}$${Math.abs(Math.round(v)).toLocaleString('es-CL')}`
}

const fmtTime = (iso) => new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })

const fmtDate = (iso) => {
  const d = new Date(iso)
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

const fmtDateShort = (iso) => {
  const d = new Date(iso)
  return `${DAYS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}`
}

const fmtDuration = (ms) => {
  if (!ms || ms < 0) return '—'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return `${h}h ${String(m).padStart(2, '0')}m`
}

const methodMeta = {
  cash: { label: 'Efectivo', icon: Banknote, bar: 'bg-emerald-500', text: 'text-emerald-600' },
  card: { label: 'Tarjeta', icon: CreditCard, bar: 'bg-blue-500', text: 'text-blue-600' },
  transfer: { label: 'Transferencia', icon: ArrowLeftRight, bar: 'bg-violet-500', text: 'text-violet-600' },
  online: { label: 'Online', icon: Globe, bar: 'bg-cyan-500', text: 'text-cyan-600' },
  other: { label: 'Otro', icon: Banknote, bar: 'bg-gray-400', text: 'text-gray-500' },
}

const bucketOf = (method) => {
  const m = (method || '').toLowerCase()
  if (m.includes('cash') || m === 'efectivo') return 'cash'
  if (m.includes('card') || m === 'tarjeta' || m.includes('debito') || m.includes('credito')) return 'card'
  if (m.includes('transfer') || m === 'transferencia') return 'transfer'
  if (m.includes('online') || m === 'klap' || m === 'webpay' || m === 'gateway') return 'online'
  return 'other'
}

const SectionLabel = ({ children }) => (
  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2.5">{children}</p>
)

const KV = ({ label, value, bold }) => (
  <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
    <span className="text-gray-500">{label}</span>
    <span className={`${bold ? 'font-bold' : 'font-semibold'} text-gray-900 tabular-nums text-right`}>{value}</span>
  </div>
)

const diffStyle = (diff) => {
  const rounded = Math.round(diff)
  if (rounded === 0) return { cls: 'text-emerald-600 bg-emerald-50', label: 'Cuadrado' }
  if (rounded > 0) return { cls: 'text-amber-600 bg-amber-50', label: 'Sobrante' }
  return { cls: 'text-red-600 bg-red-50', label: 'Faltante' }
}

const TurnosSection = ({ shifts, orders, cm, cy }) => {
  const [expandedId, setExpandedId] = useState(null)
  const [names, setNames] = useState({})

  const monthShifts = useMemo(
    () => (shifts || [])
      .filter(s => {
        const d = new Date(s.start_time)
        return d.getFullYear() === cy && d.getMonth() === cm
      })
      .sort((a, b) => new Date(b.start_time) - new Date(a.start_time)),
    [shifts, cm, cy]
  )

  // Nombres de quienes abrieron/cerraron cada turno
  useEffect(() => {
    const ids = [...new Set(monthShifts.flatMap(s => [s.opened_by, s.closed_by]).filter(Boolean))]
    if (!ids.length) return
    let cancelled = false
    supabase.from('staff').select('id, name').in('id', ids)
      .then(({ data }) => {
        if (cancelled) return
        setNames(Object.fromEntries((data || []).map(r => [r.id, r.name || 'Usuario'])))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [monthShifts])

  const rows = useMemo(() => {
    const now = Date.now()
    return monthShifts.map(s => {
      const start = new Date(s.start_time).getTime()
      const end = s.end_time ? new Date(s.end_time).getTime() : now
      const inWindow = (orders || []).filter(o => {
        const t = new Date(o.created_at).getTime()
        return t >= start && t <= end
      })
      const methods = { cash: 0, card: 0, transfer: 0, online: 0, other: 0 }
      let computedTotal = 0
      inWindow.forEach(o => {
        computedTotal += Number(o.total || 0)
        ;(o.payments || []).filter(p => p.status === 'paid').forEach(p => {
          methods[bucketOf(p.method)] += Number(p.amount || 0)
        })
      })
      const declared = s.reported_balance != null
        ? Number(s.reported_balance)
        : (s.ending_balance != null ? Number(s.ending_balance) : null)
      const expectedCash = Number(s.starting_balance || 0) + methods.cash
      return {
        shift: s,
        isOpen: !s.end_time || s.status !== 'closed',
        duration: end - start,
        orderCount: inWindow.length,
        methods,
        total: Number(s.total_sales) || computedTotal,
        expectedCash,
        declared,
        diff: declared != null ? declared - expectedCash : null,
      }
    })
  }, [monthShifts, orders])

  const summary = useMemo(() => {
    const closed = rows.filter(r => !r.isOpen)
    const withDiff = closed.filter(r => r.diff != null)
    return {
      count: rows.length,
      open: rows.filter(r => r.isOpen).length,
      sales: rows.reduce((s, r) => s + r.total, 0),
      orders: rows.reduce((s, r) => s + r.orderCount, 0),
      netDiff: withDiff.length ? withDiff.reduce((s, r) => s + r.diff, 0) : null,
    }
  }, [rows])

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200/80 p-10 text-center">
        <CalendarClock className="mx-auto mb-3 h-6 w-6" />
        <p className="text-sm font-medium text-gray-400">No hay turnos en este período.</p>
        <p className="text-xs text-gray-400 mt-1">Los turnos aparecen aquí al abrir o cerrar caja desde el POS.</p>
      </div>
    )
  }

  const netStyle = summary.netDiff != null ? diffStyle(summary.netDiff) : null

  return (
    <div className="space-y-4">
      {/* Resumen del período */}
      <div className="bg-white rounded-2xl border border-gray-200/80 p-6 sm:p-7">
        <div className="mb-5">
          <h2 className="text-lg font-bold text-gray-900 mb-0.5">Turnos de {MONTHS[cm]} {cy}</h2>
          <p className="text-sm text-gray-500">
            {summary.count} {summary.count === 1 ? 'turno registrado' : 'turnos registrados'}
            {summary.open > 0 ? ` · ${summary.open} en curso` : ' · todos cerrados'}
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
          <div className="min-w-0">
            <div className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight tabular-nums">{summary.count}</div>
            <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mt-1">Turnos</div>
            <div className="text-[11px] text-gray-400 mt-1.5">{summary.open > 0 ? `${summary.open} abierto${summary.open !== 1 ? 's' : ''}` : 'todos cerrados'}</div>
          </div>
          <div className="min-w-0">
            <div className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight tabular-nums truncate">{fmt(summary.sales)}</div>
            <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mt-1">Ventas totales</div>
            <div className="text-[11px] text-gray-400 mt-1.5">{summary.orders} {summary.orders === 1 ? 'orden' : 'órdenes'}</div>
          </div>
          <div className="min-w-0">
            <div className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight tabular-nums truncate">{summary.orders > 0 ? fmt(summary.sales / summary.orders) : '—'}</div>
            <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mt-1">Ticket promedio</div>
            <div className="text-[11px] text-gray-400 mt-1.5">por turno</div>
          </div>
          <div className="min-w-0">
            <div className={`text-2xl sm:text-3xl font-bold tracking-tight tabular-nums truncate ${netStyle ? netStyle.cls.split(' ')[0] : 'text-gray-900'}`}>
              {summary.netDiff != null ? fmt(summary.netDiff) : '—'}
            </div>
            <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mt-1">Cuadre neto</div>
            <div className="text-[11px] text-gray-400 mt-1.5">
              {summary.netDiff == null ? 'sin cuadres registrados' : Math.round(summary.netDiff) === 0 ? 'cuadre exacto' : Math.round(summary.netDiff) > 0 ? 'sobrante total' : 'faltante total'}
            </div>
          </div>
        </div>
      </div>

      {/* Lista de turnos */}
      {rows.map(r => {
        const s = r.shift
        const expanded = expandedId === s.id
        const ownerName = names[s.opened_by] || '—'
        const closerName = s.closed_by ? (names[s.closed_by] || 'Usuario') : null
        const diff = r.diff != null ? Math.round(r.diff) : null
        const style = diff != null ? diffStyle(diff) : null
        const methodsSum = Object.values(r.methods).reduce((a, b) => a + b, 0)

        return (
          <div key={s.id} className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden">
            <button
              onClick={() => setExpandedId(expanded ? null : s.id)}
              aria-expanded={expanded}
              className="w-full flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-4 text-left hover:bg-gray-50/50 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 bg-gray-100 text-[11px] font-bold text-gray-600 uppercase tracking-wider rounded-md">
                    {fmtDateShort(s.start_time)}
                  </span>
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider rounded-md ${r.isOpen ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${r.isOpen ? 'bg-amber-500 animate-pulse' : 'bg-gray-400'}`} />
                    {r.isOpen ? 'En curso' : 'Cerrado'}
                  </span>
                </div>
                <div className="mt-1.5 text-sm text-gray-700 truncate">
                  <span className="font-semibold text-gray-900 tabular-nums">{fmtTime(s.start_time)} → {s.end_time ? fmtTime(s.end_time) : '—'}</span>
                  <span className="text-gray-400"> · {fmtDuration(r.duration)}</span>
                </div>
                <div className="mt-0.5 text-xs text-gray-400 truncate">
                  Abierto por {ownerName}{closerName ? ` · Cerrado por ${closerName}` : ''}
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="text-base font-bold text-gray-900 tabular-nums">{fmt(r.total)}</div>
                {style ? (
                  <span className={`inline-block mt-1 px-2 py-0.5 text-[11px] font-bold rounded-md ${style.cls}`}>
                    {style.label} {diff !== 0 ? (diff > 0 ? '+' : '') + fmt(diff) : ''}
                  </span>
                ) : (
                  <span className="inline-block mt-1 text-[11px] text-gray-400 tabular-nums">{r.orderCount} {r.orderCount === 1 ? 'orden' : 'órdenes'}</span>
                )}
              </div>

              <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>

            {expanded && (
              <div className="px-4 sm:px-5 pt-4 pb-5 border-t border-gray-100">
                <div className="grid sm:grid-cols-2 gap-x-10 gap-y-6">
                  <div>
                    <SectionLabel>Apertura</SectionLabel>
                    <KV label="Fecha" value={fmtDate(s.start_time)} />
                    <KV label="Hora" value={fmtTime(s.start_time)} />
                    <KV label="Fondo inicial" value={fmt(s.starting_balance)} />
                    <KV label="Abierto por" value={ownerName} />
                  </div>
                  <div>
                    <SectionLabel>Cierre</SectionLabel>
                    {r.isOpen ? (
                      <>
                        <KV label="Estado" value={<span className="inline-flex items-center gap-1.5 text-amber-600"><span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />En curso</span>} />
                        <KV label="Transcurrido" value={fmtDuration(r.duration)} />
                        <KV label="Efectivo esperado" value={fmt(r.expectedCash)} />
                      </>
                    ) : (
                      <>
                        <KV label="Fecha" value={fmtDate(s.end_time)} />
                        <KV label="Hora" value={fmtTime(s.end_time)} />
                        <KV label="Duración" value={fmtDuration(r.duration)} />
                        <KV label="Declarado" value={fmt(r.declared)} />
                        <KV label="Cerrado por" value={closerName || '—'} />
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-6 pt-5 border-t border-gray-100 grid sm:grid-cols-2 gap-x-10 gap-y-6">
                  <div>
                    <SectionLabel>Ventas del turno</SectionLabel>
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <div>
                        <div className="text-lg font-bold text-gray-900 tabular-nums truncate">{fmt(r.total)}</div>
                        <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Total</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-gray-900 tabular-nums">{r.orderCount}</div>
                        <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Órdenes</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-gray-900 tabular-nums truncate">{r.orderCount > 0 ? fmt(r.total / r.orderCount) : '—'}</div>
                        <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Ticket</div>
                      </div>
                    </div>
                    {methodsSum > 0 && (
                      <div className="space-y-3">
                        {Object.entries(r.methods).filter(([, v]) => v > 0).map(([key, value]) => {
                          const m = methodMeta[key]
                          const pct = (value / methodsSum) * 100
                          const Icon = m.icon
                          return (
                            <div key={key} className="flex items-center gap-3">
                              <Icon className={`h-4 w-4 ${m.text} shrink-0`} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2 mb-1">
                                  <span className="text-sm font-medium text-gray-900 truncate">{m.label}</span>
                                  <span className="text-sm font-semibold text-gray-900 tabular-nums shrink-0">{fmt(value)}</span>
                                </div>
                                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${m.bar}`} style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                              <span className="text-xs text-gray-400 tabular-nums shrink-0 w-9 text-right">{pct.toFixed(0)}%</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  <div>
                    <SectionLabel>Cuadre de efectivo</SectionLabel>
                    <KV label="Fondo inicial" value={fmt(s.starting_balance)} />
                    <KV label="Ventas en efectivo" value={fmt(r.methods.cash)} />
                    <div className="flex items-center justify-between gap-3 py-1.5 text-sm border-t border-gray-100 mt-1">
                      <span className="text-gray-700 font-semibold">Esperado en caja</span>
                      <span className="font-bold text-gray-900 tabular-nums">{fmt(r.expectedCash)}</span>
                    </div>
                    <KV label={r.isOpen ? 'Declarado' : 'Contado al cierre'} value={r.isOpen ? <span className="text-amber-600">En curso</span> : fmt(r.declared)} />
                    {!r.isOpen && r.diff != null && (
                      <div className={`mt-3 rounded-xl p-4 text-center ${style.cls}`}>
                        <div className="text-[11px] font-bold uppercase tracking-wider opacity-80">{style.label}</div>
                        <div className="text-xl font-bold tabular-nums mt-0.5">
                          {diff > 0 ? '+' : ''}{fmt(diff)}
                        </div>
                      </div>
                    )}
                    {!r.isOpen && r.diff == null && (
                      <p className="mt-3 text-xs text-gray-400">Sin cuadre registrado para este turno.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default TurnosSection
