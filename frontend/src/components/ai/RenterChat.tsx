import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Bot, CalendarClock, Send, UserRound, UserRoundCog } from 'lucide-react'
import { api, type BotReply, type ChatTurn, type TurnoverDetail } from '../../lib/api'
import { ErrorBox } from '../ui'

const QUICK = [
  'Hi, is this still available?',
  'Are cats allowed?',
  'Can I see it this weekend?',
  'Would you take $100 less per month?',
  "What's the exact address?",
]

type Msg = ChatTurn & { meta?: BotReply & { secs: number } }

/** Demo of the instant renter-reply bot: you type as the renter. */
export default function RenterChat({ t }: { t: TurnoverDetail }) {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [msgs])

  const send = useMutation({
    mutationFn: async (message: string) => {
      const start = performance.now()
      const r = await api.aiReply(t.id, message, msgs.map(({ role, text }) => ({ role, text })))
      return { ...r, secs: (performance.now() - start) / 1000 }
    },
    onMutate: (message) => setMsgs((m) => [...m, { role: 'renter', text: message }]),
    onSuccess: (r) => setMsgs((m) => [...m, { role: 'assistant', text: r.reply, meta: r }]),
  })

  const submit = (message: string) => {
    const m = message.trim()
    if (!m || send.isPending) return
    setText('')
    send.mutate(m)
  }

  return (
    <div>
      <div className="max-h-96 min-h-40 space-y-3 overflow-y-auto rounded-card bg-canvas p-3" aria-live="polite">
        {msgs.length === 0 && (
          <p className="py-6 text-center text-sm text-body">You are the renter. Ask anything about this listing.</p>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === 'renter' ? 'flex-row-reverse' : ''}`}>
            <span className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
              m.role === 'renter' ? 'bg-navy text-white' : 'bg-chart text-white'}`}>
              {m.role === 'renter' ? <UserRound size={15} aria-hidden /> : <Bot size={15} aria-hidden />}
            </span>
            <div className={`max-w-[85%] rounded-card px-3 py-2 text-sm ${
              m.role === 'renter' ? 'bg-navy text-white' : 'bg-surface text-heading shadow-card'}`}>
              <p className="whitespace-pre-line">{m.text}</p>
              {m.meta && (
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  <span className="rounded-pill bg-canvas px-2 py-0.5 text-body">replied in {m.meta.secs.toFixed(1)}s</span>
                  <span className="rounded-pill bg-canvas px-2 py-0.5 text-body">{m.meta.intent.replace('_', ' ')}</span>
                  {m.meta.needs_human && (
                    <span className="inline-flex items-center gap-1 rounded-pill bg-warn/15 px-2 py-0.5 text-[#94600f]">
                      <UserRoundCog size={12} aria-hidden /> sent to team{m.meta.handoff_reason ? `: ${m.meta.handoff_reason}` : ''}
                    </span>
                  )}
                  {m.meta.suggested_slots.map((s) => (
                    <span key={s} className="inline-flex items-center gap-1 rounded-pill bg-accent-soft px-2 py-0.5 text-[#0f7898]">
                      <CalendarClock size={12} aria-hidden /> {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {send.isPending && <p className="pl-9 text-sm text-muted">Typing…</p>}
        <div ref={end} />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {QUICK.map((q) => (
          <button key={q} type="button" onClick={() => submit(q)} disabled={send.isPending}
                  className="rounded-pill border border-line bg-surface px-2.5 py-1 text-xs text-heading hover:border-accent">
            {q}
          </button>
        ))}
      </div>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); submit(text) }}>
        <label className="sr-only" htmlFor={`chat-${t.id}`}>Message as renter</label>
        <input id={`chat-${t.id}`} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000}
               placeholder="Type as the renter…"
               className="min-w-0 flex-1 rounded-pill border border-line bg-surface px-4 py-2 text-sm focus:border-accent" />
        <button type="submit" className="btn-solid" disabled={send.isPending || !text.trim()} aria-label="Send">
          <Send size={16} aria-hidden />
        </button>
      </form>
      {send.error && <div className="mt-3"><ErrorBox error={send.error} /></div>}
      <p className="mt-3 text-xs text-muted">
        Answers only from the listing facts and hands anything else to a person. In production this connects to
        Facebook Messenger through Meta's official API.
      </p>
    </div>
  )
}
