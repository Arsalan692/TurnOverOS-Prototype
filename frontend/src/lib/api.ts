// Typed calls to the FastAPI backend (proxied at /api in dev).

export type Health = 'ok' | 'warn' | 'late'
export type StageKey =
  | 'notice' | 'pre_marketing' | 'move_out_inspection' | 'make_ready' | 'photos'
  | 'listed' | 'showings' | 'screening' | 'lease_signed' | 'moved_in'

export interface Stage { key: StageKey; label: string; target_days: number }

export interface UnitBrief {
  id: number; label: string; unit_number: string
  property_id: number; property_name: string; property_type: string
  address: string; city: string; neighbourhood: string
  bedrooms: number; bathrooms: number; sqft: number
  market_rent: number; status: 'occupied' | 'notice' | 'vacant'; photo: string
}

export interface Card {
  id: number; unit: UnitBrief; stage: StageKey; stage_label: string
  days_in_stage: number; target_days: number; health: Health
  notice_date: string; move_out_date: string; days_until_move_out: number
  days_vacant: number; rent_lost: number; asking_rent: number | null; leads: number
  autopilot: boolean; pre_marketed: boolean; has_approved_applicant: boolean
}

export interface Board {
  columns: (Stage & { cards: Card[] })[]
  summary: { active: number; late: number; warn: number; vacant: number; rent_lost_so_far: number }
}

export interface Task {
  id: number; type: string; status: 'scheduled' | 'done' | 'cancelled'
  scheduled_for: string | null; completed_at: string | null; cost: number | null; auto_created: boolean
  vendor: { id: number; name: string; rating: number; avg_turnaround_days: number } | null
}

export interface ListingT {
  id: number; channel: string; title: string; description: string; price: number
  posted_at: string; status: 'live' | 'closed'; ai_generated: boolean
  leads: number; avg_response_hours: number | null
}

export interface ApplicationT {
  id: number; applicant_name: string; email: string; phone: string
  employer: string | null; monthly_income: number | null; income_to_rent: number | null
  household_size: number | null; has_pets: boolean | null; desired_move_in: string | null
  submitted_at: string; decided_at: string | null
  status: 'submitted' | 'approved' | 'declined' | 'withdrawn'
  ai_summary: string | null; ai_extracted: Record<string, unknown> | null
}

export interface TimelineEvent {
  stage: StageKey; label: string; entered_at: string; exited_at: string | null
  days: number; target_days: number
}

export interface TurnoverDetail extends Card {
  status: 'active' | 'completed'
  move_in_date: string | null; previous_rent: number; final_rent: number | null
  unit_details: UnitBrief & {
    pets_allowed: boolean; parking: string; utilities_included: string[]
    amenities: string[]; year_built: number
  }
  outgoing_tenant: string | null; incoming_tenant: string | null
  timeline: TimelineEvent[]; tasks: Task[]; listings: ListingT[]; applications: ApplicationT[]
}

export interface PriceSuggestion {
  action: 'lower' | 'refresh_listing' | 'watch' | 'raise' | 'hold'
  message: string; asking_rent: number; recommended_rent: number; market_rent: number
  comparables: { count: number; scope: string; median_rent?: number; avg_days_vacant?: number }
  listing: { days_listed: number; leads: number; leads_per_day: number; typical_leads_per_day: number }
  estimated_days_saved: number; estimated_vacancy_cost_saved: number; yearly_rent_given_up: number
}

export interface UnitRow extends UnitBrief {
  tenant: string | null; lease_end: string | null; current_rent: number | null
}

export interface UnitDetail extends UnitRow {
  default_move_out: string
  turnovers: { id: number; status: string; stage: StageKey; move_out_date: string
               move_in_date: string | null; days_vacant: number | null; pre_marketed: boolean }[]
}

export interface NoticeResult {
  turnover: TurnoverDetail
  actions: { when: string; action: string }[]
}

interface Compare { avg_days_vacant: number; turnovers: number }
export interface Dashboard {
  city: string
  kpis: {
    avg_days_vacant_90d: number | null; avg_days_vacant_prev_90d: number | null
    avg_days_vacant_12m: number | null; turnovers_12m: number; vacancy_cost_12m: number
    avg_rent: number; avg_daily_rent: number
    vacant_now: number; vacant_now_daily_cost: number; vacant_now_avg_days: number
    total_units: number; occupancy_rate: number | null
  }
  stage_breakdown: { stage: StageKey; label: string; avg_days: number; target_days: number }[]
  monthly_trend: { month: string; avg_days_vacant: number; turnovers: number; vacancy_cost: number }[]
  by_city: { city: string; avg_days_vacant: number; turnovers: number; vacancy_cost: number }[]
  pre_marketing: { with: Compare | null; without: Compare | null }
  pricing: { overpriced: Compare | null; fair: Compare | null }
  lead_response: { median_hours: number | null; unanswered_pct: number | null; leads_90d: number }
}

