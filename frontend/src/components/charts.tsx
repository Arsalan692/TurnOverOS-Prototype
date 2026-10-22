import { useState } from 'react'
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { Dashboard } from '../lib/api'
import { compactMoney, days, monthLabel } from '../lib/format'

const CHART = '#1594bb' // single-series mark colour (accent, darkened to pass 3:1)
const GRID = '#e6e9ec'
const INK2 = '#6a6a6a'

/** "Where the days go": one horizontal bar per vacant stage, with the target as a tick. */
export function StageBars({ data }: { data: Dashboard['stage_breakdown'] }) {
  const max = Math.max(...data.map((d) => Math.max(d.avg_days, d.target_days)), 1)
  const total = data.reduce((s, d) => s + d.avg_days, 0)
  return (
    <div>
      <ul className="space-y-3">
        {data.map((d) => {
          const over = d.avg_days - d.target_days
          return (
            <li key={d.stage} className="group relative grid grid-cols-[8.5rem_1fr] items-center gap-3 sm:grid-cols-[10rem_1fr]">
              <span className="truncate text-sm text-heading">{d.label}</span>
              <div className="relative h-7">
                <div
                  className="absolute inset-y-1 left-0 rounded-r-[4px]"
                  style={{ width: `${(d.avg_days / max) * 82}%`, background: CHART }}
                />
                {/* target tick */}
                <div
                  className="absolute inset-y-0 w-0.5 bg-navy"
                  style={{ left: `${(d.target_days / max) * 82}%` }}
                  aria-hidden
                />
                <span
                  className="absolute top-1/2 -translate-y-1/2 pl-2 text-sm font-medium tabular-nums text-heading"
                  style={{ left: `${(Math.max(d.avg_days, d.target_days) / max) * 82}%` }}
                >
                  {d.avg_days.toFixed(1)}
                </span>
                {/* hover tooltip */}
                <div className="pointer-events-none absolute -top-9 left-0 z-10 hidden whitespace-nowrap rounded-card bg-navy-deep px-3 py-1.5 text-xs text-white shadow-card group-hover:block">
                  {d.label}: avg {days(d.avg_days)} · target {days(d.target_days, 0)}
                  {over > 0.05 ? ` · ${over.toFixed(1)} over` : ' · on target'}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-body">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: CHART }} /> Average days per turnover
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-0.5 bg-navy" /> Target
        </span>
        <span className="ml-auto font-medium text-heading">Total ≈ {days(total)}</span>
      </div>
    </div>
  )
}

function TrendTooltip({ active, payload }: { active?: boolean; payload?: { payload: Dashboard['monthly_trend'][number] }[] }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="rounded-card bg-navy-deep px-3 py-2 text-xs text-white shadow-card">
      <p className="font-semibold">{monthLabel(p.month)}</p>
      <p>Avg days vacant: <b>{p.avg_days_vacant}</b></p>
      <p>Turnovers: {p.turnovers}</p>
      <p>Rent lost: {compactMoney(p.vacancy_cost)}</p>
    </div>
  )
}

/** Average days vacant by move-in month (single series, so no legend box). */
export function TrendChart({ data }: { data: Dashboard['monthly_trend'] }) {
  const [table, setTable] = useState(false)
  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button type="button" className="text-xs font-medium text-[#0f7898] hover:underline" onClick={() => setTable((t) => !t)}>
          {table ? 'Show chart' : 'Show table'}
        </button>
      </div>
      {table ? (
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted">
              <tr><th className="py-1">Month</th><th>Avg days</th><th>Turnovers</th><th>Rent lost</th></tr>
            </thead>
            <tbody className="tabular-nums">
              {data.map((m) => (
                <tr key={m.month} className="border-t border-line">
                  <td className="py-1.5">{monthLabel(m.month)}</td>
                  <td>{m.avg_days_vacant}</td><td>{m.turnovers}</td><td>{compactMoney(m.vacancy_cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fill: INK2, fontSize: 12 }}
                     axisLine={{ stroke: GRID }} tickLine={false} interval="preserveStartEnd" minTickGap={16} />
              <YAxis tick={{ fill: INK2, fontSize: 12 }} axisLine={false} tickLine={false}
                     domain={[0, 'auto']} allowDecimals={false} />
              <Tooltip content={<TrendTooltip />} cursor={{ stroke: '#092a48', strokeWidth: 1, strokeDasharray: '3 3' }} />
              <Line type="monotone" dataKey="avg_days_vacant" stroke={CHART} strokeWidth={2}
                    dot={false} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="mt-2 text-xs text-body">Average days vacant, by month the new tenant moved in.</p>
    </div>
  )
}

/** Two-value comparison drawn as paired bars on one scale. */
export function CompareBars({ items }: { items: { label: string; value: number; emphasis?: boolean }[] }) {
  const max = Math.max(...items.map((i) => i.value), 1)
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i.label}>
          <div className="flex justify-between text-sm">
            <span className="text-heading">{i.label}</span>
            <span className="font-semibold tabular-nums text-heading">{days(i.value)}</span>
          </div>
          <div className="mt-1 h-2.5 rounded-r-[4px] bg-canvas">
            <div className="h-full rounded-r-[4px]"
                 style={{ width: `${(i.value / max) * 100}%`, background: i.emphasis ? CHART : '#9fb3c4' }} />
          </div>
        </li>
      ))}
    </ul>
  )
}
