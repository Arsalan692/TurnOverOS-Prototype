import { useEffect } from 'react'

/** Sets the browser tab title for each page. */
export function useTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · TurnoverOS`
  }, [title])
}
