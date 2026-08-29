import { useEffect, useState } from 'react'
import { Header } from '../components/Header'
import { useSession } from '../lib/SessionContext'
import {
  createPoint,
  deactivatePoint,
  listAllPoints,
  updatePoint,
} from '../lib/points'
import {
  createTechnician,
  listAllTechnicians,
  setTechnicianActive,
  setTechnicianPin,
} from '../lib/technicians'
import type { MeterPoint, MeterType, Technician } from '../types'

export function Settings() {
  const { logout } = useSession()
  const [tab, setTab] = useState<'points' | 'technicians'>('points')

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <Header title="ตั้งค่า" />
      <div className="mx-auto max-w-md px-4 pt-4">
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setTab('points')}
            className={`flex-1 rounded-xl py-2 text-sm font-medium ${
              tab === 'points'
                ? 'bg-emerald-600 text-white'
                : 'bg-white text-slate-600 shadow'
            }`}
          >
            จุดมิเตอร์
          </button>
          <button
            onClick={() => setTab('technicians')}
            className={`flex-1 rounded-xl py-2 text-sm font-medium ${
              tab === 'technicians'
                ? 'bg-emerald-600 text-white'
                : 'bg-white text-slate-600 shadow'
            }`}
          >
            ช่างเทคนิค
          </button>
        </div>

        {tab === 'points' ? <PointsTab /> : <TechniciansTab />}

        <button
          onClick={logout}
          className="w-full rounded-xl bg-white shadow py-3 font-medium text-red-600 mt-8"
        >
          ออกจากระบบ
        </button>
      </div>
    </div>
  )
}

function PointsTab() {
  const [points, setPoints] = useState<MeterPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [type, setType] = useState<MeterType>('electric')
  const [location, setLocation] = useState('')
  const [unit, setUnit] = useState('kWh')
  const [adding, setAdding] = useState(false)

  async function load() {
    setLoading(true)
    try {
      setPoints(await listAllPoints())
    } catch {
      setError('โหลดข้อมูลไม่ได้')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleAdd() {
    if (!name.trim()) return
    setAdding(true)
    setError('')
    try {
      const order = points.length
        ? Math.max(...points.map((p) => p.order)) + 1
        : 0
      await createPoint({ name: name.trim(), type, location, unit, order })
      setName('')
      setLocation('')
      await load()
    } catch {
      setError('เพิ่มจุดไม่สำเร็จ')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div>
      <div className="bg-white rounded-xl shadow p-4 mb-4">
        <div className="text-sm font-semibold text-slate-700 mb-3">
          เพิ่มจุดมิเตอร์ใหม่
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ชื่อจุด เช่น มิเตอร์ไฟฟ้าอาคาร A"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 mb-2 text-sm"
        />
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="ตำแหน่ง (ไม่บังคับ)"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 mb-2 text-sm"
        />
        <div className="flex gap-2 mb-3">
          <select
            value={type}
            onChange={(e) => {
              const t = e.target.value as MeterType
              setType(t)
              setUnit(t === 'electric' ? 'kWh' : 'm³')
            }}
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="electric">⚡ ไฟฟ้า</option>
            <option value="water">💧 น้ำ</option>
          </select>
          <input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="หน่วย"
            className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
        <button
          onClick={handleAdd}
          disabled={adding || !name.trim()}
          className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {adding ? 'กำลังเพิ่ม...' : '+ เพิ่มจุด'}
        </button>
      </div>

      {error && <div className="text-red-600 text-sm mb-3">{error}</div>}
      {loading && (
        <div className="text-center text-slate-400 py-6">กำลังโหลด...</div>
      )}

      <div className="flex flex-col gap-2">
        {points.map((p) => (
          <div
            key={p.id}
            className="bg-white rounded-xl shadow px-4 py-3 flex items-center justify-between"
          >
            <div>
              <div className="font-medium text-slate-800">
                {p.type === 'electric' ? '⚡' : '💧'} {p.name}{' '}
                {!p.active && (
                  <span className="text-xs text-slate-400">(ปิดใช้งาน)</span>
                )}
              </div>
              {p.location && (
                <div className="text-xs text-slate-400">{p.location}</div>
              )}
            </div>
            <button
              onClick={async () => {
                if (p.active) {
                  await deactivatePoint(p.id)
                } else {
                  await updatePoint(p.id, { active: true })
                }
                await load()
              }}
              className={`text-xs font-medium px-3 py-1.5 rounded-full ${
                p.active
                  ? 'bg-red-50 text-red-600'
                  : 'bg-emerald-50 text-emerald-600'
              }`}
            >
              {p.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function TechniciansTab() {
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [adding, setAdding] = useState(false)
  const [resetTarget, setResetTarget] = useState<Technician | null>(null)
  const [resetPin, setResetPin] = useState('')

  async function load() {
    setLoading(true)
    try {
      setTechnicians(await listAllTechnicians())
    } catch {
      setError('โหลดข้อมูลไม่ได้')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleAdd() {
    if (!name.trim() || pin.length !== 4) {
      setError('กรุณาใส่ชื่อและ PIN 4 หลัก')
      return
    }
    setAdding(true)
    setError('')
    try {
      await createTechnician(name.trim(), pin)
      setName('')
      setPin('')
      await load()
    } catch {
      setError('เพิ่มช่างไม่สำเร็จ')
    } finally {
      setAdding(false)
    }
  }

  async function handleResetPin() {
    if (!resetTarget || resetPin.length !== 4) return
    await setTechnicianPin(resetTarget.id, resetPin)
    setResetTarget(null)
    setResetPin('')
  }

  return (
    <div>
      <div className="bg-white rounded-xl shadow p-4 mb-4">
        <div className="text-sm font-semibold text-slate-700 mb-3">
          เพิ่มช่างเทคนิค
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ชื่อช่าง"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 mb-2 text-sm"
        />
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder="รหัส PIN 4 หลัก"
          inputMode="numeric"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 mb-3 text-sm"
        />
        <button
          onClick={handleAdd}
          disabled={adding}
          className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {adding ? 'กำลังเพิ่ม...' : '+ เพิ่มช่าง'}
        </button>
      </div>

      {error && <div className="text-red-600 text-sm mb-3">{error}</div>}
      {loading && (
        <div className="text-center text-slate-400 py-6">กำลังโหลด...</div>
      )}

      <div className="flex flex-col gap-2">
        {technicians.map((t) => (
          <div key={t.id} className="bg-white rounded-xl shadow px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="font-medium text-slate-800">
                {t.name}{' '}
                {!t.active && (
                  <span className="text-xs text-slate-400">(ปิดใช้งาน)</span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setResetTarget(t)}
                  className="text-xs font-medium px-3 py-1.5 rounded-full bg-slate-100 text-slate-600"
                >
                  ตั้ง PIN ใหม่
                </button>
                <button
                  onClick={async () => {
                    await setTechnicianActive(t.id, !t.active)
                    await load()
                  }}
                  className={`text-xs font-medium px-3 py-1.5 rounded-full ${
                    t.active
                      ? 'bg-red-50 text-red-600'
                      : 'bg-emerald-50 text-emerald-600'
                  }`}
                >
                  {t.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                </button>
              </div>
            </div>
            {resetTarget?.id === t.id && (
              <div className="mt-2 flex gap-2">
                <input
                  value={resetPin}
                  onChange={(e) =>
                    setResetPin(e.target.value.replace(/\D/g, '').slice(0, 4))
                  }
                  placeholder="PIN ใหม่ 4 หลัก"
                  inputMode="numeric"
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <button
                  onClick={handleResetPin}
                  className="rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white"
                >
                  บันทึก
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
