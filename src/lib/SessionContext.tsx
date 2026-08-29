import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { getSession, logout as clearSession } from './auth'
import type { Session } from '../types'

interface SessionContextValue {
  session: Session | null
  setSession: (s: Session | null) => void
  logout: () => void
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => getSession())

  const value = useMemo(
    () => ({
      session,
      setSession,
      logout: () => {
        clearSession()
        setSession(null)
      },
    }),
    [session],
  )

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within SessionProvider')
  return ctx
}
