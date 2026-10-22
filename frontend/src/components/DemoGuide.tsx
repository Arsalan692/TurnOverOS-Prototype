import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { api } from '../lib/api'
import { withCity } from '../lib/city'

const KEY = 'turnoveros.guide.dismissed'

function readDismissed() {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}

/** A 3-minute path through the prototype for a first-time visitor. */
export default function DemoGuide({ city }: { city?: string }) {
  const [hidden, setHidden] = useState(readDismissed)
  const { data: board } = useQuery({ queryKey: ['board', undefined], queryFn: () => api.board(), enabled: !hidden })
  if (hidden) return null

  // A late unit that is listed: shows price suggestion + all AI tools
  const showcase = board?.columns.find((c) => c.key === 'showings')?.cards.find((c) => c.health === 'late')
  const unitLink = showcase ? withCity(`/turnovers/${showcase.id}`, city) : withCity('/board', city)

  const steps = [
    { n: '01', title: 'Log a notice', text: 'Pick any unit and run Notice Autopilot. The whole turnover is planned in one click.', to: '/notice', cta: 'Try it' },
    { n: '02', title: 'Work the board', text: 'Red cards are past target. Drag a card forward when a step is done.', to: withCity('/board', city), cta: 'Open board' },
    { n: '03', title: 'Use the AI tools', text: `On ${showcase?.unit.label ?? 'a listed unit'}: price check, AI listing, application reader and renter chat.`, to: unitLink, cta: 'Open unit' },
    { n: '04', title: 'See the savings', text: 'Move the sliders below to see what each day saved is worth to owners.', to: '#savings', cta: 'Jump down' },
  ]

  const dismiss = () => {
    setHidden(true)
    try { localStorage.setItem(KEY, '1') } catch { /* private mode: fine */ }
  }

  return (
    <section className="card overflow-hidden" aria-labelledby="guide-title">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <p id="guide-title" className="eyebrow">Start here · 3-minute tour</p>
        <button type="button" onClick={dismiss} className="btn-quiet text-muted!" aria-label="Hide tour">
          <X size={16} aria-hidden />
        </button>
      </div>
      <ol className="grid divide-y divide-line sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-4 xl:divide-x">
        {steps.map((s) => (
          <li key={s.n} className="flex flex-col gap-2 p-5">
            <span className="font-label text-[28px] leading-none text-gold">{s.n}</span>
            <p className="font-semibold text-ink">{s.title}</p>
            <p className="flex-1 text-sm text-body">{s.text}</p>
            {s.to.startsWith('#')
              ? <a href={s.to} className="btn-quiet -ml-2 w-fit">{s.cta} →</a>
              : <Link to={s.to} className="btn-quiet -ml-2 w-fit">{s.cta} →</Link>}
          </li>
        ))}
      </ol>
    </section>
  )
}
