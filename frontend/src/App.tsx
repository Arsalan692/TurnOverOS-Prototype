import { Link, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Board from './pages/Board'
import TurnoverPage from './pages/TurnoverPage'
import LogNotice from './pages/LogNotice'

function NotFound() {
  return (
    <div className="card mx-auto max-w-md p-8 text-center">
      <h1 className="text-2xl">Page not found</h1>
      <Link to="/" className="btn mt-6">Back to dashboard</Link>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="board" element={<Board />} />
        <Route path="turnovers/:id" element={<TurnoverPage />} />
        <Route path="notice" element={<LogNotice />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
