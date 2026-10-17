import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Plus, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCourses } from '../hooks/useCourses'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

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
  location_or_link: '', status: 'active', notes: '',
}

const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1742b5]/20 focus:border-[#1742b5]'
const selectCls = inputCls

export default function Yoga() {
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

  const allCourses = useCourses({ batchesOnly: true, includeValue: form.course || undefined })
  const filterCourses = useCourses({ batchesOnly: true })

  useEffect(() => { fetchBatches() }, [])

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

  function set(k) { return e => setForm(f => ({ ...f, [k]: e.target.value })) }

  function toggleDay(d) {
    setForm(f => ({ ...f, days: f.days.includes(d) ? f.days.filter(x => x !== d) : [...f.days, d] }))
  }

  function n(v) { return v === '' || v == null ? null : v }

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

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Yoga Batches</h1>
          <p className="text-xs text-gray-400 mt-0.5">{loading ? '…' : `${visible.length} batch${visible.length !== 1 ? 'es' : ''}`}</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-[#1742b5] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#1338a0] transition-colors"
        >
          <Plus size={16} /> Add Batch
        </button>
      </div>

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
                <th className="text-right px-4 py-3">Fee/mo</th>
                <th className="text-right px-4 py-3">Active</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="px-4 py-3 w-12" />
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
                  <td className="px-4 py-3 text-right text-gray-800">{b.monthly_fee != null ? `₹${Number(b.monthly_fee).toLocaleString('en-IN')}` : '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-800">{memberCounts[b.id] || 0}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${STATUS_BADGE[b.status] || 'bg-gray-100 text-gray-500'}`}>{b.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => openEdit(b)} className="text-xs text-gray-400 hover:text-gray-700 underline">Edit</button>
                  </td>
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
    </div>
  )
}
