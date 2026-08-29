import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from 'firebase/storage'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  where,
} from 'firebase/firestore'
import { db, storage } from './firebase'
import type { Reading } from '../types'

const readingsCol = collection(db, 'readings')

function readingId(pointId: string, date: string) {
  return `${pointId}_${date}`
}

/** Most recent reading for a point strictly before `beforeDate` (or any date if omitted). */
export async function getLatestReading(
  pointId: string,
  beforeDate?: string,
): Promise<Reading | null> {
  const clauses = [where('pointId', '==', pointId)]
  if (beforeDate) clauses.push(where('date', '<', beforeDate))
  const q = query(readingsCol, ...clauses, orderBy('date', 'desc'), limit(1))
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = snap.docs[0]
  return { id: d.id, ...d.data() } as Reading
}

/** One reading per point per day: the doc id is deterministic, so this is a direct get. */
export async function getReadingForDate(
  pointId: string,
  date: string,
): Promise<Reading | null> {
  const snap = await getDoc(doc(db, 'readings', readingId(pointId, date)))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as Reading
}

export async function listReadingsForDate(date: string): Promise<Reading[]> {
  const q = query(readingsCol, where('date', '==', date))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Reading)
}

export async function listReadingsInMonth(month: string): Promise<Reading[]> {
  const q = query(
    readingsCol,
    where('date', '>=', `${month}-01`),
    where('date', '<=', `${month}-31`),
    orderBy('date', 'asc'),
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Reading)
}

export async function uploadReadingPhotos(
  pointId: string,
  date: string,
  files: File[],
): Promise<{ paths: string[]; urls: string[] }> {
  const paths: string[] = []
  const urls: string[] = []
  for (const [i, file] of files.entries()) {
    const path = `readings/${pointId}/${date}-${Date.now()}-${i}.jpg`
    const r = ref(storage, path)
    await uploadBytes(r, file, { contentType: file.type || 'image/jpeg' })
    const url = await getDownloadURL(r)
    paths.push(path)
    urls.push(url)
  }
  return { paths, urls }
}

export async function deleteReadingPhotos(paths: string[]) {
  await Promise.all(
    paths.map((p) =>
      deleteObject(ref(storage, p)).catch(() => {
        // best-effort cleanup; ignore if already gone
      }),
    ),
  )
}

/**
 * One reading per point per day — saving again for the same point+date
 * (e.g. a technician retaking a blurry photo) overwrites that day's entry
 * instead of creating a duplicate.
 */
export async function saveReading(input: {
  pointId: string
  technicianId: string
  technicianName: string
  value: number
  date: string
  note: string
  photoPaths: string[]
  photoURLs: string[]
}) {
  const id = readingId(input.pointId, input.date)
  await setDoc(doc(db, 'readings', id), { ...input, createdAt: Date.now() })
}

export function computeUsage(
  current: number,
  previous: number | null,
): number | null {
  if (previous == null) return null
  const usage = current - previous
  return usage < 0 ? null : usage
}
