import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Clock, Loader2, Zap } from 'lucide-react'
import type { Health } from '../lib/api'

const HEALTH = {
  ok: { label: 'On track', icon: CheckCircle2, cls: 'bg-ok/10 text-[#1d7f55]' },
  warn: { label: 'At risk', icon: Clock, cls: 'bg-warn/15 text-[#94600f]' },
  late: { label: 'Late', icon: AlertTriangle, cls: 'bg-late/10 text-[#b4252a]' },
} as const

/** Status is never colour-only: icon + label + colour. */
export function HealthBadge({ health, compact = false }: { health: Health; compact?: boolean }) {
  const h = HEALTH[health]
  const Icon = h.icon
  return (
    <span className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-xs font-medium ${h.cls}`}>
      <Icon size={13} aria-hidden />
      {compact ? <span className="sr-only">{h.label}</span> : h.label}
    </span>
  )
}

export function AutopilotBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-pill bg-accent-soft px-2 py-0.5 text-xs font-medium text-[#0f7898]">
      <Zap size={12} aria-hidden /> Autopilot
    </span>
  )
}

export function StatTile({ label, value, sub, tone }: {
  label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad'
}) {
  return (
    <div className="card p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-navy tabular-nums">{value}</p>
      {sub && (
        <p className={`mt-1 text-sm ${tone === 'good' ? 'text-[#1d7f55]' : tone === 'bad' ? 'text-[#b4252a]' : 'text-body'}`}>
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
    <section className={`card p-5 ${className}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-navy">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-body">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-body" role="status">
      <Loader2 className="animate-spin text-accent" size={20} aria-hidden /> {label}
    </div>
  )
}

export function ErrorBox({ error }: { error: unknown }) {
  return (
    <div className="rounded-card border border-late/30 bg-late/5 p-4 text-sm text-[#b4252a]" role="alert">
      {error instanceof Error ? error.message : 'Something went wrong.'}
    </div>
  )
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="section-title text-2xl md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-3 max-w-2xl text-body">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
