import { useEffect, useState } from 'react'
import { useIsFetching } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'

/** The first visit of the day prepares fresh demo data; explain the wait instead of looking broken. */
export default function WakeNotice() {
  const fetching = useIsFetching()
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    if (!fetching) { setSlow(false); return }
    const id = setTimeout(() => setSlow(true), 4000)
    return () => clearTimeout(id)
  }, [fetching])

  if (!slow) return null
  return (
    <div role="status" className="flex items-center justify-center gap-2 border-b border-gold-deep/40 bg-gold-soft px-4 py-2 text-sm text-ink">
      <Loader2 size={15} className="animate-spin text-gold-ink" aria-hidden />
      Preparing today's demo data. The first visit of the day takes a few seconds.
    </div>
  )
}
