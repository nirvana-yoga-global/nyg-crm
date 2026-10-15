import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import IntakeFormTab from '../components/IntakeFormTab'
import NotesTab from '../components/NotesTab'

// Must mirror normalize_phone() in supabase/add_people_table.sql exactly.
function normalizePhone(raw) {
  if (!raw) return null
  const digits = raw.replace(/[^0-9]/g, '')
  const d = digits.startsWith('00') ? digits.slice(2) : digits
  if (!d) return null
  if (d.length === 10 && /^[6-9]/.test(d)) return '91' + d
  if (d.length === 11 && /^0[6-9]/.test(d)) return '91' + d.slice(1)
  if (d.length === 12 && d.startsWith('91')) return d
  return d
}

const TABS = ['Details', 'Registration Form', 'Notes', 'Enrollments']

function initials(name) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

// ── Details tab ───────────────────────────────────────────────────────────────
function DetailsTab({ person, setPerson }) {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    full_name: person.full_name || '',
    phone: person.phone || '',
    email: person.email || '',
    location: person.location || '',
    notes: person.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  async function handleSave() {
    if (!form.full_name.trim()) { setError('Name is required.'); return }
    setSaving(true)
    setError('')
    const { data, error: err } = await supabase
      .from('people')
      .update({
        full_name: form.full_name.trim(),
        phone: form.phone.trim() || null,
        phone_normalized: normalizePhone(form.phone),
        email: form.email.trim() || null,
        location: form.location.trim() || null,
        notes: form.notes.trim() || null,
      })
      .eq('id', person.id)
      .select()
      .single()
    if (err) { setError(err.message); setSaving(false); return }
    setPerson(data)
    setSaved(true)
    setSaving(false)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleDelete() {
    setDeleting(true)
    setDeleteError('')
    const { error: err } = await supabase.from('people').delete().eq('id', person.id)
    if (err) {
      if (err.code === '23503') {
        setDeleteError('This person has enrollments and cannot be deleted. Remove their enrollments first.')
      } else {
        setDeleteError(err.message)
      }
      setDeleting(false)
      return
    }
    navigate('/people')
  }

  return (
    <div className="space-y-5">
      {person.profile_id && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-800">Connect account linked</p>
            <p className="text-xs text-blue-600 mt-0.5">This person has a NYG Connect PWA account.</p>
          </div>
          <Link
            to={`/students/${person.profile_id}`}
            className="text-sm font-medium text-blue-700 hover:text-blue-900 underline whitespace-nowrap ml-4"
          >
            View Connect profile →
          </Link>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="grid grid-cols-2 gap-x-6 gap-y-5">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Name *</label>
            <input
              value={form.full_name}
              onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1742b5]/20 focus:border-[#1742b5]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Phone</label>
            <input
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="+91 XXXXX XXXXX"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1742b5]/20 focus:border-[#1742b5]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1742b5]/20 focus:border-[#1742b5]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Location</label>
            <input
              value={form.location}
              onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1742b5]/20 focus:border-[#1742b5]"
            />
          </div>
          {person.source && (
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Source</label>
              <p className="text-sm text-gray-600 py-2">{person.source}</p>
            </div>
          )}
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1742b5]/20 focus:border-[#1742b5] resize-none"
            />
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
          <p className="text-xs text-gray-400">
            Added {new Date(person.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
          <div className="flex items-center gap-3">
            {error && <span className="text-sm text-red-600">{error}</span>}
            {saved && <span className="text-sm text-green-600">Saved</span>}
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 text-sm font-medium bg-[#1742b5] text-white rounded-lg hover:bg-[#1330a0] disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-800 mb-1">Delete person</h3>
        <p className="text-sm text-gray-500 mb-4">
          Permanently removes this person and their notes, attunements, and registration form.
          Cannot be undone. Their Connect account is not affected.
        </p>
        {deleteError && <p className="text-sm text-red-600 mb-3">{deleteError}</p>}
        {!showDelete ? (
          <button
            onClick={() => setShowDelete(true)}
            className="px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
          >
            Delete person…
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-700">Are you sure?</span>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {deleting ? 'Deleting…' : 'Yes, delete'}
            </button>
            <button
              onClick={() => { setShowDelete(false); setDeleteError('') }}
              className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function PersonProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [person, setPerson] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('Details')

  useEffect(() => {
    supabase.from('people').select('*').eq('id', id).single()
      .then(({ data }) => { setPerson(data); setLoading(false) })
  }, [id])

  if (loading) {
    return <div className="p-6 py-16 text-center text-gray-400 text-sm">Loading…</div>
  }
  if (!person) {
    return <div className="p-6 py-16 text-center text-gray-400 text-sm">Person not found.</div>
  }

  return (
    <div className="p-6">
      <button
        onClick={() => navigate('/people')}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-5 transition-colors"
      >
        <ChevronLeft size={16} />
        Back to People
      </button>

      {/* Header card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-5">
          <div className="w-14 h-14 rounded-full bg-[#1742b5] flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
            {initials(person.full_name)}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-900">{person.full_name}</h1>
            {person.phone && <p className="text-sm text-gray-400 mt-0.5">{person.phone}</p>}
            {person.email && <p className="text-sm text-gray-400">{person.email}</p>}
            <div className="flex gap-1.5 mt-2">
              {person.profile_id && (
                <span className="text-xs font-medium bg-blue-100 text-blue-700 px-2.5 py-0.5 rounded-full">Connect</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
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
      <div className="border border-gray-200 border-t-0 rounded-b-xl bg-[#f8fafc] p-6 min-h-[300px]">
        {activeTab === 'Details' && (
          <DetailsTab person={person} setPerson={setPerson} />
        )}
        {activeTab === 'Registration Form' && (
          <IntakeFormTab
            personId={person.id}
            studentProfileId={person.profile_id || undefined}
            prefill={{
              full_name: person.full_name,
              phone: person.phone || '',
              email: person.email || '',
            }}
          />
        )}
        {activeTab === 'Notes' && (
          <NotesTab personId={person.id} />
        )}
        {activeTab === 'Enrollments' && (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 text-sm">
            Enrollments will appear here.
          </div>
        )}
      </div>
    </div>
  )
}
