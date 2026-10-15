// v3
import { useState, useEffect } from 'react'
import { Check } from 'lucide-react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import IntakeFormTab from '../components/IntakeFormTab'
import PracticeActivityTab from '../components/PracticeActivityTab'
import FeesTab from '../components/FeesTab'
import NotesTab from '../components/NotesTab'
import ProgressTab from '../components/ProgressTab'
import AraikiTab from '../components/AraikiTab'

const TABS = ['Intake Form', 'Progress', 'Practice Activity', 'Fees', 'Araiki', 'Notes']

function initials(name) {
  return (name || '?')
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function ComingSoon({ label }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 text-sm">
      {label} — coming soon
    </div>
  )
}

export default function StudentProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('Intake Form')
  const [student, setStudent] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('students')
      .select(`
        id,
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
          avatar_url,
          in_kerala_whatsapp,
          in_nyg_whatsapp,
          in_newsletter
        )
      `)
      .eq('profile_id', id)
      .maybeSingle()
      .then(({ data }) => {
        setStudent(data)
        setLoading(false)
      })
  }, [id])

  const displayName = student?.name || student?.profiles?.full_name || 'Unknown Student'
  const avatarUrl   = student?.profiles?.avatar_url
  const nygId       = `NYG-${(id || '').slice(0, 8).toUpperCase()}`

  if (loading) {
    return <div className="p-6 py-16 text-center text-gray-400 text-sm">Loading student…</div>
  }

  async function handleChannelToggle(field) {
    const newVal = !student?.profiles?.[field]
    const { error } = await supabase
      .from('profiles')
      .update({ [field]: newVal })
      .eq('id', id)
    if (!error) {
      setStudent(prev => ({ ...prev, profiles: { ...prev.profiles, [field]: newVal } }))
    }
  }

  function renderTab() {
    switch (activeTab) {
      case 'Intake Form':
        return <IntakeFormTab studentProfileId={id} />
      case 'Practice Activity':
        return <PracticeActivityTab studentId={student?.id} xp={student?.xp} streak={student?.streak} />
      case 'Progress':
        return <ProgressTab studentProfileId={id} />
      case 'Fees':
        return <FeesTab studentProfileId={id} />
      case 'Notes':
        return <NotesTab studentProfileId={id} />
      case 'Araiki':
        return <AraikiTab studentProfileId={id} />
      default:
        return <ComingSoon label={activeTab} />
    }
  }

  return (
    <div className="p-6">
      {/* Back */}
      <button
        onClick={() => navigate('/students')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-5 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Connect Students
      </button>

      {/* Student header card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-5">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              className="w-16 h-16 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-[#1742b5] flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
              {initials(displayName)}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-900">{displayName}</h1>
            <p className="text-sm text-gray-400 mt-0.5 font-mono">{nygId}</p>
            {student?.level_number != null && (
              <span className="inline-block mt-2 text-xs bg-blue-50 text-[#1742b5] font-semibold px-2.5 py-0.5 rounded-full">
                Level {student.level_number}
              </span>
            )}
          </div>

          <div className="flex gap-8 text-center flex-shrink-0">
            <div>
              <div className="text-2xl font-bold text-gray-900">{student?.xp ?? 0}</div>
              <div className="text-xs text-gray-400 mt-0.5 uppercase tracking-wide">XP</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{student?.streak ?? 0}</div>
              <div className="text-xs text-gray-400 mt-0.5 uppercase tracking-wide">Streak</div>
            </div>
          </div>
        </div>

        {/* Communication Channels */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Communication Channels</p>
          <div className="grid grid-cols-3 gap-1">
            {[
              { field: 'in_kerala_whatsapp', label: 'Added to Kerala WhatsApp group' },
              { field: 'in_nyg_whatsapp',    label: 'Added to NYG Global WhatsApp group' },
              { field: 'in_newsletter',      label: 'Added to Newsletter (Kit)' },
            ].map(({ field, label }) => {
              const checked = !!student?.profiles?.[field]
              return (
                <button
                  key={field}
                  onClick={() => handleChannelToggle(field)}
                  className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
                >
                  <span className="text-sm text-gray-700 leading-snug">{label}</span>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ml-2 transition-colors ${checked ? 'bg-green-500' : 'bg-gray-200'}`}>
                    {checked && <Check size={11} className="text-white" strokeWidth={3} />}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="bg-white rounded-t-xl border border-gray-200 border-b-0 px-2 flex">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-3.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab
                ? 'border-[#1742b5] text-[#1742b5]'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="border border-gray-200 border-t-0 rounded-b-xl bg-[#f8fafc] p-6">
        {renderTab()}
      </div>
    </div>
  )
}