export interface ListingDraft {
  title: string; description: string; highlights: string[]; facebook_post: string
  photo_notes: string[]; fair_housing_check: string
  model: string | null; photos_used: number; ai: boolean; error?: string
}

export interface ChatTurn { role: 'renter' | 'assistant'; text: string }
export interface BotReply {
  reply: string; intent: string; suggested_slots: string[]
  needs_human: boolean; handoff_reason: string | null; model: string
}

export interface ExtractedApp {
  applicant_name: string | null; current_address: string | null; current_landlord: string | null
  years_at_current_address: number | null; job_title: string | null
  employment_length_years: number | null; occupants: number | null; pets: string | null
  references: { name: string | null; relationship: string | null; phone: string | null }[]
  signed: boolean | null; missing_fields: string[]; handwriting_or_scan_quality: string
  strengths: string[]; follow_ups: string[]; model: string; source: string
}

// Production: full backend URL from VITE_API_URL. Dev: same origin, proxied by Vite.
const API = `${(import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')}/api`

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    let msg = `Request failed (${res.status})`
    try {
      const body = await res.json()
      if (typeof body.detail === 'string') msg = body.detail
    } catch { /* not JSON */ }
    throw new Error(msg)
  }
  return res.json() as Promise<T>
}

const qs = (params: Record<string, string | number | undefined | null>) => {
  const p = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.set(k, String(v)) })
  const s = p.toString()
  return s ? `?${s}` : ''
}

const post = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) })

export const api = {
  stages: () => request<Stage[]>('/stages'),
  board: (city?: string) => request<Board>(`/board${qs({ city })}`),
  dashboard: (city?: string) => request<Dashboard>(`/dashboard${qs({ city })}`),
  turnover: (id: number) => request<TurnoverDetail>(`/turnovers/${id}`),
  price: (id: number) => request<PriceSuggestion>(`/turnovers/${id}/price-suggestion`),
  move: (id: number, stage?: StageKey) => post<TurnoverDetail>(`/turnovers/${id}/move`, { stage: stage ?? null }),
  setPrice: (id: number, price: number) => post<TurnoverDetail>(`/turnovers/${id}/price`, { price }),
  decide: (appId: number, approve: boolean) => post<TurnoverDetail>(`/applications/${appId}/decision`, { approve }),
  units: (p: { q?: string; city?: string; status?: string; limit?: number }) => request<UnitRow[]>(`/units${qs(p)}`),
  unit: (id: number) => request<UnitDetail>(`/units/${id}`),
  notice: (unitId: number, body: { notice_date?: string; move_out_date?: string; autopilot: boolean }) =>
    post<NoticeResult>(`/units/${unitId}/notice`, body),

  // AI (Gemini)
  aiListing: (id: number, tone: string) => post<ListingDraft>(`/turnovers/${id}/ai/listing`, { tone }),
  applyListing: (id: number, body: { title: string; description: string; facebook_post: string; ai_generated: boolean }) =>
    post<TurnoverDetail>(`/turnovers/${id}/listings/apply`, body),
  samples: () => request<string[]>('/samples'),
  sampleApplication: (id: number, name: string) =>
    post<{ application_id: number; turnover: TurnoverDetail }>(`/turnovers/${id}/applications/sample/${encodeURIComponent(name)}`, {}),
  uploadApplication: async (id: number, file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch(`${API}/turnovers/${id}/applications/upload`, { method: 'POST', body: fd })
    if (!res.ok) {
      let msg = `Upload failed (${res.status})`
      try { const b = await res.json(); if (typeof b.detail === 'string') msg = b.detail } catch { /* not JSON */ }
      throw new Error(msg)
    }
    return res.json() as Promise<{ application_id: number; turnover: TurnoverDetail }>
  },
  aiReply: (id: number, message: string, history: ChatTurn[]) =>
    post<BotReply>(`/turnovers/${id}/ai/reply`, { message, history }),
}
