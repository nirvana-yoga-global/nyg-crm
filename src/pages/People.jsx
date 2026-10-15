import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

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

function AddPersonModal({ onClose, onSaved, existingPeople }) {
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', location: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [dupWarning, setDupWarning] = useState([])

  function checkDuplicates() {
    const norm = normalizePhone(form.phone)
    if (!norm) { setDupWarning([]); return }
    setDupWarning(existingPeople.filter(p => p.phone_normalized === norm))
  }

  async function handleSave() {
    if (!form.full_name.trim()) { setError('Name is required.'); return }
    setSaving(true)
    setError('')
    const norm = normalizePhone(form.phone)
    const { error: err } = await supabase.from('people').insert({
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || null,
      phone_normalized: norm,
      email: form.email.trim() || null,
      location: form.location.trim() || null,
      notes: form.notes.trim() || null,
    })
    if (err) { setError(err.message); setSaving(false); return }
    onSaved()
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-lg shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Add Person</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>
        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
          )}
          {dupWarning.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-lg">
              <p className="font-medium mb-1">This phone number is already used by:</p>
              <ul className="list-disc list-inside">
                {dupWarning.map(p => <li key={p.id}>{p.full_name}</li>)}
              </ul>
              <p className="mt-2 text-xs">Families may share a number. You can still save.</p>
            </div>
          )}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Name *</label>
              <input
                value={form.full_name}
                onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                placeholder="Full name"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1742b5]/20 focus:border-[#1742b5]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Phone</label>
              <input
                value={form.phone}
                onChange={e => { setForm(f => ({ ...f, phone: e.target.value })); setDupWarning([]) }}
                onBlur={checkDuplicates}
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
                placeholder="email@example.com"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1742b5]/20 focus:border-[#1742b5]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Location</label>
              <input
                value={form.location}
                onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                placeholder="City or area"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1742b5]/20 focus:border-[#1742b5]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Notes</label>
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Any notes…"
                rows={3}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1742b5]/20 focus:border-[#1742b5] resize-none"
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
          >
            Cancel
          </button>
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
  )
}

export default function People() {
  const navigate = useNavigate()
  const [people, setPeople] = useState([])
  const [formIds, setFormIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [showAddModal, setShowAddModal] = useState(false)

  const fetchPeople = useCallback(async () => {
    const [{ data: ppl }, { data: forms }] = await Promise.all([
      supabase.from('people').select('id, full_name, phone, phone_normalized, email, location, profile_id').order('full_name'),
      supabase.from('intake_forms').select('person_id').not('person_id', 'is', null),
    ])
    setPeople(ppl || [])
    setFormIds(new Set((forms || []).map(f => f.person_id)))
    setLoading(false)
  }, [])

  useEffect(() => { fetchPeople() }, [fetchPeople])

  const filtered = people.filter(p => {
    if (filter === 'connect' && !p.profile_id) return false
    if (filter === 'no-app' && p.profile_id) return false
    const q = search.trim().toLowerCase()
    if (!q) return true
    if (p.full_name?.toLowerCase().includes(q)) return true
    if (p.email?.toLowerCase().includes(q)) return true
    const searchDigits = search.replace(/[^0-9]/g, '')
    if (searchDigits && (
      p.phone?.replace(/[^0-9]/g, '').includes(searchDigits) ||
      p.phone_normalized?.includes(searchDigits)
    )) return true
    return false
  })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">People ({people.length})</h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-[#1742b5] text-white rounded-lg hover:bg-[#1330a0] transition-colors"
        >
          <Plus size={15} />
          Add Person
        </button>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, phone or email…"
            className="w-full pl-9 pr-9 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1742b5]/20 focus:border-[#1742b5]"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex gap-1.5">
          {[['all', 'All'], ['connect', 'Connect'], ['no-app', 'No app account']].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilter(val)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                filter === val ? 'bg-[#1742b5] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center text-gray-400 text-sm">Loading…</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">No people found.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-6 py-3">Name</th>
                  <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Phone</th>
                  <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Email</th>
                  <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Location</th>
                  <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr
                    key={p.id}
                    onClick={() => navigate(`/people/${p.id}`)}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-gray-900">{p.full_name}</span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-sm text-gray-600">{p.phone || '—'}</span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-sm text-gray-600">{p.email || '—'}</span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-sm text-gray-500">{p.location || '—'}</span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex gap-1.5">
                        {p.profile_id && (
                          <span className="text-xs font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Connect</span>
                        )}
                        {formIds.has(p.id) && (
                          <span className="text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Form</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showAddModal && (
        <AddPersonModal
          onClose={() => setShowAddModal(false)}
          onSaved={() => { setShowAddModal(false); fetchPeople() }}
          existingPeople={people}
        />
      )}
    </div>
  )
}
