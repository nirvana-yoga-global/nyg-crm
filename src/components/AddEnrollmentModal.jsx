import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useCourses } from '../hooks/useCourses'
const STATUS_OPTS   = ['Active', 'Completed', 'Dropped']
const FEE_TYPE_OPTS = ['Monthly', 'One-time', 'Installment', 'Scholarship', 'Partial', 'Free']

const INPUT = 'px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1742b5]/20 focus:border-[#1742b5] w-full'

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )
}

export default function AddEnrollmentModal({ studentProfileId, studentName, onClose, onSaved }) {
  const [form, setForm] = useState({
    course: '', status: 'Active', start_date: '', fee_type: '', total_fee_agreed: '', notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const courseOptions = useCourses({ includeValue: form.course || undefined })

  const set = key => e => setForm(p => ({ ...p, [key]: e.target.value }))

  async function handleSave() {
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('enrollments').insert({
      student_profile_id: studentProfileId,
      course:             form.course   || null,
      status:             form.status,
      start_date:         form.start_date || null,
      fee_type:           form.fee_type  || null,
      total_fee_agreed:   form.total_fee_agreed !== '' ? parseFloat(form.total_fee_agreed) : null,
      notes:              form.notes || null,
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
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Add Enrollment</h2>
            {studentName && <p className="text-xs text-gray-400 mt-0.5">{studentName}</p>}
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <Field label="Course">
            <select value={form.course} onChange={set('course')} className={INPUT}>
              <option value="">— Select —</option>
              {courseOptions.map(o => <option key={o.name} value={o.name}>{o.name}</option>)}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Status">
              <select value={form.status} onChange={set('status')} className={INPUT}>
                {STATUS_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Start Date">
              <input type="date" value={form.start_date} onChange={set('start_date')} className={INPUT} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Fee Type">
              <select value={form.fee_type} onChange={set('fee_type')} className={INPUT}>
                <option value="">— Select —</option>
                {FEE_TYPE_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Total Fee Agreed">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 select-none">₹</span>
                <input
                  type="number"
                  value={form.total_fee_agreed}
                  onChange={set('total_fee_agreed')}
                  placeholder="0"
                  min="0"
                  className={`${INPUT} pl-7`}
                />
              </div>
            </Field>
          </div>

          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={set('notes')}
              rows={3}
              placeholder="Any notes about this enrollment…"
              className={`${INPUT} resize-none`}
            />
          </Field>
        </div>

        {/* Footer */}
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
            {saving ? 'Saving…' : 'Save Enrollment'}
          </button>
        </div>
      </div>
    </div>
  )
}
