import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Users, UserCheck, CreditCard,
  Flower2, CalendarDays, Calendar, Settings, LogOut,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/leads', icon: Users, label: 'Leads' },
  { to: '/students', icon: UserCheck, label: 'Connect Students' },
  { to: '/fees', icon: CreditCard, label: 'Fees' },
  { to: '/araiki', icon: Flower2, label: 'Araiki' },
  { to: '/calendar', icon: CalendarDays, label: 'Calendar' },
  { to: '/meetups', icon: Calendar, label: 'Meetups' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export default function Layout({ children }) {
  const { profile, signOut } = useAuth()

  return (
    <div className="flex min-h-screen">
      <aside className="fixed left-0 top-0 h-screen w-60 bg-[#1742b5] flex flex-col z-30">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-white/20">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center flex-shrink-0">
              <span className="text-[#1742b5] font-bold text-base">N</span>
            </div>
            <div>
              <div className="text-white font-bold text-sm leading-tight">NYG CRM</div>
              <div className="text-white/50 text-xs">Admin Dashboard</div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-[#f97316] text-white'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`
              }
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User + Sign Out */}
        <div className="px-3 pb-4 border-t border-white/20 pt-3">
          <div className="px-3 py-1.5 mb-1">
            <p className="text-white/80 text-xs font-medium truncate">{profile?.full_name || 'Admin'}</p>
            <p className="text-white/40 text-xs truncate">{profile?.role || 'admin'}</p>
          </div>
          <button
            onClick={signOut}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <LogOut size={17} />
            Sign Out
          </button>
        </div>
      </aside>

      <main className="ml-60 flex-1 bg-[#f8fafc]">
        {children}
      </main>
    </div>
  )
}
