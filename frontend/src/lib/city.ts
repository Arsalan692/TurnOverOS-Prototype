import { useSearchParams } from 'react-router-dom'

/** City filter lives in the URL (?city=Calgary) so every page and link shares it. */
export function useCity(): string | undefined {
  const [params] = useSearchParams()
  const c = params.get('city')
  return c === 'Calgary' || c === 'Edmonton' ? c : undefined
}

export function withCity(path: string, city?: string) {
  return city ? `${path}?city=${city}` : path
}
