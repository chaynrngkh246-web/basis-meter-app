import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listActiveTechnicians, login } from '../lib/auth'
import { useSession } from '../lib/SessionContext'
import type { Technician } from '../types'

export function Login() {
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [selected, setSelected] = useState<Technician | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const { setSession } = useSession()
  const navigate = useNavigate()

  useEffect(() => {
    listActiveTechnicians()
      .then(setTechnicians)
      .catch(() =>
        setError('โหลดรายชื่อช่างไม่ได้ ตรวจสอบการเชื่อมต่อ Firebase'),
      )
      .finally(() => setLoading(false))
  }, [])

  async function submitPin(nextPin: string) {
    if (!selected || nextPin.length !== 4) return
    setSubmitting(true)
    setError('')
    try {
      const ok = await login(selected, nextPin)
      if (!ok) {
        setError('รหัส PIN ไม่ถูกต้อง')
        setPin('')
        return
      }
      setSession({ technicianId: selected.id, technicianName: selected.name })
      navigate('/', { replace: true })
    } finally {
      setSubmitting(false)
    }
  }

  function press(digit: string) {
    if (submitting) return
    const next = (pin + digit).slice(0, 4)
    setPin(next)
    if (next.length === 4) submitPin(next)
  }

  if (selected) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-6">
        <button
          onClick={() => {
            setSelected(null)
            setPin('')
            setError('')
          }}
          className="self-start mb-4 text-emerald-700 text-sm font-medium"
        >
          ← เลือกชื่อใหม่
        </button>
        <div className="text-slate-500 text-sm mb-1">สวัสดี</div>
        <div className="text-2xl font-semibold text-slate-800 mb-6">
          {selected.name}
        </div>
        <div className="text-slate-500 text-sm mb-3">ใส่รหัส PIN 4 หลัก</div>
        <div className="flex gap-3 mb-6">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full border-2 ${
                i < pin.length
                  ? 'bg-emerald-600 border-emerald-600'
                  : 'border-slate-300'
              }`}
            />
          ))}
        </div>
        {error && <div className="text-red-600 text-sm mb-3">{error}</div>}
        <div className="grid grid-cols-3 gap-4 w-full max-w-xs">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button
              key={d}
              onClick={() => press(d)}
              disabled={submitting}
              className="aspect-square rounded-2xl bg-white shadow text-2xl font-medium text-slate-700 active:bg-slate-100 disabled:opacity-50"
            >
              {d}
            </button>
          ))}
          <div />
          <button
            onClick={() => press('0')}
            disabled={submitting}
            className="aspect-square rounded-2xl bg-white shadow text-2xl font-medium text-slate-700 active:bg-slate-100 disabled:opacity-50"
          >
            0
          </button>
          <button
            onClick={() => setPin(pin.slice(0, -1))}
            disabled={submitting}
            className="aspect-square rounded-2xl text-xl font-medium text-slate-500 active:bg-slate-100 disabled:opacity-50"
          >
            ลบ
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-10 flex flex-col">
      <div className="text-center mb-8">
        <div className="text-3xl mb-2">⚡💧</div>
        <h1 className="text-xl font-bold text-slate-800">
          บันทึกมิเตอร์น้ำ-ไฟ
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Basis International School Bangkok
        </p>
      </div>
      <div className="text-sm font-medium text-slate-500 mb-2">
        เลือกชื่อของคุณ
      </div>
      {loading && <div className="text-slate-400 text-sm">กำลังโหลด...</div>}
      {error && !loading && (
        <div className="text-red-600 text-sm mb-3">{error}</div>
      )}
      <div className="flex flex-col gap-2">
        {technicians.map((t) => (
          <button
            key={t.id}
            onClick={() => setSelected(t)}
            className="text-left bg-white rounded-xl shadow px-4 py-3 font-medium text-slate-700 active:bg-slate-100"
          >
            {t.name}
          </button>
        ))}
      </div>
      {!loading && !error && technicians.length === 0 && (
        <div className="text-slate-400 text-sm text-center mt-6">
          ยังไม่มีรายชื่อช่าง — ให้แอดมินเพิ่มใน Firebase Console
          (คอลเลกชัน technicians) ตามคำแนะนำใน README
        </div>
      )}
    </div>
  )
}
