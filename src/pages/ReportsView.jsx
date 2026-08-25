import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { supabase } from '../lib/supabase'
import { useAuth } from '../components/AuthContext'
import PageHeader from '../components/ui/PageHeader'
import SalesAreaChart from '../components/charts/SalesAreaChart'
import DonutChart from '../components/charts/DonutChart'
import HourHeatmap from '../components/charts/HourHeatmap'
import ReportsChatDrawer from '../components/reports/ReportsChatDrawer'
import { ChevronLeft, ChevronRight, Loader2, FileDown, CalendarDays, FileText, FileSpreadsheet, Store, ShoppingBag, Globe, MessageCircle, Van, LineChart, TrendingUp, TrendingDown, Minus, Trophy, Clock, Ban, Wallet, Sparkles, Send } from 'lucide-react'

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const DAYS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']

const fmt = (n) => {
  if (!n && n !== 0) return '—'
  return '$' + Number(n).toLocaleString('es-CL')
}

const paymentMeta = {
  cash:          { label: 'Efectivo',   bar: 'bg-emerald-500', color: '#10b981' },
  card:          { label: 'Tarjeta',    bar: 'bg-blue-500',    color: '#3b82f6' },
  transfer:      { label: 'Transfer.',  bar: 'bg-violet-500',  color: '#8b5cf6' },
  online_gateway:{ label: 'Online',     bar: 'bg-cyan-500',    color: '#06b6d4' },
}

const channelMeta = {
  table:    { label: 'Local',    icon: Store,        bg: 'bg-orange-50',   iconColor: 'text-orange-600' },
  pickup:   { label: 'Retiro',   icon: ShoppingBag,  bg: 'bg-teal-50',     iconColor: 'text-teal-600' },
  delivery: { label: 'Delivery', icon: Van,           bg: 'bg-amber-50',   iconColor: 'text-amber-600' },
  online:   { label: 'Online',   icon: Globe,         bg: 'bg-indigo-50',   iconColor: 'text-indigo-600' },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle, bg: 'bg-emerald-50', iconColor: 'text-emerald-600' },
}

const calcDay = (orders) => {
  const rev = orders.reduce((s, o) => s + Number(o.total || 0), 0)
  const cnt = orders.length
  const avg = cnt > 0 ? Math.round(rev / cnt) : 0
  const payments = {}; const channels = {}; let fees = 0
  orders.forEach(o => {
    const ch = o.delivery_type === 'delivery' ? 'delivery' : (o.order_type || 'other')
    channels[ch] = (channels[ch] || 0) + 1
    fees += Number(o.delivery_fee || 0)
    if (o.payments) o.payments.filter(p => p.status === 'paid').forEach(p => {
      const m = p.method || 'other'
      payments[m] = (payments[m] || 0) + Number(p.amount || 0)
    })
  })
  return { rev, cnt, avg, payments, channels, fees }
}

