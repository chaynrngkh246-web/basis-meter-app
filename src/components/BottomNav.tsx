import { NavLink } from 'react-router-dom'

const tabs = [
  { to: '/', label: 'หน้าหลัก', icon: '🏠' },
  { to: '/history', label: 'ประวัติ', icon: '📋' },
  { to: '/export', label: 'ส่งออก', icon: '📤' },
  { to: '/settings', label: 'ตั้งค่า', icon: '⚙️' },
]

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-20 bg-white border-t border-slate-200 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto max-w-md grid grid-cols-4">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium ${
                isActive ? 'text-emerald-600' : 'text-slate-500'
              }`
            }
          >
            <span className="text-lg leading-none">{tab.icon}</span>
            {tab.label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
