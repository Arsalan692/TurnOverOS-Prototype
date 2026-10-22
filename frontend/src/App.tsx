import { Component, lazy, Suspense, type ReactNode } from 'react'
import { useTitle } from './lib/title'
import { Link, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { Loading } from './components/ui'

// Each page loads on demand, so the first screen downloads less.
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Board = lazy(() => import('./pages/Board'))
const TurnoverPage = lazy(() => import('./pages/TurnoverPage'))
const LogNotice = lazy(() => import('./pages/LogNotice'))

function NotFound() {
  useTitle('Page not found')
  return (
    <div className="card mx-auto max-w-md p-8 text-center">
      <p className="eyebrow">404</p>
      <h1 className="mt-1 text-2xl">Page not found</h1>
      <Link to="/" className="btn mt-6">Back to dashboard</Link>
    </div>
  )
}

/** Shows a friendly message instead of a blank screen if a page crashes. */
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="card mx-auto max-w-md p-8 text-center" role="alert">
        <p className="eyebrow">Something went wrong</p>
        <h1 className="mt-1 text-xl">This screen could not load.</h1>
        <button type="button" className="btn-solid mt-6" onClick={() => location.reload()}>Reload</button>
      </div>
    )
  }
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {[
          { index: true, el: <Dashboard /> },
          { path: 'board', el: <Board /> },
          { path: 'turnovers/:id', el: <TurnoverPage /> },
          { path: 'notice', el: <LogNotice /> },
        ].map((r) => (
          <Route
            key={r.path ?? 'index'}
            index={r.index}
            path={r.path}
            element={<ErrorBoundary><Suspense fallback={<Loading />}>{r.el}</Suspense></ErrorBoundary>}
          />
        ))}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
