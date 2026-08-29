import { useState } from 'react'
import { Header } from '../components/Header'
import { downloadCsv } from '../lib/csv'
import { formatThaiDate, monthStr } from '../lib/date'
import { listAllPoints } from '../lib/points'
import { getLatestReading, listReadingsInMonth } from '../lib/readings'
import type { MeterPoint, Reading } from '../types'

async function buildMonthData(month: string) {
  const [points, readings] = await Promise.all([
    listAllPoints(),
    listReadingsInMonth(month),
  ])
  const byPoint = new Map<string, Reading[]>()
  for (const r of readings) {
    const arr = byPoint.get(r.pointId) ?? []
    arr.push(r)
    byPoint.set(r.pointId, arr)
  }
  for (const arr of byPoint.values()) {
    arr.sort((a, b) => a.date.localeCompare(b.date))
  }

  const priorByPoint = new Map<string, Reading | null>()
  await Promise.all(
    Array.from(byPoint.entries()).map(async ([pointId, arr]) => {
      const prior = await getLatestReading(pointId, arr[0].date)
      priorByPoint.set(pointId, prior)
    }),
  )

  return { points, byPoint, priorByPoint }
}

function pointMeta(points: MeterPoint[], id: string) {
  return points.find((p) => p.id === id)
}

export function Export() {
  const [month, setMonth] = useState(monthStr())
  const [busy, setBusy] = useState<'summary' | 'detail' | null>(null)
  const [error, setError] = useState('')

  async function exportSummary() {
    setBusy('summary')
    setError('')
    try {
      const { points, byPoint, priorByPoint } = await buildMonthData(month)
      const rows: (string | number)[][] = [
        [
          'จุดมิเตอร์',
          'ประเภท',
          'เลขเริ่มต้นเดือน',
          'เลขสิ้นเดือน',
          'หน่วยที่ใช้ทั้งเดือน',
          'หน่วย',
          'จำนวนวันที่บันทึก',
        ],
      ]
      for (const [pointId, arr] of byPoint.entries()) {
        const point = pointMeta(points, pointId)
        const prior = priorByPoint.get(pointId)?.value ?? null
        const opening = prior ?? arr[0].value
        const closing = arr[arr.length - 1].value
        const usage = Math.max(closing - opening, 0)
        rows.push([
          point?.name ?? pointId,
          point?.type === 'electric' ? 'ไฟฟ้า' : 'น้ำ',
          opening,
          closing,
          usage,
          point?.unit ?? '',
          arr.length,
        ])
      }
      downloadCsv(`สรุปค่าน้ำค่าไฟ-${month}.csv`, rows)
    } catch {
      setError('สร้างไฟล์ไม่สำเร็จ ตรวจสอบการเชื่อมต่อ')
    } finally {
      setBusy(null)
    }
  }

  async function exportDetail() {
    setBusy('detail')
    setError('')
    try {
      const { points, byPoint, priorByPoint } = await buildMonthData(month)
      const rows: (string | number)[][] = [
        [
          'วันที่',
          'จุดมิเตอร์',
          'ประเภท',
          'เลขมิเตอร์',
          'หน่วยที่ใช้',
          'หน่วย',
          'ผู้บันทึก',
          'หมายเหตุ',
        ],
      ]
      for (const [pointId, arr] of byPoint.entries()) {
        const point = pointMeta(points, pointId)
        let prev = priorByPoint.get(pointId)?.value ?? null
        for (const r of arr) {
          const usage = prev != null ? Math.max(r.value - prev, 0) : ''
          prev = r.value
          rows.push([
            formatThaiDate(r.date),
            point?.name ?? pointId,
            point?.type === 'electric' ? 'ไฟฟ้า' : 'น้ำ',
            r.value,
            usage,
            point?.unit ?? '',
            r.technicianName,
            r.note ?? '',
          ])
        }
      }
      downloadCsv(`รายละเอียดค่าน้ำค่าไฟ-${month}.csv`, rows)
    } catch {
      setError('สร้างไฟล์ไม่สำเร็จ ตรวจสอบการเชื่อมต่อ')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <Header title="ส่งออกรายงาน" />
      <div className="mx-auto max-w-md px-4 pt-4">
        <label className="block text-sm font-medium text-slate-600 mb-1">
          เลือกเดือน
        </label>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 mb-6"
        />

        <button
          onClick={exportSummary}
          disabled={busy !== null}
          className="w-full rounded-xl bg-emerald-600 py-3 font-semibold text-white mb-3 disabled:opacity-50"
        >
          {busy === 'summary'
            ? 'กำลังสร้างไฟล์...'
            : '📊 ดาวน์โหลดสรุปรายเดือน (ส่งบัญชี)'}
        </button>
        <button
          onClick={exportDetail}
          disabled={busy !== null}
          className="w-full rounded-xl bg-white shadow py-3 font-medium text-slate-700 disabled:opacity-50"
        >
          {busy === 'detail'
            ? 'กำลังสร้างไฟล์...'
            : '📄 ดาวน์โหลดรายละเอียดรายวัน'}
        </button>

        {error && <div className="text-red-600 text-sm mt-4">{error}</div>}

        <div className="text-xs text-slate-400 mt-6 leading-relaxed">
          ไฟล์ CSV เปิดได้ด้วย Excel โดยตรง — สรุปรายเดือนคือยอดรวมการใช้น้ำ/ไฟ
          แยกตามจุด สำหรับส่งให้บัญชี ส่วนรายละเอียดรายวันมีข้อมูลทุกวันของทุกจุด
        </div>
      </div>
    </div>
  )
}
