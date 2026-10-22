import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Images, ShieldCheck, Sparkles } from 'lucide-react'
import { api, type ListingDraft, type TurnoverDetail } from '../../lib/api'
import { ErrorBox } from '../ui'

const TONES = ['warm', 'professional', 'short and punchy']

/** Gemini drafts the Rentfaster ad + Facebook post from unit facts and photos. */
export default function ListingWriter({ t }: { t: TurnoverDetail }) {
  const qc = useQueryClient()
  const [tone, setTone] = useState(TONES[0])
  const [draft, setDraft] = useState<ListingDraft | null>(null)
  const [secs, setSecs] = useState<number | null>(null)
  const [published, setPublished] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const write = useMutation({
    mutationFn: async () => {
      const start = performance.now()
      const d = await api.aiListing(t.id, tone)
      setSecs((performance.now() - start) / 1000)
      return d
    },
    onSuccess: (d) => { setDraft(d); setPublished(false) },
  })

  const publish = useMutation({
    mutationFn: () => api.applyListing(t.id, {
      title: draft!.title, description: draft!.description,
      facebook_post: draft!.facebook_post, ai_generated: draft!.ai,
    }),
    onSuccess: (next) => {
      qc.setQueryData(['turnover', t.id], next)
      qc.invalidateQueries({ queryKey: ['board'] })
      setPublished(true)
    },
  })

  const copy = async (key: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 1500) } catch { /* ignore */ }
  }

  return (
    <div className="rounded-card border border-accent/40 bg-accent-soft/50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-heading" htmlFor={`tone-${t.id}`}>Tone</label>
        <select id={`tone-${t.id}`} value={tone} onChange={(e) => setTone(e.target.value)}
                className="rounded-pill border border-line bg-surface px-3 py-1.5 text-sm">
          {TONES.map((x) => <option key={x}>{x}</option>)}
        </select>
        <button type="button" className="btn-solid" disabled={write.isPending} onClick={() => write.mutate()}>
          <Sparkles size={16} aria-hidden />
          {write.isPending ? 'Gemini is writing…' : draft ? 'Write again' : 'Write listing with AI'}
        </button>
      </div>
      {write.isPending && (
        <p className="mt-3 text-sm text-body">Reading the unit details and looking at the photos…</p>
      )}
      {write.error && <div className="mt-3"><ErrorBox error={write.error} /></div>}

      {draft && !write.isPending && (
        <div className="mt-4 space-y-4">
          {!draft.ai && (
            <ErrorBox error={new Error(`${draft.error ?? 'AI unavailable.'} Showing a plain template instead.`)} />
          )}
          <p className="text-xs text-muted">
            {draft.ai ? `Written by ${draft.model} in ${secs?.toFixed(1)}s · looked at ${draft.photos_used} photos` : 'Template'}
          </p>

          <label className="block text-sm">
            <span className="font-medium text-heading">Rentfaster title</span>
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                   className="mt-1 w-full rounded-card border border-line bg-surface px-3 py-2 text-heading" />
          </label>
          <label className="block text-sm">
            <span className="flex items-center justify-between font-medium text-heading">
              Rentfaster description
              <button type="button" className="inline-flex items-center gap-1 text-xs text-[#0f7898]"
                      onClick={() => copy('desc', `${draft.title}\n\n${draft.description}`)}>
                {copied === 'desc' ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />} Copy
              </button>
            </span>
            <textarea value={draft.description} rows={8} onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                      className="mt-1 w-full rounded-card border border-line bg-surface px-3 py-2 text-heading" />
          </label>
          <label className="block text-sm">
            <span className="flex items-center justify-between font-medium text-heading">
              Facebook Marketplace post
              <button type="button" className="inline-flex items-center gap-1 text-xs text-[#0f7898]"
                      onClick={() => copy('fb', draft.facebook_post)}>
                {copied === 'fb' ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />} Copy
              </button>
            </span>
            <textarea value={draft.facebook_post} rows={4} onChange={(e) => setDraft({ ...draft, facebook_post: e.target.value })}
                      className="mt-1 w-full rounded-card border border-line bg-surface px-3 py-2 text-heading" />
          </label>

          {draft.highlights.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {draft.highlights.map((h) => <li key={h} className="rounded-pill bg-surface px-2.5 py-1 text-xs text-heading">{h}</li>)}
            </ul>
          )}
          {draft.photo_notes.length > 0 && (
            <div className="text-sm">
              <p className="flex items-center gap-1.5 font-medium text-heading"><Images size={15} aria-hidden /> What the AI saw in the photos</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-body">
                {draft.photo_notes.map((n) => <li key={n}>{n}</li>)}
              </ul>
            </div>
          )}
          <p className="flex items-start gap-1.5 text-sm text-[#1d7f55]">
            <ShieldCheck size={16} className="mt-0.5 shrink-0" aria-hidden /> {draft.fair_housing_check}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn-solid" disabled={publish.isPending || published} onClick={() => publish.mutate()}>
              {published ? <><Check size={16} aria-hidden /> Published</> : publish.isPending ? 'Publishing…' : 'Publish to Rentfaster & Facebook'}
            </button>
            <span className="text-xs text-muted">Edits above are kept. Prototype: updates the listings stored here.</span>
          </div>
          {publish.error && <ErrorBox error={publish.error} />}
        </div>
      )}
    </div>
  )
}
