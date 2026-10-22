import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, ScanLine, Upload } from 'lucide-react'
import { api, type TurnoverDetail } from '../../lib/api'
import { ErrorBox } from '../ui'

const SAMPLE_LABELS: Record<string, string> = {
  'application-typed.pdf': 'Typed PDF',
  'application-scanned.jpg': 'Scanned, handwritten',
}

/** Upload (or pick a sample) rental application; Gemini reads it into a new application. */
export default function ApplicationReader({ t, onDone }: { t: TurnoverDetail; onDone: (appId: number) => void }) {
  const qc = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const [secs, setSecs] = useState<number | null>(null)
  const { data: samples } = useQuery({ queryKey: ['samples'], queryFn: api.samples, staleTime: Infinity })

  const run = useMutation({
    mutationFn: async (src: { file?: File; sample?: string }) => {
      const start = performance.now()
      const r = src.file ? await api.uploadApplication(t.id, src.file) : await api.sampleApplication(t.id, src.sample!)
      setSecs((performance.now() - start) / 1000)
      return r
    },
    onSuccess: (r) => {
      qc.setQueryData(['turnover', t.id], r.turnover)
      qc.invalidateQueries({ queryKey: ['board'] })
      onDone(r.application_id)
    },
  })

  const onFiles = (files: FileList | null) => { if (files?.[0]) run.mutate({ file: files[0] }) }

  return (
    <div className="rounded-card border border-accent/40 bg-accent-soft/50 p-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); onFiles(e.dataTransfer.files) }}
        className={`flex flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed px-4 py-6 text-center transition-colors ${
          drag ? 'border-accent bg-white' : 'border-line bg-surface'}`}
      >
        <ScanLine className="text-chart" aria-hidden />
        <p className="text-sm text-heading">
          {run.isPending ? 'Gemini is reading the application…' : 'Drop a rental application here: PDF, photo or scan, even handwritten'}
        </p>
        <button type="button" className="btn" disabled={run.isPending} onClick={() => input.current?.click()}>
          <Upload size={15} aria-hidden /> Choose file
        </button>
        <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden"
               onChange={(e) => { onFiles(e.target.files); e.target.value = '' }} />
      </div>
      {samples && samples.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-body">Or try a sample:</span>
          {samples.map((s) => (
            <span key={s} className="inline-flex items-center gap-1">
              <button type="button" className="btn px-3! py-1!" disabled={run.isPending} onClick={() => run.mutate({ sample: s })}>
                <FileText size={14} aria-hidden /> {SAMPLE_LABELS[s] ?? s}
              </button>
              <a href={`/samples/${s}`} target="_blank" rel="noreferrer" className="text-xs text-[#0f7898] hover:underline">view</a>
            </span>
          ))}
        </div>
      )}
      {secs != null && !run.isPending && !run.error && (
        <p className="mt-2 text-xs text-muted">Read in {secs.toFixed(1)}s. The new application is below.</p>
      )}
      {run.error && <div className="mt-3"><ErrorBox error={run.error} /></div>}
      <p className="mt-3 text-xs text-muted">
        AI reads and summarises only. Income ratio is calculated, not guessed, and a person approves or declines.
      </p>
    </div>
  )
}
