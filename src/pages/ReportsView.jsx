import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { supabase } from '../lib/supabase'
import { useAuth } from '../components/AuthContext'
import PageHeader from '../components/ui/PageHeader'
import { ChevronLeft, ChevronRight, Loader2, FileDown, CalendarDays, FileText, FileSpreadsheet, Store, ShoppingBag, Globe, MessageCircle, Van } from 'lucide-react'

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const DAYS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']

const fmt = (n) => {
  if (!n && n !== 0) return '—'
  return '$' + Number(n).toLocaleString('es-CL')
}

const paymentMeta = {
  cash:          { label: 'Efectivo',   bar: 'bg-emerald-500' },
  card:          { label: 'Tarjeta',    bar: 'bg-blue-500' },
  transfer:      { label: 'Transfer.',  bar: 'bg-violet-500' },
  online_gateway:{ label: 'Online',     bar: 'bg-cyan-500' },
}

const channelMeta = {
  table:    { label: 'Local',    icon: Store,        bg: 'bg-orange-50',   iconColor: 'text-orange-600' },
  pickup:   { label: 'Retiro',   icon: ShoppingBag,  bg: 'bg-teal-50',     iconColor: 'text-teal-600' },
  delivery: { label: 'Delivery', icon: Van,           bg: 'bg-amber-50',   iconColor: 'text-amber-600' },
  online:   { label: 'Online',   icon: Globe,         bg: 'bg-indigo-50',   iconColor: 'text-indigo-600' },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle, bg: 'bg-emerald-50', iconColor: 'text-emerald-600' },
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
  const [selected, setSelected] = useState('resumen')
  const [openDropdown, setOpenDropdown] = useState(null)
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
    if (authLoading || !organization?.id) return
    setLoading(true); setError(null)
    const s = new Date(cy, cm, 1)
    const e = new Date(cy, cm + 1, 0, 23, 59, 59, 999)
    ;(async () => {
      try {
        const [sr, or] = await Promise.all([
          supabase.from('shifts').select('*').eq('organization_id', organization.id).gte('start_time', s.toISOString()).lte('start_time', e.toISOString()).order('start_time', { ascending: false }),
          supabase.from('orders').select('id, order_number, order_type, delivery_type, status, total, delivery_fee, created_at, payments ( method, amount, status )').eq('organization_id', organization.id).gte('created_at', s.toISOString()).lte('created_at', e.toISOString()).order('created_at', { ascending: false }),
        ])
        if (sr.error) throw sr.error
        if (or.error) throw or.error
        setShifts(sr.data || [])
        const hideCancelled = organization?.hide_cancelled_orders === true
        setOrders(hideCancelled ? (or.data || []).filter(o => o.status !== 'cancelled') : (or.data || []))
      } catch (err) { console.error(err); setError('Error al cargar los datos.') }
      finally { setLoading(false) }
    })()
  }, [organization?.id, authLoading, cm, cy])

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
  const mRev = orders.reduce((s, o) => s + Number(o.total || 0), 0)
  const mOrd = orders.length
  const mFees = orders.reduce((s, o) => s + Number(o.delivery_fee || 0), 0)

  const calcDay = (orders) => {
    const rev = orders.reduce((s, o) => s + Number(o.total || 0), 0)
    const cnt = orders.length
    const avg = cnt > 0 ? Math.round(rev / cnt) : 0
    const payments = {}; const channels = {}; let fees = 0
    orders.forEach(o => {
      const ch = o.delivery_type === 'delivery' ? 'delivery' : (o.order_type || 'other')
      channels[ch] = (channels[ch] || 0) + 1
      fees += Number(o.delivery_fee || 0)
      if (o.payments) o.payments.forEach(p => {
        const m = p.method || 'other'
        payments[m] = (payments[m] || 0) + Number(p.amount || 0)
      })
    })
    return { rev, cnt, avg, payments, channels, fees }
  }

  const exportPDF = async (data, label) => {
    const { default: jsPDF } = await import('jspdf')
    await import('jspdf-autotable')
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const pageW = 210
    const margin = 20
    const contentW = pageW - margin * 2

    const orgName = organization?.name || 'FoodHub'
    const title = `Reporte ${label}`
    const subtitle = `${MONTHS[cm]} ${cy}`

    // Header
    doc.setFillColor(15, 15, 15)
    doc.rect(0, 0, pageW, 38, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.text(orgName, margin, 20)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    doc.text(title, margin, 30)
    doc.text(subtitle, margin + doc.getTextWidth(title + '  '), 30)

    // Date generated
    const now = new Date()
    const dateStr = now.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    doc.setTextColor(150, 150, 150)
    doc.setFontSize(8)
    doc.text(`Generado el ${dateStr}`, margin, 46)

    let y = 54

    // Summary
    const totalRev = data.reduce((s, d) => s + calcDay(d.orders).rev, 0)
    const totalOrd = data.reduce((s, d) => s + d.orders.length, 0)
    const totalAvg = totalOrd > 0 ? Math.round(totalRev / totalOrd) : 0
    const totalFees = data.reduce((s, d) => s + calcDay(d.orders).fees, 0)

    doc.setFillColor(248, 249, 250)
    doc.roundedRect(margin, y, contentW / 3 - 3, 22, 2, 2, 'F')
    doc.roundedRect(margin + contentW / 3 + 1.5, y, contentW / 3 - 3, 22, 2, 2, 'F')
    doc.roundedRect(margin + 2 * (contentW / 3) + 3, y, contentW / 3 - 3, 22, 2, 2, 'F')

    doc.setTextColor(100, 100, 100)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.text('VENTAS TOTALES', margin + 4, y + 7)
    doc.text('ÓRDENES', margin + contentW / 3 + 5.5, y + 7)
    doc.text('TICKET PROM.', margin + 2 * (contentW / 3) + 7, y + 7)
    doc.setTextColor(0, 0, 0)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text(fmt(totalRev), margin + 4, y + 18)
    doc.text(String(totalOrd), margin + contentW / 3 + 5.5, y + 18)
    doc.text(fmt(totalAvg), margin + 2 * (contentW / 3) + 7, y + 18)

    y += 32

    // Payments summary
    const allPayments = {}
    data.forEach(d => {
      const { payments } = calcDay(d.orders)
      Object.entries(payments).forEach(([k, v]) => { allPayments[k] = (allPayments[k] || 0) + v })
    })

    doc.setTextColor(60, 60, 60)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('Métodos de pago', margin, y)
    y += 8

    const payTable = Object.entries(paymentMeta).map(([key, m]) => {
      const amt = allPayments[key] || 0
      return [m.label, fmt(amt), totalRev > 0 ? `${Math.round((amt / totalRev) * 100)}%` : '0%']
    })

    doc.autoTable({
      startY: y,
      head: [['Método', 'Monto', '%']],
      body: payTable,
      theme: 'grid',
      headStyles: { fillColor: [15, 15, 15], fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: 50, halign: 'right' }, 2: { cellWidth: 30, halign: 'right' } },
      margin: { left: margin, right: margin },
      tableWidth: contentW,
    })

    y = doc.lastAutoTable.finalY + 12

    // Daily breakdown table
    doc.setTextColor(60, 60, 60)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('Detalle por día', margin, y)
    y += 8

    const dayRows = data.map(d => {
      const { rev, cnt, avg, payments } = calcDay(d.orders)
      const dt = new Date(d.date + 'T12:00:00')
      return [
        `${DAYS[dt.getDay()]}, ${dt.getDate()} ${MONTHS[dt.getMonth()]}`,
        fmt(rev),
        String(cnt),
        fmt(avg),
        fmt(payments.cash || 0),
        fmt(payments.card || 0),
        fmt(payments.transfer || 0),
        fmt(payments.online_gateway || 0),
      ]
    })

    // Totals row
    const tPay = {}
    data.forEach(d => {
      const { payments } = calcDay(d.orders)
      Object.entries(payments).forEach(([k, v]) => { tPay[k] = (tPay[k] || 0) + v })
    })
    dayRows.push([
      'TOTAL',
      fmt(totalRev), String(totalOrd), fmt(totalAvg),
      fmt(tPay.cash || 0), fmt(tPay.card || 0), fmt(tPay.transfer || 0), fmt(tPay.online_gateway || 0),
    ])

    doc.autoTable({
      startY: y,
      head: [['Día', 'Ventas', 'Ord.', 'Ticket', 'Efectivo', 'Tarjeta', 'Transf.', 'Online']],
      body: dayRows,
      theme: 'grid',
      headStyles: { fillColor: [15, 15, 15], fontSize: 7, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7 },
      footStyles: { fillColor: [248, 249, 250], fontStyle: 'bold', fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 42 },
        1: { cellWidth: 28, halign: 'right' },
        2: { cellWidth: 14, halign: 'center' },
        3: { cellWidth: 28, halign: 'right' },
        4: { cellWidth: 22, halign: 'right' },
        5: { cellWidth: 22, halign: 'right' },
        6: { cellWidth: 22, halign: 'right' },
        7: { cellWidth: 22, halign: 'right' },
      },
      margin: { left: margin, right: margin },
      tableWidth: contentW,
    })

    // Footer
    const totalPages = doc.internal.getNumberOfPages()
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i)
      doc.setTextColor(180, 180, 180)
      doc.setFontSize(7)
      doc.text(`${orgName} · Reporte ${label}`, margin, 290)
      doc.text(`Página ${i} de ${totalPages}`, pageW - margin, 290, { align: 'right' })
    }

    doc.save(`reporte-${label.toLowerCase()}-${MONTHS[cm].toLowerCase()}-${cy}.pdf`)
  }

  const exportExcel = (data, label) => {
    const XLSX = require('xlsx')
    const wb = XLSX.utils.book_new()

    const orgName = organization?.name || 'FoodHub'
    const title = `Reporte ${label} - ${MONTHS[cm]} ${cy}`

    // Summary
    const totalRev = data.reduce((s, d) => s + calcDay(d.orders).rev, 0)
    const totalOrd = data.reduce((s, d) => s + d.orders.length, 0)
    const totalAvg = totalOrd > 0 ? Math.round(totalRev / totalOrd) : 0
    const totalFees = data.reduce((s, d) => s + calcDay(d.orders).fees, 0)

    const allPayments = {}
    data.forEach(d => {
      const { payments } = calcDay(d.orders)
      Object.entries(payments).forEach(([k, v]) => { allPayments[k] = (allPayments[k] || 0) + v })
    })

    // Daily rows
    const dayRows = data.map(d => {
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

    // Totals row
    const tPay = {}
    data.forEach(d => {
      const { payments } = calcDay(d.orders)
      Object.entries(payments).forEach(([k, v]) => { tPay[k] = (tPay[k] || 0) + v })
    })
    const totalChannels = {}
    data.forEach(d => {
      const { channels } = calcDay(d.orders)
      Object.entries(channels).forEach(([k, v]) => { totalChannels[k] = (totalChannels[k] || 0) + v })
    })
    const totalChStr = Object.entries(channelMeta)
      .filter(([k]) => totalChannels[k])
      .map(([k, m]) => `${m.label}: ${totalChannels[k]}`)
      .join(', ')
    dayRows.push({
      'Día': 'TOTAL',
      'Ventas': totalRev,
      'Órdenes': totalOrd,
      'Ticket Prom.': totalAvg,
      'Efectivo': tPay.cash || 0,
      'Tarjeta': tPay.card || 0,
      'Transferencia': tPay.transfer || 0,
      'Online': tPay.online_gateway || 0,
      'Delivery Fees': totalFees,
      'Canales': totalChStr,
    })

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

  return (
    <div className="bg-gray-50 p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* ── Header ── */}
        <PageHeader
          title="Reportes"
          subtitle="Resumen de ventas diarias"
          actions={
            <div className="flex items-center gap-2" ref={dropdownRef}>
              {/* Semanal dropdown */}
              <div className="relative">
                <button onClick={() => setOpenDropdown(openDropdown === 'weekly' ? null : 'weekly')}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-white rounded-xl shadow-[0_1px_3px_0_rgba(0,0,0,0.06)] border border-gray-200/80 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                  <FileDown className="h-4 w-4" /> Semanal
                </button>
                {openDropdown === 'weekly' && (
                  <div className="absolute right-0 top-full mt-1.5 w-36 bg-white rounded-xl shadow-lg border border-gray-200/80 py-1 z-50 overflow-hidden">
                    <button onClick={() => { exportPDF(days.slice(0, 7), 'Semanal'); setOpenDropdown(null) }}
                      className="flex items-center gap-2.5 w-full text-left px-3.5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                      <FileText className="h-4 w-4 text-red-500" /> PDF
                    </button>
                    <button onClick={() => { exportExcel(days.slice(0, 7), 'Semanal'); setOpenDropdown(null) }}
                      className="flex items-center gap-2.5 w-full text-left px-3.5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                      <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Excel
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
                    <button onClick={() => { exportPDF(days, 'Mensual'); setOpenDropdown(null) }}
                      className="flex items-center gap-2.5 w-full text-left px-3.5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                      <FileText className="h-4 w-4 text-red-500" /> PDF
                    </button>
                    <button onClick={() => { exportExcel(days, 'Mensual'); setOpenDropdown(null) }}
                      className="flex items-center gap-2.5 w-full text-left px-3.5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                      <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Excel
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
        ) : days.length === 0 ? (
          <div className="text-center py-32"><p className="text-gray-400 font-medium">No hay ventas en este período.</p></div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-6">
            {/* ── Left: day list ── */}
            <div className="lg:w-[280px] shrink-0">
              <div className="bg-white rounded-2xl shadow-[0_1px_3px_0_rgba(0,0,0,0.06)] border border-gray-200/80 overflow-hidden">
                <div className="max-h-[calc(100vh-220px)] overflow-y-auto hide-scrollbar">
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
              {selected === 'resumen' ? (
                <>
                  {/* Month hero */}
                  <div className="bg-white rounded-2xl shadow-[0_1px_3px_0_rgba(0,0,0,0.06)] border border-gray-200/80 p-5 sm:p-6">
                    <h2 className="text-lg font-bold text-gray-900 mb-1">Resumen de {MONTHS[cm]} {cy}</h2>
                    <p className="text-sm text-gray-500 mb-5">{mOrd} órdenes en {days.length} días con actividad</p>
                    <div className="grid grid-cols-3 gap-4 sm:gap-8">
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
                    </div>
                  </div>

                  {/* Month payments */}
                  <div className="bg-white rounded-2xl shadow-[0_1px_3px_0_rgba(0,0,0,0.06)] border border-gray-200/80 p-5 sm:p-6">
                    <h3 className="text-sm font-semibold text-gray-900 mb-4">Métodos de pago</h3>
                    <div className="space-y-3">
                      {Object.entries(paymentMeta).map(([key, m]) => {
                        const amt = days.reduce((s, d) => s + (calcDay(d.orders).payments[key] || 0), 0)
                        if (!amt) return null
                        const pct = mRev > 0 ? (amt / mRev) * 100 : 0
                        return (
                          <div key={key}>
                            <div className="flex items-center justify-between text-sm mb-1">
                              <span className="text-gray-700 font-medium">{m.label}</span>
                              <span className="text-gray-900 font-semibold">{fmt(amt)} <span className="text-xs text-gray-400 font-normal">({Math.round(pct)}%)</span></span>
                            </div>
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${m.bar} transition-all`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
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
    </div>
  )
}

export default ReportsView
