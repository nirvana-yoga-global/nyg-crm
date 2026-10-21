import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Plus, X, MapPin, Star, Copy, Check, Trash2, Wifi, Users, Search, UserPlus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCourses } from '../hooks/useCourses'
import { normalizePhone } from '../lib/normalizePhone'

function generateEventCode() {
  return 'NYG' + Math.random().toString(36).substring(2, 7).toUpperCase()
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatDateTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatShortDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

const MEETUP_COURSES = ['Araiki', 'Regular Yoga', 'Free Workshop', 'Other']

function courseMatchFilter(course) {
  if (course === 'Araiki') return ['Araiki Local', 'Araiki Foreigner']
  if (!course || course === 'Other') return null
  return [course]
}

const LEAD_STATUS_STYLE = {
  new: 'bg-gray-100 text-gray-600',
  contacted: 'bg-blue-100 text-blue-700',
  interested: 'bg-amber-100 text-amber-700',
  enrolled: 'bg-green-100 text-green-700',
  lost: 'bg-red-100 text-red-600',
}

const EMPTY_MEETUP = { title: '', date: '', type: 'offline', location: '', description: '', event_code: '', xp_reward: 50, language: '', course: '' }

export default function Meetups() {
  const [meetups, setMeetups] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedMeetup, setSelectedMeetup] = useState(null)
  const [attendance, setAttendance] = useState([])
  const [loadingAttendance, setLoadingAttendance] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newMeetup, setNewMeetup] = useState({ ...EMPTY_MEETUP, event_code: generateEventCode() })
  const [saving, setSaving] = useState(false)
  const [attSearch, setAttSearch] = useState('')
  const [attSearchLoading, setAttSearchLoading] = useState(false)
  const [attResults, setAttResults] = useState([])
  const [attShowDropdown, setAttShowDropdown] = useState(false)
  const [attMarkingId, setAttMarkingId] = useState(null)
  const [showNewAttForm, setShowNewAttForm] = useState(false)
  const [newAttName, setNewAttName] = useState('')
  const [newAttPhone, setNewAttPhone] = useState('')
  const [attPhoneDupLoading, setAttPhoneDupLoading] = useState(false)
  const [attPhoneDupResults, setAttPhoneDupResults] = useState([])
  const [savingNewAtt, setSavingNewAtt] = useState(false)
  const [removeAttId, setRemoveAttId] = useState(null)
  const [removingAtt, setRemovingAtt] = useState(false)
  const [attError, setAttError] = useState('')
  const [copied, setCopied] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [showAraikiLeads, setShowAraikiLeads] = useState(false)
  const [araikiLeads, setAraikiLeads] = useState([])
  const [araikiLeadsLoading, setAraikiLeadsLoading] = useState(false)
  const [araikiCourseFilter, setAraikiCourseFilter] = useState('')
  const [copiedNumbers, setCopiedNumbers] = useState(false)

  // Registration state
  const [registrations, setRegistrations] = useState([])
  const [loadingRegistrations, setLoadingRegistrations] = useState(false)
  const [regSearchText, setRegSearchText] = useState('')
  const [regSuggestions, setRegSuggestions] = useState([])
  const [regSearchLoading, setRegSearchLoading] = useState(false)
  const [showRegDropdown, setShowRegDropdown] = useState(false)
  const [addingReg, setAddingReg] = useState(false)
  const [removeRegId, setRemoveRegId] = useState(null)
  const [removingReg, setRemovingReg] = useState(false)
  const [showNewPersonForm, setShowNewPersonForm] = useState(false)
  const [newPerson, setNewPerson] = useState({ name: '', phone: '' })
  const [savingNewPerson, setSavingNewPerson] = useState(false)

  const regDropdownRef = useRef(null)
  const attDropdownRef = useRef(null)
  const attSearchTimer = useRef(null)
  const attPhoneTimer = useRef(null)
  const leadCourses = useCourses()

  useEffect(() => { fetchMeetups() }, [])

  useEffect(() => {
    if (selectedMeetup) {
      fetchAttendance(selectedMeetup.id)
      fetchRegistrations(selectedMeetup.id)
    } else {
      setAttendance([])
      setRegistrations([])
    }
    setRegSearchText('')
    setShowRegDropdown(false)
    setRegSuggestions([])
    setShowNewPersonForm(false)
    setNewPerson({ name: '', phone: '' })
    setRemoveRegId(null)
    setAttSearch('')
    setAttResults([])
    setAttShowDropdown(false)
    setShowNewAttForm(false)
    setNewAttName('')
    setNewAttPhone('')
    setAttPhoneDupResults([])
    setRemoveAttId(null)
    setAttError('')
  }, [selectedMeetup?.id])

  useEffect(() => {
    function handleClickOutside(e) {
      if (regDropdownRef.current && !regDropdownRef.current.contains(e.target)) {
        setShowRegDropdown(false)
        setShowNewPersonForm(false)
        setNewPerson({ name: '', phone: '' })
      }
      if (attDropdownRef.current && !attDropdownRef.current.contains(e.target)) {
        setAttShowDropdown(false)
        setShowNewAttForm(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function fetchMeetups() {
    const { data } = await supabase
      .from('meetups')
      .select('*, meetup_attendance(count)')
      .order('date', { ascending: false })
    setMeetups(data || [])
    setLoading(false)
  }

  async function fetchAttendance(meetupId) {
    setLoadingAttendance(true)
    const { data } = await supabase
      .from('meetup_attendance')
      .select('*')
      .eq('meetup_id', meetupId)
      .order('attended_at', { ascending: false })
    setAttendance(data || [])
    setLoadingAttendance(false)
  }

  async function fetchRegistrations(meetupId) {
    setLoadingRegistrations(true)
    const { data } = await supabase
      .from('meetup_registrations')
      .select('*')
      .eq('meetup_id', meetupId)
      .order('registered_at', { ascending: false })
    setRegistrations(data || [])
    setLoadingRegistrations(false)
  }

  async function searchLeads(text, currentRegs) {
    setRegSearchLoading(true)
    const regs = currentRegs ?? registrations
    const registeredIds = regs.filter(r => r.enquiry_id).map(r => r.enquiry_id)

    let query = supabase
      .from('enquiries')
      .select('id, name, phone, course_interested, status')
      .neq('status', 'lost')
      .order('created_at', { ascending: false })
      .limit(20)

    if (text.trim()) {
      query = query.or(`name.ilike.%${text}%,phone.ilike.%${text}%`)
    } else {
      const matchCourses = courseMatchFilter(selectedMeetup?.course)
      if (matchCourses) {
        query = query.in('course_interested', matchCourses)
      }
    }

    const { data } = await query
    const filtered = (data || []).filter(l => !registeredIds.includes(l.id))
    setRegSuggestions(filtered)
    setRegSearchLoading(false)
  }

  async function registerLead(lead) {
    if (addingReg) return
    setAddingReg(true)
    const { data, error } = await supabase
      .from('meetup_registrations')
      .insert({
        meetup_id: selectedMeetup.id,
        enquiry_id: lead.id,
        name: lead.name,
        phone: lead.phone || null,
      })
      .select()
      .single()
    if (!error && data) {
      setRegistrations(prev => [data, ...prev])
      setRegSearchText('')
      setShowRegDropdown(false)
      setRegSuggestions([])
    }
    setAddingReg(false)
  }

  async function handleAddNewPerson() {
    if (!newPerson.name.trim() || savingNewPerson) return
    setSavingNewPerson(true)

    const courseInterested = selectedMeetup?.course && selectedMeetup.course !== 'Other'
      ? selectedMeetup.course
      : null

    const { data: enquiry, error: eqErr } = await supabase
      .from('enquiries')
      .insert({
        name: newPerson.name.trim(),
        phone: newPerson.phone.trim() || null,
        source: 'Meetup',
        course_interested: courseInterested,
        status: 'new',
      })
      .select()
      .single()

    if (eqErr || !enquiry) {
      console.error('Error creating enquiry:', eqErr)
      setSavingNewPerson(false)
      return
    }

    const { data: reg, error: regErr } = await supabase
      .from('meetup_registrations')
      .insert({
        meetup_id: selectedMeetup.id,
        enquiry_id: enquiry.id,
        name: enquiry.name,
        phone: enquiry.phone || null,
      })
      .select()
      .single()

    if (!regErr && reg) {
      setRegistrations(prev => [reg, ...prev])
    }

    setNewPerson({ name: '', phone: '' })
    setShowNewPersonForm(false)
    setShowRegDropdown(false)
    setSavingNewPerson(false)
  }

  async function removeRegistration() {
    setRemovingReg(true)
    const { error } = await supabase
      .from('meetup_registrations')
      .delete()
      .eq('id', removeRegId)
    if (!error) {
      setRegistrations(prev => prev.filter(r => r.id !== removeRegId))
      setRemoveRegId(null)
    }
    setRemovingReg(false)
  }

  async function handleAddMeetup(e) {
    e.preventDefault()
    setSaving(true)
    setSaveError('')
    const payload = { ...newMeetup, xp_reward: Number(newMeetup.xp_reward) || 50 }
    if (!payload.location) delete payload.location
    if (!payload.description) delete payload.description
    if (!payload.course) delete payload.course
    const { data, error } = await supabase.from('meetups').insert(payload).select('*').single()
    if (error) {
      console.error('Create meetup error:', error)
      setSaveError(error.message)
      setSaving(false)
      return
    }
    setMeetups(prev => [{ ...data, meetup_attendance: [{ count: 0 }] }, ...prev])
    setShowAddModal(false)
    setNewMeetup({ ...EMPTY_MEETUP, event_code: generateEventCode() })
    setSaving(false)
  }

  function handleAttSearchChange(text) {
    setAttSearch(text)
    setAttShowDropdown(true)
    clearTimeout(attSearchTimer.current)
    if (!text.trim()) {
      setAttResults([])
      setAttSearchLoading(false)
      return
    }
    setAttSearchLoading(true)
    attSearchTimer.current = setTimeout(() => searchPeopleForAtt(text), 250)
  }

  async function searchPeopleForAtt(text) {
    const digits = text.replace(/\D/g, '')
    const filter = digits
      ? `full_name.ilike.%${text}%,phone_normalized.ilike.%${digits}%`
      : `full_name.ilike.%${text}%`
    const { data } = await supabase
      .from('people')
      .select('id, full_name, phone, phone_normalized, person_type, profile_id')
      .or(filter)
      .limit(8)
    setAttResults(data || [])
    setAttSearchLoading(false)
  }

  async function markAttendance(person) {
    if (attMarkingId) return false
    setAttMarkingId(person.id)
    setAttError('')
    try {
      const payload = {
        meetup_id: selectedMeetup.id,
        person_id: person.id,
        name: person.full_name,
        phone: person.phone || null,
        is_student: person.person_type === 'student' || !!person.profile_id,
        student_profile_id: person.profile_id || null,
      }
      const { data, error } = await supabase.from('meetup_attendance').insert(payload).select().single()
      if (error) {
        console.error('markAttendance insert error:', error)
        setAttError(error.code === '23505'
          ? 'Already marked for this meetup.'
          : `${error.message} (${error.code})`)
        return false
      }
      setAttendance(prev => [data, ...prev])
      setAttSearch('')
      setAttResults([])
      setAttShowDropdown(false)
      setShowNewAttForm(false)
      setMeetups(prev => prev.map(m =>
        m.id === selectedMeetup.id
          ? { ...m, meetup_attendance: [{ count: (m.meetup_attendance?.[0]?.count ?? 0) + 1 }] }
          : m
      ))
      return true
    } finally {
      setAttMarkingId(null)
    }
  }

  function handleAttPhoneChange(phone) {
    setNewAttPhone(phone)
    clearTimeout(attPhoneTimer.current)
    setAttPhoneDupResults([])
    if (!phone.trim()) { setAttPhoneDupLoading(false); return }
    setAttPhoneDupLoading(true)
    attPhoneTimer.current = setTimeout(async () => {
      const norm = normalizePhone(phone)
      if (!norm) { setAttPhoneDupLoading(false); return }
      const { data } = await supabase
        .from('people')
        .select('id, full_name, phone')
        .eq('phone_normalized', norm)
        .limit(5)
      setAttPhoneDupResults(data || [])
      setAttPhoneDupLoading(false)
    }, 300)
  }

  async function handleAddNewAtt() {
    if (!newAttName.trim() || savingNewAtt) return
    setSavingNewAtt(true)
    setAttError('')
    const { data: person, error: pErr } = await supabase
      .from('people')
      .insert({ full_name: newAttName.trim(), phone: newAttPhone.trim() || null })
      .select('id, full_name, phone, person_type, profile_id')
      .single()
    if (pErr) {
      console.error('handleAddNewAtt people insert error:', pErr)
      setAttError(`${pErr.message} (${pErr.code})`)
      setSavingNewAtt(false)
      return
    }
    const ok = await markAttendance(person)
    if (ok) {
      setNewAttName('')
      setNewAttPhone('')
      setAttPhoneDupResults([])
    }
    setSavingNewAtt(false)
  }

  async function removeAttendee() {
    setRemovingAtt(true)
    setAttError('')
    const { error } = await supabase.from('meetup_attendance').delete().eq('id', removeAttId)
    if (error) {
      console.error('removeAttendee error:', error)
      setAttError(`${error.message} (${error.code})`)
      setRemovingAtt(false)
      return
    }
    setAttendance(prev => prev.filter(a => a.id !== removeAttId))
    setRemoveAttId(null)
    setMeetups(prev => prev.map(m =>
      m.id === selectedMeetup.id
        ? { ...m, meetup_attendance: [{ count: Math.max(0, (m.meetup_attendance?.[0]?.count ?? 0) - 1) }] }
        : m
    ))
    setRemovingAtt(false)
  }

  async function handleDeleteMeetup() {
    setDeleting(true)
    const { error } = await supabase.from('meetups').delete().eq('id', selectedMeetup.id)
    if (!error) {
      setMeetups(prev => prev.filter(m => m.id !== selectedMeetup.id))
      setSelectedMeetup(null)
      setShowDeleteConfirm(false)
    }
    setDeleting(false)
  }

  function copyEventCode(code) {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function fetchAraikiLeads() {
    setAraikiLeadsLoading(true)
    const { data } = await supabase
      .from('enquiries')
      .select('id, name, phone, course_interested, language_preference, mode_preference, status')
      .neq('status', 'enrolled')
      .neq('status', 'lost')
      .order('created_at', { ascending: false })
    setAraikiLeads(data || [])
    setAraikiLeadsLoading(false)
  }

  function openAraikiLeads() {
    setShowAraikiLeads(true)
    fetchAraikiLeads()
  }

  function copyAllNumbers() {
    const leads = araikiCourseFilter
      ? araikiLeads.filter(l => l.course_interested === araikiCourseFilter)
      : araikiLeads
    const numbers = leads.filter(l => l.phone).map(l => l.phone).join(', ')
    navigator.clipboard.writeText(numbers)
    setCopiedNumbers(true)
    setTimeout(() => setCopiedNumbers(false), 2000)
  }

  const now = new Date()
  const upcoming = meetups.filter(m => new Date(m.date) >= now)
  const thisMonth = meetups.filter(m => {
    const d = new Date(m.date)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })
  const filteredAraikiLeads = araikiCourseFilter
    ? araikiLeads.filter(l => l.course_interested === araikiCourseFilter)
    : araikiLeads

  const markedPersonIds = new Set(attendance.filter(a => a.person_id).map(a => a.person_id))

  return (
    <div className="h-screen flex flex-col overflow-hidden">

      {/* Header */}
      <div className="px-6 py-4 bg-white border-b border-gray-200 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Meetups</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {loading ? '...' : `${meetups.length} total · ${upcoming.length} upcoming`}
          </p>
        </div>
        <button
          onClick={() => { setShowAddModal(true); setSaveError('') }}
          className="flex items-center gap-2 bg-[#1742b5] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#1338a0] transition-colors"
        >
          <Plus size={16} />
          Add Meetup
        </button>
      </div>

      {/* Stats */}
      <div className="px-6 pt-5 grid grid-cols-3 gap-4 flex-shrink-0">
        <StatCard label="Total Meetups" value={loading ? '—' : meetups.length} color="blue" />
        <StatCard label="This Month" value={loading ? '—' : thisMonth.length} color="gray" />
        <StatCard label="Upcoming" value={loading ? '—' : upcoming.length} color="green" />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {loading ? (
          <div className="py-16 text-center text-gray-400 text-sm">Loading…</div>
        ) : meetups.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-400 text-sm">
            No meetups yet. Create your first one.
          </div>
        ) : (
          <div className="space-y-3">
            {meetups.map(m => (
              <MeetupCard
                key={m.id}
                meetup={m}
                isUpcoming={new Date(m.date) >= now}
                onClick={() => setSelectedMeetup(m)}
                active={selectedMeetup?.id === m.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Add Meetup Modal ── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white rounded-t-2xl">
              <h2 className="font-semibold text-gray-900">Add Meetup</h2>
              <button onClick={() => { setShowAddModal(false); setNewMeetup({ ...EMPTY_MEETUP, event_code: generateEventCode() }) }}>
                <X size={18} className="text-gray-400 hover:text-gray-600" />
              </button>
            </div>
            <form onSubmit={handleAddMeetup} className="p-6 space-y-4">
              <Field label="Title *">
                <input required value={newMeetup.title}
                  onChange={e => setNewMeetup(p => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. Bi-weekly Yoga Meetup"
                  className={inputCls} />
              </Field>
              <Field label="Date & Time *">
                <input required type="datetime-local" value={newMeetup.date}
                  onChange={e => setNewMeetup(p => ({ ...p, date: e.target.value }))}
                  className={inputCls} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Type">
                  <select value={newMeetup.type}
                    onChange={e => setNewMeetup(p => ({ ...p, type: e.target.value }))}
                    className={selectCls}>
                    <option value="offline">Offline</option>
                    <option value="online">Online</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
                </Field>
                <Field label="Language">
                  <select value={newMeetup.language}
                    onChange={e => setNewMeetup(p => ({ ...p, language: e.target.value }))}
                    className={selectCls}>
                    <option value="">Not specified</option>
                    <option>Malayalam</option>
                    <option>English</option>
                    <option>Both</option>
                  </select>
                </Field>
              </div>
              <Field label="Course">
                <select value={newMeetup.course}
                  onChange={e => setNewMeetup(p => ({ ...p, course: e.target.value }))}
                  className={selectCls}>
                  <option value="">Not specified</option>
                  {MEETUP_COURSES.map(c => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label={newMeetup.type === 'online' ? 'Meeting Link / Platform' : newMeetup.type === 'hybrid' ? 'Venue / Meeting Link' : 'Venue / Location'}>
                <input value={newMeetup.location}
                  onChange={e => setNewMeetup(p => ({ ...p, location: e.target.value }))}
                  placeholder={newMeetup.type === 'online' ? 'e.g. Google Meet link' : newMeetup.type === 'hybrid' ? 'e.g. NYG Studio + Google Meet link' : 'e.g. NYG Studio, Kochi'}
                  className={inputCls} />
              </Field>
              <Field label="Description">
                <textarea value={newMeetup.description} rows={3}
                  onChange={e => setNewMeetup(p => ({ ...p, description: e.target.value }))}
                  placeholder="What's this meetup about?"
                  className={`${inputCls} resize-none`} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Event Code">
                  <div className="flex gap-2">
                    <input value={newMeetup.event_code}
                      onChange={e => setNewMeetup(p => ({ ...p, event_code: e.target.value.toUpperCase() }))}
                      placeholder="Auto-generated"
                      className={`${inputCls} font-mono tracking-wider`} />
                    <button type="button"
                      onClick={() => setNewMeetup(p => ({ ...p, event_code: generateEventCode() }))}
                      className="px-3 text-xs text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50 flex-shrink-0 whitespace-nowrap">
                      New
                    </button>
                  </div>
                </Field>
                <Field label="XP Reward">
                  <input type="number" value={newMeetup.xp_reward} min={0}
                    onChange={e => setNewMeetup(p => ({ ...p, xp_reward: e.target.value }))}
                    className={inputCls} />
                </Field>
              </div>
              {saveError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {saveError}
                </p>
              )}
              <div className="flex gap-3 pt-1">
                <button type="button"
                  onClick={() => { setShowAddModal(false); setSaveError(''); setNewMeetup({ ...EMPTY_MEETUP, event_code: generateEventCode() }) }}
                  className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-[#1742b5] text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-[#1338a0] transition-colors disabled:opacity-50">
                  {saving ? 'Creating…' : 'Create Meetup'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Meetup Detail Panel ── */}
      {selectedMeetup && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelectedMeetup(null)} />
          <div className="absolute right-0 top-0 h-full w-[440px] bg-white shadow-2xl flex flex-col">

            {/* Panel header */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between flex-shrink-0">
              <div className="flex-1 min-w-0 mr-3">
                <h2 className="font-semibold text-gray-900 leading-snug">{selectedMeetup.title}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(selectedMeetup.date)}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button onClick={() => setShowDeleteConfirm(true)}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 size={15} />
                </button>
                <button onClick={() => setSelectedMeetup(null)}
                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">

              {/* Details section */}
              <div className="p-5 space-y-3 border-b border-gray-100">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
                    selectedMeetup.type === 'online' ? 'bg-blue-50 text-blue-700' :
                    selectedMeetup.type === 'hybrid' ? 'bg-purple-50 text-purple-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    <Wifi size={11} />
                    {selectedMeetup.type === 'online' ? 'Online' : selectedMeetup.type === 'hybrid' ? 'Hybrid' : 'Offline'}
                  </span>
                  {selectedMeetup.language && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                      {selectedMeetup.language}
                    </span>
                  )}
                  {selectedMeetup.course && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-50 text-orange-600">
                      {selectedMeetup.course}
                    </span>
                  )}
                  <span className="text-xs text-gray-500">{formatDate(selectedMeetup.date)}</span>
                </div>

                {selectedMeetup.location && (
                  <div className="flex items-start gap-2.5">
                    <MapPin size={14} className="text-gray-400 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-gray-700">{selectedMeetup.location}</span>
                  </div>
                )}

                {selectedMeetup.description && (
                  <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 leading-relaxed">
                    {selectedMeetup.description}
                  </p>
                )}

                <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-2.5">
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Event Code</p>
                    <p className="font-mono font-bold text-gray-900 text-base mt-0.5 tracking-widest">
                      {selectedMeetup.event_code}
                    </p>
                  </div>
                  <button
                    onClick={() => copyEventCode(selectedMeetup.event_code)}
                    className="p-2 text-gray-400 hover:text-[#1742b5] hover:bg-blue-50 rounded-lg transition-colors">
                    {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <Star size={13} className="text-amber-500 fill-amber-400" />
                  <span className="text-sm text-gray-700 font-medium">{selectedMeetup.xp_reward} XP reward</span>
                </div>
                <button
                  onClick={openAraikiLeads}
                  className="w-full flex items-center justify-center gap-2 bg-[#1742b5]/5 text-[#1742b5] border border-[#1742b5]/20 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#1742b5]/10 transition-colors"
                >
                  <Users size={14} />
                  Araiki Leads
                </button>
              </div>

              {/* ── Registered section ── */}
              <div className="p-5 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Registered · {registrations.length}
                </p>

                {/* Search / Add registrant */}
                <div className="relative mb-4" ref={regDropdownRef}>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input
                      value={regSearchText}
                      onChange={e => {
                        setRegSearchText(e.target.value)
                        searchLeads(e.target.value, registrations)
                      }}
                      onFocus={() => {
                        setShowRegDropdown(true)
                        searchLeads(regSearchText, registrations)
                      }}
                      placeholder="Search leads to register…"
                      className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#1742b5] focus:border-transparent"
                    />
                  </div>

                  {showRegDropdown && (
                    <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                      {regSearchLoading ? (
                        <div className="py-4 text-center text-xs text-gray-400">Searching…</div>
                      ) : showNewPersonForm ? (
                        <div className="p-3 space-y-2">
                          <p className="text-xs font-semibold text-gray-500">New Person</p>
                          <input
                            value={newPerson.name}
                            onChange={e => setNewPerson(p => ({ ...p, name: e.target.value }))}
                            placeholder="Full name *"
                            autoFocus
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1742b5]"
                          />
                          <input
                            value={newPerson.phone}
                            onChange={e => setNewPerson(p => ({ ...p, phone: e.target.value }))}
                            placeholder="Phone (optional)"
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1742b5]"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => { setShowNewPersonForm(false); setNewPerson({ name: '', phone: '' }) }}
                              className="flex-1 border border-gray-200 text-gray-500 py-1.5 rounded-lg text-xs hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={handleAddNewPerson}
                              disabled={!newPerson.name.trim() || savingNewPerson}
                              className="flex-1 bg-[#1742b5] text-white py-1.5 rounded-lg text-xs font-semibold hover:bg-[#1338a0] disabled:opacity-50"
                            >
                              {savingNewPerson ? 'Saving…' : 'Register'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {regSuggestions.length > 0 && (
                            <div className="max-h-52 overflow-y-auto">
                              {regSuggestions.map(lead => (
                                <button
                                  key={lead.id}
                                  onClick={() => registerLead(lead)}
                                  className="w-full text-left px-3 py-2.5 hover:bg-gray-50 flex items-center gap-3 border-b border-gray-50 last:border-0"
                                >
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 truncate">{lead.name}</p>
                                    {lead.phone && <p className="text-xs text-gray-400">{lead.phone}</p>}
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-shrink-0">
                                    {lead.course_interested && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-600 font-medium truncate max-w-[80px]">
                                        {lead.course_interested}
                                      </span>
                                    )}
                                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize ${LEAD_STATUS_STYLE[lead.status] || 'bg-gray-100 text-gray-600'}`}>
                                      {lead.status}
                                    </span>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                          {regSuggestions.length === 0 && (
                            <div className="py-3 text-center text-xs text-gray-400">No matching leads</div>
                          )}
                          <button
                            onClick={() => setShowNewPersonForm(true)}
                            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-[#1742b5] hover:bg-blue-50 border-t border-gray-100"
                          >
                            <UserPlus size={14} />
                            Add as new person
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Registrations list */}
                {loadingRegistrations ? (
                  <div className="py-6 text-center text-xs text-gray-300">Loading…</div>
                ) : registrations.length === 0 ? (
                  <div className="py-6 text-center text-xs text-gray-300">No registrations yet</div>
                ) : (
                  <div className="space-y-2">
                    {registrations.map(r => (
                      <div key={r.id} className="bg-white border border-gray-100 rounded-xl px-3 py-2.5">
                        {removeRegId === r.id ? (
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-gray-600">Remove <strong>{r.name}</strong>?</p>
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => setRemoveRegId(null)}
                                className="text-xs text-gray-400 hover:text-gray-600"
                              >
                                No
                              </button>
                              <button
                                onClick={removeRegistration}
                                disabled={removingReg}
                                className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
                              >
                                {removingReg ? '…' : 'Yes, remove'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 bg-orange-50 text-orange-600">
                              {r.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{r.name}</p>
                              {r.phone && <p className="text-xs text-gray-400">{r.phone}</p>}
                            </div>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 capitalize ${
                              r.status === 'attended' ? 'bg-green-50 text-green-700' :
                              r.status === 'absent' ? 'bg-red-50 text-red-600' :
                              'bg-blue-50 text-blue-600'
                            }`}>
                              {r.status}
                            </span>
                            <button
                              onClick={() => setRemoveRegId(r.id)}
                              className="p-1 text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Attendance section */}
              <div className="p-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Attendance · {attendance.length}
                </p>

                {attError && (
                  <div className="mb-3 flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
                    <span className="text-xs text-red-600 flex-1">{attError}</span>
                    <button onClick={() => setAttError('')} className="text-red-400 hover:text-red-600 flex-shrink-0 mt-px">
                      <X size={13} />
                    </button>
                  </div>
                )}

                {/* Person search for attendance */}
                <div className="relative mb-4" ref={attDropdownRef}>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input
                      value={attSearch}
                      onChange={e => handleAttSearchChange(e.target.value)}
                      onFocus={() => setAttShowDropdown(true)}
                      placeholder="Search name or phone…"
                      className="w-full border border-gray-200 rounded-lg pl-8 pr-8 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#1742b5] focus:border-transparent"
                    />
                    {attSearch && (
                      <button onClick={() => { setAttSearch(''); setAttResults([]); setAttShowDropdown(false); setShowNewAttForm(false) }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {attShowDropdown && (attSearch.trim() || showNewAttForm) && (
                    <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                      {showNewAttForm ? (
                        <div className="p-3 space-y-2">
                          <p className="text-xs font-semibold text-gray-500">New person</p>
                          <input
                            value={newAttName}
                            onChange={e => setNewAttName(e.target.value)}
                            placeholder="Full name *"
                            autoFocus
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1742b5]"
                          />
                          <input
                            value={newAttPhone}
                            onChange={e => handleAttPhoneChange(e.target.value)}
                            placeholder="Phone (optional)"
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1742b5]"
                          />
                          {attPhoneDupLoading && <p className="text-xs text-gray-400">Checking…</p>}
                          {attPhoneDupResults.length > 0 && (
                            <div className="border border-amber-100 bg-amber-50 rounded-lg p-2 space-y-1">
                              <p className="text-xs text-amber-700 font-medium">Same phone already exists:</p>
                              {attPhoneDupResults.map(p => (
                                <button key={p.id}
                                  onClick={() => { markAttendance(p); setShowNewAttForm(false); setNewAttName(''); setNewAttPhone(''); setAttPhoneDupResults([]) }}
                                  className="w-full text-left px-2 py-1 text-sm text-[#1742b5] font-medium hover:bg-amber-100 rounded">
                                  Use {p.full_name}
                                </button>
                              ))}
                            </div>
                          )}
                          <div className="flex gap-2">
                            <button type="button"
                              onClick={() => { setShowNewAttForm(false); setNewAttName(''); setNewAttPhone(''); setAttPhoneDupResults([]) }}
                              className="flex-1 border border-gray-200 text-gray-500 py-1.5 rounded-lg text-xs hover:bg-gray-50">
                              Cancel
                            </button>
                            <button type="button" onClick={handleAddNewAtt} disabled={!newAttName.trim() || savingNewAtt}
                              className="flex-1 bg-[#1742b5] text-white py-1.5 rounded-lg text-xs font-semibold hover:bg-[#1338a0] disabled:opacity-50">
                              {savingNewAtt ? 'Adding…' : 'Add anyway'}
                            </button>
                          </div>
                        </div>
                      ) : attSearchLoading ? (
                        <div className="py-4 text-center text-xs text-gray-400">Searching…</div>
                      ) : (
                        <>
                          {attResults.length > 0 ? (
                            <div className="max-h-52 overflow-y-auto">
                              {attResults.map(p => {
                                const already = markedPersonIds.has(p.id)
                                const isStudent = p.person_type === 'student' || !!p.profile_id
                                return (
                                  <button key={p.id} onClick={() => !already && markAttendance(p)}
                                    disabled={already || !!attMarkingId}
                                    className={`w-full text-left px-3 py-2.5 flex items-center gap-3 border-b border-gray-50 last:border-0 ${already ? 'opacity-50 cursor-default' : 'hover:bg-gray-50'}`}>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-gray-900 truncate">{p.full_name}</p>
                                      {p.phone && <p className="text-xs text-gray-400">{p.phone}</p>}
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                      {already ? (
                                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-50 text-green-600">Marked</span>
                                      ) : isStudent ? (
                                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700">Student</span>
                                      ) : (
                                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">Contact</span>
                                      )}
                                      {attMarkingId === p.id && <span className="text-[10px] text-gray-400">Adding…</span>}
                                    </div>
                                  </button>
                                )
                              })}
                            </div>
                          ) : (
                            <div className="py-3 text-center text-xs text-gray-400">No results</div>
                          )}
                          <button onClick={() => setShowNewAttForm(true)}
                            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-[#1742b5] hover:bg-blue-50 border-t border-gray-100">
                            <UserPlus size={14} />
                            Not in the list? Add new person
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Attendance list */}
                {loadingAttendance ? (
                  <div className="py-8 text-center text-gray-300 text-xs">Loading…</div>
                ) : attendance.length === 0 ? (
                  <div className="py-8 text-center text-gray-300 text-xs">No attendees yet</div>
                ) : (
                  <div className="space-y-2">
                    {attendance.map(a => (
                      <div key={a.id} className="bg-white border border-gray-100 rounded-xl px-3 py-2.5">
                        {removeAttId === a.id ? (
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-gray-600">Remove <strong>{a.name}</strong>?</p>
                            <div className="flex items-center gap-3">
                              <button onClick={() => setRemoveAttId(null)} className="text-xs text-gray-400 hover:text-gray-600">No</button>
                              <button onClick={removeAttendee} disabled={removingAtt}
                                className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50">
                                {removingAtt ? '…' : 'Yes, remove'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${a.is_student ? 'bg-[#1742b5]/10 text-[#1742b5]' : 'bg-gray-100 text-gray-500'}`}>
                              {a.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              {a.person_id ? (
                                <Link to={`/people/${a.person_id}`} className="text-sm font-medium text-[#1742b5] hover:underline truncate block">{a.name}</Link>
                              ) : (
                                <p className="text-sm font-medium text-gray-900 truncate">{a.name}</p>
                              )}
                              {a.phone && <p className="text-xs text-gray-400">{a.phone}</p>}
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {a.person_id ? (
                                a.is_student ? (
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700">Student</span>
                                ) : (
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">Contact</span>
                                )
                              ) : (
                                <span className="text-[10px] text-gray-300 italic">Not linked</span>
                              )}
                              <button onClick={() => setRemoveAttId(a.id)}
                                className="p-1 text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-colors">
                                <X size={13} />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Araiki Leads Modal ── */}
      {showAraikiLeads && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-2xl flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="font-semibold text-gray-900">Araiki Leads</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {araikiLeadsLoading ? 'Loading…' : `${filteredAraikiLeads.length} active leads`}
                </p>
              </div>
              <button onClick={() => setShowAraikiLeads(false)}>
                <X size={18} className="text-gray-400 hover:text-gray-600" />
              </button>
            </div>

            <div className="px-6 py-3 border-b border-gray-100 flex-shrink-0">
              <select
                value={araikiCourseFilter}
                onChange={e => setAraikiCourseFilter(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#1742b5] text-gray-700"
              >
                <option value="">All Courses</option>
                {leadCourses.map(c => <option key={c.name}>{c.name}</option>)}
              </select>
            </div>

            <div className="flex-1 overflow-y-auto">
              {araikiLeadsLoading ? (
                <div className="py-16 text-center text-gray-400 text-sm">Loading…</div>
              ) : filteredAraikiLeads.length === 0 ? (
                <div className="py-16 text-center text-gray-400 text-sm">No active leads</div>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 py-3">Name</th>
                      <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 py-3">Phone</th>
                      <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 py-3">Language</th>
                      <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 py-3">Mode</th>
                      <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAraikiLeads.map(lead => (
                      <tr key={lead.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="px-5 py-3 text-sm font-medium text-gray-900">{lead.name}</td>
                        <td className="px-3 py-3 text-sm text-gray-600">{lead.phone || '—'}</td>
                        <td className="px-3 py-3">
                          {lead.language_preference
                            ? <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600">{lead.language_preference}</span>
                            : <span className="text-xs text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-3">
                          {lead.mode_preference
                            ? <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-teal-50 text-teal-600">{lead.mode_preference}</span>
                            : <span className="text-xs text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-3">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${LEAD_STATUS_STYLE[lead.status] || 'bg-gray-100 text-gray-600'}`}>
                            {lead.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0 flex items-center justify-between">
              <p className="text-xs text-gray-400">
                {filteredAraikiLeads.filter(l => l.phone).length} numbers available
              </p>
              <button
                onClick={copyAllNumbers}
                disabled={!filteredAraikiLeads.some(l => l.phone)}
                className="flex items-center gap-2 bg-[#1742b5] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#1338a0] transition-colors disabled:opacity-40"
              >
                {copiedNumbers ? <Check size={14} className="text-green-300" /> : <Copy size={14} />}
                {copiedNumbers ? 'Copied!' : 'Copy All Numbers'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation ── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="text-center mb-5">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Trash2 size={20} className="text-red-500" />
              </div>
              <h3 className="font-bold text-gray-900">Delete Meetup?</h3>
              <p className="text-sm text-gray-500 mt-2 leading-relaxed">
                Permanently delete <strong>{selectedMeetup?.title}</strong> and all attendance and registration records? This cannot be undone.
              </p>
            </div>
            <div className="space-y-2">
              <button onClick={handleDeleteMeetup} disabled={deleting}
                className="w-full bg-red-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50">
                {deleting ? 'Deleting…' : 'Yes, Delete Meetup'}
              </button>
              <button onClick={() => setShowDeleteConfirm(false)}
                className="w-full border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MeetupCard({ meetup, isUpcoming, onClick, active }) {
  const count = meetup.meetup_attendance?.[0]?.count ?? 0
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl border px-5 py-4 cursor-pointer hover:shadow-md transition-all flex items-center gap-4 ${active ? 'border-[#1742b5]/40 shadow-sm' : 'border-gray-200'}`}
    >
      <div className="flex-shrink-0 w-12 text-center">
        <p className="text-lg font-bold text-gray-900 leading-none">
          {new Date(meetup.date).getDate()}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          {new Date(meetup.date).toLocaleDateString('en-IN', { month: 'short' })}
        </p>
        <p className="text-xs text-gray-300">
          {new Date(meetup.date).getFullYear()}
        </p>
      </div>

      <div className="w-px h-10 bg-gray-100 flex-shrink-0" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="font-semibold text-gray-900 truncate">{meetup.title}</p>
          {isUpcoming && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 flex-shrink-0">
              Upcoming
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className={`inline-flex items-center gap-1 text-xs font-medium ${meetup.type === 'online' ? 'text-blue-600' : meetup.type === 'hybrid' ? 'text-purple-600' : 'text-gray-500'}`}>
            <Wifi size={10} />
            {meetup.type === 'online' ? 'Online' : meetup.type === 'hybrid' ? 'Hybrid' : 'Offline'}
          </span>
          {meetup.course && (
            <span className="text-xs text-orange-500 font-medium">{meetup.course}</span>
          )}
          {meetup.location && (
            <span className="text-xs text-gray-400 flex items-center gap-1 truncate max-w-[160px]">
              <MapPin size={10} className="flex-shrink-0" />
              {meetup.location}
            </span>
          )}
        </div>
      </div>

      <div className="flex-shrink-0 text-right space-y-1">
        <div className="flex items-center gap-1.5 justify-end">
          <Users size={12} className="text-gray-400" />
          <span className="text-sm font-semibold text-gray-700">{count}</span>
        </div>
        <p className="text-[10px] font-mono text-gray-300 tracking-wider">{meetup.event_code}</p>
      </div>
    </div>
  )
}

function StatCard({ label, value, color }) {
  const colorMap = { blue: 'text-[#1742b5]', green: 'text-green-600', gray: 'text-gray-700' }
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${colorMap[color]}`}>{value}</p>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  )
}

const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1742b5] focus:border-transparent transition-shadow'
const selectCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#1742b5] focus:border-transparent transition-shadow'
