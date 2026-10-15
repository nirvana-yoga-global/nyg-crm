import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

function formatDateTime(ts) {
  const d = new Date(ts)
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function AddNoteModal({ onClose, onSaved }) {
  const [note, setNote]     = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const { user } = useAuth()

  async function handleSave() {
    if (!note.trim()) { setError('Note cannot be empty.'); return }
    setSaving(true)
    setError('')
    const ownerField = onSaved.personId
      ? { person_id: onSaved.personId }
      : { student_profile_id: onSaved.studentProfileId }
    const { error: err } = await supabase.from('student_notes').insert({
      ...ownerField,
      admin_id: user.id,
      note: note.trim(),
    })
    if (err) { setError(err.message); setSaving(false); return }
    onSaved.refresh()
    onClose()
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
          <h2 className="text-base font-semibold text-gray-900">Add Note</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
              {error}
            </div>
          )}
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={6}
            placeholder="Write your note here…"
            autoFocus
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1742b5]/20 focus:border-[#1742b5] resize-none"
          />
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
            {saving ? 'Saving…' : 'Save Note'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function NotesTab({ studentProfileId, personId }) {
  const [notes, setNotes]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [showModal, setShowModal] = useState(false)

  const fetchNotes = useCallback(async () => {
    const col = personId ? 'person_id' : 'student_profile_id'
    const val = personId || studentProfileId
    const { data, error } = await supabase
      .from('student_notes')
      .select('*, profiles:admin_id(full_name)')
      .eq(col, val)
      .order('created_at', { ascending: false })
    if (!error) setNotes(data || [])
    setLoading(false)
  }, [personId, studentProfileId])

  useEffect(() => { fetchNotes() }, [fetchNotes])

  if (loading) {
    return <div className="py-14 text-center text-gray-400 text-sm">Loading notes…</div>
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-[#1742b5] text-white rounded-lg hover:bg-[#1330a0] transition-colors"
        >
          + Add Note
        </button>
      </div>

      {/* Notes list */}
      {notes.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 text-sm">
          No notes added yet.
        </div>
      ) : (
        notes.map(n => (
          <div key={n.id} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-gray-400">
                {formatDateTime(n.created_at)}
              </span>
              <span className="text-xs font-medium text-[#1742b5] bg-blue-50 px-2.5 py-0.5 rounded-full">
                {n.profiles?.full_name || 'Admin'}
              </span>
            </div>
            <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{n.note}</p>
          </div>
        ))
      )}

      {showModal && (
        <AddNoteModal
          onClose={() => setShowModal(false)}
          onSaved={{ studentProfileId, personId, refresh: fetchNotes }}
        />
      )}
    </div>
  )
}