const ReportsView = () => {
  const { organization, loading: authLoading } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [today] = useState(() => new Date())
  const [cm, setCm] = useState(() => today.getMonth())
  const [cy, setCy] = useState(() => today.getFullYear())
  const [shifts, setShifts] = useState([])
  const [orders, setOrders] = useState([])
  const [cancelledCount, setCancelledCount] = useState(0)
  const [totalOrderCount, setTotalOrderCount] = useState(0)
  const [selected, setSelected] = useState('resumen')
  const [openDropdown, setOpenDropdown] = useState(null)
  const [annualYear, setAnnualYear] = useState(() => today.getFullYear())
  const [annual, setAnnual] = useState(null)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const dropdownRef = useRef(null)
  const printRef = useRef()

  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpenDropdown(null)
    }
    if (openDropdown) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [openDropdown])

  useDocumentTitle('Reportes')

  useEffect(() => {
    if (authLoading || !organization?.id || selected === 'anual') return
    setLoading(true); setError(null)
    const s = new Date(cy, cm, 1)
    const e = new Date(cy, cm + 1, 0, 23, 59, 59, 999)
    ;(async () => {
      try {
        const [sr, or] = await Promise.all([
          supabase.from('shifts').select('*').eq('organization_id', organization.id).gte('start_time', s.toISOString()).lte('start_time', e.toISOString()).order('start_time', { ascending: false }),
          supabase.from('orders').select('id, order_number, order_type, delivery_type, status, total, delivery_fee, created_at, payments ( method, amount, status ), order_items ( product_name, quantity, unit_price )').eq('organization_id', organization.id).gte('created_at', s.toISOString()).lte('created_at', e.toISOString()).order('created_at', { ascending: false }),
        ])
        if (sr.error) throw sr.error
        if (or.error) throw or.error
        setShifts(sr.data || [])
        const allOrders = or.data || []
        setTotalOrderCount(allOrders.length)
        setCancelledCount(allOrders.filter(o => o.status === 'cancelled').length)
        // Solo incluir órdenes que tengan al menos un pago completado (status 'paid')
        setOrders(allOrders.filter(o => o.status !== 'cancelled' && o.status !== 'refunded' && o.payments?.some(p => p.status === 'paid')))
      } catch (err) { console.error(err); setError('Error al cargar los datos.') }
      finally { setLoading(false) }
    })()
  }, [organization?.id, authLoading, cm, cy, selected])

  useEffect(() => {
    if (authLoading || !organization?.id || selected !== 'anual') return
    setLoading(true); setError(null)
    const start = new Date(annualYear, 0, 1)
    const end = new Date(annualYear + 1, 0, 0, 23, 59, 59, 999)
    const pStart = new Date(annualYear - 1, 0, 1)
    const pEnd = new Date(annualYear - 1, 11, 31, 23, 59, 59, 999)
    const sel = 'id, total, status, created_at, payments ( status )'
    ;(async () => {
      try {
        const [cr, pr] = await Promise.all([
          supabase.from('orders').select(sel).eq('organization_id', organization.id).gte('created_at', start.toISOString()).lte('created_at', end.toISOString()),
          supabase.from('orders').select(sel).eq('organization_id', organization.id).gte('created_at', pStart.toISOString()).lte('created_at', pEnd.toISOString()),
        ])
        if (cr.error) throw cr.error
        if (pr.error) throw pr.error
        // Solo incluir órdenes pagadas (no canceladas/reembolsadas y con al menos un pago 'paid')
        const clean = (rows) => (rows || []).filter(o => o.status !== 'cancelled' && o.status !== 'refunded' && o.payments?.some(p => p.status === 'paid'))
        const bucket = (rows) => {
          const m = Array.from({ length: 12 }, () => ({ sales: 0, orders: 0 }))
          ;(rows || []).forEach(o => {
            const i = new Date(o.created_at).getMonth()
            m[i].sales += Number(o.total || 0)
            m[i].orders += 1
          })
          return m
        }
        setAnnual({ year: annualYear, current: bucket(clean(cr.data)), previous: bucket(clean(pr.data)) })
      } catch (err) { console.error(err); setError('Error al cargar los datos anuales.') }
      finally { setLoading(false) }
    })()
  }, [organization?.id, authLoading, annualYear, selected])

  const prev = () => { if (cm === 0) { setCm(11); setCy(y => y - 1) } else setCm(m => m - 1) }
  const next = () => { if (cm === 11) { setCm(0); setCy(y => y + 1) } else setCm(m => m + 1) }

  const days = useMemo(() => {
    const r = []
    const dc = new Date(cy, cm + 1, 0).getDate()
    for (let d = 1; d <= dc; d++) {
      const ds = `${cy}-${String(cm + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const ss = shifts.filter(s => new Date(s.start_time).toISOString().slice(0, 10) === ds)
      const os = orders.filter(o => new Date(o.created_at).toISOString().slice(0, 10) === ds)
      if (ss.length > 0 || os.length > 0) r.push({ date: ds, shifts: ss, orders: os })
    }
    return r.reverse()
  }, [shifts, orders, cm, cy])

  const isCm = cm === today.getMonth() && cy === today.getFullYear()
  const validOrders = orders // ya filtrados al cargar (solo pagados, no cancelados/reembolsados)
  const mRev = validOrders.reduce((s, o) => s + Number(o.total || 0), 0)
  const mOrd = validOrders.length
  const mFees = validOrders.reduce((s, o) => s + Number(o.delivery_fee || 0), 0)
  const mNetRev = mRev - mFees

  // KPI: Top productos del mes
  const topProducts = useMemo(() => {
    const map = {}
    validOrders.forEach(o => {
      if (o.order_items) o.order_items.forEach(item => {
        const name = item.product_name || 'Sin nombre'
        if (!map[name]) map[name] = { name, qty: 0, revenue: 0 }
        map[name].qty += Number(item.quantity || 1)
        map[name].revenue += Number(item.unit_price || 0) * Number(item.quantity || 1)
      })
    })
    return Object.values(map).sort((a, b) => b.qty - a.qty).slice(0, 5)
  }, [validOrders])

  // KPI: Hora pico
  const peakHour = useMemo(() => {
    const hours = Array.from({ length: 24 }, () => 0)
    validOrders.forEach(o => {
      const h = new Date(o.created_at).getHours()
      hours[h]++
    })
    const maxH = hours.indexOf(Math.max(...hours))
    return { hour: maxH, count: hours[maxH], distribution: hours }
  }, [validOrders])

  // KPI: Tasa de cancelación
  const cancellationRate = totalOrderCount > 0 ? (cancelledCount / totalOrderCount) * 100 : 0

  // KPI: Ticket promedio por canal
  const ticketByChannel = useMemo(() => {
    const map = {}
    validOrders.forEach(o => {
      const ch = o.delivery_type === 'delivery' ? 'delivery' : (o.order_type || 'other')
      if (!map[ch]) map[ch] = { total: 0, count: 0 }
      map[ch].total += Number(o.total || 0)
      map[ch].count += 1
    })
    return Object.entries(map).map(([key, v]) => ({
      key,
      ...(channelMeta[key] || { label: key, icon: Store, iconColor: 'text-gray-500' }),
      avg: Math.round(v.total / v.count),
      count: v.count
    })).sort((a, b) => b.avg - a.avg)
  }, [validOrders])

  // Donut chart payment data
  const paymentDonutData = useMemo(() => {
    const totals = {};
    days.forEach((d) => {
      const { payments } = calcDay(d.orders);
      Object.entries(payments).forEach(([k, v]) => {
        totals[k] = (totals[k] || 0) + v;
      });
    });

    return Object.entries(paymentMeta)
      .map(([key, meta]) => ({
        key,
        label: meta.label,
        value: totals[key] || 0,
        color: meta.color,
      }))
      .filter((item) => item.value > 0);
  }, [days]);

  // Payload para el chat de IA BI
  const summaryReportPayload = useMemo(() => {
    return {
      periodo: `${MONTHS[cm]} ${cy}`,
      ventasTotales: mRev,
      totalOrdenes: mOrd,
      ticketPromedio: mOrd > 0 ? Math.round(mRev / mOrd) : 0,
      ingresoNeto: mNetRev,
      totalDeliveryFees: mFees,
      tasaCancelacion: `${cancellationRate.toFixed(1)}%`,
      ordenesCanceladas: cancelledCount,
      horaPico: peakHour.count > 0 ? `${String(peakHour.hour).padStart(2, '0')}:00 (${peakHour.count} órdenes)` : 'N/A',
      productosMasVendidos: topProducts.map(p => ({ producto: p.name, cantidadVendida: p.qty, ingresosGenerados: p.revenue })),
      metodosDePago: paymentDonutData.map(p => ({ metodo: p.label, montoTotal: p.value })),
      ticketPorCanal: ticketByChannel.map(c => ({ canal: c.label, ordenes: c.count, ticketPromedio: c.avg })),
      resumenDiario: days.map(d => {
        const { rev, cnt, avg } = calcDay(d.orders);
        return { fecha: d.date, ventas: rev, ordenes: cnt, ticketPromedio: avg };
      })
    };
  }, [cm, cy, mRev, mOrd, mNetRev, mFees, cancellationRate, cancelledCount, peakHour, topProducts, paymentDonutData, ticketByChannel, days]);

  const annualStats = useMemo(() => {
    if (!annual) return null
    const cur = annual.current
    const prev = annual.previous
    const total = cur.reduce((s, m) => s + m.sales, 0)
    const ordersCount = cur.reduce((s, m) => s + m.orders, 0)
    const prevTotal = prev.reduce((s, m) => s + m.sales, 0)
    const active = cur.filter(m => m.orders > 0).length
    const avg = active > 0 ? Math.round(total / active) : 0
    let best = -1, worst = -1
    cur.forEach((m, i) => {
      if (m.sales > 0 && (best === -1 || m.sales > cur[best].sales)) best = i
      if (m.orders > 0 && (worst === -1 || m.sales < cur[worst].sales)) worst = i
    })
    const pct = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : null
    return { total, ordersCount, avg, best, worst, pct, prevTotal }
  }, [annual])

  const annualChange = (i) => {
    if (!annual || i === 0) return null
    const prevS = annual.current[i - 1].sales
    const curS = annual.current[i].sales
    if (prevS === 0) return null
    return ((curS - prevS) / prevS) * 100
  }

  const pctBadge = (value, inverse = false) => {
    if (value === null || value === undefined) return <span className="text-xs text-gray-400">—</span>
    if (value === 0) return <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500"><Minus className="h-3 w-3" />0%</span>
    const up = value > 0
    const good = inverse ? !up : up
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-semibold ${good ? 'text-emerald-600' : 'text-red-500'}`}>
        {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        {Math.abs(value).toFixed(1)}%
      </span>
    )
  }

  const buildDayRows = (data) => {
    const rows = data.map(d => {
      const { rev, cnt, avg, payments, channels, fees } = calcDay(d.orders)
      const dt = new Date(d.date + 'T12:00:00')
      const chStr = Object.entries(channelMeta)
        .filter(([k]) => channels[k])
        .map(([k, m]) => `${m.label}: ${channels[k]}`)
        .join(', ')
      return {
        'Día': `${DAYS[dt.getDay()]}, ${dt.getDate()} ${MONTHS[dt.getMonth()]}`,
        'Ventas': rev,
        'Órdenes': cnt,
        'Ticket Prom.': avg,
        'Efectivo': payments.cash || 0,
        'Tarjeta': payments.card || 0,
        'Transferencia': payments.transfer || 0,
        'Online': payments.online_gateway || 0,
        'Delivery Fees': fees,
        'Canales': chStr,
      }
    })

    const totalRev = data.reduce((s, d) => s + calcDay(d.orders).rev, 0)
    const totalOrd = data.reduce((s, d) => s + d.orders.length, 0)
    const totalAvg = totalOrd > 0 ? Math.round(totalRev / totalOrd) : 0
    const tPay = {}
    const totalChannels = {}
    data.forEach(d => {
      const { payments, channels } = calcDay(d.orders)
      Object.entries(payments).forEach(([k, v]) => { tPay[k] = (tPay[k] || 0) + v })
      Object.entries(channels).forEach(([k, v]) => { totalChannels[k] = (totalChannels[k] || 0) + v })
    })
    const totalChStr = Object.entries(channelMeta)
      .filter(([k]) => totalChannels[k])
      .map(([k, m]) => `${m.label}: ${totalChannels[k]}`)
      .join(', ')

    rows.push({
      'Día': 'TOTAL',
      'Ventas': totalRev,
      'Órdenes': totalOrd,
      'Ticket Prom.': totalAvg,
      'Efectivo': tPay.cash || 0,
      'Tarjeta': tPay.card || 0,
      'Transferencia': tPay.transfer || 0,
      'Online': tPay.online_gateway || 0,
      'Delivery Fees': data.reduce((s, d) => s + calcDay(d.orders).fees, 0),
      'Canales': totalChStr,
    })

    return rows
  }

  const exportExcel = async (data, label) => {
    const mod = await import('xlsx')
    const XLSX = mod.utils ? mod : mod.default
    const wb = XLSX.utils.book_new()

    const orgName = organization?.name || 'FoodHub'
    const title = `Reporte ${label} - ${MONTHS[cm]} ${cy}`

    const totalRev = data.reduce((s, d) => s + calcDay(d.orders).rev, 0)
    const totalOrd = data.reduce((s, d) => s + d.orders.length, 0)
    const totalAvg = totalOrd > 0 ? Math.round(totalRev / totalOrd) : 0
    const totalFees = data.reduce((s, d) => s + calcDay(d.orders).fees, 0)

    const allPayments = {}
    data.forEach(d => {
      const { payments } = calcDay(d.orders)
      Object.entries(payments).forEach(([k, v]) => { allPayments[k] = (allPayments[k] || 0) + v })
    })

    const dayRows = buildDayRows(data)

    // Summary sheet
    const summaryData = [
      ['Métrica', 'Valor'],
      ['Organización', orgName],
      ['Período', title],
      ['Ventas Totales', totalRev],
      ['Órdenes', totalOrd],
      ['Ticket Promedio', totalAvg],
      ['Delivery Fees', totalFees],
    ]
    Object.entries(paymentMeta).forEach(([key, m]) => {
      const amt = allPayments[key] || 0
      if (amt) summaryData.push([m.label, amt])
    })
    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData)
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Resumen')

    // Daily sheet
    const dailyWs = XLSX.utils.json_to_sheet(dayRows)
    XLSX.utils.book_append_sheet(wb, dailyWs, 'Detalle Diario')

    // Column widths
    dailyWs['!cols'] = [
      { wch: 25 }, { wch: 14 }, { wch: 8 }, { wch: 14 },
      { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 },
      { wch: 14 }, { wch: 30 },
    ]

    XLSX.writeFile(wb, `reporte-${label.toLowerCase()}-${MONTHS[cm].toLowerCase()}-${cy}.xlsx`)
  }

  const exportCSV = (data, label) => {
    const orgName = organization?.name || 'FoodHub'
    const title = `Reporte ${label} - ${MONTHS[cm]} ${cy}`

    const totalRev = data.reduce((s, d) => s + calcDay(d.orders).rev, 0)
    const totalOrd = data.reduce((s, d) => s + d.orders.length, 0)
    const totalAvg = totalOrd > 0 ? Math.round(totalRev / totalOrd) : 0
    const totalFees = data.reduce((s, d) => s + calcDay(d.orders).fees, 0)

    const allPayments = {}
    data.forEach(d => {
      const { payments } = calcDay(d.orders)
      Object.entries(payments).forEach(([k, v]) => { allPayments[k] = (allPayments[k] || 0) + v })
    })

    const summaryRows = [
      ['Métrica', 'Valor'],
      ['Organización', orgName],
      ['Período', title],
      ['Ventas Totales', totalRev],
      ['Órdenes', totalOrd],
      ['Ticket Promedio', totalAvg],
      ['Delivery Fees', totalFees],
      ...Object.entries(paymentMeta)
        .filter(([key]) => allPayments[key])
        .map(([key, m]) => [m.label, allPayments[key]]),
    ]

    const dayRows = buildDayRows(data)
    const dayCols = ['Día', 'Ventas', 'Órdenes', 'Ticket Prom.', 'Efectivo', 'Tarjeta', 'Transferencia', 'Online', 'Delivery Fees', 'Canales']
    const csvRows = [
      ...summaryRows,
      [],
      dayCols,
      ...dayRows.map(r => dayCols.map(c => r[c])),
    ]

    const escape = (v) => {
      if (v === null || v === undefined) return ''
      const s = String(v)
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const csv = csvRows.map(row => row.map(escape).join(',')).join('\n')

    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reporte-${label.toLowerCase()}-${MONTHS[cm].toLowerCase()}-${cy}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="bg-gray-50 p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* ── Header ── */}
        <PageHeader
          title="Reportes"
          subtitle="Resumen de ventas diarias"
          actions={
            <div className="flex items-center gap-2" ref={dropdownRef}>
              {/* AI Chat button */}
              <button
                onClick={() => setIsChatOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 rounded-xl shadow-[0_1px_3px_0_rgba(0,0,0,0.06)] text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
              >
                <Sparkles className="h-4 w-4" /> Asistente IA
              </button>

              {/* Semanal dropdown */}
              <div className="relative">
                <button onClick={() => setOpenDropdown(openDropdown === 'weekly' ? null : 'weekly')}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-white rounded-xl shadow-[0_1px_3px_0_rgba(0,0,0,0.06)] border border-gray-200/80 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                  <FileDown className="h-4 w-4" /> Semanal
                </button>
                {openDropdown === 'weekly' && (
                  <div className="absolute right-0 top-full mt-1.5 w-36 bg-white rounded-xl shadow-lg border border-gray-200/80 py-1 z-50 overflow-hidden">
                    <button onClick={() => { exportExcel(days.slice(0, 7), 'Semanal'); setOpenDropdown(null) }}
                      className="flex items-center gap-2.5 w-full text-left px-3.5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                      <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> XLS
                    </button>
                    <button onClick={() => { exportCSV(days.slice(0, 7), 'Semanal'); setOpenDropdown(null) }}
                      className="flex items-center gap-2.5 w-full text-left px-3.5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                      <FileText className="h-4 w-4 text-blue-500" /> CSV
                    </button>
                  </div>
                )}
              </div>

              {/* Mensual dropdown */}
              <div className="relative">
                <button onClick={() => setOpenDropdown(openDropdown === 'monthly' ? null : 'monthly')}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-gray-900 rounded-xl text-sm font-semibold text-white hover:bg-gray-800 transition-colors">
                  <FileDown className="h-4 w-4" /> Mensual
                </button>
                {openDropdown === 'monthly' && (
                  <div className="absolute right-0 top-full mt-1.5 w-36 bg-white rounded-xl shadow-lg border border-gray-200/80 py-1 z-50 overflow-hidden">
                    <button onClick={() => { exportExcel(days, 'Mensual'); setOpenDropdown(null) }}
                      className="flex items-center gap-2.5 w-full text-left px-3.5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                      <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> XLS
                    </button>
                    <button onClick={() => { exportCSV(days, 'Mensual'); setOpenDropdown(null) }}
                      className="flex items-center gap-2.5 w-full text-left px-3.5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                      <FileText className="h-4 w-4 text-blue-500" /> CSV
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 bg-white rounded-xl shadow-[0_1px_3px_0_rgba(0,0,0,0.06)] border border-gray-200/80 px-2 py-1.5">
                <button onClick={prev} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"><ChevronLeft className="h-4 w-4 text-gray-500" /></button>
                <span className="text-sm font-semibold text-gray-900 min-w-[130px] text-center select-none">{MONTHS[cm]} {cy}</span>
                <button onClick={next} disabled={isCm} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"><ChevronRight className="h-4 w-4 text-gray-500" /></button>
              </div>
            </div>
          }
        />

        {error && <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-xl border border-red-100 text-sm">{error}</div>}

        {loading ? (
          <div className="flex justify-center py-32"><Loader2 className="h-6 w-6 animate-spin text-gray-300" /></div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-6">
            {/* ── Left: day list ── */}
            <div className="lg:w-[280px] shrink-0">
              <div className="bg-white rounded-2xl shadow-[0_1px_3px_0_rgba(0,0,0,0.06)] border border-gray-200/80 overflow-hidden">
                <div className="max-h-[calc(100vh-220px)] overflow-y-auto hide-scrollbar">
                  {/* Ventas anuales */}
                  <button onClick={() => setSelected('anual')}
                    className={`relative w-full text-left px-5 py-4 transition-all duration-150 hover:bg-neutral-50/80 ${
                      selected === 'anual' 
                        ? 'bg-neutral-50/50 after:absolute after:left-0 after:top-1/2 after:-translate-y-1/2 after:w-[3px] after:h-6 after:bg-black after:rounded-r-full' 
                        : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                        selected === 'anual' ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-500'
                      }`}>
                        <LineChart className="h-[18px] w-[18px]" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-semibold ${selected === 'anual' ? 'text-black' : 'text-neutral-900'}`}>Ventas anuales</div>
                        <div className="text-xs text-neutral-400">Mes a mes</div>
                      </div>
                    </div>
                    {annual && (
                      <div className="flex items-center justify-between mt-2.5 pl-12">
                        <span className="text-[11px] text-neutral-400 font-medium">{annualYear}</span>
                        <span className={`text-sm font-bold ${selected === 'anual' ? 'text-black' : 'text-neutral-900'}`}>{fmt(annual.current.reduce((s, m) => s + m.sales, 0))}</span>
                      </div>
                    )}
                  </button>

                  <div className="mx-5 h-px bg-neutral-100" />

                  {/* Resumen del mes */}
                  <button onClick={() => setSelected('resumen')}
                    className={`relative w-full text-left px-5 py-4 transition-all duration-150 hover:bg-neutral-50/80 ${
                      selected === 'resumen' 
                        ? 'bg-neutral-50/50 after:absolute after:left-0 after:top-1/2 after:-translate-y-1/2 after:w-[3px] after:h-6 after:bg-black after:rounded-r-full' 
                        : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                        selected === 'resumen' ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-500'
                      }`}>
                        <CalendarDays className="h-[18px] w-[18px]" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-semibold ${selected === 'resumen' ? 'text-black' : 'text-neutral-900'}`}>Resumen del mes</div>
                        <div className="text-xs text-neutral-400">{MONTHS[cm]} {cy}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2.5 pl-12">
                      <span className="text-[11px] text-neutral-400 font-medium">{mOrd} órdenes</span>
                      <span className={`text-sm font-bold ${selected === 'resumen' ? 'text-black' : 'text-neutral-900'}`}>{fmt(mRev)}</span>
                    </div>
                  </button>

                  <div className="mx-5 h-px bg-neutral-100" />

                  {/* Day list */}
                  <div className="pt-1 pb-2">
                    <div className="px-5 py-2.5 text-[10px] font-semibold text-neutral-400 uppercase tracking-widest">Días</div>
                    <div className="space-y-0.5 px-2">
                      {days.map(d => {
                        const { rev, cnt } = calcDay(d.orders)
                        const dt = new Date(d.date + 'T12:00:00')
                        const isToday = d.date === new Date().toISOString().slice(0, 10)
                        return (
                          <button key={d.date} onClick={() => setSelected(d.date)}
                            className={`relative w-full text-left px-3 py-2.5 rounded-xl transition-all duration-150 hover:bg-neutral-50 ${
                              selected === d.date 
                                ? 'bg-neutral-100/70 shadow-[inset_0_1px_2px_0_rgba(0,0,0,0.04)]' 
                                : ''
                            }`}
                          >
                            {selected === d.date && (
                              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-black rounded-r-full" />
                            )}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className={`text-sm font-semibold ${selected === d.date ? 'text-black' : 'text-neutral-700'}`}>
                                  {DAYS[dt.getDay()].slice(0, 3)}
                                </span>
                                {isToday && (
                                  <span className="text-[10px] font-bold text-white bg-black px-1.5 py-0.5 rounded-md leading-none">Hoy</span>
                                )}
                              </div>
                              <span className={`text-sm font-bold ${selected === d.date ? 'text-black' : 'text-neutral-900'}`}>{fmt(rev)}</span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-xs text-neutral-400">{dt.getDate()} {MONTHS[dt.getMonth()].slice(0, 3)}</span>
                              <span className="text-[8px] text-neutral-300">·</span>
                              <span className="text-xs text-neutral-400">{cnt} {cnt === 1 ? 'orden' : 'órdenes'}</span>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Right panel ── */}
            <div className="flex-1 space-y-4" ref={printRef}>
              {selected === 'anual' ? (
                <div className="space-y-4">
                  {/* Annual hero */}
                  <div className="bg-white rounded-2xl shadow-[0_1px_3px_0_rgba(0,0,0,0.06)] border border-gray-200/80 p-5 sm:p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
                      <div>
                        <h2 className="text-lg font-bold text-gray-900 mb-0.5">Ventas anuales</h2>
                        <p className="text-sm text-gray-500">Compara las ventas mes a mes y con el año anterior.</p>
                      </div>
                      <div className="flex items-center gap-2 bg-white rounded-xl shadow-[0_1px_3px_0_rgba(0,0,0,0.06)] border border-gray-200/80 px-2 py-1.5 w-fit">
                        <button onClick={() => setAnnualYear(y => y - 1)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"><ChevronLeft className="h-4 w-4 text-gray-500" /></button>
                        <span className="text-sm font-semibold text-gray-900 min-w-[60px] text-center select-none">{annualYear}</span>
                        <button onClick={() => setAnnualYear(y => y + 1)} disabled={annualYear >= today.getFullYear()} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"><ChevronRight className="h-4 w-4 text-gray-500" /></button>
                      </div>
                    </div>
                    {annualStats && (
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                        <div>
                          <div className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">{fmt(annualStats.total)}</div>
                          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mt-1">Ventas totales {annualYear}</div>
                          {annualStats.prevTotal > 0 && (
                            <div className="mt-1.5 flex items-center gap-1.5">
                              <span className="text-[11px] text-gray-400">vs {annualYear - 1}:</span>
                              {pctBadge(annualStats.pct)}
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">{annualStats.ordersCount}</div>
                          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mt-1">Órdenes</div>
                          <div className="text-[11px] text-gray-400 mt-1.5">{annualStats.active} {annualStats.active === 1 ? 'mes' : 'meses'} con actividad</div>
                        </div>
                        <div>
                          <div className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">{fmt(annualStats.avg)}</div>
                          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mt-1">Promedio mensual</div>
                          <div className="text-[11px] text-gray-400 mt-1.5">por mes con actividad</div>
                        </div>
                        <div>
                          <div className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">{annualStats.best !== -1 ? MONTHS[annualStats.best] : '—'}</div>
                          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mt-1">Mejor mes</div>
                          {annualStats.best !== -1 && (
                            <div className="text-[11px] text-gray-400 mt-1.5">{fmt(annual.current[annualStats.best].sales)} · {annual.current[annualStats.best].orders} órdenes</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Chart */}
                  <div className="bg-white rounded-2xl shadow-[0_1px_3px_0_rgba(0,0,0,0.06)] border border-gray-200/80 p-5 sm:p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-gray-900">Ventas mensuales {annualYear}</h3>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-full bg-emerald-500" />{annualYear}</span>
                        <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-gray-300" />Año {annualYear - 1}</span>
                      </div>
                    </div>
                    {annual ? (
                      <SalesAreaChart
                        labels={MONTHS.map(m => m.slice(0, 3))}
                        current={annual.current.map(m => m.sales)}
                        previous={annual.previous.map(m => m.sales)}
                      />
                    ) : (
                      <div className="text-center py-16"><p className="text-gray-400 font-medium">Sin datos disponibles.</p></div>
                    )}
                  </div>

                  {/* Monthly table */}
                  <div className="bg-white rounded-2xl shadow-[0_1px_3px_0_rgba(0,0,0,0.06)] border border-gray-200/80 overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100">
                      <h3 className="text-sm font-semibold text-gray-900">Detalle mensual</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100">
                            <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Mes</th>
                            <th className="text-right px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Ventas</th>
                            <th className="text-right px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Órdenes</th>
                            <th className="text-right px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Ticket</th>
                            <th className="text-right px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">vs mes anterior</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {annual && annual.current.map((m, i) => {
                            const change = annualChange(i)
                            const best = annualStats?.best === i
                            const worst = annualStats?.worst === i
                            return (
                              <tr key={i} className={`hover:bg-gray-50/50 transition-colors ${best ? 'bg-emerald-50/40' : worst ? 'bg-red-50/30' : ''}`}>
                                <td className="px-5 py-3 font-medium text-gray-900 flex items-center gap-2">
                                  {MONTHS[i]}
                                  {best && <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-md leading-none">MEJOR</span>}
                                  {worst && <span className="text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded-md leading-none">MÁS BAJO</span>}
                                </td>
                                <td className="px-5 py-3 text-right font-semibold text-gray-900">{fmt(m.sales)}</td>
                                <td className="px-5 py-3 text-right text-gray-600">{m.orders}</td>
                                <td className="px-5 py-3 text-right text-gray-600">{m.orders > 0 ? fmt(Math.round(m.sales / m.orders)) : '—'}</td>
                                <td className="px-5 py-3 text-right">{pctBadge(change)}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : days.length === 0 ? (
                <div className="text-center py-32"><p className="text-gray-400 font-medium">No hay ventas en este período.</p></div>
              ) : selected === 'resumen' ? (
                <>
                  {/* Month hero */}
                  <div className="bg-white rounded-2xl shadow-[0_1px_3px_0_rgba(0,0,0,0.06)] border border-gray-200/80 p-5 sm:p-6">
                    <h2 className="text-lg font-bold text-gray-900 mb-1">Resumen de {MONTHS[cm]} {cy}</h2>
                    <p className="text-sm text-gray-500 mb-5">{mOrd} órdenes en {days.length} días con actividad</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-6">
                      <div>
                        <div className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">{fmt(mRev)}</div>
                        <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mt-1">Ventas totales</div>
                      </div>
                      <div>
                        <div className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">{mOrd}</div>
                        <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mt-1">Órdenes</div>
                      </div>
                      <div>
                        <div className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">{fmt(mOrd > 0 ? Math.round(mRev / mOrd) : 0)}</div>
                        <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mt-1">Ticket promedio</div>
                      </div>
                      <div>
                        <div className="text-2xl sm:text-3xl font-bold text-emerald-600 tracking-tight">{fmt(mNetRev)}</div>
                        <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mt-1 flex items-center gap-1"><Wallet className="h-3 w-3" />Ingreso neto</div>
                      </div>
                      <div>
                        <div className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">{peakHour.count > 0 ? `${String(peakHour.hour).padStart(2,'0')}:00` : '—'}</div>
                        <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mt-1 flex items-center gap-1"><Clock className="h-3 w-3" />Hora pico</div>
                        {peakHour.count > 0 && <div className="text-[11px] text-gray-400 mt-0.5">{peakHour.count} órdenes</div>}
                      </div>
                      <div>
                        <div className={`text-2xl sm:text-3xl font-bold tracking-tight ${cancellationRate > 5 ? 'text-red-500' : 'text-gray-900'}`}>{cancellationRate.toFixed(1)}%</div>
                        <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mt-1 flex items-center gap-1"><Ban className="h-3 w-3" />Cancelaciones</div>
                        {cancelledCount > 0 && <div className="text-[11px] text-gray-400 mt-0.5">{cancelledCount} de {totalOrderCount}</div>}
                      </div>
                    </div>
                  </div>

                  {/* Top Products */}
                  {topProducts.length > 0 && (
                    <div className="bg-white rounded-2xl shadow-[0_1px_3px_0_rgba(0,0,0,0.06)] border border-gray-200/80 p-5 sm:p-6">
                      <div className="flex items-center gap-2 mb-4">
                        <Trophy className="h-4 w-4 text-amber-500" />
                        <h3 className="text-sm font-semibold text-gray-900">Productos más vendidos</h3>
                      </div>
                      <div className="space-y-2.5">
                        {topProducts.map((p, i) => {
                          const maxQty = topProducts[0].qty
                          const pct = maxQty > 0 ? (p.qty / maxQty) * 100 : 0
                          return (
                            <div key={p.name} className="flex items-center gap-3">
                              <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                                i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-gray-200 text-gray-600' : i === 2 ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-500'
                              }`}>{i + 1}</span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-0.5">
                                  <span className="text-sm font-medium text-gray-900 truncate">{p.name}</span>
                                  <span className="text-sm font-semibold text-gray-900 ml-2 shrink-0">{p.qty} uds</span>
                                </div>
                                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full transition-all ${i === 0 ? 'bg-amber-400' : 'bg-gray-300'}`} style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                              <span className="text-xs text-gray-400 shrink-0 w-16 text-right">{fmt(p.revenue)}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Ticket promedio por canal */}
                  {ticketByChannel.length > 1 && (
                    <div className="bg-white rounded-2xl shadow-[0_1px_3px_0_rgba(0,0,0,0.06)] border border-gray-200/80 p-5 sm:p-6">
                      <h3 className="text-sm font-semibold text-gray-900 mb-4">Ticket promedio por canal</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                        {ticketByChannel.map(ch => (
                          <div key={ch.key} className="flex items-center gap-2.5 px-3.5 py-2.5 bg-gray-50 rounded-xl">
                            {React.createElement(ch.icon, { className: `h-4 w-4 ${ch.iconColor}` })}
                            <div>
                              <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{ch.label}</div>
                              <div className="text-sm font-bold text-gray-900">{fmt(ch.avg)}</div>
                              <div className="text-[10px] text-gray-400">{ch.count} orden{ch.count !== 1 ? 'es' : ''}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Hora pico distribution */}
                  {peakHour.count > 0 && (
                    <div className="bg-white rounded-2xl shadow-[0_1px_3px_0_rgba(0,0,0,0.06)] border border-gray-200/80 p-5 sm:p-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-blue-500" />
                          <h3 className="text-sm font-semibold text-gray-900">Distribución de ventas por hora y día</h3>
                        </div>
                      </div>

                      <HourHeatmap orders={validOrders} />
                    </div>
                  )}

                  {/* Month payments Donut Chart */}
                  <div className="bg-white rounded-2xl shadow-[0_1px_3px_0_rgba(0,0,0,0.06)] border border-gray-200/80 p-5 sm:p-6">
                    <h3 className="text-sm font-semibold text-gray-900 mb-4">Desglose de métodos de pago</h3>
                    <DonutChart data={paymentDonutData} total={mRev} />
                    {mFees > 0 && (
                      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-sm">
                        <span className="text-gray-500">Delivery fees</span>
                        <span className="font-semibold text-gray-900">{fmt(mFees)}</span>
                      </div>
                    )}
                  </div>

                  {/* Month channels */}
                  <div className="bg-white rounded-2xl shadow-[0_1px_3px_0_rgba(0,0,0,0.06)] border border-gray-200/80 p-5 sm:p-6">
                    <h3 className="text-sm font-semibold text-gray-900 mb-4">Canales de venta</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                      {Object.entries(channelMeta).map(([key, m]) => {
                        const c = days.reduce((s, d) => s + (calcDay(d.orders).channels[key] || 0), 0)
                        if (!c) return null
                        return (
                          <div key={key} className="flex items-center gap-2.5 px-3.5 py-2.5 bg-gray-50 rounded-xl">
                            {React.createElement(m.icon, { className: `h-4 w-4 ${m.iconColor}` })}
                            <div>
                              <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{m.label}</div>
                              <div className="text-sm font-bold text-gray-900">{c} orden{c !== 1 ? 'es' : ''}</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Daily table summary */}
                  <div className="bg-white rounded-2xl shadow-[0_1px_3px_0_rgba(0,0,0,0.06)] border border-gray-200/80 overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100">
                      <h3 className="text-sm font-semibold text-gray-900">Resumen por día</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100">
                            <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Día</th>
                            <th className="text-right px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Ventas</th>
                            <th className="text-center px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Ord.</th>
                            <th className="text-right px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Ticket</th>
                            <th className="text-right px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Efectivo</th>
                            <th className="text-right px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Tarjeta</th>
                            <th className="text-right px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Transfer.</th>
                            <th className="text-right px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Online</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {days.map(d => {
                            const { rev, cnt, avg, payments } = calcDay(d.orders)
                            const dt = new Date(d.date + 'T12:00:00')
                            return (
                              <tr key={d.date} className="hover:bg-gray-50/50 transition-colors">
                                <td className="px-5 py-3 font-medium text-gray-900">{DAYS[dt.getDay()].slice(0, 3)} {dt.getDate()}</td>
                                <td className="px-5 py-3 text-right font-semibold text-gray-900">{fmt(rev)}</td>
                                <td className="px-5 py-3 text-center text-gray-600">{cnt}</td>
                                <td className="px-5 py-3 text-right text-gray-600">{fmt(avg)}</td>
                                <td className="px-5 py-3 text-right text-gray-600">{fmt(payments.cash || 0)}</td>
                                <td className="px-5 py-3 text-right text-gray-600">{fmt(payments.card || 0)}</td>
                                <td className="px-5 py-3 text-right text-gray-600">{fmt(payments.transfer || 0)}</td>
                                <td className="px-5 py-3 text-right text-gray-600">{fmt(payments.online_gateway || 0)}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-gray-200 bg-gray-50/50">
                            <td className="px-5 py-3 font-bold text-gray-900">Total</td>
                            <td className="px-5 py-3 text-right font-bold text-gray-900">{fmt(mRev)}</td>
                            <td className="px-5 py-3 text-center font-bold text-gray-900">{mOrd}</td>
                            <td className="px-5 py-3 text-right font-bold text-gray-900">{fmt(mOrd > 0 ? Math.round(mRev / mOrd) : 0)}</td>
                            <td className="px-5 py-3 text-right font-bold text-gray-900">{fmt(days.reduce((s, d) => s + (calcDay(d.orders).payments.cash || 0), 0))}</td>
                            <td className="px-5 py-3 text-right font-bold text-gray-900">{fmt(days.reduce((s, d) => s + (calcDay(d.orders).payments.card || 0), 0))}</td>
                            <td className="px-5 py-3 text-right font-bold text-gray-900">{fmt(days.reduce((s, d) => s + (calcDay(d.orders).payments.transfer || 0), 0))}</td>
                            <td className="px-5 py-3 text-right font-bold text-gray-900">{fmt(days.reduce((s, d) => s + (calcDay(d.orders).payments.online_gateway || 0), 0))}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </>
              ) : (() => {
                const day = days.find(d => d.date === selected)
                if (!day) return null
                const { rev, cnt, avg, payments, channels, fees } = calcDay(day.orders)
                const dt = new Date(day.date + 'T12:00:00')

                return (
                  <>
                    <div className="bg-white rounded-2xl shadow-[0_1px_3px_0_rgba(0,0,0,0.06)] border border-gray-200/80 p-5 sm:p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h2 className="text-lg font-bold text-gray-900">{DAYS[dt.getDay()]}</h2>
                          <p className="text-sm text-gray-500">{dt.getDate()} de {MONTHS[dt.getMonth()]} {cy}</p>
                        </div>
                      </div>
                      {day.shifts.length > 0 && day.shifts.map(s => {
                        const op = new Date(s.start_time).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
                        const cl = s.end_time ? new Date(s.end_time).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : '—'
                        return (
                          <div key={s.id} className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg text-xs text-gray-500">
                            <span className="text-gray-400">Caja</span>
                            <span className="font-semibold text-gray-700">{op}</span>
                            <span className="text-gray-300">→</span>
                            <span className="font-semibold text-gray-700">{cl}</span>
                          </div>
                        )
                      })}
                      <div className="grid grid-cols-3 gap-4 mt-5">
                        <div>
                          <div className="text-2xl font-bold text-gray-900 tracking-tight">{fmt(rev)}</div>
                          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mt-1">Ventas</div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-gray-900 tracking-tight">{cnt}</div>
                          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mt-1">Órdenes</div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-gray-900 tracking-tight">{fmt(avg)}</div>
                          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mt-1">Ticket prom.</div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-[0_1px_3px_0_rgba(0,0,0,0.06)] border border-gray-200/80 p-5 sm:p-6">
                      <h3 className="text-sm font-semibold text-gray-900 mb-4">Métodos de pago</h3>
                      <div className="space-y-3">
                        {Object.entries(paymentMeta).map(([key, m]) => {
                          const amt = payments[key]
                          if (!amt) return null
                          const pct = rev > 0 ? (amt / rev) * 100 : 0
                          return (
                            <div key={key}>
                              <div className="flex items-center justify-between text-sm mb-1">
                                <span className="text-gray-700 font-medium">{m.label}</span>
                                <span className="text-gray-900 font-semibold">{fmt(amt)}</span>
                              </div>
                              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${m.bar} transition-all`} style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      {fees > 0 && (
                        <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-sm">
                          <span className="text-gray-500">Delivery fees</span>
                          <span className="font-semibold text-gray-900">{fmt(fees)}</span>
                        </div>
                      )}
                    </div>

                    <div className="bg-white rounded-2xl shadow-[0_1px_3px_0_rgba(0,0,0,0.06)] border border-gray-200/80 p-5 sm:p-6">
                      <h3 className="text-sm font-semibold text-gray-900 mb-4">Canales de venta</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {Object.entries(channelMeta).map(([key, m]) => {
                          const c = channels[key]
                          if (!c) return null
                          return (
                            <div key={key} className="flex items-center gap-2.5 px-3.5 py-2.5 bg-gray-50 rounded-xl">
                              <span className={`w-2 h-2 rounded-full ${m.dot} shrink-0`} />
                              <div>
                                <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{m.label}</div>
                                <div className="text-sm font-bold text-gray-900">{c} orden{c !== 1 ? 'es' : ''}</div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </>
                )
              })()}
            </div>
          </div>
        )}
      </div>

      {/* AI Reports Chat Drawer */}
      <ReportsChatDrawer
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        reportData={summaryReportPayload}
      />
    </div>
  )
}

export default ReportsView
