function escapeCell(v: string | number): string {
  const s = String(v)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function toCsv(rows: (string | number)[][]): string {
  return rows.map((row) => row.map(escapeCell).join(',')).join('\r\n')
}

export function downloadCsv(filename: string, rows: (string | number)[][]) {
  // Leading BOM so Excel opens the UTF-8 (Thai) text correctly.
  const csv = '﻿' + toCsv(rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
