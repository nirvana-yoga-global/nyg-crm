import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Plus, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useCourses } from '../hooks/useCourses'
import RecordPaymentModal from '../components/RecordPaymentModal'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function localToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

function fmtDate(s) {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${parseInt(d, 10)} ${MONTHS[parseInt(m, 10) - 1]} ${y}`
}

function timeForInput(t) { return t ? t.slice(0, 5) : '' }

function fmtTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':')
  const hour = parseInt(h, 10)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  return `${hour % 12 || 12}:${m} ${ampm}`
}

function formatSchedule(batch) {
  const days = (batch.days || []).slice().sort((a, b) => a - b).map(d => DAY_NAMES[d]).join(', ')
  const time = batch.start_time && batch.end_time
    ? `${fmtTime(batch.start_time)} – ${fmtTime(batch.end_time)}`
    : ''
  return [days, time].filter(Boolean).join(' · ') || '—'
}

const STATUS_BADGE = {
  active: 'bg-green-100 text-green-700',
  paused: 'bg-yellow-100 text-yellow-700',
  closed: 'bg-gray-100 text-gray-500',
}

const EMPTY_BATCH = {
  name: '', course: '', teacher_name: '', mode: 'Offline',
  days: [], start_time: '', end_time: '', monthly_fee: '',
  location_or_link: '', status: 'active', notes: '', teacher_profile_id: '',
}

const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1742b5]/20 focus:border-[#1742b5]'
const selectCls = inputCls

export default function Yoga() {
  const { isFaculty } = useAuth()
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('active')
  const [filterCourse, setFilterCourse] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingBatch, setEditingBatch] = useState(null)
  const [form, setForm] = useState(EMPTY_BATCH)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [memberCounts, setMemberCounts] = useState({})
  const [facultyProfiles, setFacultyProfiles] = useState([])

  // Dues panel
  const [dues, setDues] = useState({ overdue: [], soon: [] })
  const [duesLoading, setDuesLoading] = useState(true)
  const [duesTab, setDuesTab] = useState('overdue')
  const [payDue, setPayDue] = useState(null)

  const allCourses = useCourses({ batchesOnly: true, includeValue: form.course || undefined })
  const filterCourses = useCourses({ batchesOnly: true })

  useEffect(() => {
    fetchBatches()
    if (!isFaculty) {
      loadDues()
      fetchFacultyProfiles()
    }
  }, [])

  async function fetchFacultyProfiles() {
    const { data } = await supabase.from('profiles').select('id, full_name').eq('role', 'faculty').order('full_name')
    setFacultyProfiles(data || [])
  }

  async function fetchBatches() {
    const { data } = await supabase.from('batches').select('*').order('created_at', { ascending: true })
    setBatches(data || [])
    setLoading(false)
    if (data?.length) {
      const { data: ms } = await supabase.from('batch_members').select('batch_id').eq('status', 'active')
      const counts = {}
      ;(ms || []).forEach(m => { counts[m.batch_id] = (counts[m.batch_id] || 0) + 1 })
      setMemberCounts(counts)
    }
  }

  async function loadDues() {
    setDuesLoading(true)
    const today = localToday()
    const in7 = addDays(today, 7)

    const { data: installs } = await supabase
      .from('installments')
      .select('id, due_date, amount, enrollment_id')
      .eq('kind', 'monthly')
      .eq('status', 'pending')
      .lte('due_date', in7)
      .order('due_date', { ascending: true })

    if (!installs?.length) { setDues({ overdue: [], soon: [] }); setDuesLoading(false); return }

    const enrolIds = [...new Set(installs.map(i => i.enrollment_id).filter(Boolean))]
    const { data: enrols } = await supabase
      .from('enrollments').select('id, person_id, batch_member_id').in('id', enrolIds)

    const memberIds = [...new Set((enrols || []).map(e => e.batch_member_id).filter(Boolean))]
    let bmMap = {}
    if (memberIds.length) {
      const { data: bms } = await supabase
        .from('batch_members')
        .select('id, batch_id, people(id, full_name), batches(id, name)')
        .in('id', memberIds)
      ;(bms || []).forEach(bm => { bmMap[bm.id] = bm })
    }

    const enrolMap = {}
    ;(enrols || []).forEach(e => { enrolMap[e.id] = e })

    const rows = installs.map(i => {
      const enr = enrolMap[i.enrollment_id]
      const bm = enr ? bmMap[enr.batch_member_id] : null
      return {
        ...i,
        person_id: bm?.people?.id || enr?.person_id,
        full_name: bm?.people?.full_name || '—',
        batch_id: bm?.batch_id,
        batch_name: bm?.batches?.name || '—',
        context: `${bm?.people?.full_name || '—'} — ${bm?.batches?.name || '—'}`,
      }
    })

    setDues({
      overdue: rows.filter(r => r.due_date < today),
      soon: rows.filter(r => r.due_date >= today),
    })
    setDuesLoading(false)
  }

  function set(k) { return e => setForm(f => ({ ...f, [k]: e.target.value })) }

  function toggleDay(d) {
    setForm(f => ({ ...f, days: f.days.includes(d) ? f.days.filter(x => x !== d) : [...f.days, d] }))
  }

  function n(v) { return v === '' || v == null ? null : v }

  function handleTeacherProfileChange(e) {
    const val = e.target.value
    const profile = facultyProfiles.find(p => p.id === val)
    setForm(f => ({
      ...f,
      teacher_profile_id: val,
      teacher_name: (!f.teacher_name.trim() && profile) ? profile.full_name : f.teacher_name,
    }))
  }

  function openAdd() {
    setEditingBatch(null); setForm(EMPTY_BATCH); setSaveError(''); setShowModal(true)
  }

  function openEdit(b) {
    setEditingBatch(b)
    setForm({
      name: b.name || '',
      course: b.course || '',
      teacher_name: b.teacher_name || '',
      mode: b.mode || 'Offline',
      days: b.days || [],
      start_time: timeForInput(b.start_time),
      end_time: timeForInput(b.end_time),
      monthly_fee: b.monthly_fee != null ? String(b.monthly_fee) : '',
      location_or_link: b.location_or_link || '',
      status: b.status || 'active',
      notes: b.notes || '',
      teacher_profile_id: b.teacher_profile_id || '',
    })
    setSaveError(''); setShowModal(true)
  }

  async function handleSave() {
    if (!form.name.trim()) { setSaveError('Name is required.'); return }
    setSaving(true); setSaveError('')
    const payload = {
      name: form.name.trim(),
      course: n(form.course),
      teacher_name: n(form.teacher_name.trim()),
      mode: form.mode,
      days: form.days.slice().sort((a, b) => a - b),
      start_time: n(form.start_time),
      end_time: n(form.end_time),
      monthly_fee: form.monthly_fee === '' ? 0 : Number(form.monthly_fee),
      location_or_link: n(form.location_or_link.trim()),
      status: form.status,
      notes: n(form.notes.trim()),
      teacher_profile_id: n(form.teacher_profile_id),
    }
    const query = editingBatch
      ? supabase.from('batches').update(payload).eq('id', editingBatch.id)
      : supabase.from('batches').insert(payload)
    const { error } = await query
    if (error) { setSaveError(error.message); setSaving(false); return }
    setSaving(false); setShowModal(false); fetchBatches()
  }

  const visible = batches.filter(b => {
    if (filterStatus && b.status !== filterStatus) return false
    if (filterCourse && b.course !== filterCourse) return false
    return true
  })

  const dueRows = duesTab === 'overdue' ? dues.overdue : dues.soon
  const dueTotal = dueRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0)

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Yoga Batches</h1>
          <p className="text-xs text-gray-400 mt-0.5">{loading ? '…' : `${visible.length} batch${visible.length !== 1 ? 'es' : ''}`}</p>
        </div>
        {!isFaculty && (
          <button
            onClick={openAdd}
            className="flex items-center gap-2 bg-[#1742b5] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#1338a0] transition-colors"
          >
            <Plus size={16} /> Add Batch
          </button>
        )}
      </div>

      {/* ── Dues panel ── */}
      {!isFaculty && <div className="bg-white rounded-xl border border-gray-200 mb-5">
        <div className="flex items-center gap-1 px-4 pt-4 pb-0 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800 mr-3">Dues</h2>
          {['overdue', 'soon'].map(t => (
            <button key={t} onClick={() => setDuesTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${duesTab === t ? 'border-[#1742b5] text-[#1742b5]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t === 'overdue' ? 'Overdue' : 'Due in 7 days'}
              {!duesLoading && (
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${t === 'overdue' ? (dues.overdue.length ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500') : (dues.soon.length ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500')}`}>
                  {t === 'overdue' ? dues.overdue.length : dues.soon.length}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="p-4">
          {duesLoading ? (
            <p className="text-sm text-gray-400 py-2">Loading…</p>
          ) : dueRows.length === 0 ? (
            <p className="text-sm text-gray-400 py-2">
              {duesTab === 'overdue' ? 'Nothing overdue.' : 'Nothing due this week.'}
            </p>
          ) : (
            <>
              <table className="w-full text-sm mb-3">
                <thead>
                  <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
                    <th className="text-left pb-2 pr-4">Student</th>
                    <th className="text-left pb-2 pr-4">Batch</th>
                    <th className="text-left pb-2 pr-4">Due date</th>
                    <th className="text-right pb-2 pr-4">Amount</th>
                    <th className="pb-2 w-32" />
                  </tr>
                </thead>
                <tbody>
                  {dueRows.map(r => (
                    <tr key={r.id} className="border-b border-gray-50 last:border-0">
                      <td className="py-2.5 pr-4">
                        {r.person_id ? (
                          <Link to={`/people/${r.person_id}`} className="font-medium text-gray-800 hover:text-[#1742b5]">
                            {r.full_name}
                          </Link>
                        ) : (
                          <span className="text-gray-800">{r.full_name}</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4">
                        {r.batch_id ? (
                          <Link to={`/yoga/${r.batch_id}`} className="text-gray-600 hover:text-[#1742b5]">{r.batch_name}</Link>
                        ) : (
                          <span className="text-gray-600">{r.batch_name}</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-gray-600 text-xs">{fmtDate(r.due_date)}</td>
                      <td className="py-2.5 pr-4 text-right text-gray-800">₹{Number(r.amount).toLocaleString('en-IN')}</td>
                      <td className="py-2.5 text-right">
                        <button onClick={() => setPayDue(r)}
                          className="text-xs font-medium text-[#1742b5] border border-[#1742b5]/30 px-2.5 py-1 rounded-lg hover:bg-[#1742b5]/5 transition-colors whitespace-nowrap">
                          Record payment
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-xs text-gray-500 text-right border-t border-gray-100 pt-2">
                Total: <span className="font-semibold text-gray-800">₹{dueTotal.toLocaleString('en-IN')}</span>
              </div>
            </>
          )}
        </div>
      </div>}

      <div className="flex gap-3 mb-5">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1742b5] text-gray-700">
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="closed">Closed</option>
        </select>
        <select value={filterCourse} onChange={e => setFilterCourse(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1742b5] text-gray-700">
          <option value="">All Courses</option>
          {filterCourses.map(c => <option key={c.name}>{c.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">No batches found.</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                <th className="text-left px-4 py-3">Batch</th>
                <th className="text-left px-4 py-3">Schedule</th>
                <th className="text-left px-4 py-3">Teacher</th>
                <th className="text-left px-4 py-3">Mode</th>
                {!isFaculty && <th className="text-right px-4 py-3">Fee/mo</th>}
                <th className="text-right px-4 py-3">Active</th>
                <th className="text-left px-4 py-3">Status</th>
                {!isFaculty && <th className="px-4 py-3 w-12" />}
              </tr>
            </thead>
            <tbody>
              {visible.map(b => (
                <tr key={b.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <Link to={`/yoga/${b.id}`} className="font-medium text-gray-900 hover:text-[#1742b5]">{b.name}</Link>
                    {b.course && (
                      <div className="mt-0.5">
                        <span className="text-xs bg-[#1742b5]/10 text-[#1742b5] px-1.5 py-0.5 rounded">{b.course}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{formatSchedule(b)}</td>
                  <td className="px-4 py-3 text-gray-600">{b.teacher_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{b.mode}</td>
                  {!isFaculty && <td className="px-4 py-3 text-right text-gray-800">{b.monthly_fee != null ? `₹${Number(b.monthly_fee).toLocaleString('en-IN')}` : '—'}</td>}
                  <td className="px-4 py-3 text-right text-gray-800">{memberCounts[b.id] || 0}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${STATUS_BADGE[b.status] || 'bg-gray-100 text-gray-500'}`}>{b.status}</span>
                  </td>
                  {!isFaculty && (
                    <td className="px-4 py-3">
                      <button onClick={() => openEdit(b)} className="text-xs text-gray-400 hover:text-gray-700 underline">Edit</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">{editingBatch ? 'Edit Batch' : 'Add Batch'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Batch Name *</label>
                  <input value={form.name} onChange={set('name')} placeholder="e.g. Morning Yoga 6AM" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Course</label>
                  <select value={form.course} onChange={set('course')} className={selectCls}>
                    <option value="">— Select —</option>
                    {allCourses.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Teacher</label>
                  <input value={form.teacher_name} onChange={set('teacher_name')} placeholder="Teacher name" className={inputCls} />
                </div>
                {!isFaculty && (
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Teacher Login</label>
                    {facultyProfiles.length === 0 ? (
                      <p className="text-xs text-gray-400 py-1.5">No faculty logins yet. Set a person's role to faculty in Supabase.</p>
                    ) : (
                      <select value={form.teacher_profile_id} onChange={handleTeacherProfileChange} className={selectCls}>
                        <option value="">None</option>
                        {facultyProfiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                      </select>
                    )}
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Mode</label>
                  <select value={form.mode} onChange={set('mode')} className={selectCls}>
                    <option>Offline</option>
                    <option>Online</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Status</label>
                  <select value={form.status} onChange={set('status')} className={selectCls}>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Days</label>
                <div className="flex gap-2 flex-wrap">
                  {DAY_NAMES.map((day, i) => (
                    <button key={i} type="button" onClick={() => toggleDay(i)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${form.days.includes(i) ? 'bg-[#1742b5] text-white border-[#1742b5]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
                    >{day}</button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Start Time</label>
                  <input type="time" value={form.start_time} onChange={set('start_time')} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">End Time</label>
                  <input type="time" value={form.end_time} onChange={set('end_time')} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Monthly Fee (₹)</label>
                  <input type="number" value={form.monthly_fee} onChange={set('monthly_fee')} placeholder="0" min="0" className={inputCls} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{form.mode === 'Online' ? 'Meeting Link' : 'Location'}</label>
                <input value={form.location_or_link} onChange={set('location_or_link')} placeholder={form.mode === 'Online' ? 'https://meet.google.com/…' : 'Class venue'} className={inputCls} />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Notes</label>
                <textarea value={form.notes} onChange={set('notes')} rows={2} className={`${inputCls} resize-none`} />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
              {saveError && <span className="text-sm text-red-600 mr-auto">{saveError}</span>}
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-5 py-2 text-sm font-semibold bg-[#1742b5] text-white rounded-lg hover:bg-[#1338a0] disabled:opacity-60 transition-colors">
                {saving ? 'Saving…' : (editingBatch ? 'Save Changes' : 'Add Batch')}
              </button>
            </div>
          </div>
        </div>
      )}

      {payDue && (
        <RecordPaymentModal
          due={payDue}
          onClose={() => setPayDue(null)}
          onSuccess={() => { setPayDue(null); loadDues() }}
        />
      )}
    </div>
  )
}
