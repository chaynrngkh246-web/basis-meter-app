import { useNavigate } from 'react-router-dom'
import { useSession } from '../lib/SessionContext'

export function Header({
  title,
  back,
}: {
  title: string
  back?: boolean
}) {
  const navigate = useNavigate()
  const { session } = useSession()

  return (
    <header className="sticky top-0 z-10 bg-emerald-600 text-white pt-[env(safe-area-inset-top)]">
      <div className="mx-auto max-w-md flex items-center gap-2 px-4 py-3">
        {back && (
          <button
            onClick={() => navigate(-1)}
            aria-label="ย้อนกลับ"
            className="-ml-2 p-2 text-xl leading-none"
          >
            ←
          </button>
        )}
        <h1 className="text-lg font-semibold flex-1 truncate">{title}</h1>
        {session && (
          <span className="text-xs bg-emerald-700/60 rounded-full px-2 py-1">
            {session.technicianName}
          </span>
        )}
      </div>
    </header>
  )
}
