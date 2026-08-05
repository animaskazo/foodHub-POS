import React, { useState, useRef, useId } from 'react'

const fmtCLP = (n) => '$' + Number(n || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 })

const compact = (n) => {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1).replace(/\.0$/, '')}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`
  return `$${Math.round(n)}`
}

const SalesAreaChart = ({ labels = [], current = [], previous = [], format = fmtCLP, height = 280 }) => {
  const [hover, setHover] = useState(null)
  const svgRef = useRef(null)
  const gid = useId().replace(/[^a-zA-Z0-9_-]/g, '')

  const W = 760
  const H = height
  const PADX = 44
  const PADT = 16
  const PADB = 28
  const n = labels.length
  if (n === 0) return null

  const innerW = W - PADX * 2
  const innerH = H - PADT - PADB
  const stepX = n > 1 ? innerW / (n - 1) : innerW
  const maxVal = Math.max(1, ...current, ...previous)

  const x = (i) => PADX + (n > 1 ? i * stepX : innerW / 2)
  const y = (v) => PADT + innerH - (Number(v || 0) / maxVal) * innerH

  const toPath = (values) =>
    values.map((v, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')

  const curLine = toPath(current)
  const prevLine = previous.length ? toPath(previous) : null
  const curArea = `${curLine} L ${x(n - 1).toFixed(1)} ${(PADT + innerH).toFixed(1)} L ${x(0).toFixed(1)} ${(PADT + innerH).toFixed(1)} Z`

  const grid = [0, 0.25, 0.5, 0.75, 1]

  const handleMove = (e) => {
    const rect = svgRef.current.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    const idx = Math.round((px - PADX) / stepX)
    setHover(Math.max(0, Math.min(n - 1, idx)))
  }

  const showVal = hover !== null ? Math.max(current[hover] || 0, previous[hover] || 0, 1) : 1
  const tooltipX = hover !== null ? (x(hover) / W) * 100 : 0
  const tooltipTop = hover !== null ? Math.max(8, (y(showVal) / H) * 100) : 0

  return (
    <div className="relative">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none" onMouseMove={handleMove} onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id={`${gid}-area`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {grid.map((f, i) => {
          const gy = PADT + innerH - f * innerH
          return (
            <g key={i}>
              <line x1={PADX} y1={gy} x2={W - PADX} y2={gy} stroke="#eef2f7" strokeWidth="1" />
              <text x={PADX - 8} y={gy + 3.5} textAnchor="end" fontSize="10" fill="#a1aab8">{compact(maxVal * f)}</text>
            </g>
          )
        })}

        {prevLine && <path d={prevLine} fill="none" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="5 5" strokeLinejoin="round" />}
        <path d={curArea} fill={`url(#${gid}-area)`} />
        <path d={curLine} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

        {current.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={hover === i ? 5 : 2.5} fill="#10b981" stroke="#fff" strokeWidth="1.5" className="transition-all" />
        ))}

        {labels.map((l, i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10.5" fontWeight={hover === i ? 700 : 500} fill={hover === i ? '#0f172a' : '#94a3b8'}>{l}</text>
        ))}

        {hover !== null && <line x1={x(hover)} y1={PADT} x2={x(hover)} y2={PADT + innerH} stroke="#e2e8f0" strokeWidth="1.5" />}
      </svg>

      {hover !== null && (
        <div className="pointer-events-none absolute z-10 -translate-x-1/2" style={{ left: `${tooltipX}%`, top: `${tooltipTop}%` }}>
          <div className="bg-gray-900 text-white text-xs rounded-xl px-3 py-2 shadow-xl whitespace-nowrap">
            <div className="font-bold mb-1 text-gray-100">{labels[hover]}</div>
            <div className="text-emerald-400 font-medium">{format(current[hover] || 0)}</div>
            {previous.length > 0 && <div className="text-gray-400 mt-0.5">Año anterior: {format(previous[hover] || 0)}</div>}
          </div>
        </div>
      )}
    </div>
  )
}

export default SalesAreaChart
