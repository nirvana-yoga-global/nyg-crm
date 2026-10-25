import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Search, Plus, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

const CHUNK = 1000
const PAGE  = 100
const BATCH = 100   // IDs per Supabase .in() call

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

const COMMUNITY_LABELS = {
  not_invited: 'Not invited',
  invited:     'Invited',
  joined:      'Joined',
  declined:    'Declined',
  cant_reach:  "Can't reach",
}

function localToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function chunks(arr, size) {
  const result = []
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size))
  return result
}

// Returns { label, title } for a people.updated_at timestamptz string, using IST.
// label: "Updated today" / "Updated yesterday" / "Updated N days ago" (≤6) / "Updated 4 Jul 2026"
// title: full IST datetime for hover
function relativeUpdated(ts) {
  if (!ts) return null
  const tsDate = new Date(ts)
  const now    = new Date()

  // YYYY-MM-DD in IST for both dates
  const istFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const todayIST = istFmt.format(now)
  const tsIST    = istFmt.format(tsDate)

  const [ty, tm, td] = todayIST.split('-').map(Number)
  const [py, pm, pd] = tsIST.split('-').map(Number)
  const diffDays = Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(py, pm - 1, pd)) / 86400000
  )

  const shortFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric', month: 'short', year: 'numeric',
  })
  const longFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  let label
  if (diffDays === 0)      label = 'Updated today'
  else if (diffDays === 1) label = 'Updated yesterday'
  else if (diffDays <= 6)  label = `Updated ${diffDays} days ago`
  else                     label = `Updated ${shortFmt.format(tsDate)}`

  return { label, title: longFmt.format(tsDate) }
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
          <h2 className="text-base font-semibold text-gray-900">Add Student</h2>
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

  // Core data
  const [people, setPeople]         = useState([])
  const [formIds, setFormIds]       = useState(new Set())
  const [loading, setLoading]       = useState(true)
  const [loadError, setLoadError]   = useState('')

  // Invite-filter data (loaded in parallel with people)
  const [programmeMap, setProgrammeMap]   = useState(new Map()) // person_id → Set<programme>
  const [waMap, setWaMap]                 = useState(new Map()) // person_id → Set<group_id>
  const [programmeList, setProgrammeList] = useState([])        // sorted distinct programme names
  const [waGroupList, setWaGroupList]     = useState([])        // [{id, name, sort_order}]
  const [countryList, setCountryList]     = useState([])        // sorted distinct countries

  // Filter state
  const [search, setSearch]               = useState('')
  const [filter, setFilter]               = useState('all')         // 'all' | 'connect' | 'no-app'
  const [typeFilter, setTypeFilter]       = useState('students')    // 'all' | 'students' | 'contacts'
  const [needsReview, setNeedsReview]     = useState(false)
  const [progFilter, setProgFilter]       = useState('')            // '' | '__none__' | programme name
  const [waFilter, setWaFilter]           = useState('')            // '' | '__none__' | group_id
  // community filter: '' | '__not_invited__' | 'invited' | 'joined' | 'declined'
  const [communityFilter, setCommunityFilter] = useState('')
  const [countryFilter, setCountryFilter] = useState('')            // '' | '__none__' | country name
  const [updatedFilter, setUpdatedFilter] = useState('')            // '' | '7d' | '30d' | '60d_not'
  const [sortBy, setSortBy]               = useState('name')        // 'name' | 'updated'
  const [showCount, setShowCount]         = useState(PAGE)
  const [showAddModal, setShowAddModal]   = useState(false)
  const [copyMsg, setCopyMsg]             = useState('')

  // Selection + bulk state
  const [selectedIds, setSelectedIds]       = useState(new Set())
  const [bulkAction, setBulkAction]         = useState(null)   // null | 'invited' | 'joined'
  const [includeDeclined, setIncludeDeclined] = useState(false)
  const [bulkSaving, setBulkSaving]         = useState(false)
  const [bulkError, setBulkError]           = useState('')
  const [bulkResult, setBulkResult]         = useState(null)   // { updated, skipped } | null
  const headerCheckRef = useRef(null)

  const fetchPeople = useCallback(async () => {
    setLoading(true)
    setLoadError('')

    async function pageAll(queryFn) {
      const all = []
      let from = 0
      while (true) {
        const { data, error } = await queryFn(from)
        if (error) return { data: null, error }
        all.push(...data)
        if (data.length < CHUNK) break
        from += CHUNK
      }
      return { data: all, error: null }
    }

    const [peopleRes, progRes, waMembRes, formsRes, waGroupsRes] = await Promise.all([
      pageAll(from => supabase
        .from('people')
        .select('id, full_name, phone, phone_normalized, email, location, profile_id, person_type, needs_review, country, register_no, community_status, updated_at')
        .order('full_name').order('id')
        .range(from, from + CHUNK - 1)),
      pageAll(from => supabase
        .from('person_programmes')
        .select('person_id, programme')
        .order('id')
        .range(from, from + CHUNK - 1)),
      pageAll(from => supabase
        .from('person_whatsapp_groups')
        .select('person_id, group_id')
        .order('id')
        .range(from, from + CHUNK - 1)),
      supabase.from('intake_forms').select('person_id').not('person_id', 'is', null),
      supabase.from('whatsapp_groups').select('id, name, sort_order').eq('is_active', true).order('sort_order'),
    ])

    const firstError = peopleRes.error || progRes.error || waMembRes.error || formsRes.error
    if (firstError) { setLoadError(firstError.message); setLoading(false); return }

    const progMap = new Map()
    for (const r of progRes.data) {
      if (!progMap.has(r.person_id)) progMap.set(r.person_id, new Set())
      progMap.get(r.person_id).add(r.programme)
    }

    const waMemMap = new Map()
    for (const r of waMembRes.data) {
      if (!waMemMap.has(r.person_id)) waMemMap.set(r.person_id, new Set())
      waMemMap.get(r.person_id).add(r.group_id)
    }

    const allProgs = [...new Set(progRes.data.map(r => r.programme))].sort((a, b) =>
      a.localeCompare(b, ['ml', 'en'])
    )

    const countriesRaw = new Set(peopleRes.data.map(p => p.country).filter(Boolean))
    const countries = [...countriesRaw].sort((a, b) => {
      if (a === 'India') return -1
      if (b === 'India') return 1
      return a.localeCompare(b)
    })

    setPeople(peopleRes.data)
    setProgrammeMap(progMap)
    setWaMap(waMemMap)
    setProgrammeList(allProgs)
    setWaGroupList(waGroupsRes.data || [])
    setCountryList(countries)
    setFormIds(new Set((formsRes.data || []).map(f => f.person_id)))
    setLoading(false)
  }, [])

  useEffect(() => { fetchPeople() }, [fetchPeople])

  // Reset paging when any filter or sort changes — selection intentionally survives
  useEffect(() => {
    setShowCount(PAGE)
  }, [search, typeFilter, needsReview, filter, progFilter, waFilter, communityFilter, countryFilter, updatedFilter, sortBy])

  // ── Filtering ──────────────────────────────────────────────────────────────
  const base = people.filter(p => {
    if (needsReview && !p.needs_review) return false
    if (filter === 'connect' && !p.profile_id) return false
    if (filter === 'no-app'  &&  p.profile_id) return false

    const q = search.trim().toLowerCase()
    if (q) {
      const matchName  = p.full_name?.toLowerCase().includes(q)
      const matchEmail = p.email?.toLowerCase().includes(q)
      const digits     = search.replace(/[^0-9]/g, '')
      const matchPhone = digits && (
        p.phone?.replace(/[^0-9]/g, '').includes(digits) ||
        p.phone_normalized?.includes(digits)
      )
      if (!matchName && !matchEmail && !matchPhone) return false
    }

    if (progFilter === '__none__') {
      if (programmeMap.has(p.id)) return false
    } else if (progFilter) {
      if (!programmeMap.get(p.id)?.has(progFilter)) return false
    }

    if (waFilter === '__none__') {
      if (waMap.has(p.id)) return false
    } else if (waFilter) {
      if (!waMap.get(p.id)?.has(waFilter)) return false
    }

    // Community filter: '__not_invited__' matches NULL + not_invited + cant_reach
    if (communityFilter === '__not_invited__') {
      if (p.community_status != null &&
          p.community_status !== 'not_invited' &&
          p.community_status !== 'cant_reach') return false
    } else if (communityFilter) {
      if (p.community_status !== communityFilter) return false
    }

    if (countryFilter === '__none__') {
      if (p.country) return false
    } else if (countryFilter) {
      if (p.country !== countryFilter) return false
    }

    // Updated filter — raw ms comparison is sufficient for day-granularity ranges
    if (updatedFilter) {
      if (!p.updated_at) return updatedFilter === '60d_not' ? false : false
      const ageDays = (Date.now() - new Date(p.updated_at).getTime()) / 86400000
      if (updatedFilter === '7d'      && ageDays > 7)  return false
      if (updatedFilter === '30d'     && ageDays > 30) return false
      if (updatedFilter === '60d_not' && ageDays <= 60) return false
    }

    return true
  })

  // Tab counts — derived from base
  const studentsCount = base.filter(p => p.person_type !== 'contact').length
  const contactsCount = base.filter(p => p.person_type === 'contact').length
  const reviewCount   = base.filter(p => p.needs_review).length

  const filtered = typeFilter === 'students' ? base.filter(p => p.person_type !== 'contact')
    : typeFilter === 'contacts' ? base.filter(p => p.person_type === 'contact')
    : base

  // Sort — name order comes from DB; recently-updated is a client-side sort
  const sortedFiltered = sortBy === 'updated'
    ? [...filtered].sort((a, b) => {
        if (!a.updated_at && !b.updated_at) return 0
        if (!a.updated_at) return 1
        if (!b.updated_at) return -1
        return new Date(b.updated_at) - new Date(a.updated_at)
      })
    : filtered

  const displayed = sortedFiltered.slice(0, showCount)

  // Selected people that are not visible in the current page
  const selectedInView    = displayed.filter(p => selectedIds.has(p.id)).length
  const selectedNotInView = selectedIds.size - selectedInView

  // ── Selection helpers ──────────────────────────────────────────────────────
  const allOnPage  = displayed.length > 0 && displayed.every(p => selectedIds.has(p.id))
  const someOnPage = !allOnPage && displayed.some(p => selectedIds.has(p.id))

  useEffect(() => {
    if (headerCheckRef.current) {
      headerCheckRef.current.indeterminate = someOnPage
    }
  }, [someOnPage, allOnPage])

  function toggleSelectAll(e) {
    e.stopPropagation()
    if (allOnPage) {
      setSelectedIds(ids => { const n = new Set(ids); displayed.forEach(p => n.delete(p.id)); return n })
    } else {
      setSelectedIds(ids => { const n = new Set(ids); displayed.forEach(p => n.add(p.id)); return n })
    }
  }

  function toggleRow(e, id) {
    e.stopPropagation()
    setSelectedIds(ids => {
      const n = new Set(ids)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  // ── Bulk computed values (used in confirm UI) ─────────────────────────────
  const selPeopleSnap  = bulkAction ? people.filter(p => selectedIds.has(p.id)) : []

  const inviteToUpdate = bulkAction === 'invited'
    ? selPeopleSnap.filter(p =>
        p.community_status == null ||
        p.community_status === 'not_invited' ||
        p.community_status === 'cant_reach'
      )
    : []

  const joinDeclinedCount = bulkAction === 'joined'
    ? selPeopleSnap.filter(p => p.community_status === 'declined').length
    : 0

  const joinToUpdate = bulkAction === 'joined'
    ? selPeopleSnap.filter(p => {
        if (p.community_status === 'joined') return false
        if (p.community_status === 'declined' && !includeDeclined) return false
        return true
      })
    : []

  // ── Bulk save ──────────────────────────────────────────────────────────────
  async function runBulkSave() {
    setBulkSaving(true)
    setBulkError('')

    const selectedPeople = people.filter(p => selectedIds.has(p.id))
    let toUpdate, updateData

    if (bulkAction === 'invited') {
      toUpdate = selectedPeople.filter(p =>
        p.community_status == null ||
        p.community_status === 'not_invited' ||
        p.community_status === 'cant_reach'
      )
      updateData = { community_status: 'invited', community_invited_on: localToday() }
    } else {
      toUpdate = selectedPeople.filter(p => {
        if (p.community_status === 'joined') return false
        if (p.community_status === 'declined' && !includeDeclined) return false
        return true
      })
      updateData = { community_status: 'joined' }
    }

    const ids    = toUpdate.map(p => p.id)
    const skipped = selectedPeople.length - ids.length
    const updatedSet = new Set(ids)

    for (const batch of chunks(ids, BATCH)) {
      const { error: err } = await supabase.from('people').update(updateData).in('id', batch)
      if (err) {
        setBulkError(err.message)
        setBulkSaving(false)
        return
      }
    }

    // Optimistic in-memory update (also stamp updated_at so relative label refreshes)
    const nowISO = new Date().toISOString()
    setPeople(prev => prev.map(p =>
      updatedSet.has(p.id) ? { ...p, ...updateData, updated_at: nowISO } : p
    ))

    setSelectedIds(new Set())
    setBulkAction(null)
    setIncludeDeclined(false)
    setBulkSaving(false)
    setBulkResult({ updated: ids.length, skipped })
    setTimeout(() => setBulkResult(null), 6000)
  }

  // ── Active filter chips ────────────────────────────────────────────────────
  const activeChips = []
  if (progFilter) {
    const lbl = progFilter === '__none__' ? 'None' : progFilter
    activeChips.push({ label: `Programme: ${lbl}`, onRemove: () => setProgFilter('') })
  }
  if (waFilter) {
    const grpName = waFilter === '__none__' ? 'No group'
      : (waGroupList.find(g => g.id === waFilter)?.name ?? waFilter)
    activeChips.push({ label: `Group: ${grpName}`, onRemove: () => setWaFilter('') })
  }
  if (communityFilter) {
    const COMM_CHIP = {
      '__not_invited__': 'Not invited',
      invited:  'Invited, not joined',
      joined:   'Joined',
      declined: 'Declined',
    }
    activeChips.push({ label: `Community: ${COMM_CHIP[communityFilter] ?? communityFilter}`, onRemove: () => setCommunityFilter('') })
  }
  if (countryFilter) {
    const lbl = countryFilter === '__none__' ? 'None' : countryFilter
    activeChips.push({ label: `Country: ${lbl}`, onRemove: () => setCountryFilter('') })
  }
  if (updatedFilter) {
    const UPD_CHIP = { '7d': 'Last 7 days', '30d': 'Last 30 days', '60d_not': 'Not updated in 60 days' }
    activeChips.push({ label: `Updated: ${UPD_CHIP[updatedFilter]}`, onRemove: () => setUpdatedFilter('') })
  }
  const hasFilters = activeChips.length > 0

  function clearFilters() {
    setProgFilter('')
    setWaFilter('')
    setCommunityFilter('')
    setCountryFilter('')
    setUpdatedFilter('')
  }

  // ── Title ──────────────────────────────────────────────────────────────────
  const titleLabel = needsReview ? 'Needs review'
    : typeFilter === 'students' ? 'Students'
    : typeFilter === 'contacts' ? 'Contacts'
    : 'All people'

  // ── Copy phones ────────────────────────────────────────────────────────────
  async function handleCopyPhones() {
    const phones = sortedFiltered
      .filter(p => p.phone)
      .map(p => p.phone_normalized ? '+' + p.phone_normalized : p.phone)
    try {
      await navigator.clipboard.writeText(phones.join('\n'))
      setCopyMsg(`Copied ${phones.length} numbers`)
    } catch {
      setCopyMsg('Copy failed')
    }
    setTimeout(() => setCopyMsg(''), 3000)
  }

  const selCls = active =>
    `px-3 py-1.5 text-xs rounded-lg border cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#1742b5]/20 transition-colors ${
      active
        ? 'border-[#1742b5] text-[#1742b5] bg-blue-50 font-medium'
        : 'border-gray-200 text-gray-600 bg-white hover:border-gray-300'
    }`

  return (
    <div className="p-6 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {titleLabel} ({sortedFiltered.length})
        </h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-[#1742b5] text-white rounded-lg hover:bg-[#1330a0] transition-colors"
        >
          <Plus size={15} />
          Add Student
        </button>
      </div>

      {/* Bulk result notice */}
      {bulkResult && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-3 rounded-lg flex items-center justify-between">
          <span>
            Updated {bulkResult.updated}
            {bulkResult.skipped > 0 && `, skipped ${bulkResult.skipped} (already invited / joined / declined)`}
          </span>
          <button onClick={() => setBulkResult(null)} className="text-green-600 hover:text-green-800 ml-4">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Row 1: search + account pills */}
      <div className="flex items-center gap-3 mb-3">
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
          {[['all', 'Any account'], ['connect', 'Has app account'], ['no-app', 'No app account']].map(([val, label]) => (
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

      {/* Row 2: type pills + Needs review pill */}
      <div className="flex items-center gap-1.5 mb-3">
        {[
          ['all',      `All (${base.length})`],
          ['students', `Students (${studentsCount})`],
          ['contacts', `Contacts (${contactsCount})`],
        ].map(([val, label]) => (
          <button
            key={val}
            onClick={() => setTypeFilter(val)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
              typeFilter === val ? 'bg-[#1742b5] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
        <button
          onClick={() => setNeedsReview(r => !r)}
          className={`ml-2 px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
            needsReview
              ? 'bg-amber-500 text-white'
              : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
          }`}
        >
          Needs review ({reviewCount})
        </button>
        {reviewCount > 0 && (
          <Link
            to="/people/review"
            className="ml-auto text-xs font-medium text-[#1742b5] hover:underline px-1"
          >
            Review queue →
          </Link>
        )}
      </div>

      {/* Row 3: Invite filters + updated filter + sort + copy button */}
      {!loading && !loadError && (
        <div className="mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <select value={progFilter} onChange={e => setProgFilter(e.target.value)} className={selCls(!!progFilter)}>
              <option value="">Any programme</option>
              {programmeList.map(p => <option key={p} value={p}>{p}</option>)}
              <option value="__none__">No programme</option>
            </select>

            <select value={waFilter} onChange={e => setWaFilter(e.target.value)} className={selCls(!!waFilter)}>
              <option value="">Any group</option>
              {waGroupList.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              <option value="__none__">In no group</option>
            </select>

            <select value={communityFilter} onChange={e => setCommunityFilter(e.target.value)} className={selCls(!!communityFilter)}>
              <option value="">Thapovanam: Any</option>
              <option value="__not_invited__">Not invited</option>
              <option value="invited">Invited, not joined</option>
              <option value="joined">Joined</option>
              <option value="declined">Declined</option>
            </select>

            <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)} className={selCls(!!countryFilter)}>
              <option value="">Any country</option>
              {countryList.map(c => <option key={c} value={c}>{c}</option>)}
              <option value="__none__">No country</option>
            </select>

            <select value={updatedFilter} onChange={e => setUpdatedFilter(e.target.value)} className={selCls(!!updatedFilter)}>
              <option value="">Updated: Any</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="60d_not">Not updated in 60 days</option>
            </select>

            <select value={sortBy} onChange={e => setSortBy(e.target.value)} className={selCls(sortBy !== 'name')}>
              <option value="name">Sort: Name A–Z</option>
              <option value="updated">Recently updated first</option>
            </select>

            <div className="ml-auto">
              <button
                onClick={handleCopyPhones}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                  copyMsg
                    ? 'border-green-300 bg-green-50 text-green-700'
                    : 'border-gray-200 text-gray-600 bg-white hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                {copyMsg || 'Copy phone numbers'}
              </button>
            </div>
          </div>

          {/* Active filter chips */}
          {hasFilters && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {activeChips.map(({ label, onRemove }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-[#1742b5]/10 text-[#1742b5] rounded-full"
                >
                  {label}
                  <button
                    onClick={onRemove}
                    className="text-[#1742b5]/60 hover:text-[#1742b5] leading-none"
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
              <button
                onClick={clearFilters}
                className="text-xs text-gray-400 hover:text-gray-600 ml-1 underline underline-offset-2"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-gray-400 text-sm">Loading…</div>
      ) : loadError ? (
        <div className="py-16 text-center text-red-500 text-sm">Failed to load: {loadError}</div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {displayed.length === 0 ? (
              <div className="py-16 text-center text-gray-400 text-sm">No students found.</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="px-3 py-3 w-10">
                      <input
                        ref={headerCheckRef}
                        type="checkbox"
                        checked={allOnPage}
                        onChange={toggleSelectAll}
                        onClick={e => e.stopPropagation()}
                        className="w-4 h-4 rounded border-gray-300 text-[#1742b5] cursor-pointer accent-[#1742b5]"
                        title="Select all on this page"
                      />
                    </th>
                    <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Name</th>
                    <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Phone</th>
                    <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Email</th>
                    <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Location</th>
                    <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map(p => {
                    const upd = relativeUpdated(p.updated_at)
                    return (
                      <tr
                        key={p.id}
                        onClick={() => navigate(`/people/${p.id}`)}
                        className={`border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer transition-colors ${
                          selectedIds.has(p.id) ? 'bg-blue-50/50' : ''
                        }`}
                      >
                        <td className="px-3 py-4" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(p.id)}
                            onChange={e => toggleRow(e, p.id)}
                            onClick={e => e.stopPropagation()}
                            className="w-4 h-4 rounded border-gray-300 text-[#1742b5] cursor-pointer accent-[#1742b5]"
                          />
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-sm font-medium text-gray-900">{p.full_name}</span>
                          {upd && (
                            <p
                              className="text-xs text-gray-400 mt-0.5 leading-tight"
                              title={upd.title}
                            >
                              {upd.label}
                            </p>
                          )}
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
                          <div className="flex gap-1.5 flex-wrap">
                            {p.needs_review && (
                              <span className="text-xs font-medium bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Needs review</span>
                            )}
                            {p.person_type === 'contact' && (
                              <span className="text-xs font-medium bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Contact</span>
                            )}
                            {p.profile_id && (
                              <span className="text-xs font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Connect</span>
                            )}
                            {formIds.has(p.id) && (
                              <span className="text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Form</span>
                            )}
                            {p.community_status && p.community_status !== 'not_invited' && (
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                p.community_status === 'invited' ? 'bg-blue-100 text-blue-700'
                                : p.community_status === 'joined' ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-500'
                              }`}>
                                Community: {COMMUNITY_LABELS[p.community_status]}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {sortedFiltered.length > showCount && (
            <div className="mt-4 text-center">
              <button
                onClick={() => setShowCount(c => c + PAGE)}
                className="px-6 py-2 text-sm font-medium text-[#1742b5] border border-[#1742b5]/30 rounded-lg hover:bg-[#1742b5]/5 transition-colors"
              >
                Show more ({sortedFiltered.length - showCount} remaining)
              </button>
            </div>
          )}

          {sortedFiltered.length > 0 && (
            <p className="mt-3 text-center text-xs text-gray-400">
              Showing {Math.min(showCount, sortedFiltered.length)} of {sortedFiltered.length}
            </p>
          )}
        </>
      )}

      {showAddModal && (
        <AddPersonModal
          onClose={() => setShowAddModal(false)}
          onSaved={() => { setShowAddModal(false); fetchPeople() }}
          existingPeople={people}
        />
      )}

      {/* ── Fixed bulk action bar ─────────────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-60 right-0 z-40 bg-white border-t border-gray-200 shadow-lg">
          <div className="px-6 py-3">
            {bulkAction === null ? (
              /* Action selection */
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-gray-700">
                  {selectedIds.size} {selectedIds.size === 1 ? 'person' : 'people'} selected
                  {selectedNotInView > 0 && (
                    <span className="font-normal text-gray-400"> ({selectedNotInView} not in current view)</span>
                  )}
                </span>
                <div className="flex gap-2 ml-2">
                  <button
                    onClick={() => { setBulkAction('invited'); setBulkError('') }}
                    className="px-4 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Mark invited
                  </button>
                  <button
                    onClick={() => { setBulkAction('joined'); setBulkError('') }}
                    className="px-4 py-1.5 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    Mark joined
                  </button>
                </div>
                <button
                  onClick={() => { setSelectedIds(new Set()); setBulkAction(null); setIncludeDeclined(false); setBulkError('') }}
                  className="ml-auto text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2"
                >
                  Clear
                </button>
              </div>
            ) : (
              /* Confirm */
              <div className="flex items-start gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  {bulkAction === 'invited' ? (
                    <p className="text-sm text-gray-800">
                      Mark <span className="font-semibold">{inviteToUpdate.length}</span> {inviteToUpdate.length === 1 ? 'person' : 'people'} as <span className="font-semibold">Invited</span> in the Thapovanam Siddhashram community
                      {selectedIds.size - inviteToUpdate.length > 0 && (
                        <span className="text-gray-500">
                          {' '}({selectedIds.size - inviteToUpdate.length} already invited / joined / declined — will be skipped)
                        </span>
                      )}
                    </p>
                  ) : (
                    <div>
                      <p className="text-sm text-gray-800">
                        Mark <span className="font-semibold">{joinToUpdate.length}</span> {joinToUpdate.length === 1 ? 'person' : 'people'} as <span className="font-semibold">Joined</span> in the Thapovanam Siddhashram community
                        {!includeDeclined && joinDeclinedCount > 0 && (
                          <span className="text-gray-500"> ({joinDeclinedCount} declined will be skipped)</span>
                        )}
                      </p>
                      {joinDeclinedCount > 0 && (
                        <label className="inline-flex items-center gap-2 mt-1.5 text-xs text-gray-600 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={includeDeclined}
                            onChange={e => setIncludeDeclined(e.target.checked)}
                            className="w-3.5 h-3.5 rounded border-gray-300 accent-[#1742b5]"
                          />
                          Include declined (+{joinDeclinedCount})
                        </label>
                      )}
                    </div>
                  )}
                  {bulkError && <p className="text-xs text-red-600 mt-1">{bulkError}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={runBulkSave}
                    disabled={bulkSaving || (bulkAction === 'invited' ? inviteToUpdate.length === 0 : joinToUpdate.length === 0)}
                    className="px-4 py-1.5 text-sm font-medium bg-[#1742b5] text-white rounded-lg hover:bg-[#1330a0] disabled:opacity-50 transition-colors"
                  >
                    {bulkSaving ? 'Saving…' : 'Confirm'}
                  </button>
                  <button
                    onClick={() => { setBulkAction(null); setIncludeDeclined(false); setBulkError('') }}
                    disabled={bulkSaving}
                    className="px-4 py-1.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:border-gray-300 disabled:opacity-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
