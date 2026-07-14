import { useState, useEffect } from 'react'
import { Plus, X, Phone, Mail, MapPin, BookOpen, Tag, Calendar, Trash2, Check, Pencil } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const STAGES = ['new', 'contacted', 'interested', 'enrolled', 'lost']
const STAGE_LABELS = { new: 'New', contacted: 'Contacted', interested: 'Interested', enrolled: 'Enrolled', lost: 'Lost' }

const STAGE_STYLE = {
  new:        { dot: 'bg-gray-400',   badge: 'bg-gray-100 text-gray-600' },
  contacted:  { dot: 'bg-blue-500',   badge: 'bg-blue-100 text-blue-700' },
  interested: { dot: 'bg-amber-400',  badge: 'bg-amber-100 text-amber-700' },
  enrolled:   { dot: 'bg-green-500',  badge: 'bg-green-100 text-green-700' },
  lost:       { dot: 'bg-red-400',    badge: 'bg-red-100 text-red-600' },
}

const SOURCES = ['Walk-in', 'Social Media', 'Referral', 'Online', 'Workshop', 'Friend', 'Other']
const COURSES = [
  'Regular Yoga', 'Araiki Local', 'Araiki Foreigner',
  'Amasana / Inner Mastery Circle', 'TTC', 'Free Workshop',
]
const FOLLOW_UP_TYPES = ['Call', 'WhatsApp', 'Email', 'Visit', 'Other']
const LEAD_TYPES = ['Local', 'Foreigner', 'Online', 'Referral', 'Walk-in']
const NEXT_STEPS = ['Book Appointment', 'Send Information', 'Enrol Directly', 'Level 2 Ready', 'Level 3 Ready', 'Follow Up Later']
const LANGUAGE_PREFS = ['Malayalam', 'English', 'Either']
const MODE_PREFS = ['Online', 'Offline', 'Either']

const LEAD_TYPE_STYLE = {
  'Local':     'bg-gray-100 text-gray-600',
  'Foreigner': 'bg-purple-100 text-purple-700',
  'Online':    'bg-teal-100 text-teal-700',
  'Referral':  'bg-amber-100 text-amber-700',
  'Walk-in':   'bg-green-100 text-green-700',
}

const EMPTY_LEAD = { name: '', phone: '', email: '', location: '', source: '', course_interested: '', lead_type: '', next_step: '', follow_up_date: '', notes: '', language_preference: '', mode_preference: '' }

