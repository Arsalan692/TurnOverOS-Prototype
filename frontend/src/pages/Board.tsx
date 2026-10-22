import { useState } from 'react'
import { useTitle } from '../lib/title'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor, useDraggable, useDroppable,
  useSensor, useSensors, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { BedDouble, Clock, DollarSign, MessageCircle } from 'lucide-react'
import { api, type Board as BoardT, type Card, type StageKey } from '../lib/api'
import { beds, money } from '../lib/format'
import { useCity, withCity } from '../lib/city'
import { AutopilotBadge, ErrorBox, HealthBadge, Loading, PageHeader } from '../components/ui'

const BORDER = { ok: 'border-l-ok', warn: 'border-l-warn', late: 'border-l-late' } as const

function CardBody({ c }: { c: Card }) {
  const vacant = c.days_vacant > 0
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-navy">{c.unit.label}</p>
          <p className="truncate text-xs text-body">{c.unit.neighbourhood}, {c.unit.city}</p>
        </div>
        <HealthBadge health={c.health} compact />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-body">
        <span className="inline-flex items-center gap-1"><BedDouble size={13} aria-hidden />{beds(c.unit.bedrooms)}</span>
        <span className="inline-flex items-center gap-1 tabular-nums"><Clock size={13} aria-hidden />
          {c.days_in_stage}/{c.target_days}d
        </span>
        <span className="inline-flex items-center gap-1 tabular-nums"><MessageCircle size={13} aria-hidden />{c.leads}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        {vacant ? (
          <span className="inline-flex items-center gap-1 font-medium text-late tabular-nums">
            <DollarSign size={13} aria-hidden />{money(c.rent_lost)} lost · {c.days_vacant}d empty
          </span>
        ) : (
          <span className="tabular-nums text-body">
            {c.days_until_move_out > 0 ? `Moves out in ${c.days_until_move_out}d` : 'Moved out today'}
          </span>
        )}
        {c.autopilot && <AutopilotBadge />}
      </div>
    </>
  )
}

function DraggableCard({ c, city }: { c: Card; city?: string }) {
  const navigate = useNavigate()
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: c.id, data: { card: c } })
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      role="button"
      aria-label={`${c.unit.label}, ${c.stage_label}, ${c.health}. Press Enter to open, Space to drag.`}
      onClick={() => navigate(withCity(`/turnovers/${c.id}`, city))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') navigate(withCity(`/turnovers/${c.id}`, city))
        else listeners?.onKeyDown?.(e)
      }}
      className={`card cursor-grab border-l-4 p-3 active:cursor-grabbing ${BORDER[c.health]} ${isDragging ? 'opacity-40' : ''}`}
    >
      <CardBody c={c} />
    </div>
  )
}

function Column({ col, city, dropAllowed }: {
  col: BoardT['columns'][number]; city?: string; dropAllowed: boolean | null
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key })
  const late = col.cards.filter((c) => c.health === 'late').length
  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 shrink-0 flex-col rounded-card bg-[#f3eee2] transition-colors ${
        isOver && dropAllowed ? 'bg-gold-soft ring-2 ring-gold-deep' : ''} ${
        dropAllowed === false ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <div>
          <h2 className="text-sm font-semibold text-navy">{col.label}</h2>
          <p className="text-xs text-muted">Target {col.target_days}d</p>
        </div>
        <div className="flex items-center gap-1.5">
          {late > 0 && <span className="rounded-btn bg-late/10 px-2 py-0.5 text-xs font-medium text-late">{late} late</span>}
          <span className="rounded-btn bg-white px-2 py-0.5 text-xs font-semibold text-navy">{col.cards.length}</span>
        </div>
      </div>
      <div className="flex max-h-[calc(100vh-17rem)] min-h-24 flex-col gap-2 overflow-y-auto px-2 pb-3">
        {col.cards.map((c) => <DraggableCard key={c.id} c={c} city={city} />)}
        {col.cards.length === 0 && <p className="px-2 py-6 text-center text-xs text-muted">Nothing here</p>}
      </div>
    </div>
  )
}

export default function Board() {
  useTitle('Turnover board')
  const city = useCity()
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery({ queryKey: ['board', city], queryFn: () => api.board(city) })
  const [dragging, setDragging] = useState<Card | null>(null)
  const [moveError, setMoveError] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  )
  const order = data?.columns.map((c) => c.key) ?? []

  const move = useMutation({
    mutationFn: ({ id, stage }: { id: number; stage: StageKey }) => api.move(id, stage),
    onSuccess: () => {
      setMoveError(null)
      qc.invalidateQueries({ queryKey: ['board'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (e) => setMoveError(e instanceof Error ? e.message : 'Could not move unit.'),
  })

  const onDragStart = (e: DragStartEvent) => setDragging((e.active.data.current?.card as Card) ?? null)
  const onDragEnd = (e: DragEndEvent) => {
    const card = e.active.data.current?.card as Card | undefined
    setDragging(null)
    const target = e.over?.id as StageKey | undefined
    if (!card || !target || target === card.stage) return
    if (order.indexOf(target) < order.indexOf(card.stage)) {
      setMoveError('Units can only move forward.')
      return
    }
    move.mutate({ id: card.id, stage: target })
  }

  if (isLoading) return <Loading />
  if (error || !data) return <ErrorBox error={error} />
  const s = data.summary

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Turnover board"
        subtitle="Every unit between tenants, from notice to move-in. Drag a card forward when a step is done; red cards are past their target."
        action={<Link to="/notice" className="btn-solid">Log a notice</Link>}
      />

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {[
          { v: s.active, l: 'in progress', c: 'text-ink' },
          { v: s.vacant, l: 'empty now', c: 'text-ink' },
          { v: s.late, l: 'late', c: 'text-late' },
          { v: s.warn, l: 'at risk', c: 'text-[#92400e]' },
          { v: money(s.rent_lost_so_far), l: 'rent lost so far', c: 'text-ink' },
        ].map((x) => (
          <span key={x.l} className="rounded-btn border border-line bg-surface px-3 py-1.5">
            <b className={`num font-semibold ${x.c}`}>{x.v}</b> <span className="text-body">{x.l}</span>
          </span>
        ))}
      </div>

      {moveError && <div className="mb-3"><ErrorBox error={new Error(moveError)} /></div>}

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
        <div className="-mx-4 overflow-x-auto px-4 pb-4 md:-mx-8 md:px-8">
          <div className="flex gap-3">
            {data.columns.map((col) => (
              <Column
                key={col.key}
                col={col}
                city={city}
                dropAllowed={dragging ? order.indexOf(col.key) > order.indexOf(dragging.stage) : null}
              />
            ))}
          </div>
        </div>
        <DragOverlay>
          {dragging && <div className={`card w-68 rotate-2 border-l-4 p-3 shadow-card-hover ${BORDER[dragging.health]}`}><CardBody c={dragging} /></div>}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
