import { useEffect, useMemo, useState } from 'react'
import { Header } from '../components/Header'
import { formatThaiDate, monthStr } from '../lib/date'
import { listAllPoints } from '../lib/points'
import { getLatestReading, listReadingsInMonth } from '../lib/readings'
import type { MeterPoint, Reading } from '../types'

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const date = new Date(y, m - 1 + delta, 1)
  return monthStr(date)
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const buddhistYear = y + 543
  const names = [
    'มกราคม',
    'กุมภาพันธ์',
    'มีนาคม',
    'เมษายน',
    'พฤษภาคม',
    'มิถุนายน',
    'กรกฎาคม',
    'สิงหาคม',
    'กันยายน',
    'ตุลาคม',
    'พฤศจิกายน',
    'ธันวาคม',
  ]
  return `${names[m - 1]} ${buddhistYear}`
}

export function History() {
  const [month, setMonth] = useState(monthStr())
  const [points, setPoints] = useState<MeterPoint[]>([])
  const [readings, setReadings] = useState<Reading[]>([])
  const [selectedPoint, setSelectedPoint] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [priorByPoint, setPriorByPoint] = useState<
    Map<string, Reading | null>
  >(new Map())

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError('')
      try {
        const [pts, monthReadings] = await Promise.all([
          listAllPoints(),
          listReadingsInMonth(month),
        ])
        setPoints(pts)

        const byPoint = new Map<string, Reading[]>()
        for (const r of monthReadings) {
          const arr = byPoint.get(r.pointId) ?? []
          arr.push(r)
          byPoint.set(r.pointId, arr)
        }
        // Fetch the last reading before this month for each point that has
        // entries, so the first day's usage delta is correct too.
        const priors = await Promise.all(
          Array.from(byPoint.entries()).map(async ([pointId, arr]) => {
            const firstDate = arr.slice().sort((a, b) =>
              a.date.localeCompare(b.date),
            )[0].date
            const prior = await getLatestReading(pointId, firstDate)
            return [pointId, prior] as const
          }),
        )
        setPriorByPoint(new Map(priors))
        setReadings(monthReadings)
      } catch {
        setError('โหลดข้อมูลไม่ได้ ตรวจสอบการเชื่อมต่อ')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [month])

  const pointName = useMemo(() => {
    const m = new Map(points.map((p) => [p.id, p]))
    return (id: string) => m.get(id)
  }, [points])

  const grouped = useMemo(() => {
    const byPoint = new Map<string, Reading[]>()
    for (const r of readings) {
      if (selectedPoint !== 'all' && r.pointId !== selectedPoint) continue
      const arr = byPoint.get(r.pointId) ?? []
      arr.push(r)
      byPoint.set(r.pointId, arr)
    }
    for (const arr of byPoint.values()) {
      arr.sort((a, b) => a.date.localeCompare(b.date))
    }
    return byPoint
  }, [readings, selectedPoint])

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <Header title="ประวัติการบันทึก" />
      <div className="mx-auto max-w-md px-4 pt-4">
        <div className="flex items-center justify-between bg-white rounded-xl shadow px-3 py-2 mb-3">
          <button
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            className="px-2 py-1 text-lg"
            aria-label="เดือนก่อนหน้า"
          >
            ←
          </button>
          <div className="font-semibold text-slate-800">
            {monthLabel(month)}
          </div>
          <button
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            className="px-2 py-1 text-lg"
            aria-label="เดือนถัดไป"
          >
            →
          </button>
        </div>

        <select
          value={selectedPoint}
          onChange={(e) => setSelectedPoint(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 mb-4 text-sm"
        >
          <option value="all">ทุกจุด</option>
          {points.map((p) => (
            <option key={p.id} value={p.id}>
              {p.type === 'electric' ? '⚡' : '💧'} {p.name}
            </option>
          ))}
        </select>

        {loading && (
          <div className="text-center text-slate-400 py-10">
            กำลังโหลด...
          </div>
        )}
        {error && <div className="text-red-600 text-sm mb-3">{error}</div>}
        {!loading && !error && grouped.size === 0 && (
          <div className="text-center text-slate-400 text-sm py-10">
            ไม่มีข้อมูลในเดือนนี้
          </div>
        )}

        {Array.from(grouped.entries()).map(([pointId, arr]) => {
          const point = pointName(pointId)
          let prev = priorByPoint.get(pointId)?.value ?? null
          const totalUsage = arr.reduce((sum, r) => {
            const usage = prev != null ? Math.max(r.value - prev, 0) : 0
            prev = r.value
            return sum + usage
          }, 0)
          prev = priorByPoint.get(pointId)?.value ?? null

          return (
            <div
              key={pointId}
              className="bg-white rounded-xl shadow mb-4 overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <div className="font-medium text-slate-800">
                  {point ? (point.type === 'electric' ? '⚡ ' : '💧 ') : ''}
                  {point?.name ?? pointId}
                </div>
                <div className="text-sm font-semibold text-emerald-600">
                  รวม {totalUsage.toLocaleString()} {point?.unit ?? ''}
                </div>
              </div>
              <div className="divide-y divide-slate-100">
                {arr.map((r) => {
                  const usage =
                    prev != null ? Math.max(r.value - prev, 0) : null
                  prev = r.value
                  return (
                    <div
                      key={r.id}
                      className="px-4 py-2.5 flex items-center justify-between text-sm"
                    >
                      <div>
                        <div className="text-slate-700">
                          {formatThaiDate(r.date)}
                        </div>
                        <div className="text-xs text-slate-400">
                          {r.technicianName}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {r.photoURLs[0] && (
                          <a
                            href={r.photoURLs[0]}
                            target="_blank"
                            rel="noreferrer"
                            className="w-9 h-9 rounded-md overflow-hidden bg-slate-100 shrink-0"
                          >
                            <img
                              src={r.photoURLs[0]}
                              alt="รูปมิเตอร์"
                              className="w-full h-full object-cover"
                            />
                          </a>
                        )}
                        <div className="text-right">
                          <div className="font-medium text-slate-800">
                            {r.value.toLocaleString()}
                          </div>
                          {usage != null && (
                            <div className="text-xs text-emerald-600">
                              +{usage.toLocaleString()}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
