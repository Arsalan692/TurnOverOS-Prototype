const money0 = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })

export const money = (n: number | null | undefined) => (n == null ? '—' : money0.format(n).replace('CA', ''))

export const compactMoney = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : n >= 10_000 ? `$${Math.round(n / 1000)}K` : money(n)

export const days = (n: number | null | undefined, digits = 1) =>
  n == null ? '—' : `${Number(n.toFixed(digits))} ${Math.abs(n) === 1 ? 'day' : 'days'}`

export const shortDate = (iso: string | null | undefined) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : '—'

export const monthLabel = (ym: string) =>
  new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-CA', { month: 'short', year: '2-digit' })

export const beds = (n: number) => (n === 0 ? 'Studio' : `${n} bed`)

export const todayISO = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

// Interior shots are shared demo photos; pick one per unit so cards vary.
const INTERIORS = ['/images/unit-living.jpg', '/images/unit-kitchen.jpg', '/images/unit-bedroom.jpg', '/images/unit-bathroom.jpg']
export const interiorFor = (unitId: number) => INTERIORS[unitId % INTERIORS.length]
export const allInteriors = INTERIORS

export const TASK_LABELS: Record<string, string> = {
  move_out_inspection: 'Move-out inspection',
  cleaning: 'Cleaning',
  repairs: 'Repairs',
  painting: 'Painting',
  photos: 'Photos',
}

export const CHANNEL_LABELS: Record<string, string> = {
  rentfaster: 'Rentfaster',
  facebook: 'Facebook Marketplace',
  website: 'Website',
}
