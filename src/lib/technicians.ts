import { addDoc, collection, doc, getDocs, orderBy, query, updateDoc } from 'firebase/firestore'
import { db } from './firebase'
import { hashPin } from './hash'
import type { Technician } from '../types'

const techniciansCol = collection(db, 'technicians')

export async function listAllTechnicians(): Promise<Technician[]> {
  const q = query(techniciansCol, orderBy('name'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Technician)
}

export async function createTechnician(name: string, pin: string) {
  const pinHash = await hashPin(pin)
  await addDoc(techniciansCol, {
    name,
    pinHash,
    active: true,
    createdAt: Date.now(),
  })
}

export async function setTechnicianPin(id: string, pin: string) {
  const pinHash = await hashPin(pin)
  await updateDoc(doc(db, 'technicians', id), { pinHash })
}

export async function setTechnicianActive(id: string, active: boolean) {
  await updateDoc(doc(db, 'technicians', id), { active })
}
