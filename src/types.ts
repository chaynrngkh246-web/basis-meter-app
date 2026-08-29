export type MeterType = 'electric' | 'water'

export interface Technician {
  id: string
  name: string
  pinHash: string
  active: boolean
  createdAt: number
}

export interface MeterPoint {
  id: string
  name: string
  type: MeterType
  location: string
  order: number
  unit: string
  active: boolean
}

export interface Reading {
  id: string
  pointId: string
  technicianId: string
  technicianName: string
  value: number
  date: string // YYYY-MM-DD, local (Asia/Bangkok)
  note: string
  photoPaths: string[]
  photoURLs: string[]
  createdAt: number
}

export interface Session {
  technicianId: string
  technicianName: string
}
