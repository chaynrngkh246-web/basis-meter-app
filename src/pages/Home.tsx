import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from '../components/Header'
import { formatThaiDate, todayStr } from '../lib/date'
import { listActivePoints } from '../lib/points'
import { listReadingsForDate } from '../lib/readings'
import type { MeterPoint, Reading } from '../types'

export function Home() {
  const [points, setPoints] = useState<MeterPoint[]>([])
  const [todayReadings, setTodayReadings] = useState<Reading[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const today = todayStr()

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [pts, readings] = await Promise.all([
        listActivePoints(),
        listReadingsForDate(today),
      ])
      setPoints(pts)
      setTodayReadings(readings)
    } catch {
      setError('โหลดข้อมูลไม่ได้ ตรวจสอบการเชื่อมต่อ')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const doneMap = useMemo(() => {
    const m = new Map<string, Reading>()
    for (const r of todayReadings) m.set(r.pointId, r)
    return m
  }, [todayReadings])

  const electricPoints = points.filter((p) => p.type === 'electric')
  const waterPoints = points.filter((p) => p.type === 'water')
  const doneCount = points.filter((p) => doneMap.has(p.id)).length

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <Header title="หน้าหลัก" />
      <div className="mx-auto max-w-md px-4 pt-4">
        <div className="bg-white rounded-xl shadow px-4 py-3 mb-4">
          <div className="text-sm text-slate-500">วันนี้</div>
          <div className="text-lg font-semibold text-slate-800">
            {formatThaiDate(today)}
          </div>
          <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{
                width: points.length
                  ? `${(doneCount / points.length) * 100}%`
                  : '0%',
              }}
            />
          </div>
          <div className="text-xs text-slate-500 mt-1">
            บันทึกแล้ว {doneCount} / {points.length} จุด
          </div>
        </div>

        {loading && (
          <div className="text-center text-slate-400 py-10">
            กำลังโหลด...
          </div>
        )}
        {error && <div className="text-red-600 text-sm mb-3">{error}</div>}

        {!loading && !error && points.length === 0 && (
          <div className="text-center text-slate-400 text-sm py-10">
            ยังไม่มีจุดมิเตอร์ — ไปที่ "ตั้งค่า" เพื่อเพิ่มจุด
          </div>
        )}

        {electricPoints.length > 0 && (
          <PointGroup
            title="⚡ ไฟฟ้า"
            points={electricPoints}
            doneMap={doneMap}
            onSelect={(id) => navigate(`/record/${id}`)}
          />
        )}
        {waterPoints.length > 0 && (
          <PointGroup
            title="💧 น้ำ"
            points={waterPoints}
            doneMap={doneMap}
            onSelect={(id) => navigate(`/record/${id}`)}
          />
        )}
      </div>
    </div>
  )
}

function PointGroup({
  title,
  points,
  doneMap,
  onSelect,
}: {
  title: string
  points: MeterPoint[]
  doneMap: Map<string, Reading>
  onSelect: (id: string) => void
}) {
  return (
    <div className="mb-5">
      <div className="text-sm font-semibold text-slate-600 mb-2">{title}</div>
      <div className="flex flex-col gap-2">
        {points.map((p) => {
          const reading = doneMap.get(p.id)
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className="bg-white rounded-xl shadow px-4 py-3 flex items-center justify-between active:bg-slate-50"
            >
              <div className="text-left">
                <div className="font-medium text-slate-800">{p.name}</div>
                {p.location && (
                  <div className="text-xs text-slate-400">{p.location}</div>
                )}
              </div>
              {reading ? (
                <div className="text-right">
                  <div className="text-xs text-emerald-600 font-semibold">
                    ✓ บันทึกแล้ว
                  </div>
                  <div className="text-xs text-slate-400">
                    {reading.value.toLocaleString()} {p.unit}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-amber-600 font-semibold">
                  ยังไม่บันทึก
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
