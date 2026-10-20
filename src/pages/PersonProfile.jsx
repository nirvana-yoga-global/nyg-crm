import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'

function fmtDate(s) {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${parseInt(d, 10)} ${MONTHS[parseInt(m, 10) - 1]} ${y}`
}
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

const COMMUNITY_STATUS_LABELS = {
  '':           'Not set',
  not_invited:  'Not invited',
  invited:      'Invited',
  joined:       'Joined',
  declined:     'Declined',
  cant_reach:   "Can't reach",
}

const ARAIKI_FIELDS = [
  ['reg_no',                'Reg no'],
  ['enquiry_date',          'Enquiry date'],
  ['class_dates',           'Class dates'],
  ['first_degree_mode',     'First degree mode'],
  ['practice_status',       'Practice status'],
  ['event_confirmation',    'Event confirmation'],
  ['current_level',         'Current level'],
  ['follow_up_date',        'Follow up date'],
  ['second_degree_mode',    'Second degree mode'],
  ['second_degree_remarks', 'Second degree remarks'],
  ['found_in_tabs',         'Found in tabs'],
]

// ── WhatsApp groups card (self-contained) ─────────────────────────────────────
function WhatsAppGroupsCard({ personId }) {
  const [memberships, setMemberships] = useState([])
  const [allGroups, setAllGroups]     = useState([])
  const [cardLoading, setCardLoading] = useState(true)
  const [cardError, setCardError]     = useState('')
  const [confirmRemove, setConfirmRemove] = useState(null) // { entryId, groupName }
  const [removing, setRemoving]       = useState(false)
  const [addGroupId, setAddGroupId]   = useState('')
  const [addNameInGroup, setAddNameInGroup] = useState('')
  const [adding, setAdding]           = useState(false)
  const [addError, setAddError]       = useState('')

  async function load() {
    setCardLoading(true)
    setCardError('')
    const [membRes, grpRes] = await Promise.all([
      supabase
        .from('person_whatsapp_groups')
        .select('id, name_in_group, group_id, whatsapp_groups(id, name)')
        .eq('person_id', personId)
        .order('created_at'),
      supabase
        .from('whatsapp_groups')
        .select('id, name, sort_order')
        .eq('is_active', true)
        .order('sort_order'),
    ])
    if (membRes.error) { setCardError(membRes.error.message); setCardLoading(false); return }
    if (grpRes.error)  { setCardError(grpRes.error.message);  setCardLoading(false); return }
    setMemberships(membRes.data || [])
    setAllGroups(grpRes.data || [])
    setCardLoading(false)
  }

  useEffect(() => { load() }, [personId])

  const joinedGroupIds  = new Set(memberships.map(m => m.group_id))
  const availableGroups = allGroups.filter(g => !joinedGroupIds.has(g.id))

  async function handleRemove() {
    if (!confirmRemove) return
    setRemoving(true)
    const { error: err } = await supabase
      .from('person_whatsapp_groups')
      .delete()
      .eq('id', confirmRemove.entryId)
    if (err) { setCardError(err.message); setRemoving(false); return }
    setConfirmRemove(null)
    setRemoving(false)
    await load()
  }

  async function handleAdd() {
    if (!addGroupId) { setAddError('Select a group.'); return }
    setAdding(true)
    setAddError('')
    const { error: err } = await supabase.from('person_whatsapp_groups').insert({
      person_id:     personId,
      group_id:      addGroupId,
      name_in_group: addNameInGroup.trim() || null,
    })
    if (err) {
      setAddError(err.code === '23505' ? 'Already in this group.' : err.message)
      setAdding(false)
      return
    }
    setAddGroupId('')
    setAddNameInGroup('')
    setAdding(false)
    await load()
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-sm font-semibold text-gray-800 mb-4">WhatsApp groups</h3>

      {cardLoading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <>
          {cardError && <p className="text-sm text-red-600 mb-3">{cardError}</p>}

          {memberships.length === 0 ? (
            <p className="text-sm text-gray-400 mb-4">Not in any WhatsApp groups.</p>
          ) : (
            <ul className="space-y-2.5 mb-5">
              {memberships.map(entry => {
                const isConfirming = confirmRemove?.entryId === entry.id
                const grpName = entry.whatsapp_groups?.name || '—'
                return (
                  <li key={entry.id} className="flex items-center justify-between gap-3">
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className="text-sm text-gray-800">{grpName}</span>
                      {entry.name_in_group && (
                        <span className="text-xs text-gray-400 truncate">
                          saved as: {entry.name_in_group}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 text-xs">
                      {isConfirming ? (
                        <>
                          <span className="text-gray-600">Remove from {grpName}?</span>
                          <button
                            onClick={handleRemove}
                            disabled={removing}
                            className="font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                          >
                            {removing ? 'Removing…' : 'Yes, remove'}
                          </button>
                          <button
                            onClick={() => setConfirmRemove(null)}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setConfirmRemove({ entryId: entry.id, groupName: grpName })}
                          className="text-gray-400 hover:text-red-600 transition-colors"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {/* Add to group */}
          {availableGroups.length > 0 && (
            <div className="border-t border-gray-100 pt-4 space-y-2.5">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                Add to group
              </p>
              <select
                value={addGroupId}
                onChange={e => { setAddGroupId(e.target.value); setAddError('') }}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1742b5]/20 focus:border-[#1742b5]"
              >
                <option value="">Select a group…</option>
                {availableGroups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <input
                value={addNameInGroup}
                onChange={e => setAddNameInGroup(e.target.value)}
                placeholder="Name shown in the group (optional)"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1742b5]/20 focus:border-[#1742b5]"
              />
              <div className="flex items-center gap-3">
                <button
                  onClick={handleAdd}
                  disabled={adding || !addGroupId}
                  className="px-4 py-2 text-sm font-medium bg-[#1742b5] text-white rounded-lg hover:bg-[#1330a0] disabled:opacity-50 transition-colors"
                >
                  {adding ? 'Adding…' : 'Add'}
                </button>
                {addError && <span className="text-sm text-red-600">{addError}</span>}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Details tab ───────────────────────────────────────────────────────────────
function DetailsTab({ person, setPerson, programmes, whatsappGroups, araikiHistory, importDataError }) {
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

  const [communityStatus, setCommunityStatus]     = useState(person.community_status || '')
  const [communityInvitedOn, setCommunityInvitedOn] = useState(person.community_invited_on || '')
  const [communitySaving, setCommunitySaving]     = useState(false)
  const [communitySaved, setCommunitySaved]       = useState(false)
  const [communityError, setCommunityError]       = useState('')

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
        setDeleteError('This student has enrollments and cannot be deleted. Remove their enrollments first.')
      } else {
        setDeleteError(err.message)
      }
      setDeleting(false)
      return
    }
    navigate('/people')
  }

  async function saveCommunity(status, invitedOn) {
    setCommunitySaving(true)
    setCommunityError('')
    const { data, error: err } = await supabase
      .from('people')
      .update({
        community_status:     status || null,
        community_invited_on: invitedOn || null,
      })
      .eq('id', person.id)
      .select()
      .single()
    if (err) { setCommunityError(err.message); setCommunitySaving(false); return }
    setPerson(data)
    setCommunitySaved(true)
    setCommunitySaving(false)
    setTimeout(() => setCommunitySaved(false), 2000)
  }

  // Import-data fields shown only when non-empty
  const importFields = [
    person.register_no   != null && ['Register no',    String(person.register_no)],
    person.country                && ['Country',        person.country],
    person.language               && ['Language',       person.language],
    person.referred_by            && ['Referred by',    person.referred_by],
    person.contact_via            && ['Contact via',    person.contact_via],
    person.alternate_phone        && ['Alternate phone',person.alternate_phone],
    person.person_type === 'contact' && ['Person type', 'Contact'],
  ].filter(Boolean)

  const araikiRows = araikiHistory
    ? ARAIKI_FIELDS.filter(([key]) => araikiHistory[key])
    : []

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

      {/* Core editable fields */}
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

      {/* Import-data details card */}
      {importFields.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Details</h3>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
            {importFields.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</dt>
                <dd className="text-sm text-gray-700 mt-0.5">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Thapovanam Siddhashram community card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-800">Thapovanam Siddhashram community</h3>
          {communitySaving && <span className="text-xs text-gray-400">Saving…</span>}
          {communitySaved && <span className="text-xs text-green-600">Saved</span>}
          {communityError && <span className="text-xs text-red-600">{communityError}</span>}
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Status</label>
            <select
              value={communityStatus}
              onChange={e => {
                setCommunityStatus(e.target.value)
                saveCommunity(e.target.value, communityInvitedOn)
              }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1742b5]/20 focus:border-[#1742b5] bg-white"
            >
              {Object.entries(COMMUNITY_STATUS_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Invited on</label>
            <input
              type="date"
              value={communityInvitedOn}
              onChange={e => setCommunityInvitedOn(e.target.value)}
              onBlur={e => saveCommunity(communityStatus, e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1742b5]/20 focus:border-[#1742b5]"
            />
          </div>
        </div>
      </div>

      {/* Programmes card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-800 mb-4">Programmes</h3>
        {importDataError ? (
          <p className="text-sm text-red-600">{importDataError}</p>
        ) : programmes.length === 0 ? (
          <p className="text-sm text-gray-400">No programmes recorded.</p>
        ) : (
          <ul className="space-y-2">
            {programmes.map(p => (
              <li key={p.id} className="flex items-baseline gap-2">
                <span className="text-sm text-gray-800">{p.programme}</span>
                {p.source && (
                  <span className="text-xs text-gray-400">{p.source}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* WhatsApp groups card */}
      <WhatsAppGroupsCard personId={person.id} />

      {/* Araiki history card (only if row exists) */}
      {araikiRows.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Araiki history (from old records)</h3>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
            {araikiRows.map(([key, label]) => (
              <div key={key}>
                <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</dt>
                <dd className="text-sm text-gray-700 mt-0.5">{araikiHistory[key]}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Delete student */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-800 mb-1">Delete student</h3>
        <p className="text-sm text-gray-500 mb-4">
          Permanently removes this student and their notes, attunements, and registration form.
          Cannot be undone. Their Connect account is not affected.
        </p>
        {deleteError && <p className="text-sm text-red-600 mb-3">{deleteError}</p>}
        {!showDelete ? (
          <button
            onClick={() => setShowDelete(true)}
            className="px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
          >
            Delete student…
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

// ── Enrollments tab ───────────────────────────────────────────────────────────
const LEAD_STATUS_BADGE = {
  new:        'bg-gray-100 text-gray-600',
  contacted:  'bg-blue-100 text-blue-700',
  interested: 'bg-yellow-100 text-yellow-700',
  enrolled:   'bg-green-100 text-green-700',
  lost:       'bg-red-100 text-red-600',
}
const ENROL_STATUS_BADGE = {
  active:    'bg-green-100 text-green-700',
  completed: 'bg-blue-100 text-blue-700',
  paused:    'bg-yellow-100 text-yellow-700',
  cancelled: 'bg-red-100 text-red-600',
}

const BATCH_MEMBER_STATUS_BADGE = {
  active: 'bg-green-100 text-green-700',
  paused: 'bg-yellow-100 text-yellow-700',
  left:   'bg-gray-100 text-gray-500',
}

function localToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

function EnrollmentsTab({ person }) {
  const [leads, setLeads] = useState([])
  const [enrolments, setEnrolments] = useState([])
  const [batchMemberships, setBatchMemberships] = useState([])
  const [batchDues, setBatchDues] = useState({})
  const [leadsError, setLeadsError] = useState('')
  const [enrolmentsError, setEnrolmentsError] = useState('')
  const [batchError, setBatchError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [leadsRes, enrolRes, batchRes] = await Promise.all([
        supabase
          .from('enquiries')
          .select('id, name, course_interested, status, created_at')
          .eq('person_id', person.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('enrollments')
          .select('id, course, status, start_date, total_fee_agreed')
          .eq('person_id', person.id)
          .order('start_date', { ascending: false }),
        supabase
          .from('batch_members')
          .select('id, status, start_date, end_date, monthly_fee_override, batches(id, name, course, monthly_fee)')
          .eq('person_id', person.id)
          .order('start_date', { ascending: false }),
      ])
      if (leadsRes.error) setLeadsError(leadsRes.error.message)
      else setLeads(leadsRes.data || [])
      if (enrolRes.error) setEnrolmentsError(enrolRes.error.message)
      else setEnrolments(enrolRes.data || [])
      if (batchRes.error) { setBatchError(batchRes.error.message); setLoading(false); return }
      const bms = batchRes.data || []
      setBatchMemberships(bms)

      // Load monthly dues for each batch membership
      if (bms.length) {
        const memberIds = bms.map(m => m.id)
        const { data: memberEnrols } = await supabase
          .from('enrollments').select('id, batch_member_id').in('batch_member_id', memberIds)
        if (memberEnrols?.length) {
          const enrolIdMap = {}
          memberEnrols.forEach(e => { enrolIdMap[e.batch_member_id] = e.id })
          const enrolIds = memberEnrols.map(e => e.id)
          const { data: installs } = await supabase
            .from('installments')
            .select('id, enrollment_id, status, due_date, amount, paid_date, payment_method')
            .in('enrollment_id', enrolIds)
            .eq('kind', 'monthly')
            .order('due_date', { ascending: false })
          const installMap = {}
          ;(installs || []).forEach(i => {
            if (!installMap[i.enrollment_id]) installMap[i.enrollment_id] = []
            installMap[i.enrollment_id].push(i)
          })
          const result = {}
          bms.forEach(m => {
            const enrolId = enrolIdMap[m.id]
            const all = enrolId ? (installMap[enrolId] || []) : []
            result[m.id] = { pending: all.find(i => i.status === 'pending') || null, history: all.slice(0, 5) }
          })
          setBatchDues(result)
        }
      }

      setLoading(false)
    }
    load()
  }, [person.id])

  if (loading) return <div className="py-12 text-center text-gray-400 text-sm">Loading…</div>

  return (
    <div className="space-y-6">

      {/* ── Courses from leads ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-800 mb-4">Courses from leads</h3>
        {leadsError ? (
          <p className="text-sm text-red-600">{leadsError}</p>
        ) : leads.length === 0 ? (
          <p className="text-sm text-gray-400">No leads linked yet.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide pb-2 pr-4">Course</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide pb-2 pr-4">Status</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide pb-2">Lead date</th>
              </tr>
            </thead>
            <tbody>
              {leads.map(lead => (
                <tr key={lead.id} className="border-b border-gray-50 last:border-0">
                  <td className="py-3 pr-4 text-sm text-gray-800">{lead.course_interested || '—'}</td>
                  <td className="py-3 pr-4">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${LEAD_STATUS_BADGE[lead.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {lead.status}
                    </span>
                  </td>
                  <td className="py-3 text-sm text-gray-500">
                    {new Date(lead.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Enrolments ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-800 mb-4">Enrolments</h3>
        {enrolmentsError ? (
          <p className="text-sm text-red-600">{enrolmentsError}</p>
        ) : enrolments.length === 0 ? (
          <p className="text-sm text-gray-400">No enrolments yet.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide pb-2 pr-4">Course</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide pb-2 pr-4">Status</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide pb-2 pr-4">Start date</th>
                <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wide pb-2">Total fee</th>
              </tr>
            </thead>
            <tbody>
              {enrolments.map(enr => (
                <tr key={enr.id} className="border-b border-gray-50 last:border-0">
                  <td className="py-3 pr-4 text-sm text-gray-800">{enr.course || '—'}</td>
                  <td className="py-3 pr-4">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${ENROL_STATUS_BADGE[enr.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {enr.status || '—'}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-sm text-gray-500">
                    {enr.start_date ? fmtDate(enr.start_date) : '—'}
                  </td>
                  <td className="py-3 text-sm text-gray-800 text-right">
                    {enr.total_fee_agreed != null ? `₹${Number(enr.total_fee_agreed).toLocaleString('en-IN')}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Batches ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-800 mb-4">Batches</h3>
        {batchError ? (
          <p className="text-sm text-red-600">{batchError}</p>
        ) : batchMemberships.length === 0 ? (
          <p className="text-sm text-gray-400">Not in any batch.</p>
        ) : (
          <div className="space-y-4">
            {batchMemberships.map(m => {
              const fee = m.monthly_fee_override != null ? m.monthly_fee_override : m.batches?.monthly_fee
              const dues = batchDues[m.id]
              const pending = dues?.pending
              const history = dues?.history || []
              const today = localToday()
              const in7 = addDays(today, 7)
              const overdue = pending && pending.due_date < today
              const soon = pending && !overdue && pending.due_date <= in7
              return (
                <div key={m.id} className="border border-gray-100 rounded-xl p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <Link to={`/yoga/${m.batches?.id}`} className="text-sm font-semibold text-gray-800 hover:text-[#1742b5]">
                        {m.batches?.name || '—'}
                      </Link>
                      {m.batches?.course && <span className="ml-2 text-xs text-gray-400">{m.batches.course}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${BATCH_MEMBER_STATUS_BADGE[m.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {m.status}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-6 text-xs text-gray-500 mb-3">
                    <span>Start: <span className="text-gray-700">{m.start_date ? fmtDate(m.start_date) : '—'}</span></span>
                    {m.end_date && <span>End: <span className="text-gray-700">{fmtDate(m.end_date)}</span></span>}
                    <span>Fee: <span className="text-gray-700">
                      {fee != null ? `₹${Number(fee).toLocaleString('en-IN')}/mo` : '—'}
                      {m.monthly_fee_override != null && <span className="ml-1 text-amber-600">custom</span>}
                    </span></span>
                  </div>
                  {pending ? (
                    <div className="flex items-center gap-2 text-xs mb-3">
                      <span className="text-gray-500">Next due:</span>
                      <span className="font-medium text-gray-700">{fmtDate(pending.due_date)} · ₹{Number(pending.amount).toLocaleString('en-IN')}</span>
                      {overdue && <span className="bg-red-100 text-red-700 font-medium px-1.5 py-0.5 rounded-full">Overdue</span>}
                      {soon && <span className="bg-amber-100 text-amber-700 font-medium px-1.5 py-0.5 rounded-full">Due soon</span>}
                    </div>
                  ) : null}
                  {history.length > 0 && (
                    <div className="rounded-lg border border-gray-100 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-100 text-gray-400 font-semibold uppercase tracking-wide">
                            <th className="text-left px-3 py-1.5">Due date</th>
                            <th className="text-right px-3 py-1.5">Amount</th>
                            <th className="text-left px-3 py-1.5">Status</th>
                            <th className="text-left px-3 py-1.5">Paid</th>
                            <th className="text-left px-3 py-1.5">Method</th>
                          </tr>
                        </thead>
                        <tbody>
                          {history.map(inst => {
                            const today2 = localToday()
                            const isPaid = inst.status === 'paid'
                            const isOvd = inst.status === 'pending' && inst.due_date < today2
                            const statusCls = isPaid ? 'bg-green-100 text-green-700' : isOvd ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                            return (
                              <tr key={inst.id} className="border-b border-gray-100 last:border-0">
                                <td className="px-3 py-1.5 text-gray-700">{fmtDate(inst.due_date)}</td>
                                <td className="px-3 py-1.5 text-right text-gray-700">₹{Number(inst.amount).toLocaleString('en-IN')}</td>
                                <td className="px-3 py-1.5">
                                  <span className={`font-medium px-1.5 py-0.5 rounded-full capitalize ${statusCls}`}>
                                    {isOvd ? 'overdue' : inst.status}
                                  </span>
                                </td>
                                <td className="px-3 py-1.5 text-gray-500">{inst.paid_date ? fmtDate(inst.paid_date) : '—'}</td>
                                <td className="px-3 py-1.5 text-gray-500">{inst.payment_method || '—'}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
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

  const [programmes, setProgrammes] = useState([])
  const [whatsappGroups, setWhatsappGroups] = useState([])
  const [araikiHistory, setAraikiHistory] = useState(null)
  const [importDataError, setImportDataError] = useState('')
  const [markingReviewed, setMarkingReviewed] = useState(false)

  useEffect(() => {
    async function load() {
      const [personRes, progRes, waRes, araikiRes] = await Promise.all([
        supabase.from('people').select('*').eq('id', id).single(),
        supabase.from('person_programmes').select('id, programme, source').eq('person_id', id).order('programme'),
        supabase.from('person_whatsapp_groups').select('id, name_in_group, whatsapp_groups(name)').eq('person_id', id),
        supabase.from('araiki_history').select('*').eq('person_id', id).maybeSingle(),
      ])
      if (personRes.data) setPerson(personRes.data)
      const errors = [progRes, waRes, araikiRes]
        .filter(r => r.error && !r.error.message?.includes('0 rows'))
        .map(r => r.error.message)
      if (errors.length) setImportDataError(errors.join(' · '))
      if (!progRes.error) setProgrammes(progRes.data || [])
      if (!waRes.error) setWhatsappGroups(waRes.data || [])
      if (!araikiRes.error && araikiRes.data) setAraikiHistory(araikiRes.data)
      setLoading(false)
    }
    load()
  }, [id])

  async function markReviewed() {
    setMarkingReviewed(true)
    const { data } = await supabase
      .from('people')
      .update({ needs_review: false })
      .eq('id', id)
      .select()
      .single()
    if (data) setPerson(data)
    setMarkingReviewed(false)
  }

  if (loading) {
    return <div className="p-6 py-16 text-center text-gray-400 text-sm">Loading…</div>
  }
  if (!person) {
    return <div className="p-6 py-16 text-center text-gray-400 text-sm">Student not found.</div>
  }

  return (
    <div className="p-6">
      <button
        onClick={() => navigate('/people')}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-5 transition-colors"
      >
        <ChevronLeft size={16} />
        Back to Students
      </button>

      {/* Needs review banner */}
      {person.needs_review && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-amber-800">Needs review</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
              {person.review_type && (
                <span className="text-xs text-amber-700"><span className="font-medium">Type:</span> {person.review_type}</span>
              )}
              {person.review_pair && (
                <span className="text-xs text-amber-700"><span className="font-medium">Pair:</span> {person.review_pair}</span>
              )}
              {person.review_note && (
                <span className="text-xs text-amber-700"><span className="font-medium">Note:</span> {person.review_note}</span>
              )}
            </div>
          </div>
          <button
            onClick={markReviewed}
            disabled={markingReviewed}
            className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-amber-800 border border-amber-300 rounded-lg hover:bg-amber-100 disabled:opacity-50 transition-colors"
          >
            {markingReviewed ? 'Saving…' : 'Mark as reviewed'}
          </button>
        </div>
      )}

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
          <DetailsTab
            person={person}
            setPerson={setPerson}
            programmes={programmes}
            whatsappGroups={whatsappGroups}
            araikiHistory={araikiHistory}
            importDataError={importDataError}
          />
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
          <EnrollmentsTab person={person} />
        )}
      </div>
    </div>
  )
}
