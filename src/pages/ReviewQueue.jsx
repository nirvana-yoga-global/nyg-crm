import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, Search, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

const CHUNK = 1000
const PAGE  = 100

// Build { label -> [people] } from people whose review_pair contains that label.
// Skips already-resolved labels. Returns only groups with 2+ members.
function buildGroups(people, resolvedLabels) {
  const groups = {}
  people.forEach(p => {
    if (!p.review_pair) return
    p.review_pair.split(',').map(l => l.trim()).filter(Boolean).forEach(label => {
      if (resolvedLabels.has(label)) return
      if (!groups[label]) groups[label] = []
      if (!groups[label].find(q => q.id === p.id)) groups[label].push(p)
    })
  })
  return Object.entries(groups).filter(([, members]) => members.length >= 2)
}

// Remove one label from a review_pair string; return null if none left.
function removeLabelFrom(reviewPair, label) {
  if (!reviewPair) return null
  const remaining = reviewPair.split(',').map(l => l.trim()).filter(l => l && l !== label)
  return remaining.length > 0 ? remaining.join(', ') : null
}

// Case-insensitive match on name, email, or phone digits.
function personMatchesSearch(p, q) {
  if (!q) return true
  const lower = q.toLowerCase()
  if (p.full_name?.toLowerCase().includes(lower)) return true
  if (p.email?.toLowerCase().includes(lower)) return true
  const digits = q.replace(/[^0-9]/g, '')
  if (digits && p.phone?.replace(/[^0-9]/g, '').includes(digits)) return true
  return false
}

// Name cell — grey italics for "Unnamed (" rows
function PersonName({ name }) {
  return name?.startsWith('Unnamed (')
    ? <span className="text-gray-400 italic text-sm">{name}</span>
    : <span className="text-sm font-semibold text-gray-900">{name || '—'}</span>
}

// Side-by-side comparison row — amber text when both values are non-empty and different
function Field({ label, a, b }) {
  const isDiff = !!(a && b && a !== b)
  const cls = isDiff ? 'text-amber-700 font-medium' : 'text-gray-700'
  return (
    <tr>
      <td className="py-1.5 pr-4 text-xs font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap align-top w-28">
        {label}
      </td>
      <td className={`py-1.5 pr-8 text-sm align-top ${cls}`}>
        {a || <span className="text-gray-300">—</span>}
      </td>
      <td className={`py-1.5 text-sm align-top ${cls}`}>
        {b || <span className="text-gray-300">—</span>}
      </td>
    </tr>
  )
}

