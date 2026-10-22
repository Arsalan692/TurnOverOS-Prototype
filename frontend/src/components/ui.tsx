import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Clock, Zap } from 'lucide-react'
import type { Health } from '../lib/api'

const HEALTH = {
  ok: { label: 'On track', icon: CheckCircle2, cls: 'border-ok/25 bg-ok/8 text-ok' },
  warn: { label: 'At risk', icon: Clock, cls: 'border-warn/30 bg-warn/10 text-[#92400e]' },
  late: { label: 'Late', icon: AlertTriangle, cls: 'border-late/25 bg-late/8 text-late' },
} as const

/** Status is never colour-only: icon + label + colour. */
export function HealthBadge({ health, compact = false }: { health: Health; compact?: boolean }) {
  const h = HEALTH[health]
  const Icon = h.icon
  return (
    <span className={`inline-flex items-center gap-1 rounded-btn border px-1.5 py-0.5 text-xs font-semibold ${h.cls}`}
          title={compact ? h.label : undefined}>
      <Icon size={12} strokeWidth={2.4} aria-hidden />
      {compact ? <span className="sr-only">{h.label}</span> : h.label}
    </span>
  )
}

export function AutopilotBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-btn border border-gold-deep/40 bg-gold-soft px-1.5 py-0.5 text-xs font-semibold text-gold-ink">
      <Zap size={11} strokeWidth={2.4} aria-hidden /> Autopilot
    </span>
  )
}

export function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'gold' | 'ok' }) {
  const cls = { neutral: 'border-line bg-canvas text-body', gold: 'border-gold-deep/40 bg-gold-soft text-gold-ink', ok: 'border-ok/25 bg-ok/8 text-ok' }[tone]
  return <span className={`inline-flex items-center gap-1 rounded-btn border px-1.5 py-0.5 text-xs font-medium ${cls}`}>{children}</span>
}

export function StatTile({ label, value, sub, tone }: {
  label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad'
}) {
  return (
    <div className="card p-5">
      <p className="eyebrow text-muted!">{label}</p>
      <p className="num mt-2 text-[2rem] font-semibold leading-none text-ink">{value}</p>
      {sub && (
        <p className={`mt-2 text-sm ${tone === 'good' ? 'text-ok' : tone === 'bad' ? 'text-late' : 'text-body'}`}>
          {sub}
        </p>
      )}
    </div>
  )
}

export function Section({ title, subtitle, action, children, className = '' }: {
  title: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string
}) {
  return (
    <section className={`card ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-body">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

/** Placeholder blocks shaped like the content, instead of a spinner. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Skeleton className="h-72" /><Skeleton className="h-72" />
      </div>
    </div>
  )
}

export function InlineLoading({ label }: { label: string }) {
  return (
    <div role="status" className="space-y-2 py-2">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-4 w-2/3" />
    </div>
  )
}

export function ErrorBox({ error }: { error: unknown }) {
  return (
    <div className="flex items-start gap-2 rounded-card border border-late/30 bg-late/5 p-3 text-sm text-late" role="alert">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
      {error instanceof Error ? error.message : 'Something went wrong.'}
    </div>
  )
}

export function PageHeader({ eyebrow, title, subtitle, action }: {
  eyebrow?: string; title: string; subtitle?: string; action?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold text-ink md:text-[1.75rem]">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-body">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
