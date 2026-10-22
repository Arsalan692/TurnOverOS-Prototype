import { useEffect, useState } from 'react'

export default function App() {
  const [health, setHealth] = useState<string>('checking...')

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setHealth(`${d.status} · database ${d.database}`))
      .catch(() => setHealth('backend not reachable'))
  }, [])

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="card p-8 text-center max-w-md w-full">
        <h1 className="section-title inline-block text-3xl">TurnoverOS</h1>
        <p className="mt-4">Backend: {health}</p>
        <div className="mt-6 flex justify-center gap-3">
          <button className="btn">Outline button</button>
          <button className="btn-solid">Solid button</button>
        </div>
      </div>
    </main>
  )
}
