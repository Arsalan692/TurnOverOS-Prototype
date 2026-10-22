import { useEffect, useState } from 'react'
import { useIsFetching } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'

/** Free hosting sleeps when idle; explain the first slow load instead of looking broken. */
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
      Waking up the demo server (free hosting sleeps when idle). This takes about 30 seconds, once.
    </div>
  )
}