export default function Leads() {
  const { user } = useAuth()
  const [enquiries, setEnquiries] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedLead, setSelectedLead] = useState(null)
  const [notes, setNotes] = useState([])
  const [newNote, setNewNote] = useState({ note: '', follow_up_type: '' })
  const [savingNote, setSavingNote] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingLead, setEditingLead] = useState(null)
  const [newLead, setNewLead] = useState(EMPTY_LEAD)
  const [saving, setSaving] = useState(false)
  const [showEnrollConfirm, setShowEnrollConfirm] = useState(false)
  const [enrolling, setEnrolling] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => { fetchEnquiries() }, [])

  useEffect(() => {
    if (selectedLead) fetchNotes(selectedLead.id)
    else setNotes([])
  }, [selectedLead?.id])

  async function fetchEnquiries() {
    const { data } = await supabase
      .from('enquiries')
      .select('*')
      .order('created_at', { ascending: false })
    setEnquiries(data || [])
    setLoading(false)
  }

  async function fetchNotes(enquiryId) {
    const { data } = await supabase
      .from('lead_notes')
      .select('*')
      .eq('enquiry_id', enquiryId)
      .order('created_at', { ascending: false })
    setNotes(data || [])
  }

  function closeModal() {
    setShowAddModal(false)
    setEditingLead(null)
    setNewLead(EMPTY_LEAD)
    setSaveError('')
  }

  function openEditModal(lead) {
    setEditingLead(lead)
    setNewLead({
      name: lead.name || '',
      phone: lead.phone || '',
      email: lead.email || '',
      location: lead.location || '',
      source: lead.source || '',
      course_interested: lead.course_interested || '',
      lead_type: lead.lead_type || '',
      next_step: lead.next_step || '',
      follow_up_date: lead.follow_up_date || '',
      notes: lead.notes || '',
      language_preference: lead.language_preference || '',
      mode_preference: lead.mode_preference || '',
    })
    setSaveError('')
    setShowAddModal(true)
  }

  async function handleSaveLead(e) {
    e.preventDefault()
    setSaving(true)
    setSaveError('')
    const raw = {
      ...newLead,
      name: newLead.name.trim(),
      phone: newLead.phone.trim(),
    }
    // Strip empty strings — optional fields become null in the DB
    const payload = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== ''))

    if (editingLead) {
      const { data, error } = await supabase
        .from('enquiries')
        .update(payload)
        .eq('id', editingLead.id)
        .select()
        .single()
      if (error) { setSaveError(error.message); setSaving(false); return }
      setEnquiries(prev => prev.map(e => e.id === data.id ? data : e))
      if (selectedLead?.id === data.id) setSelectedLead(data)
    } else {
      const { data, error } = await supabase
        .from('enquiries')
        .insert({ ...payload, status: 'new' })
        .select()
        .single()
      if (error) { setSaveError(error.message); setSaving(false); return }
      setEnquiries(prev => [data, ...prev])
    }

    closeModal()
    setSaving(false)
  }

  async function applyStatusChange(status) {
    const { data, error } = await supabase
      .from('enquiries')
      .update({ status })
      .eq('id', selectedLead.id)
      .select()
      .single()
    if (!error && data) {
      setEnquiries(prev => prev.map(e => e.id === data.id ? data : e))
      setSelectedLead(data)
    }
  }

  function handleStatusChange(e) {
    const status = e.target.value
    if (status === 'enrolled' && selectedLead.status !== 'enrolled') {
      setShowEnrollConfirm(true)
    } else {
      applyStatusChange(status)
    }
  }

  async function handleFieldUpdate(field, value) {
    const { data, error } = await supabase
      .from('enquiries')
      .update({ [field]: value || null })
      .eq('id', selectedLead.id)
      .select()
      .single()
    if (!error && data) {
      setEnquiries(prev => prev.map(e => e.id === data.id ? data : e))
      setSelectedLead(data)
    }
  }

  async function handleConfirmEnroll() {
    setEnrolling(true)
    await applyStatusChange('enrolled')
    setShowEnrollConfirm(false)
    setEnrolling(false)
  }

  async function handleDeleteLead() {
    setDeleting(true)
    const { error } = await supabase
      .from('enquiries')
      .delete()
      .eq('id', selectedLead.id)
    if (!error) {
      setEnquiries(prev => prev.filter(e => e.id !== selectedLead.id))
      setSelectedLead(null)
      setShowDeleteConfirm(false)
    }
    setDeleting(false)
  }

  async function handleAddNote(e) {
    e.preventDefault()
    if (!newNote.note.trim()) return
    setSavingNote(true)
    const { data, error } = await supabase
      .from('lead_notes')
      .insert({ enquiry_id: selectedLead.id, admin_id: user.id, note: newNote.note, follow_up_type: newNote.follow_up_type || null })
      .select()
      .single()
    if (!error && data) {
      setNotes(prev => [data, ...prev])
      setNewNote({ note: '', follow_up_type: '' })
    }
    setSavingNote(false)
  }

  const grouped = STAGES.reduce((acc, s) => {
    acc[s] = enquiries.filter(e => e.status === s)
    return acc
  }, {})

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Page header */}
      <div className="px-6 py-4 bg-white border-b border-gray-200 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Leads Pipeline</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {loading ? '...' : `${enquiries.length} total enquiries`}
          </p>
        </div>
        <button
          onClick={() => { setEditingLead(null); setNewLead(EMPTY_LEAD); setSaveError(''); setShowAddModal(true) }}
          className="flex items-center gap-2 bg-[#1742b5] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#1338a0] transition-colors"
        >
          <Plus size={16} />
          Add New Lead
        </button>
      </div>

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto p-4 pb-4">
        <div className="flex gap-3 h-full min-w-max">
          {STAGES.map(stage => {
            const leads = grouped[stage] || []
            const { dot } = STAGE_STYLE[stage]
            return (
              <div key={stage} className="w-[260px] flex-shrink-0 flex flex-col bg-gray-100/80 rounded-xl border border-gray-200">
                {/* Column header */}
                <div className="px-3 py-3 flex items-center justify-between bg-white rounded-t-xl border-b border-gray-200 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${dot}`} />
                    <span className="font-semibold text-gray-800 text-sm">{STAGE_LABELS[stage]}</span>
                  </div>
                  <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                    {leads.length}
                  </span>
                </div>
                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {leads.map(lead => (
                    <LeadCard key={lead.id} lead={lead} onClick={() => setSelectedLead(lead)} />
                  ))}
                  {!loading && leads.length === 0 && (
                    <p className="text-center text-gray-300 text-xs py-6">No leads</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Add Lead Modal ── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white rounded-t-2xl">
              <h2 className="font-semibold text-gray-900">{editingLead ? 'Edit Lead' : 'Add New Lead'}</h2>
              <button onClick={closeModal}>
                <X size={18} className="text-gray-400 hover:text-gray-600" />
              </button>
            </div>
            <form onSubmit={handleSaveLead} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Name *">
                  <input required value={newLead.name}
                    onChange={e => setNewLead(p => ({ ...p, name: e.target.value }))}
                    placeholder="Full name" className={inputCls} />
                </Field>
                <Field label="Phone *">
                  <input required value={newLead.phone}
                    onChange={e => setNewLead(p => ({ ...p, phone: e.target.value }))}
                    placeholder="+91 98765 43210" className={inputCls} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Email">
                  <input type="email" value={newLead.email}
                    onChange={e => setNewLead(p => ({ ...p, email: e.target.value }))}
                    placeholder="email@example.com" className={inputCls} />
                </Field>
                <Field label="Location">
                  <input value={newLead.location}
                    onChange={e => setNewLead(p => ({ ...p, location: e.target.value }))}
                    placeholder="City / Area" className={inputCls} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Source">
                  <select value={newLead.source}
                    onChange={e => setNewLead(p => ({ ...p, source: e.target.value }))}
                    className={selectCls}>
                    <option value="">Select source</option>
                    {SOURCES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Course Interested">
                  <select value={newLead.course_interested}
                    onChange={e => setNewLead(p => ({ ...p, course_interested: e.target.value }))}
                    className={selectCls}>
                    <option value="">Select course</option>
                    {COURSES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Lead Type">
                  <select value={newLead.lead_type}
                    onChange={e => setNewLead(p => ({ ...p, lead_type: e.target.value }))}
                    className={selectCls}>
                    <option value="">Select type</option>
                    {LEAD_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Next Step">
                  <select value={newLead.next_step}
                    onChange={e => setNewLead(p => ({ ...p, next_step: e.target.value }))}
                    className={selectCls}>
                    <option value="">Select next step</option>
                    {NEXT_STEPS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Language Preference">
                  <select value={newLead.language_preference}
                    onChange={e => setNewLead(p => ({ ...p, language_preference: e.target.value }))}
                    className={selectCls}>
                    <option value="">Select language</option>
                    {LANGUAGE_PREFS.map(l => <option key={l}>{l}</option>)}
                  </select>
                </Field>
                <Field label="Mode Preference">
                  <select value={newLead.mode_preference}
                    onChange={e => setNewLead(p => ({ ...p, mode_preference: e.target.value }))}
                    className={selectCls}>
                    <option value="">Select mode</option>
                    {MODE_PREFS.map(m => <option key={m}>{m}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Follow-up Date">
                <input type="date" value={newLead.follow_up_date}
                  onChange={e => setNewLead(p => ({ ...p, follow_up_date: e.target.value }))}
                  className={inputCls} />
              </Field>
              <Field label="Notes">
                <textarea value={newLead.notes} rows={3}
                  onChange={e => setNewLead(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Any initial notes..." className={`${inputCls} resize-none`} />
              </Field>
              {saveError && (
                <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2.5 text-xs text-red-700 leading-relaxed">
                  {saveError}
                </div>
              )}
              <div className="flex gap-3 pt-1">
                <button type="button"
                  onClick={closeModal}
                  className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-[#1742b5] text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-[#1338a0] transition-colors disabled:opacity-50">
                  {saving ? (editingLead ? 'Saving...' : 'Adding...') : (editingLead ? 'Save Changes' : 'Add Lead')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Lead Side Panel ── */}
      {selectedLead && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelectedLead(null)} />
          <div className="absolute right-0 top-0 h-full w-[420px] bg-white shadow-2xl flex flex-col">
            {/* Panel header */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between flex-shrink-0 bg-white">
              <div>
                <h2 className="font-semibold text-gray-900">{selectedLead.name}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{selectedLead.phone}</p>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <button
                  onClick={() => openEditModal(selectedLead)}
                  className="p-1.5 text-gray-400 hover:text-[#1742b5] hover:bg-blue-50 rounded-lg transition-colors"
                  title="Edit lead"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete lead"
                >
                  <Trash2 size={16} />
                </button>
                <button onClick={() => setSelectedLead(null)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                  <X size={18} />
                </button>
              </div>
            </div>

            {selectedLead.do_not_contact && (
              <div className="flex items-center gap-2.5 px-5 py-3 bg-red-50 border-b border-red-100 flex-shrink-0">
                <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                <p className="text-sm font-semibold text-red-700">Do Not Contact</p>
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              {/* Details */}
              <div className="p-5 space-y-2.5 border-b border-gray-100">
                <Detail icon={Phone} value={selectedLead.phone} />
                <Detail icon={Mail} value={selectedLead.email} />
                <Detail icon={MapPin} value={selectedLead.location} />
                <Detail icon={BookOpen} value={selectedLead.course_interested} />
                <Detail icon={Tag} value={selectedLead.source} />
                {selectedLead.follow_up_date && (
                  <Detail icon={Calendar} value={
                    new Date(selectedLead.follow_up_date).toLocaleDateString('en-IN', {
                      day: 'numeric', month: 'long', year: 'numeric',
                    })
                  } />
                )}
                {selectedLead.notes && (
                  <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600 mt-2 leading-relaxed">
                    {selectedLead.notes}
                  </div>
                )}
              </div>

              {/* Lead Type & Next Step */}
              <div className="p-5 border-b border-gray-100 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Lead Type</p>
                  <select
                    value={selectedLead.lead_type || ''}
                    onChange={e => handleFieldUpdate('lead_type', e.target.value)}
                    className={selectCls}
                  >
                    <option value="">Not set</option>
                    {LEAD_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Next Step</p>
                  <select
                    value={selectedLead.next_step || ''}
                    onChange={e => handleFieldUpdate('next_step', e.target.value)}
                    className={selectCls}
                  >
                    <option value="">Not set</option>
                    {NEXT_STEPS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Language</p>
                    <select
                      value={selectedLead.language_preference || ''}
                      onChange={e => handleFieldUpdate('language_preference', e.target.value)}
                      className={selectCls}
                    >
                      <option value="">Not set</option>
                      {LANGUAGE_PREFS.map(l => <option key={l}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Mode</p>
                    <select
                      value={selectedLead.mode_preference || ''}
                      onChange={e => handleFieldUpdate('mode_preference', e.target.value)}
                      className={selectCls}
                    >
                      <option value="">Not set</option>
                      {MODE_PREFS.map(m => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Flags */}
              <div className="p-5 border-b border-gray-100 space-y-0.5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Flags</p>
                {[
                  { field: 'no_followup',     label: 'No Follow-up',    activeColor: 'bg-amber-500' },
                  { field: 'do_not_contact',  label: 'Do Not Contact',  activeColor: 'bg-red-500' },
                ].map(({ field, label, activeColor }) => (
                  <button
                    key={field}
                    onClick={() => handleFieldUpdate(field, !selectedLead[field])}
                    className="flex items-center justify-between w-full py-2 px-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
                  >
                    <span className="text-sm text-gray-700">{label}</span>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${selectedLead[field] ? activeColor : 'bg-gray-200'}`}>
                      {selectedLead[field] && <Check size={11} className="text-white" strokeWidth={3} />}
                    </div>
                  </button>
                ))}
              </div>

              {/* Stage */}
              <div className="p-5 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Pipeline Stage</p>
                <select
                  value={selectedLead.status}
                  onChange={handleStatusChange}
                  className={`${selectCls} font-medium`}
                >
                  {STAGES.map(s => (
                    <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div className="p-5 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Activity Notes</p>

                {/* Add note */}
                <form onSubmit={handleAddNote} className="bg-gray-50 rounded-xl p-3 mb-4 space-y-2">
                  <select
                    value={newNote.follow_up_type}
                    onChange={e => setNewNote(p => ({ ...p, follow_up_type: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#1742b5]"
                  >
                    <option value="">Follow-up type (optional)</option>
                    {FOLLOW_UP_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                  <textarea
                    value={newNote.note}
                    onChange={e => setNewNote(p => ({ ...p, note: e.target.value }))}
                    placeholder="Add a note..."
                    rows={2}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#1742b5] resize-none"
                  />
                  <button type="submit" disabled={savingNote}
                    className="w-full bg-[#1742b5] text-white py-1.5 rounded-lg text-xs font-semibold hover:bg-[#1338a0] transition-colors disabled:opacity-50">
                    {savingNote ? 'Saving...' : 'Add Note'}
                  </button>
                </form>

                {/* Notes list */}
                <div className="space-y-3">
                  {notes.map(note => (
                    <div key={note.id} className="border border-gray-100 rounded-xl p-3">
                      {note.follow_up_type && (
                        <span className="text-xs font-semibold text-[#1742b5] bg-blue-50 px-2 py-0.5 rounded-full">
                          {note.follow_up_type}
                        </span>
                      )}
                      <p className="text-sm text-gray-700 mt-1.5 leading-relaxed">{note.note}</p>
                      <p className="text-xs text-gray-300 mt-1.5">
                        {new Date(note.created_at).toLocaleString('en-IN', {
                          day: 'numeric', month: 'short', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                    </div>
                  ))}
                  {notes.length === 0 && (
                    <p className="text-xs text-gray-300 text-center py-4">No notes yet</p>
                  )}
                </div>
              </div>

              {/* Communication Channels */}
              <div className="p-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Communication Channels</p>
                <div className="space-y-1">
                  {[
                    { field: 'in_kerala_whatsapp', label: 'Added to Kerala WhatsApp group' },
                    { field: 'in_nyg_whatsapp',    label: 'Added to NYG Global WhatsApp group' },
                    { field: 'in_newsletter',       label: 'Added to Newsletter (Kit)' },
                  ].map(({ field, label }) => (
                    <button
                      key={field}
                      onClick={() => handleFieldUpdate(field, !selectedLead[field])}
                      className="flex items-center justify-between w-full py-2.5 px-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
                    >
                      <span className="text-sm text-gray-700">{label}</span>
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${selectedLead[field] ? 'bg-green-500' : 'bg-gray-200'}`}>
                        {selectedLead[field] && <Check size={11} className="text-white" strokeWidth={3} />}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Enroll Confirmation ── */}
      {showEnrollConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="text-center mb-5">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-green-600 text-xl font-bold">✓</span>
              </div>
              <h3 className="font-bold text-gray-900">Create Student Enrollment?</h3>
              <p className="text-sm text-gray-500 mt-2 leading-relaxed">
                Mark <strong>{selectedLead?.name}</strong> as Enrolled? You can create their full course
                enrollment record in the <span className="text-[#1742b5] font-medium">Students</span> section.
              </p>
            </div>
            <div className="space-y-2">
              <button
                onClick={handleConfirmEnroll}
                disabled={enrolling}
                className="w-full bg-green-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {enrolling ? 'Updating...' : 'Yes, Mark as Enrolled'}
              </button>
              <button
                onClick={() => setShowEnrollConfirm(false)}
                className="w-full border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
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
              <h3 className="font-bold text-gray-900">Delete Lead?</h3>
              <p className="text-sm text-gray-500 mt-2 leading-relaxed">
                Permanently delete <strong>{selectedLead?.name}</strong>? All notes for this lead will also be removed. This cannot be undone.
              </p>
            </div>
            <div className="space-y-2">
              <button
                onClick={handleDeleteLead}
                disabled={deleting}
                className="w-full bg-red-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Yes, Delete Lead'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="w-full border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function LeadCard({ lead, onClick }) {
  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl border border-gray-200 p-3.5 cursor-pointer hover:shadow-md hover:border-[#1742b5]/20 transition-all"
    >
      <div className="flex items-start justify-between mb-2">
        <p className="font-semibold text-gray-900 text-sm leading-tight">{lead.name}</p>
        {lead.lead_type && (
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ml-1.5 ${LEAD_TYPE_STYLE[lead.lead_type] || 'bg-gray-100 text-gray-600'}`}>
            {lead.lead_type}
          </span>
        )}
      </div>
      {(lead.do_not_contact || lead.no_followup) && (
        <div className="flex items-center gap-1 mb-2 flex-wrap">
          {lead.do_not_contact && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">
              Do Not Contact
            </span>
          )}
          {lead.no_followup && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
              No Follow-up
            </span>
          )}
        </div>
      )}
      {lead.phone && (
        <p className="text-xs text-gray-500 flex items-center gap-1.5 mb-1">
          <Phone size={11} className="text-gray-400" /> {lead.phone}
        </p>
      )}
      {lead.course_interested && (
        <p className="text-xs text-gray-500 flex items-center gap-1.5 mb-1 truncate">
          <BookOpen size={11} className="text-gray-400 flex-shrink-0" />
          <span className="truncate">{lead.course_interested}</span>
        </p>
      )}
      {lead.source && (
        <p className="text-xs text-gray-400 flex items-center gap-1.5">
          <Tag size={11} className="text-gray-300" /> {lead.source}
        </p>
      )}
      {(lead.language_preference || lead.mode_preference) && (
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {lead.language_preference && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600">
              {lead.language_preference}
            </span>
          )}
          {lead.mode_preference && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-teal-50 text-teal-600">
              {lead.mode_preference}
            </span>
          )}
        </div>
      )}
      {lead.follow_up_date && (
        <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-1.5">
          <Calendar size={11} className="text-gray-300" />
          <span className="text-xs text-gray-400">
            {new Date(lead.follow_up_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </span>
        </div>
      )}
    </div>
  )
}

function Detail({ icon: Icon, value }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-2.5">
      <Icon size={14} className="text-gray-400 mt-0.5 flex-shrink-0" />
      <span className="text-sm text-gray-700">{value}</span>
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
