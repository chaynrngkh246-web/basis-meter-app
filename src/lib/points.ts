import {
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from './firebase'
import type { MeterPoint, MeterType } from '../types'

const pointsCol = collection(db, 'points')

export async function listActivePoints(): Promise<MeterPoint[]> {
  const q = query(
    pointsCol,
    where('active', '==', true),
    orderBy('order'),
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MeterPoint)
}

export async function listAllPoints(): Promise<MeterPoint[]> {
  const q = query(pointsCol, orderBy('order'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MeterPoint)
}

export async function createPoint(input: {
  name: string
  type: MeterType
  location: string
  unit: string
  order: number
}) {
  await addDoc(pointsCol, { ...input, active: true })
}

export async function updatePoint(id: string, patch: Partial<MeterPoint>) {
  await updateDoc(doc(db, 'points', id), patch)
}

export async function deactivatePoint(id: string) {
  await updateDoc(doc(db, 'points', id), { active: false })
}
