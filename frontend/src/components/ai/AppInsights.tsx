import { useState } from 'react'
import { AlertCircle, CheckCircle2, ChevronDown, HelpCircle, Sparkles } from 'lucide-react'
import type { ApplicationT, ExtractedApp } from '../../lib/api'

/** What Gemini read from an uploaded application. */
export default function AppInsights({ a, open: initialOpen = false }: { a: ApplicationT; open?: boolean }) {
  const [open, setOpen] = useState(initialOpen)
  const x = a.ai_extracted as unknown as ExtractedApp | null
  if (!x) return null
  const fields: [string, string | number | null | undefined][] = [
    ['Current address', x.current_address],
    ['Current landlord', x.current_landlord],
    ['Years at address', x.years_at_current_address],
    ['Job title', x.job_title],
    ['Years with employer', x.employment_length_years],
    ['Occupants', x.occupants],
    ['Pets', x.pets],
    ['Signed', x.signed == null ? null : x.signed ? 'Yes' : 'No'],
    ['Document quality', x.handwriting_or_scan_quality],
  ]

  return (
    <div className="mt-2">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#0f7898]">
        <Sparkles size={13} aria-hidden /> AI read this application
        <ChevronDown size={14} aria-hidden className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-2 space-y-3 rounded-card border border-line bg-surface p-3">
          <p className="text-sm text-heading">{a.ai_summary}</p>
          <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
            {fields.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2 border-b border-line/60 py-1">
                <dt className="text-muted">{k}</dt>
                <dd className={v == null || v === '' ? 'text-[#b4252a]' : 'text-right text-heading'}>{v ?? 'missing'}</dd>
              </div>
            ))}
          </dl>
          {x.references?.length > 0 && (
            <p className="text-xs text-body">
              References: {x.references.map((r) => [r.name, r.relationship, r.phone].filter(Boolean).join(', ')).join(' · ')}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {x.strengths?.length > 0 && (
              <div>
                <p className="flex items-center gap-1 text-xs font-semibold text-[#1d7f55]"><CheckCircle2 size={13} aria-hidden /> Strengths</p>
                <ul className="mt-1 list-disc pl-4 text-xs text-heading">{x.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
              </div>
            )}
            {x.follow_ups?.length > 0 && (
              <div>
                <p className="flex items-center gap-1 text-xs font-semibold text-[#94600f]"><HelpCircle size={13} aria-hidden /> Ask before deciding</p>
                <ul className="mt-1 list-disc pl-4 text-xs text-heading">{x.follow_ups.map((s) => <li key={s}>{s}</li>)}</ul>
              </div>
            )}
          </div>
          {x.missing_fields?.length > 0 && (
            <p className="flex items-start gap-1 text-xs text-[#b4252a]">
              <AlertCircle size={13} className="mt-0.5 shrink-0" aria-hidden /> Missing: {x.missing_fields.join(', ')}
            </p>
          )}
          <p className="text-xs text-muted">Read by {x.model}. Advisory only: a person makes the decision.</p>
        </div>
      )}
    </div>
  )
}
