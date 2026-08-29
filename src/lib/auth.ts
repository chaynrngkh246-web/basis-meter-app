import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
} from 'firebase/firestore'
import { db } from './firebase'
import { hashPin } from './hash'
import type { Session, Technician } from '../types'

const SESSION_KEY = 'basis-meter-session'

export async function listActiveTechnicians(): Promise<Technician[]> {
  const q = query(
    collection(db, 'technicians'),
    where('active', '==', true),
    orderBy('name'),
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Technician)
}

export async function login(
  technician: Technician,
  pin: string,
): Promise<boolean> {
  const hash = await hashPin(pin)
  if (hash !== technician.pinHash) return false
  const session: Session = {
    technicianId: technician.id,
    technicianName: technician.name,
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return true
}

export function getSession(): Session | null {
  const raw = localStorage.getItem(SESSION_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as Session
  } catch {
    return null
  }
}

export function logout() {
  localStorage.removeItem(SESSION_KEY)
}
