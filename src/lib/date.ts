// Dates are formatted from local device time. Technicians are always in
// Bangkok when taking readings, so we don't need a timezone library.
export function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayStr(): string {
  return toDateStr(new Date())
}

export function monthStr(d: Date = new Date()): string {
  return toDateStr(d).slice(0, 7)
}

const THAI_MONTHS = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
]

export function formatThaiDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const buddhistYear = y + 543
  return `${d} ${THAI_MONTHS[m - 1]} ${buddhistYear}`
}
