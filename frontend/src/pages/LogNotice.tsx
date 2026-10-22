import { useEffect, useState } from 'react'
import { useTitle } from '../lib/title'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, CalendarDays, CheckCircle2, Search, Zap } from 'lucide-react'
import { api, type NoticeResult, type UnitRow } from '../lib/api'
import { beds, days, money, shortDate, todayISO } from '../lib/format'
import { ErrorBox, InlineLoading, PageHeader, Section } from '../components/ui'

function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return v
}

function UnitPicker({ onPick }: { onPick: (u: UnitRow) => void }) {
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const { data, isLoading } = useQuery({
    queryKey: ['units', 'occupied', dq],
    queryFn: () => api.units({ q: dq, status: 'occupied', limit: 12 }),
  })
  return (
    <Section title="1. Which unit?" subtitle="Search occupied units by building, address, neighbourhood or unit number.">
      <label className="relative block">
        <span className="sr-only">Search units</span>
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
        <input
          value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Beltline, Oliver, 304…"
          className="input py-2.5! pl-10!"
        />
      </label>
      {isLoading ? <InlineLoading label="Searching units" /> : (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {data?.map((u) => (
            <li key={u.id}>
              <button type="button" onClick={() => onPick(u)}
                      className="card w-full p-3 text-left transition-colors hover:border-gold-deep hover:bg-gold-soft">
                <p className="text-sm font-semibold text-navy">{u.label}</p>
                <p className="text-xs text-body">{u.neighbourhood}, {u.city} · {beds(u.bedrooms)} · {money(u.current_rent)}/mo</p>
                <p className="mt-1 text-xs text-muted">Tenant: {u.tenant}</p>
              </button>
            </li>
          ))}
          {data?.length === 0 && <li className="text-sm text-body">No occupied units match.</li>}
        </ul>
      )}
    </Section>
  )
}

