import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { BottomNav } from './components/BottomNav'
import { useSession } from './lib/SessionContext'
import { Export } from './pages/Export'
import { History } from './pages/History'
import { Home } from './pages/Home'
import { Login } from './pages/Login'
import { Record } from './pages/Record'
import { Settings } from './pages/Settings'

function RequireAuth({ children }: { children: ReactNode }) {
  const { session } = useSession()
  if (!session) return <Navigate to="/login" replace />
  return (
    <>
      {children}
      <BottomNav />
    </>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Home />
          </RequireAuth>
        }
      />
      <Route
        path="/record/:pointId"
        element={
          <RequireAuth>
            <Record />
          </RequireAuth>
        }
      />
      <Route
        path="/history"
        element={
          <RequireAuth>
            <History />
          </RequireAuth>
        }
      />
      <Route
        path="/export"
        element={
          <RequireAuth>
            <Export />
          </RequireAuth>
        }
      />
      <Route
        path="/settings"
        element={
          <RequireAuth>
            <Settings />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
