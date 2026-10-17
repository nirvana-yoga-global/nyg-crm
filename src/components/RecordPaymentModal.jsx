import { useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../lib/supabase'

function localToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtDate(s) {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${parseInt(d, 10)} ${MONTHS[parseInt(m, 10) - 1]} ${y}`
}

const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1742b5]/20 focus:border-[#1742b5]'

// due: { id, due_date, amount, context? }
// context: optional string shown under the title (e.g. "Charles Raj — Morning Yoga")
export default function RecordPaymentModal({ due, onClose, onSuccess }) {
  const [form, setForm] = useState({
    amount: due.amount != null ? String(due.amount) : '',
    paid_date: localToday(),
    method: 'Cash',
    note: '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function handleSave() {
    if (!form.amount || isNaN(Number(form.amount))) { setErr('Amount is required.'); return }
    if (!form.paid_date) { setErr('Paid date is required.'); return }
    setSaving(true); setErr('')
    const { error } = await supabase.rpc('record_batch_payment', {
      p_installment_id: due.id,
      p_amount: Number(form.amount),
      p_paid_date: form.paid_date,
      p_method: form.method,
      p_note: form.note.trim() || null,
    })
    if (error) { setErr(error.message); setSaving(false); return }
    onSuccess()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Record Payment</h2>
            {due.context && <p className="text-xs text-gray-500 mt-0.5">{due.context}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-xs text-gray-500 mb-1">
            Due date: <span className="font-medium text-gray-700">{fmtDate(due.due_date)}</span>
          </p>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Amount (₹)</label>
            <input type="number" value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              min="0" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Paid Date</label>
            <input type="date" value={form.paid_date}
              onChange={e => setForm(f => ({ ...f, paid_date: e.target.value }))}
              className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Method</label>
            <select value={form.method}
              onChange={e => setForm(f => ({ ...f, method: e.target.value }))}
              className={inputCls}>
              <option>Cash</option>
              <option>UPI</option>
              <option>Bank Transfer</option>
              <option>Other</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Note (optional)</label>
            <input value={form.note}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              placeholder="Receipt number, remarks…"
              className={inputCls} />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
          {err && <span className="text-sm text-red-600 mr-auto">{err}</span>}
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:border-gray-300">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 text-sm font-semibold bg-[#1742b5] text-white rounded-lg hover:bg-[#1338a0] disabled:opacity-60 transition-colors">
            {saving ? 'Saving…' : 'Record Payment'}
          </button>
        </div>
      </div>
    </div>
  )
}