function Result({ r, onReset }: { r: NoticeResult; onReset: () => void }) {
  const t = r.turnover
  const { data: dash } = useQuery({ queryKey: ['dashboard', undefined], queryFn: () => api.dashboard() })
  const pre = dash?.pre_marketing
  return (
    <div className="space-y-6">
      <section className="card overflow-hidden">
        <div className="bg-navy-deep p-6 text-white">
          <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-accent">
            {t.autopilot ? <><Zap size={16} aria-hidden /> Autopilot plan</> : <><CheckCircle2 size={16} aria-hidden /> Notice logged</>}
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">{t.unit.label}</h2>
          <p className="text-[#e6e1f0]">Tenant moves out {shortDate(t.move_out_date)}. {t.autopilot
            ? `${r.actions.length - 1} steps planned in one click.`
            : 'Nothing else happens until someone acts.'}</p>
        </div>
        <ol className="relative space-y-4 p-6 before:absolute before:inset-y-8 before:left-[2.05rem] before:w-0.5 before:bg-line">
          {r.actions.map((a, i) => (
            <li key={i} className="relative flex gap-4">
              <span className="z-10 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold text-ink">
                <CheckCircle2 size={14} aria-hidden />
              </span>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">{shortDate(a.when)}</p>
                <p className="text-sm text-heading">{a.action}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {pre?.with && pre.without && (
        <Section title="What this changes">
          <p className="text-body">
            {t.autopilot ? (
              <>Units marketed before move-out were empty <b className="text-heading">{days(pre.with.avg_days_vacant)}</b> on
                average, vs <b className="text-heading">{days(pre.without.avg_days_vacant)}</b> when listing waited for move-out.
                At {money(t.asking_rent)}/mo that is about{' '}
                <b className="text-heading">{money(((pre.without.avg_days_vacant - pre.with.avg_days_vacant) * (t.asking_rent ?? 0) * 12) / 365)}</b>{' '}
                more rent for the owner on this one unit.</>
            ) : (
              <>Without Autopilot this unit waits in <b className="text-heading">Notice</b> until someone acts.
                Units listed after move-out sat empty <b className="text-heading">{days(pre.without.avg_days_vacant)}</b> on average.</>
            )}
          </p>
        </Section>
      )}

      <div className="flex flex-wrap gap-3">
        <Link to={`/turnovers/${t.id}`} className="btn-solid">Open this turnover <ArrowRight size={16} aria-hidden /></Link>
        <Link to="/board" className="btn">Go to board</Link>
        <button type="button" className="btn" onClick={onReset}>Log another notice</button>
      </div>
    </div>
  )
}

export default function LogNotice() {
  useTitle('Log a notice')
  const qc = useQueryClient()
  const [unit, setUnit] = useState<UnitRow | null>(null)
  const [noticeDate, setNoticeDate] = useState(todayISO())
  const [moveOut, setMoveOut] = useState('')
  const [autopilot, setAutopilot] = useState(true)
  const [result, setResult] = useState<NoticeResult | null>(null)

  const detail = useQuery({ queryKey: ['unit', unit?.id], queryFn: () => api.unit(unit!.id), enabled: !!unit })
  useEffect(() => { if (detail.data) setMoveOut(detail.data.default_move_out) }, [detail.data])

  const submit = useMutation({
    mutationFn: () => api.notice(unit!.id, { notice_date: noticeDate, move_out_date: moveOut || undefined, autopilot }),
    onSuccess: (r) => {
      setResult(r)
      qc.invalidateQueries({ queryKey: ['board'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['units'] })
    },
  })

  const reset = () => { setResult(null); setUnit(null); submit.reset() }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow="Notice Autopilot"
        title="Log a notice"
        subtitle="A tenant told you they are leaving. With Autopilot, the whole turnover is planned right now, so the next tenant can be found before this one moves out."
      />

      {result ? <Result r={result} onReset={reset} /> : !unit ? <UnitPicker onPick={setUnit} /> : (
        <Section title="2. Notice details"
                 action={<button type="button" className="text-sm font-medium text-gold-ink hover:underline" onClick={() => setUnit(null)}>Change unit</button>}>
          <div className="mb-5 rounded-card bg-canvas p-4">
            <p className="font-semibold text-navy">{unit.label}</p>
            <p className="text-sm text-body">{unit.address} · {beds(unit.bedrooms)} · {money(unit.current_rent)}/mo · Tenant: {unit.tenant}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="flex items-center gap-1.5 font-medium text-heading"><CalendarDays size={15} aria-hidden /> Notice received</span>
              <input type="date" value={noticeDate} onChange={(e) => setNoticeDate(e.target.value)}
                     className="mt-1 w-full rounded-card border border-line bg-surface px-3 py-2 text-heading focus:border-accent" />
            </label>
            <label className="block text-sm">
              <span className="flex items-center gap-1.5 font-medium text-heading"><CalendarDays size={15} aria-hidden /> Move-out date</span>
              <input type="date" value={moveOut} onChange={(e) => setMoveOut(e.target.value)}
                     className="mt-1 w-full rounded-card border border-line bg-surface px-3 py-2 text-heading focus:border-accent" />
              <span className="mt-1 block text-xs text-muted">Default: end of the next full month (Alberta monthly tenancy).</span>
            </label>
          </div>

          <label className={`mt-5 flex cursor-pointer items-start gap-3 rounded-card border-2 p-4 transition-colors ${
            autopilot ? 'border-gold-deep bg-gold-soft' : 'border-line'}`}>
            <input type="checkbox" checked={autopilot} onChange={(e) => setAutopilot(e.target.checked)}
                   className="mt-1 h-4 w-4 accent-[#8a6116]" />
            <span>
              <span className="flex items-center gap-1.5 font-semibold text-navy"><Zap size={16} aria-hidden /> Notice Autopilot</span>
              <span className="mt-1 block text-sm text-body">
                Sets the rent from similar recent leases, books photos, inspection, cleaning and repairs with the
                fastest vendors, and lists the unit on Rentfaster and Facebook today.
              </span>
            </span>
          </label>

          {submit.error && <div className="mt-4"><ErrorBox error={submit.error} /></div>}

          <button type="button" className="btn-solid mt-6" disabled={submit.isPending || !moveOut}
                  onClick={() => submit.mutate()}>
            {submit.isPending ? 'Planning…' : autopilot ? <><Zap size={16} aria-hidden /> Log notice and run Autopilot</> : 'Log notice'}
          </button>
        </Section>
      )}
    </div>
  )
}
