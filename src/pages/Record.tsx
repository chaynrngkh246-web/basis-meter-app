import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Header } from '../components/Header'
import { PhotoCapture, type PhotoItem } from '../components/PhotoCapture'
import { formatThaiDate, todayStr } from '../lib/date'
import { listAllPoints } from '../lib/points'
import {
  computeUsage,
  deleteReadingPhotos,
  getLatestReading,
  getReadingForDate,
  saveReading,
  uploadReadingPhotos,
} from '../lib/readings'
import { useSession } from '../lib/SessionContext'
import type { MeterPoint, Reading } from '../types'

export function Record() {
  const { pointId = '' } = useParams()
  const navigate = useNavigate()
  const { session } = useSession()
  const today = todayStr()

  const [point, setPoint] = useState<MeterPoint | null>(null)
  const [previous, setPrevious] = useState<Reading | null>(null)
  const [existing, setExisting] = useState<Reading | null>(null)
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [value, setValue] = useState('')
  const [note, setNote] = useState('')
  const [photos, setPhotos] = useState<PhotoItem[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError('')
      try {
        const [points, prev, todayReading] = await Promise.all([
          listAllPoints(),
          getLatestReading(pointId, today),
          getReadingForDate(pointId, today),
        ])
        const pt = points.find((p) => p.id === pointId) ?? null
        setPoint(pt)
        setPrevious(prev)
        setExisting(todayReading)
        if (todayReading) {
          setValue(String(todayReading.value))
          setNote(todayReading.note ?? '')
          setPhotos(
            todayReading.photoURLs.map((url, i) => ({
              kind: 'existing',
              url,
              path: todayReading.photoPaths[i],
            })),
          )
        }
      } catch {
        setError('โหลดข้อมูลไม่ได้ ตรวจสอบการเชื่อมต่อ')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [pointId, today])

  const numericValue = value === '' ? null : Number(value)
  const usage =
    numericValue != null && !Number.isNaN(numericValue)
      ? computeUsage(numericValue, previous?.value ?? null)
      : null

  async function handleSave() {
    if (!session || !point) return
    if (numericValue == null || Number.isNaN(numericValue)) {
      setError('กรุณาใส่เลขมิเตอร์')
      return
    }
    if (photos.length === 0) {
      setError('กรุณาถ่ายรูปมิเตอร์อย่างน้อย 1 รูป')
      return
    }
    setSaving(true)
    setError('')
    try {
      const keepPaths = new Set(
        photos.flatMap((p) => (p.kind === 'existing' ? [p.path] : [])),
      )
      const removedPaths = (existing?.photoPaths ?? []).filter(
        (p) => !keepPaths.has(p),
      )
      const newFiles = photos.flatMap((p) =>
        p.kind === 'new' ? [p.file] : [],
      )
      const uploaded = newFiles.length
        ? await uploadReadingPhotos(pointId, today, newFiles)
        : { paths: [], urls: [] }

      const finalPaths = [
        ...photos.flatMap((p) => (p.kind === 'existing' ? [p.path] : [])),
        ...uploaded.paths,
      ]
      const finalUrls = [
        ...photos.flatMap((p) => (p.kind === 'existing' ? [p.url] : [])),
        ...uploaded.urls,
      ]

      await saveReading({
        pointId,
        technicianId: session.technicianId,
        technicianName: session.technicianName,
        value: numericValue,
        date: today,
        note,
        photoPaths: finalPaths,
        photoURLs: finalUrls,
      })

      if (removedPaths.length) await deleteReadingPhotos(removedPaths)

      navigate('/', { replace: true })
    } catch {
      setError('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง (ข้อมูลจะถูกส่งอัตโนมัติเมื่อเน็ตกลับมา)')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header title="บันทึกค่ามิเตอร์" back />
        <div className="text-center text-slate-400 py-10">กำลังโหลด...</div>
      </div>
    )
  }

  if (!point) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header title="บันทึกค่ามิเตอร์" back />
        <div className="text-center text-red-500 py-10">ไม่พบจุดมิเตอร์นี้</div>
      </div>
    )
  }

  if (existing && !editing) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header title={point.name} back />
        <div className="mx-auto max-w-md px-4 pt-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-4">
            <div className="text-emerald-700 font-semibold">
              ✓ บันทึกวันนี้แล้วโดย {existing.technicianName}
            </div>
            <div className="text-sm text-slate-600 mt-1">
              เลขมิเตอร์: {existing.value.toLocaleString()} {point.unit}
            </div>
            {usage != null || previous ? (
              <div className="text-sm text-slate-600">
                ใช้ไป:{' '}
                {computeUsage(existing.value, previous?.value ?? null) ??
                  '—'}{' '}
                {point.unit}
              </div>
            ) : null}
          </div>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {existing.photoURLs.map((url, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="aspect-square rounded-lg overflow-hidden bg-slate-100"
              >
                <img
                  src={url}
                  alt={`รูปมิเตอร์ ${i + 1}`}
                  className="w-full h-full object-cover"
                />
              </a>
            ))}
          </div>
          <button
            onClick={() => setEditing(true)}
            className="w-full rounded-xl bg-white shadow py-3 font-medium text-slate-700 active:bg-slate-100"
          >
            แก้ไข / ถ่ายใหม่
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      <Header title={point.name} back />
      <div className="mx-auto max-w-md px-4 pt-4">
        <div className="text-sm text-slate-500 mb-4">
          {formatThaiDate(today)}
          {point.location ? ` · ${point.location}` : ''}
        </div>

        {previous && (
          <div className="bg-white rounded-xl shadow px-4 py-3 mb-4 text-sm">
            <div className="text-slate-500">
              ครั้งก่อน ({formatThaiDate(previous.date)})
            </div>
            <div className="font-semibold text-slate-800">
              {previous.value.toLocaleString()} {point.unit}
            </div>
          </div>
        )}

        <label className="block text-sm font-medium text-slate-600 mb-1">
          ถ่ายรูปมิเตอร์
        </label>
        <div className="mb-4">
          <PhotoCapture photos={photos} onChange={setPhotos} />
        </div>

        <label className="block text-sm font-medium text-slate-600 mb-1">
          เลขมิเตอร์ปัจจุบัน ({point.unit})
        </label>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="0"
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-2xl font-semibold text-slate-800 mb-2"
        />

        {usage != null && (
          <div className="text-sm text-slate-600 mb-4">
            ใช้ไป{' '}
            <span className="font-semibold text-emerald-600">
              {usage.toLocaleString()} {point.unit}
            </span>{' '}
            จากครั้งก่อน
          </div>
        )}
        {numericValue != null &&
          previous &&
          numericValue < previous.value && (
            <div className="text-sm text-amber-600 mb-4">
              ⚠️ เลขน้อยกว่าครั้งก่อน ตรวจสอบให้แน่ใจว่าพิมพ์ถูกต้อง
            </div>
          )}

        <label className="block text-sm font-medium text-slate-600 mb-1">
          หมายเหตุ (ถ้ามี)
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm mb-4"
          placeholder="เช่น มิเตอร์เสีย, เปลี่ยนมิเตอร์ใหม่"
        />

        {error && <div className="text-red-600 text-sm mb-4">{error}</div>}
      </div>

      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <div className="mx-auto max-w-md flex gap-2">
          {existing && (
            <button
              onClick={() => setEditing(false)}
              className="rounded-xl bg-slate-100 px-4 py-3 font-medium text-slate-600"
            >
              ยกเลิก
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-xl bg-emerald-600 py-3 font-semibold text-white active:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
          </button>
        </div>
      </div>
    </div>
  )
}
