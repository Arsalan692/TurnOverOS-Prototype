import { useEffect, useMemo, useState } from 'react'
import { Zap } from 'lucide-react'
import type { Dashboard } from '../lib/api'
import { compactMoney, days, money } from '../lib/format'

/** "If we cut X days from stage Y, owners keep $Z a year." */
export default function SavingsCalculator({ d }: { d: Dashboard }) {
  const stages = d.stage_breakdown
  const [cuts, setCuts] = useState<Record<string, number>>({})

  const preWith = d.pre_marketing.with?.avg_days_vacant
  const preWithout = d.pre_marketing.without?.avg_days_vacant
  const autopilotCut = preWith != null && preWithout != null ? preWithout - preWith : null

  const totalCut = useMemo(() => Object.values(cuts).reduce((s, v) => s + v, 0), [cuts])
  const turnovers = d.kpis.turnovers_12m
  const daily = d.kpis.avg_daily_rent
  const saved = totalCut * turnovers * daily
  const current = d.kpis.avg_days_vacant_12m ?? 0

  const applyAutopilot = () => {
    if (autopilotCut == null) return
    // Spread the measured pre-marketing gain over the stages it removes, biggest first
    let left = autopilotCut
    const next: Record<string, number> = {}
    for (const s of [...stages].sort((a, b) => b.avg_days - a.avg_days)) {
      const take = Math.min(left, Math.floor(s.avg_days * 2) / 2)
      next[s.stage] = Math.max(0, Math.round(take * 2) / 2)
      left -= next[s.stage]
      if (left <= 0) break
    }
    setCuts(next)
  }

  // Open with the measured Autopilot result so the first number is meaningful
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { applyAutopilot() }, [d.city])

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div>
        <div className="mb-4 flex flex-wrap gap-2">
          {autopilotCut != null && (
            <button type="button" className="btn-solid" onClick={applyAutopilot}>
              <Zap size={16} aria-hidden /> Apply Autopilot result (−{days(autopilotCut)})
            </button>
          )}
          <button type="button" className="btn" onClick={() => setCuts({})}>Reset</button>
        </div>
        <ul className="space-y-4">
          {stages.map((s) => {
            const v = cuts[s.stage] ?? 0
            const maxCut = Math.max(0.5, Math.floor(s.avg_days * 2) / 2)
            return (
              <li key={s.stage}>
                <div className="flex justify-between text-sm">
                  <label htmlFor={`cut-${s.stage}`} className="text-heading">{s.label}</label>
                  <span className="tabular-nums text-body">
                    {s.avg_days.toFixed(1)} → <b className="text-heading">{Math.max(0, s.avg_days - v).toFixed(1)}</b> days
                  </span>
                </div>
                <input
                  id={`cut-${s.stage}`} type="range" min={0} max={maxCut} step={0.5} value={v}
                  onChange={(e) => setCuts((c) => ({ ...c, [s.stage]: Number(e.target.value) }))}
                  className="mt-1 w-full accent-[#1594bb]"
                  aria-valuetext={`cut ${v} days`}
                />
              </li>
            )
          })}
        </ul>
      </div>

      <div className="rounded-card bg-navy-deep p-6 text-white">
        <p className="text-xs uppercase tracking-wide text-[#b7becd]">Owners keep per year</p>
        <p className="mt-2 text-4xl font-semibold tabular-nums text-accent">{compactMoney(Math.round(saved))}</p>
        <dl className="mt-6 space-y-3 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-[#b7becd]">Days cut per turnover</dt><dd className="font-semibold tabular-nums">{totalCut.toFixed(1)}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-[#b7becd]">Avg days vacant</dt><dd className="font-semibold tabular-nums">{current.toFixed(1)} → {Math.max(0, current - totalCut).toFixed(1)}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-[#b7becd]">Turnovers per year</dt><dd className="font-semibold tabular-nums">{turnovers}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-[#b7becd]">Avg rent per day</dt><dd className="font-semibold tabular-nums">{money(daily)}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-[#b7becd]">Rent days recovered</dt><dd className="font-semibold tabular-nums">{Math.round(totalCut * turnovers).toLocaleString()}</dd></div>
        </dl>
        <p className="mt-6 text-xs leading-relaxed text-[#8c96a8]">
          Days cut × turnovers per year × average daily rent. Based on the last 12 months of demo data.
        </p>
      </div>
    </div>
  )
}