// Merge confirmation modal
function MergeModal({
  keepName, keepPhone, keepLocation,
  removeName, removePhone, removeLocation,
  onCancel, onConfirm, merging, error,
}) {
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-md shadow-xl p-6"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-gray-900 mb-4">Merge records?</h2>
        <div className="flex gap-6 mb-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{keepName || '—'}</p>
            {keepPhone    && <p className="text-xs text-gray-500 mt-0.5">{keepPhone}</p>}
            {keepLocation && <p className="text-xs text-gray-500">{keepLocation}</p>}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{removeName || '—'}</p>
            {removePhone    && <p className="text-xs text-gray-500 mt-0.5">{removePhone}</p>}
            {removeLocation && <p className="text-xs text-gray-500">{removeLocation}</p>}
          </div>
        </div>
        <p className="text-sm text-gray-500 mb-5">
          Their notes, programmes, WhatsApp groups, forms and payments move to{' '}
          <span className="font-medium text-gray-700">{keepName}</span>, and{' '}
          <span className="font-medium text-gray-700">{removeName}</span> is deleted.
          This cannot be undone.
        </p>
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={merging}
            className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:border-gray-300 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={merging}
            className="px-5 py-2 text-sm font-medium bg-[#1742b5] text-white rounded-lg hover:bg-[#1330a0] disabled:opacity-50 transition-colors"
          >
            {merging ? 'Merging…' : `Merge and delete ${removeName}`}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ReviewQueue() {
  const navigate = useNavigate()
  const [pairPeople, setPairPeople]         = useState([])
  const [otherPeople, setOtherPeople]       = useState([])
  const [loading, setLoading]               = useState(true)
  const [loadError, setLoadError]           = useState('')
  const [activeTab, setActiveTab]           = useState('duplicates')
  const [resolvedLabels, setResolvedLabels] = useState(new Set())
  const [mergeModal, setMergeModal]         = useState(null)
  const [merging, setMerging]               = useState(false)
  const [mergeError, setMergeError]         = useState('')
  const [successMsg, setSuccessMsg]         = useState('')
  const [otherShowCount, setOtherShowCount] = useState(PAGE)
  const [search, setSearch]                 = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    const all = []
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('people')
        .select('id, full_name, phone, email, location, register_no, source, person_type, needs_review, review_type, review_note, review_pair')
        .eq('needs_review', true)
        .order('id')
        .range(from, from + CHUNK - 1)
      if (error) { setLoadError(error.message); setLoading(false); return }
      all.push(...data)
      if (data.length < CHUNK) break
      from += CHUNK
    }
    setPairPeople(all.filter(p => p.review_pair))
    setOtherPeople(all.filter(p => !p.review_pair))
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Derived — filtered by search
  const allGroupEntries      = buildGroups(pairPeople, resolvedLabels)
  const filteredGroupEntries = search
    ? allGroupEntries.filter(([, members]) => members.some(p => personMatchesSearch(p, search)))
    : allGroupEntries
  const filteredOther = search
    ? otherPeople.filter(p => personMatchesSearch(p, search))
    : otherPeople

  const dupCount   = filteredGroupEntries.length
  const otherCount = filteredOther.length

  // ── Merge ──────────────────────────────────────────────────────────────────
  async function handleMerge() {
    if (!mergeModal) return
    setMerging(true)
    setMergeError('')
    const { error } = await supabase.rpc('merge_people', {
      p_keep:   mergeModal.keepId,
      p_remove: mergeModal.removeId,
    })
    if (error) {
      setMergeError(error.message)
      setMerging(false)
      return
    }
    // Both are gone: p_remove is deleted; p_keep has needs_review=false (backend cleared it)
    setPairPeople(prev => prev.filter(p => p.id !== mergeModal.removeId && p.id !== mergeModal.keepId))
    setResolvedLabels(s => new Set([...s, mergeModal.label]))
    setMerging(false)
    setMergeModal(null)
    setSuccessMsg(`Merged ${mergeModal.removeName} into ${mergeModal.keepName}.`)
    setTimeout(() => setSuccessMsg(''), 8000)
  }

  // ── Not the same person ────────────────────────────────────────────────────
  async function handleNotSamePerson(label, p1, p2) {
    const tasks = [p1, p2].map(async person => {
      const newPair     = removeLabelFrom(person.review_pair, label)
      const shouldClear = !newPair && person.review_type === 'Merge'
      const patch = { review_pair: newPair }
      if (shouldClear) patch.needs_review = false
      await supabase.from('people').update(patch).eq('id', person.id)
      return { id: person.id, newPair, shouldClear }
    })
    const results = await Promise.all(tasks)
    setPairPeople(prev => {
      let next = prev
      for (const { id, newPair, shouldClear } of results) {
        if (shouldClear) {
          next = next.filter(p => p.id !== id)
        } else {
          next = next.map(p => p.id === id ? { ...p, review_pair: newPair } : p)
        }
      }
      return next
    })
    setResolvedLabels(s => new Set([...s, label]))
  }

  // ── Mark other reviewed ────────────────────────────────────────────────────
  async function markOtherReviewed(personId) {
    await supabase.from('people').update({ needs_review: false }).eq('id', personId)
    setOtherPeople(prev => prev.filter(p => p.id !== personId))
  }

  if (loading) {
    return <div className="p-6 py-16 text-center text-gray-400 text-sm">Loading…</div>
  }

  return (
    <div className="p-6">

      {/* Fixed success banner */}
      {successMsg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 bg-green-600 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg whitespace-nowrap">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg('')} className="text-white/80 hover:text-white">
            <X size={15} />
          </button>
        </div>
      )}

      {/* Fixed error banner */}
      {loadError && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 bg-red-600 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg whitespace-nowrap">
          <span>{loadError}</span>
          <button onClick={() => setLoadError('')} className="text-white/80 hover:text-white">
            <X size={15} />
          </button>
        </div>
      )}

      <button
        onClick={() => navigate('/people')}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-5 transition-colors"
      >
        <ChevronLeft size={16} />
        Back to Students
      </button>

      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Needs review</h1>
      </div>

      {/* Search */}
      <div className="relative mb-5 max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, phone or email…"
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

      {/* Tabs */}
      <div className="bg-white rounded-t-xl border border-gray-200 border-b-0 px-2 flex">
        {[
          ['duplicates', `Possible duplicates (${dupCount})`],
          ['other',      `Other checks (${otherCount})`],
        ].map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-3.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-[#1742b5] text-[#1742b5]'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="border border-gray-200 border-t-0 rounded-b-xl bg-[#f8fafc] p-6 min-h-[300px]">

        {/* ── Possible duplicates ── */}
        {activeTab === 'duplicates' && (
          <div className="space-y-5">
            {filteredGroupEntries.length === 0 ? (
              <p className="text-sm text-gray-400 py-10 text-center">
                {search ? 'No matches.' : 'No possible duplicates to review.'}
              </p>
            ) : (
              filteredGroupEntries.map(([label, members]) => {
                const p1 = members[0]
                const p2 = members[1]
                const extras = members.length - 2
                return (
                  <div key={label} className="bg-white rounded-xl border border-gray-200 p-5">
                    {/* Group header */}
                    <div className="flex items-center gap-3 mb-4">
                      <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full">
                        {label}
                      </span>
                      {p1.review_note && (
                        <span className="text-xs text-gray-500">{p1.review_note}</span>
                      )}
                    </div>

                    {/* Side-by-side comparison */}
                    <div className="overflow-x-auto mb-5">
                      <table className="w-full">
                        <thead>
                          <tr>
                            <th className="w-28" />
                            <th className="text-left pb-3 pr-8 align-bottom">
                              <PersonName name={p1.full_name} />
                            </th>
                            <th className="text-left pb-3 align-bottom">
                              <PersonName name={p2.full_name} />
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <Field label="Phone"       a={p1.phone}       b={p2.phone} />
                          <Field label="Email"       a={p1.email}       b={p2.email} />
                          <Field label="Location"    a={p1.location}    b={p2.location} />
                          <Field
                            label="Register #"
                            a={p1.register_no != null ? String(p1.register_no) : null}
                            b={p2.register_no != null ? String(p2.register_no) : null}
                          />
                          <Field label="Source"      a={p1.source}      b={p2.source} />
                          <Field label="Type"        a={p1.person_type} b={p2.person_type} />
                        </tbody>
                      </table>
                    </div>

                    {extras > 0 && (
                      <p className="text-xs text-amber-600 mb-4">
                        {extras} more {extras === 1 ? 'person shares' : 'people share'} this label —
                        resolve this pair first to see them.
                      </p>
                    )}

                    {/* Action buttons */}
                    <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-gray-100">
                      <button
                        onClick={() => setMergeModal({
                          label,
                          keepId:         p1.id,        keepName:       p1.full_name,
                          keepPhone:      p1.phone,     keepLocation:   p1.location,
                          removeId:       p2.id,        removeName:     p2.full_name,
                          removePhone:    p2.phone,     removeLocation: p2.location,
                        })}
                        className="px-4 py-2 text-sm font-medium bg-[#1742b5] text-white rounded-lg hover:bg-[#1330a0] transition-colors"
                      >
                        Keep left, merge right into it
                      </button>
                      <button
                        onClick={() => setMergeModal({
                          label,
                          keepId:         p2.id,        keepName:       p2.full_name,
                          keepPhone:      p2.phone,     keepLocation:   p2.location,
                          removeId:       p1.id,        removeName:     p1.full_name,
                          removePhone:    p1.phone,     removeLocation: p1.location,
                        })}
                        className="px-4 py-2 text-sm font-medium bg-[#1742b5] text-white rounded-lg hover:bg-[#1330a0] transition-colors"
                      >
                        Keep right, merge left into it
                      </button>
                      <button
                        onClick={() => handleNotSamePerson(label, p1, p2)}
                        className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                      >
                        Not the same person
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* ── Other checks ── */}
        {activeTab === 'other' && (
          <div>
            {filteredOther.length === 0 ? (
              <p className="text-sm text-gray-400 py-10 text-center">
                {search ? 'No matches.' : 'No other items to review.'}
              </p>
            ) : (
              <>
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-6 py-3">Name</th>
                        <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Phone</th>
                        <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Type</th>
                        <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Note</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOther.slice(0, otherShowCount).map(p => (
                        <tr key={p.id} className="border-b border-gray-50 last:border-0">
                          <td className="px-6 py-3">
                            {p.full_name?.startsWith('Unnamed (') ? (
                              <span className="text-sm text-gray-400 italic">{p.full_name}</span>
                            ) : (
                              <Link
                                to={`/people/${p.id}`}
                                className="text-sm font-medium text-[#1742b5] hover:underline"
                              >
                                {p.full_name}
                              </Link>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{p.phone || '—'}</td>
                          <td className="px-4 py-3">
                            {p.review_type && (
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                p.review_type === 'Merge'
                                  ? 'bg-orange-100 text-orange-700'
                                  : 'bg-blue-100 text-blue-700'
                              }`}>
                                {p.review_type}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">
                            {p.review_note || '—'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3 justify-end">
                              <Link
                                to={`/people/${p.id}`}
                                className="text-xs font-medium text-[#1742b5] hover:underline whitespace-nowrap"
                              >
                                Profile →
                              </Link>
                              <button
                                onClick={() => markOtherReviewed(p.id)}
                                className="text-xs font-medium px-3 py-1.5 border border-gray-200 rounded-lg hover:border-gray-300 text-gray-600 transition-colors whitespace-nowrap"
                              >
                                Mark reviewed
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {filteredOther.length > otherShowCount && (
                  <div className="mt-4 text-center">
                    <button
                      onClick={() => setOtherShowCount(c => c + PAGE)}
                      className="px-6 py-2 text-sm font-medium text-[#1742b5] border border-[#1742b5]/30 rounded-lg hover:bg-[#1742b5]/5 transition-colors"
                    >
                      Show more ({filteredOther.length - otherShowCount} remaining)
                    </button>
                  </div>
                )}
                <p className="mt-3 text-center text-xs text-gray-400">
                  Showing {Math.min(otherShowCount, filteredOther.length)} of {filteredOther.length}
                </p>
              </>
            )}
          </div>
        )}

      </div>

      {mergeModal && (
        <MergeModal
          keepName={mergeModal.keepName}
          keepPhone={mergeModal.keepPhone}
          keepLocation={mergeModal.keepLocation}
          removeName={mergeModal.removeName}
          removePhone={mergeModal.removePhone}
          removeLocation={mergeModal.removeLocation}
          onCancel={() => { if (!merging) { setMergeModal(null); setMergeError('') } }}
          onConfirm={handleMerge}
          merging={merging}
          error={mergeError}
        />
      )}
    </div>
  )
}
