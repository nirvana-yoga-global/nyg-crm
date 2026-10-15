import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import AddEnrollmentModal from '../components/AddEnrollmentModal'

function initials(name) {
  return (name || '?')
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export default function Students() {
  const navigate = useNavigate()
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [quickEnroll, setQuickEnroll] = useState(null) // { profileId, name }

  useEffect(() => {
    fetchStudents()
  }, [])

  async function fetchStudents() {
    const { data, error } = await supabase
      .from('students')
      .select(`
        profile_id,
        name,
        phone,
        email,
        xp,
        level_number,
        streak,
        profiles:profile_id (
          id,
          full_name,
          avatar_url
        )
      `)
      .order('name')

    if (!error) setStudents(data || [])
    setLoading(false)
  }

  const displayName = s => s.name || s.profiles?.full_name || 'Unknown'

  const filtered = students.filter(s => {
    const q = search.toLowerCase()
    return (
      displayName(s).toLowerCase().includes(q) ||
      (s.phone || '').includes(q) ||
      (s.email || '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Connect Students</h1>
          <p className="text-gray-400 text-sm mt-0.5">Practitioners with an NYG Connect account: sadhana, XP and streaks</p>
        </div>
        <span className="text-sm text-gray-400">
          {filtered.length} practitioner{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, phone, or email…"
          className="w-80 px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1742b5]/20 focus:border-[#1742b5]"
        />
      </div>

      {loading ? (
        <div className="py-16 text-center text-gray-400 text-sm">Loading students…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 text-sm">
          {search ? 'No students match your search.' : 'No students found.'}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Student
                </th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Phone
                </th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Email
                </th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Level
                </th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                  XP
                </th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Streak
                </th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => {
                const name = displayName(s)
                return (
                  <tr
                    key={s.profile_id}
                    onClick={() => navigate(`/students/${s.profile_id}`)}
                    className={`border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors ${
                      i === filtered.length - 1 ? 'border-b-0' : ''
                    }`}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        {s.profiles?.avatar_url ? (
                          <img
                            src={s.profiles.avatar_url}
                            alt={name}
                            className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-[#1742b5] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {initials(name)}
                          </div>
                        )}
                        <span className="font-medium text-gray-900">{name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-gray-600">{s.phone || '—'}</td>
                    <td className="px-5 py-3.5 text-gray-600">{s.email || '—'}</td>
                    <td className="px-5 py-3.5 text-gray-600">
                      {s.level_number != null ? (
                        <span className="inline-block text-xs bg-blue-50 text-[#1742b5] font-medium px-2 py-0.5 rounded-full">
                          Lvl {s.level_number}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-gray-600">{s.xp ?? '—'}</td>
                    <td className="px-5 py-3.5 text-gray-600">
                      {s.streak ? `${s.streak} days` : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          setQuickEnroll({ profileId: s.profile_id, name })
                        }}
                        className="text-xs font-medium text-[#1742b5] border border-[#1742b5]/30 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors whitespace-nowrap"
                      >
                        + Enroll
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {quickEnroll && (
        <AddEnrollmentModal
          studentProfileId={quickEnroll.profileId}
          studentName={quickEnroll.name}
          onClose={() => setQuickEnroll(null)}
          onSaved={() => setQuickEnroll(null)}
        />
      )}
    </div>
  )
}
