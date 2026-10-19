import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ChevronLeft, X, Search, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useCourses } from '../hooks/useCourses'
import RecordPaymentModal from '../components/RecordPaymentModal'

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function fmtTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':')
  const hour = parseInt(h, 10)
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
}

function timeForInput(t) { return t ? t.slice(0, 5) : '' }

function formatSchedule(batch) {
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const days = (batch.days || []).slice().sort((a, b) => a - b).map(d => DAY_NAMES[d]).join(', ')
  const time = batch.start_time && batch.end_time
    ? `${fmtTime(batch.start_time)} – ${fmtTime(batch.end_time)}`
    : ''
  return [days, time].filter(Boolean).join(' · ') || '—'
}

function n(v) { return v === '' || v == null ? null : v }

const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1742b5]/20 focus:border-[#1742b5]'

const MEMBER_STATUS_BADGE = {
  active: 'bg-green-100 text-green-700',
  paused: 'bg-yellow-100 text-yellow-700',
  left:   'bg-gray-100 text-gray-500',
}

// ─── Students Tab ─────────────────────────────────────────────────────────────

function StudentsTab({ batch, members, setMembers, memberDues, refreshDues, isFaculty }) {
  const today = localToday()
  const in7 = addDays(today, 7)

  const [addSearch, setAddSearch] = useState('')
  const [addResults, setAddResults] = useState([])
  const [addSearching, setAddSearching] = useState(false)
  const [selectedPerson, setSelectedPerson] = useState(null)
  const [addForm, setAddForm] = useState({ start_date: localToday(), monthly_fee_override: '' })
  const [addSaving, setAddSaving] = useState(false)
  const [addErr, setAddErr] = useState('')
  const [duplicateMsg, setDuplicateMsg] = useState('')
  const [editMember, setEditMember] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [editSaving, setEditSaving] = useState(false)
  const [editErr, setEditErr] = useState('')
  const [payDue, setPayDue] = useState(null)
  const [expanded, setExpanded] = useState(new Set())
  const searchRef = useRef(null)
  const debounceRef = useRef(null)

  function handleSearchChange(val) {
    setAddSearch(val)
    setSelectedPerson(null)
    setDuplicateMsg('')
    clearTimeout(debounceRef.current)
    if (val.trim().length < 2) { setAddResults([]); return }
    debounceRef.current = setTimeout(async () => {
      setAddSearching(true)
      const { data } = await supabase.from('people')
        .select('id, full_name, phone')
        .or(`full_name.ilike.%${val.trim()}%,phone.ilike.%${val.trim()}%`)
        .limit(8)
      setAddResults(data || [])
      setAddSearching(false)
    }, 300)
  }

  function selectPerson(person) {
    const existing = members.find(m => m.person_id === person.id && (m.status === 'active' || m.status === 'paused'))
    if (existing) {
      setDuplicateMsg(`${person.full_name} is already ${existing.status} in this batch.`)
      setAddResults([])
      setAddSearch(person.full_name)
      return
    }
    setSelectedPerson(person)
    setAddSearch(person.full_name)
    setAddResults([])
    setAddErr('')
  }

  async function handleAddMember() {
    if (!selectedPerson) { setAddErr('Select a student first.'); return }
    if (!addForm.start_date) { setAddErr('Start date is required.'); return }
    setAddSaving(true); setAddErr('')
    const { data, error } = await supabase.from('batch_members').insert({
      batch_id: batch.id,
      person_id: selectedPerson.id,
      start_date: addForm.start_date,
      monthly_fee_override: addForm.monthly_fee_override === '' ? null : Number(addForm.monthly_fee_override),
      status: 'active',
    }).select('*, people(id, full_name, phone)').single()
    if (error) {
      if (error.code === '23505') setAddErr(`${selectedPerson.full_name} is already active or paused in this batch.`)
      else setAddErr(error.message)
      setAddSaving(false); return
    }
    const newMembers = [...members, data]
    setMembers(newMembers)
    const { error: rpcErr } = await supabase.rpc('create_batch_enrollment', { p_batch_member_id: data.id })
    if (rpcErr) {
      setAddErr(`Student added but has no due yet: ${rpcErr.message}`)
    }
    await refreshDues(newMembers)
    setSelectedPerson(null)
    setAddSearch('')
    setAddForm({ start_date: localToday(), monthly_fee_override: '' })
    setAddSaving(false)
  }

  function openEdit(m) {
    setEditMember(m)
    setEditForm({
      status: m.status,
      start_date: m.start_date || '',
      end_date: m.end_date || '',
      monthly_fee_override: m.monthly_fee_override != null ? String(m.monthly_fee_override) : '',
      notes: m.notes || '',
    })
    setEditErr('')
  }

  async function handleEditSave() {
    if (!editForm.start_date) { setEditErr('Start date is required.'); return }
    setEditSaving(true); setEditErr('')
    const today = localToday()
    const statusChanged = editForm.status !== editMember.status
    const newOverride = editForm.monthly_fee_override === '' ? null : Number(editForm.monthly_fee_override)
    const overrideChanged = newOverride !== editMember.monthly_fee_override
    const hasDues = (memberDues[editMember.id]?.history?.length || 0) > 0

    // 1. Status change → RPC (handles batch_members.status, end_date, installment pruning/seeding)
    if (statusChanged) {
      const pDate = editForm.status === 'left' ? (editForm.end_date || today) : today
      const { error: rpcErr } = await supabase.rpc('set_batch_member_status', {
        p_member_id: editMember.id,
        p_status: editForm.status,
        p_date: pDate,
      })
      if (rpcErr) { setEditErr(rpcErr.message); setEditSaving(false); return }
    }

    // 2. Direct update for other editable fields
    const payload = {
      monthly_fee_override: newOverride,
      notes: n(editForm.notes.trim()),
    }
    if (!hasDues) payload.start_date = editForm.start_date
    if (!statusChanged) {
      payload.status = editForm.status
      payload.end_date = editForm.status === 'left' ? (editForm.end_date || today) : null
    }
    const { error: updErr } = await supabase.from('batch_members').update(payload).eq('id', editMember.id)
    if (updErr) { setEditErr(updErr.message); setEditSaving(false); return }

    // 3. If fee override changed, update pending monthly installment amounts
    if (overrideChanged && memberDues[editMember.id]?.enrollmentId) {
      const newFee = newOverride != null ? newOverride : batch.monthly_fee
      if (newFee != null) {
        await supabase.from('installments')
          .update({ amount: newFee })
          .eq('enrollment_id', memberDues[editMember.id].enrollmentId)
          .eq('kind', 'monthly')
          .eq('status', 'pending')
      }
    }

    // 4. Refresh member row with latest DB state
    const { data: fresh } = await supabase.from('batch_members')
      .select('*, people(id, full_name, phone)')
      .eq('id', editMember.id).single()
    const updatedMembers = members.map(m => m.id === editMember.id ? (fresh || m) : m)
    setMembers(updatedMembers)
    await refreshDues(updatedMembers)
    setEditMember(null)
    setEditSaving(false)
  }

  function toggleExpanded(id) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const feeDisplay = (m) => {
    const fee = m.monthly_fee_override != null ? m.monthly_fee_override : batch.monthly_fee
    return { text: fee != null ? `₹${Number(fee).toLocaleString('en-IN')}` : '—', custom: m.monthly_fee_override != null }
  }

  if (isFaculty) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {members.length === 0 ? (
          <p className="text-sm text-gray-400 p-6">No students enrolled.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Phone</th>
                <th className="text-left px-4 py-3">Start</th>
                <th className="text-left px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-3 font-medium text-gray-900">{m.people?.full_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{m.people?.phone || '—'}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{fmtDate(m.start_date)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${MEMBER_STATUS_BADGE[m.status] || 'bg-gray-100 text-gray-600'}`}>
                      {m.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Members table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {members.length === 0 ? (
          <p className="text-sm text-gray-400 p-6">No students yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-right px-4 py-3">Fee/mo</th>
                <th className="text-left px-4 py-3">Start</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Next due</th>
                <th className="px-4 py-3 w-36" />
              </tr>
            </thead>
            <tbody>
              {members.flatMap(m => {
                const { text: feeText, custom } = feeDisplay(m)
                const dues = memberDues[m.id]
                const pending = dues?.pending
                const isExpanded = expanded.has(m.id)
                const history = dues?.history || []
                const overdue = pending && pending.due_date < today
                const soon = pending && !overdue && pending.due_date <= in7

                const rows = [
                  <tr key={m.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-medium">
                      <Link to={`/people/${m.person_id}`} className="text-gray-900 hover:text-[#1742b5]">
                        {m.people?.full_name || '—'}
                      </Link>
                      {m.people?.phone && <div className="text-xs text-gray-400">{m.people.phone}</div>}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-800">
                      {feeText}
                      {custom && <span className="ml-1 text-xs text-amber-600 font-medium">custom</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{fmtDate(m.start_date)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${MEMBER_STATUS_BADGE[m.status] || 'bg-gray-100 text-gray-600'}`}>
                        {m.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {pending ? (
                        <div className="space-y-1">
                          <span className="text-xs text-gray-700">
                            {fmtDate(pending.due_date)} · ₹{Number(pending.amount).toLocaleString('en-IN')}
                          </span>
                          <div className="flex gap-1">
                            {overdue && (
                              <span className="text-xs font-medium bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">Overdue</span>
                            )}
                            {soon && (
                              <span className="text-xs font-medium bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Due soon</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        {pending && (
                          <button onClick={() => setPayDue(pending)}
                            className="text-xs font-medium text-[#1742b5] border border-[#1742b5]/30 px-2 py-1 rounded-lg hover:bg-[#1742b5]/5 transition-colors whitespace-nowrap">
                            Record payment
                          </button>
                        )}
                        {history.length > 0 && (
                          <button onClick={() => toggleExpanded(m.id)}
                            className="text-gray-400 hover:text-gray-600 flex items-center">
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        )}
                        <button onClick={() => openEdit(m)} className="text-xs text-gray-400 hover:text-gray-700 underline">Edit</button>
                      </div>
                    </td>
                  </tr>,
                ]

                if (isExpanded && history.length > 0) {
                  rows.push(
                    <tr key={`${m.id}-hist`} className="bg-gray-50/60">
                      <td colSpan={6} className="px-4 pb-3 pt-0">
                        <div className="rounded-lg border border-gray-100 overflow-hidden mt-1">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-gray-50 border-b border-gray-100 text-gray-400 font-semibold uppercase tracking-wide">
                                <th className="text-left px-3 py-2">Due date</th>
                                <th className="text-right px-3 py-2">Amount</th>
                                <th className="text-left px-3 py-2">Status</th>
                                <th className="text-left px-3 py-2">Paid date</th>
                                <th className="text-left px-3 py-2">Method</th>
                              </tr>
                            </thead>
                            <tbody>
                              {history.map(inst => {
                                const isPaid = inst.status === 'paid'
                                const isOvd = inst.status === 'pending' && inst.due_date < today
                                const statusLabel = isOvd ? 'overdue' : inst.status
                                const statusCls = isPaid
                                  ? 'bg-green-100 text-green-700'
                                  : isOvd
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-yellow-100 text-yellow-700'
                                return (
                                  <tr key={inst.id} className="border-b border-gray-100 last:border-0">
                                    <td className="px-3 py-2 text-gray-700">{fmtDate(inst.due_date)}</td>
                                    <td className="px-3 py-2 text-right text-gray-700">₹{Number(inst.amount).toLocaleString('en-IN')}</td>
                                    <td className="px-3 py-2">
                                      <span className={`font-medium px-1.5 py-0.5 rounded-full capitalize ${statusCls}`}>{statusLabel}</span>
                                    </td>
                                    <td className="px-3 py-2 text-gray-500">{inst.paid_date ? fmtDate(inst.paid_date) : '—'}</td>
                                    <td className="px-3 py-2 text-gray-500">{inst.payment_method || '—'}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )
                }

                return rows
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Add student */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-4">Add Student</h3>
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            ref={searchRef}
            value={addSearch}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder="Search by name or phone…"
            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1742b5]/20 focus:border-[#1742b5]"
          />
          {addSearching && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">Searching…</span>}
          {addResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-lg z-10 overflow-hidden">
              {addResults.map(p => (
                <button key={p.id} onClick={() => selectPerson(p)}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center justify-between">
                  <span className="font-medium text-gray-800">{p.full_name}</span>
                  {p.phone && <span className="text-xs text-gray-400">{p.phone}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        {duplicateMsg && <p className="text-sm text-amber-600 mb-3">{duplicateMsg}</p>}
        {selectedPerson && (
          <div className="space-y-3">
            <div className="px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800 font-medium">
              {selectedPerson.full_name}{selectedPerson.phone ? ` · ${selectedPerson.phone}` : ''}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Start Date</label>
                <input type="date" value={addForm.start_date}
                  onChange={e => setAddForm(f => ({ ...f, start_date: e.target.value }))}
                  className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Custom Monthly Fee (₹) — optional</label>
                <input type="number" value={addForm.monthly_fee_override}
                  onChange={e => setAddForm(f => ({ ...f, monthly_fee_override: e.target.value }))}
                  placeholder={`Batch default: ₹${batch.monthly_fee != null ? batch.monthly_fee : 0}`}
                  min="0" className={inputCls} />
              </div>
            </div>
            <div className="flex items-center gap-3 pt-1">
              {addErr && <span className="text-sm text-red-600 mr-auto">{addErr}</span>}
              <button onClick={() => { setSelectedPerson(null); setAddSearch(''); setAddErr('') }}
                className="px-3 py-1.5 text-sm text-gray-500 border border-gray-200 rounded-lg hover:border-gray-300">
                Cancel
              </button>
              <button onClick={handleAddMember} disabled={addSaving}
                className="px-4 py-1.5 text-sm font-semibold bg-[#1742b5] text-white rounded-lg hover:bg-[#1338a0] disabled:opacity-60 transition-colors">
                {addSaving ? 'Adding…' : 'Add to Batch'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit member modal */}
      {editMember && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Edit — {editMember.people?.full_name}</h2>
              <button onClick={() => setEditMember(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Status</label>
                <select value={editForm.status}
                  onChange={e => setEditForm(f => ({
                    ...f,
                    status: e.target.value,
                    end_date: e.target.value === 'left' ? (f.end_date || localToday()) : f.end_date,
                  }))}
                  className={inputCls}>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="left">Left</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Start Date
                  </label>
                  {(memberDues[editMember.id]?.history?.length || 0) > 0 ? (
                    <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
                      {fmtDate(editMember.start_date)}
                      <span className="ml-2 text-xs text-gray-400">(locked — has dues)</span>
                    </div>
                  ) : (
                    <input type="date" value={editForm.start_date}
                      onChange={e => setEditForm(f => ({ ...f, start_date: e.target.value }))}
                      className={inputCls} />
                  )}
                </div>
                {editForm.status === 'left' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">End Date</label>
                    <input type="date" value={editForm.end_date || localToday()}
                      onChange={e => setEditForm(f => ({ ...f, end_date: e.target.value }))}
                      className={inputCls} />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Custom Monthly Fee (₹) — leave blank for batch default
                </label>
                <input type="number" value={editForm.monthly_fee_override}
                  onChange={e => setEditForm(f => ({ ...f, monthly_fee_override: e.target.value }))}
                  placeholder={`Batch default: ₹${batch.monthly_fee != null ? batch.monthly_fee : 0}`}
                  min="0" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Notes</label>
                <textarea value={editForm.notes}
                  onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} className={`${inputCls} resize-none`} />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
              {editErr && <span className="text-sm text-red-600 mr-auto">{editErr}</span>}
              <button onClick={() => setEditMember(null)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:border-gray-300">
                Cancel
              </button>
              <button onClick={handleEditSave} disabled={editSaving}
                className="px-5 py-2 text-sm font-semibold bg-[#1742b5] text-white rounded-lg hover:bg-[#1338a0] disabled:opacity-60 transition-colors">
                {editSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record payment modal */}
      {payDue && (
        <RecordPaymentModal
          due={payDue}
          onClose={() => setPayDue(null)}
          onSuccess={async () => {
            setPayDue(null)
            await refreshDues(members)
          }}
        />
      )}
    </div>
  )
}

// ─── Attendance Tab ───────────────────────────────────────────────────────────

function AttendanceTab({ batch, members, userId }) {
  const [date, setDate] = useState(localToday)
  const [sessionId, setSessionId] = useState(null)
  const [sessionStatus, setSessionStatus] = useState(null)
  const [attendance, setAttendance] = useState({})
  const [loadingDate, setLoadingDate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState('')
  const [saved, setSaved] = useState(false)
  const [cancelNote, setCancelNote] = useState('')
  const [cancelSaving, setCancelSaving] = useState(false)
  const [cancelErr, setCancelErr] = useState('')
  const [recentSessions, setRecentSessions] = useState([])

  const eligible = members.filter(m => {
    if (!m.start_date || m.start_date > date) return false
    if (m.end_date && m.end_date < date) return false
    return true
  })

  const loadRecentSessions = useCallback(async () => {
    const { data: sessions } = await supabase.from('batch_sessions')
      .select('id, class_date, status, note')
      .eq('batch_id', batch.id)
      .order('class_date', { ascending: false })
      .limit(8)
    if (!sessions?.length) { setRecentSessions([]); return }
    const { data: counts } = await supabase.from('batch_attendance')
      .select('session_id, present')
      .in('session_id', sessions.map(s => s.id))
    const presentMap = {}, totalMap = {}
    ;(counts || []).forEach(r => {
      totalMap[r.session_id] = (totalMap[r.session_id] || 0) + 1
      if (r.present) presentMap[r.session_id] = (presentMap[r.session_id] || 0) + 1
    })
    setRecentSessions(sessions.map(s => ({ ...s, present: presentMap[s.id] || 0, total: totalMap[s.id] || 0 })))
  }, [batch.id])

  const loadForDate = useCallback(async (d) => {
    setLoadingDate(true); setSaveErr(''); setSaved(false)
    const { data: session } = await supabase.from('batch_sessions')
      .select('id, status, note')
      .eq('batch_id', batch.id)
      .eq('class_date', d)
      .maybeSingle()
    setSessionId(session?.id || null)
    setSessionStatus(session?.status || null)
    setCancelNote(session?.note || '')
    if (session) {
      const { data: rows } = await supabase.from('batch_attendance')
        .select('person_id, present, note')
        .eq('session_id', session.id)
      const map = {}
      ;(rows || []).forEach(r => { map[r.person_id] = { present: r.present, note: r.note || '' } })
      setAttendance(map)
    } else {
      setAttendance({})
    }
    setLoadingDate(false)
  }, [batch.id])

  useEffect(() => { loadForDate(date); loadRecentSessions() }, [])
  useEffect(() => { loadForDate(date) }, [date])

  function togglePresent(personId) {
    setAttendance(prev => ({
      ...prev,
      [personId]: { present: !(prev[personId]?.present), note: prev[personId]?.note || '' },
    }))
  }

  function setNote(personId, note) {
    setAttendance(prev => ({ ...prev, [personId]: { ...(prev[personId] || { present: false }), note } }))
  }

  async function handleSave() {
    setSaving(true); setSaveErr(''); setSaved(false)
    const { data: session, error: sErr } = await supabase.from('batch_sessions')
      .upsert({ batch_id: batch.id, class_date: date, status: 'held', note: null }, { onConflict: 'batch_id,class_date' })
      .select('id').single()
    if (sErr) { setSaveErr(sErr.message); setSaving(false); return }
    const rows = eligible.map(m => ({
      session_id: session.id,
      person_id: m.person_id,
      present: attendance[m.person_id]?.present ?? false,
      note: attendance[m.person_id]?.note?.trim() || null,
      marked_by: userId,
    }))
    if (rows.length) {
      const { error: aErr } = await supabase.from('batch_attendance')
        .upsert(rows, { onConflict: 'session_id,person_id' })
      if (aErr) { setSaveErr(aErr.message); setSaving(false); return }
    }
    setSessionId(session.id)
    setSessionStatus('held')
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    loadRecentSessions()
  }

  async function handleCancelClass() {
    setCancelSaving(true); setCancelErr('')
    const { error } = await supabase.from('batch_sessions')
      .upsert({ batch_id: batch.id, class_date: date, status: 'cancelled', note: cancelNote.trim() || null }, { onConflict: 'batch_id,class_date' })
    if (error) { setCancelErr(error.message); setCancelSaving(false); return }
    setSessionStatus('cancelled')
    setCancelSaving(false)
    loadRecentSessions()
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-4 mb-5">
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1742b5]/20 focus:border-[#1742b5]" />
          </div>
          {sessionStatus && (
            <div className={`mt-5 px-3 py-1 rounded-full text-xs font-medium ${sessionStatus === 'held' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
              {sessionStatus === 'held' ? 'Class held' : 'Class cancelled'}
            </div>
          )}
        </div>

        {loadingDate ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : eligible.length === 0 ? (
          <p className="text-sm text-gray-400">No students were enrolled on this date.</p>
        ) : (
          <div className="space-y-2 mb-5">
            {eligible.map(m => (
              <div key={m.person_id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                <button
                  onClick={() => togglePresent(m.person_id)}
                  className={`mt-0.5 w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${attendance[m.person_id]?.present ? 'bg-[#1742b5] border-[#1742b5]' : 'bg-white border-gray-300 hover:border-gray-400'}`}
                >
                  {attendance[m.person_id]?.present && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L4 7L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <Link to={`/people/${m.person_id}`} className="text-sm font-medium text-gray-800 hover:text-[#1742b5]">
                    {m.people?.full_name || '—'}
                  </Link>
                  <input
                    value={attendance[m.person_id]?.note || ''}
                    onChange={e => setNote(m.person_id, e.target.value)}
                    placeholder="Note (optional)"
                    className="mt-1 block w-full px-2 py-1 border border-gray-100 rounded text-xs text-gray-500 focus:outline-none focus:ring-1 focus:ring-[#1742b5] bg-gray-50"
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          {saveErr && <span className="text-sm text-red-600 w-full">{saveErr}</span>}
          {eligible.length > 0 && (
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-2 text-sm font-semibold bg-[#1742b5] text-white rounded-lg hover:bg-[#1338a0] disabled:opacity-60 transition-colors">
              {saving ? 'Saving…' : 'Save Attendance'}
            </button>
          )}
          {saved && <span className="text-sm text-green-600">Saved</span>}
        </div>

        <div className="mt-5 pt-4 border-t border-gray-100">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Class cancelled or postponed?</p>
          <div className="flex gap-3">
            <input value={cancelNote} onChange={e => setCancelNote(e.target.value)}
              placeholder="Optional note (e.g. postponed to Saturday)"
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1742b5]/20 focus:border-[#1742b5]" />
            <button onClick={handleCancelClass} disabled={cancelSaving}
              className="px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-60 transition-colors whitespace-nowrap">
              {cancelSaving ? 'Saving…' : 'Mark Cancelled'}
            </button>
          </div>
          {cancelErr && <p className="text-xs text-red-500 mt-1">{cancelErr}</p>}
        </div>
      </div>

      {recentSessions.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Recent Sessions</h3>
          <div className="space-y-1">
            {recentSessions.map(s => (
              <button key={s.id} onClick={() => setDate(s.class_date)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-left transition-colors ${s.class_date === date ? 'bg-[#1742b5]/5 text-[#1742b5]' : 'hover:bg-gray-50 text-gray-700'}`}>
                <div className="flex items-center gap-3">
                  <span className="font-medium">{fmtDate(s.class_date)}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${s.status === 'held' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                    {s.status}
                  </span>
                  {s.note && <span className="text-xs text-gray-400 truncate max-w-xs">{s.note}</span>}
                </div>
                {s.status === 'held' && <span className="text-xs text-gray-400 flex-shrink-0">{s.present}/{s.total} present</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Details Tab ──────────────────────────────────────────────────────────────

function DetailsTab({ batch, setBatch }) {
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    name: batch.name || '',
    course: batch.course || '',
    teacher_name: batch.teacher_name || '',
    mode: batch.mode || 'Offline',
    days: batch.days || [],
    start_time: timeForInput(batch.start_time),
    end_time: timeForInput(batch.end_time),
    monthly_fee: batch.monthly_fee != null ? String(batch.monthly_fee) : '',
    location_or_link: batch.location_or_link || '',
    status: batch.status || 'active',
    notes: batch.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState('')

  const allCourses = useCourses({ batchesOnly: true, includeValue: form.course || undefined })

  function setF(k) { return e => setForm(f => ({ ...f, [k]: e.target.value })) }
  function toggleDay(d) { setForm(f => ({ ...f, days: f.days.includes(d) ? f.days.filter(x => x !== d) : [...f.days, d] })) }

  async function handleSave() {
    if (!form.name.trim()) { setSaveErr('Name is required.'); return }
    setSaving(true); setSaveErr('')
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
    const { data, error } = await supabase.from('batches').update(payload).eq('id', batch.id).select().single()
    if (error) { setSaveErr(error.message); setSaving(false); return }
    setBatch(data)
    setEditing(false)
    setSaving(false)
  }

  if (!editing) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex justify-between items-start">
          <h3 className="text-base font-semibold text-gray-900">{batch.name}</h3>
          <button onClick={() => setEditing(true)} className="px-4 py-1.5 text-sm text-[#1742b5] border border-[#1742b5]/30 rounded-lg hover:bg-[#1742b5]/5 transition-colors">Edit</button>
        </div>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div><dt className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">Course</dt><dd className="text-gray-800">{batch.course || '—'}</dd></div>
          <div><dt className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">Teacher</dt><dd className="text-gray-800">{batch.teacher_name || '—'}</dd></div>
          <div><dt className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">Mode</dt><dd className="text-gray-800">{batch.mode}</dd></div>
          <div><dt className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">Status</dt><dd className="text-gray-800 capitalize">{batch.status}</dd></div>
          <div className="col-span-2"><dt className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">Schedule</dt><dd className="text-gray-800">{formatSchedule(batch)}</dd></div>
          <div><dt className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">Monthly Fee</dt><dd className="text-gray-800">{batch.monthly_fee != null ? `₹${Number(batch.monthly_fee).toLocaleString('en-IN')}` : '—'}</dd></div>
          <div><dt className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">{batch.mode === 'Online' ? 'Meeting Link' : 'Location'}</dt><dd className="text-gray-800 break-all">{batch.location_or_link || '—'}</dd></div>
          {batch.notes && <div className="col-span-2"><dt className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">Notes</dt><dd className="text-gray-800">{batch.notes}</dd></div>}
        </dl>
      </div>
    )
  }

  const inputCls2 = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1742b5]/20 focus:border-[#1742b5]'
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Batch Name *</label>
          <input value={form.name} onChange={setF('name')} className={inputCls2} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Course</label>
          <select value={form.course} onChange={setF('course')} className={inputCls2}>
            <option value="">— Select —</option>
            {allCourses.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Teacher</label>
          <input value={form.teacher_name} onChange={setF('teacher_name')} className={inputCls2} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Mode</label>
          <select value={form.mode} onChange={setF('mode')} className={inputCls2}><option>Offline</option><option>Online</option></select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Status</label>
          <select value={form.status} onChange={setF('status')} className={inputCls2}>
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
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${form.days.includes(i) ? 'bg-[#1742b5] text-white border-[#1742b5]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
              {day}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Start Time</label>
          <input type="time" value={form.start_time} onChange={setF('start_time')} className={inputCls2} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">End Time</label>
          <input type="time" value={form.end_time} onChange={setF('end_time')} className={inputCls2} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Monthly Fee (₹)</label>
          <input type="number" value={form.monthly_fee} onChange={setF('monthly_fee')} min="0" className={inputCls2} />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{form.mode === 'Online' ? 'Meeting Link' : 'Location'}</label>
        <input value={form.location_or_link} onChange={setF('location_or_link')} className={inputCls2} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Notes</label>
        <textarea value={form.notes} onChange={setF('notes')} rows={2} className={`${inputCls2} resize-none`} />
      </div>
      <div className="flex items-center justify-end gap-3 pt-2">
        {saveErr && <span className="text-sm text-red-600 mr-auto">{saveErr}</span>}
        <button onClick={() => setEditing(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:border-gray-300">Cancel</button>
        <button onClick={handleSave} disabled={saving}
          className="px-5 py-2 text-sm font-semibold bg-[#1742b5] text-white rounded-lg hover:bg-[#1338a0] disabled:opacity-60 transition-colors">
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TABS = ['Students', 'Attendance', 'Details']

export default function BatchPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, isFaculty } = useAuth()
  const [batch, setBatch] = useState(null)
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('Students')
  const [memberDues, setMemberDues] = useState({})
  const visibleTabs = isFaculty ? ['Students', 'Attendance'] : TABS

  async function loadDues(membersList) {
    if (!membersList?.length) { setMemberDues({}); return }
    const memberIds = membersList.map(m => m.id)
    const { data: enrols } = await supabase
      .from('enrollments').select('id, batch_member_id').in('batch_member_id', memberIds)
    const enrolMap = {}
    ;(enrols || []).forEach(e => { enrolMap[e.batch_member_id] = e.id })
    const enrolIds = (enrols || []).map(e => e.id)
    if (!enrolIds.length) {
      const result = {}
      membersList.forEach(m => { result[m.id] = { enrollmentId: null, pending: null, history: [] } })
      setMemberDues(result); return
    }
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
    membersList.forEach(m => {
      const enrolId = enrolMap[m.id]
      const all = enrolId ? (installMap[enrolId] || []) : []
      result[m.id] = { enrollmentId: enrolId || null, pending: all.find(i => i.status === 'pending') || null, history: all }
    })
    setMemberDues(result)
  }

  useEffect(() => {
    async function load() {
      const [bRes, mRes] = await Promise.all([
        supabase.from('batches').select('*').eq('id', id).single(),
        supabase.from('batch_members')
          .select('*, people(id, full_name, phone)')
          .eq('batch_id', id)
          .order('created_at', { ascending: true }),
      ])
      setBatch(bRes.data)
      const mData = mRes.data || []
      setMembers(mData)
      setLoading(false)
      if (!isFaculty) await loadDues(mData)
    }
    load()
  }, [id])

  if (loading) return <div className="p-6 py-16 text-center text-gray-400 text-sm">Loading…</div>
  if (!batch) return <div className="p-6 py-16 text-center text-gray-400 text-sm">Batch not found.</div>

  return (
    <div className="p-6">
      <button onClick={() => navigate('/yoga')}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-5 transition-colors">
        <ChevronLeft size={16} /> Back to Yoga Batches
      </button>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{batch.name}</h1>
            <p className="text-sm text-gray-400 mt-0.5">{formatSchedule(batch)}</p>
          </div>
          <div className="flex items-center gap-2">
            {batch.course && <span className="text-sm bg-[#1742b5]/10 text-[#1742b5] px-2.5 py-1 rounded-lg">{batch.course}</span>}
            <span className={`text-sm font-medium px-2.5 py-1 rounded-full capitalize ${batch.status === 'active' ? 'bg-green-100 text-green-700' : batch.status === 'paused' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}`}>
              {batch.status}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-t-xl border border-gray-200 border-b-0 px-2 flex">
        {visibleTabs.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-5 py-3.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab ? 'border-[#1742b5] text-[#1742b5]' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200'}`}>
            {tab}
          </button>
        ))}
      </div>
      <div className="border border-gray-200 border-t-0 rounded-b-xl bg-[#f8fafc] p-6 min-h-[300px]">
        {activeTab === 'Students' && (
          <StudentsTab
            batch={batch}
            members={members}
            setMembers={setMembers}
            memberDues={memberDues}
            refreshDues={loadDues}
            isFaculty={isFaculty}
          />
        )}
        {activeTab === 'Attendance' && <AttendanceTab batch={batch} members={members} userId={user?.id} />}
        {activeTab === 'Details' && <DetailsTab batch={batch} setBatch={setBatch} />}
      </div>
    </div>
  )
}
