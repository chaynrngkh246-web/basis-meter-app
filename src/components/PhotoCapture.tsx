import { useRef } from 'react'

export type PhotoItem =
  | { kind: 'existing'; url: string; path: string }
  | { kind: 'new'; file: File; previewUrl: string }

export function PhotoCapture({
  photos,
  onChange,
}: {
  photos: PhotoItem[]
  onChange: (photos: PhotoItem[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const added: PhotoItem[] = Array.from(files).map((file) => ({
      kind: 'new',
      file,
      previewUrl: URL.createObjectURL(file),
    }))
    onChange([...photos, ...added])
  }

  function remove(index: number) {
    const item = photos[index]
    if (item.kind === 'new') URL.revokeObjectURL(item.previewUrl)
    onChange(photos.filter((_, i) => i !== index))
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((p, i) => (
          <div
            key={i}
            className="relative aspect-square rounded-lg overflow-hidden bg-slate-100"
          >
            <img
              src={p.kind === 'existing' ? p.url : p.previewUrl}
              alt={`รูปมิเตอร์ ${i + 1}`}
              className="w-full h-full object-cover"
            />
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label="ลบรูป"
              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-sm leading-none flex items-center justify-center"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="aspect-square rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 active:bg-slate-50"
        >
          <span className="text-2xl leading-none">📷</span>
          <span className="text-xs mt-1">ถ่ายรูป</span>
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
