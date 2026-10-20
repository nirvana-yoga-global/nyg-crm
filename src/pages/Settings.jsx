import { useState, useEffect } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { refetchCourses } from '../hooks/useCourses'

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#1742b5] focus:ring-offset-1 ${checked ? 'bg-[#1742b5]' : 'bg-gray-200'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  )
}

function CoursesSection() {
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [patchErr, setPatchErr] = useState(null)
  const [addName, setAddName] = useState('')
  const [addBatches, setAddBatches] = useState(false)
  const [addErr, setAddErr] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('courses')
      .select('id, name, runs_batches, is_active, sort_order')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
    setCourses(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function patch(id, field, value) {
    setPatchErr(null)
    const { error } = await supabase.from('courses').update({ [field]: value }).eq('id', id)
    if (error) {
      setPatchErr({ id, field, message: error.message })
    } else {
      setCourses(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c))
      refetchCourses()
    }
  }

  async function move(idx, delta) {
    const next = idx + delta
    if (next < 0 || next >= courses.length) return
    const a = courses[idx]
    const b = courses[next]
    let aOrder = b.sort_order
    let bOrder = a.sort_order
    if (aOrder === bOrder) {
      aOrder = b.sort_order + (delta > 0 ? -1 : 1)
      bOrder = a.sort_order + (delta > 0 ? 1 : -1)
    }
    const updated = courses.map(c => {
      if (c.id === a.id) return { ...c, sort_order: aOrder }
      if (c.id === b.id) return { ...c, sort_order: bOrder }
      return c
    }).sort((x, y) => x.sort_order - y.sort_order || x.name.localeCompare(y.name))
    setCourses(updated)
    await supabase.from('courses').update({ sort_order: aOrder }).eq('id', a.id)
    await supabase.from('courses').update({ sort_order: bOrder }).eq('id', b.id)
    refetchCourses()
  }

  async function handleAdd(e) {
    e.preventDefault()
    const name = addName.trim()
    if (!name) return
    setAddErr('')
    if (courses.some(c => c.name.toLowerCase() === name.toLowerCase())) {
      setAddErr('That course already exists.')
      return
    }
    setSaving(true)
    const maxOrder = courses.length > 0 ? Math.max(...courses.map(c => c.sort_order)) : 0
    const { error } = await supabase.from('courses').insert({ name, runs_batches: addBatches, sort_order: maxOrder + 10 })
    setSaving(false)
    if (error) {
      setAddErr(error.code === '23505' ? 'That course already exists.' : error.message)
    } else {
      setAddName('')
      setAddBatches(false)
      await load()
      refetchCourses()
    }
  }

  if (loading) return <p className="text-sm text-gray-400">Loading courses…</p>

  return (
    <div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
            <th className="text-left font-medium py-2 pr-4">Course</th>
            <th className="text-left font-medium py-2 pr-4">Has Batches</th>
            <th className="text-left font-medium py-2 pr-4">Visibility</th>
            <th className="py-2 w-16" />
          </tr>
        </thead>
        <tbody>
          {courses.map((c, idx) => (
            <tr key={c.id} className="border-b border-gray-50 last:border-0">
              <td className={`py-3 pr-4 font-medium ${c.is_active ? 'text-gray-800' : 'text-gray-400'}`}>
                {c.name}
              </td>
              <td className="py-3 pr-4">
                <div className="flex items-center gap-2">
                  <Toggle checked={c.runs_batches} onChange={val => patch(c.id, 'runs_batches', val)} />
                  {patchErr?.id === c.id && patchErr?.field === 'runs_batches' && (
                    <span className="text-xs text-red-500">{patchErr.message}</span>
                  )}
                </div>
              </td>
              <td className="py-3 pr-4">
                <div className="flex items-center gap-2">
                  <Toggle checked={c.is_active} onChange={val => patch(c.id, 'is_active', val)} />
                  <span className={`text-xs ${c.is_active ? 'text-gray-500' : 'text-gray-400'}`}>
                    {c.is_active ? 'Visible' : 'Hidden'}
                  </span>
                  {patchErr?.id === c.id && patchErr?.field === 'is_active' && (
                    <span className="text-xs text-red-500">{patchErr.message}</span>
                  )}
                </div>
              </td>
              <td className="py-3">
                <div className="flex gap-1">
                  <button
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0}
                    className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    onClick={() => move(idx, 1)}
                    disabled={idx === courses.length - 1}
                    className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-xs text-gray-400 mt-3 mb-5">
        Hide a course instead of deleting it. Existing leads keep their course.
      </p>

      <form onSubmit={handleAdd} className="flex items-center gap-3">
        <input
          type="text"
          value={addName}
          onChange={e => { setAddName(e.target.value); setAddErr('') }}
          placeholder="New course name"
          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1742b5]/20 focus:border-[#1742b5]"
        />
        <label className="flex items-center gap-1.5 text-sm text-gray-600 whitespace-nowrap">
          <input
            type="checkbox"
            checked={addBatches}
            onChange={e => setAddBatches(e.target.checked)}
            className="rounded border-gray-300 text-[#1742b5] focus:ring-[#1742b5]"
          />
          Has batches
        </label>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-[#1742b5] text-white text-sm font-semibold rounded-lg hover:bg-[#1338a0] transition-colors disabled:opacity-60"
        >
          Add course
        </button>
        {addErr && <span className="text-xs text-red-500">{addErr}</span>}
      </form>
    </div>
  )
}

function WhatsAppGroupsSection() {
  const [groups, setGroups]           = useState([])
  const [loading, setLoading]         = useState(true)
  const [patchErr, setPatchErr]       = useState(null)
  const [addName, setAddName]         = useState('')
  const [addErr, setAddErr]           = useState('')
  const [saving, setSaving]           = useState(false)
  const [editingId, setEditingId]     = useState(null)
  const [editingName, setEditingName] = useState('')
  const [renameErr, setRenameErr]     = useState('')
  const [renameSaving, setRenameSaving] = useState(false)

  async function load() {
    setLoading(true)
    const [groupsRes, membersRes] = await Promise.all([
      supabase.from('whatsapp_groups')
        .select('id, name, is_active, sort_order')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true }),
      supabase.from('person_whatsapp_groups').select('group_id'),
    ])

    // Build member count map
    const countMap = {}
    for (const row of membersRes.data || []) {
      countMap[row.group_id] = (countMap[row.group_id] || 0) + 1
    }

    setGroups((groupsRes.data || []).map(g => ({ ...g, member_count: countMap[g.id] || 0 })))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function patch(id, field, value) {
    setPatchErr(null)
    const { error } = await supabase.from('whatsapp_groups').update({ [field]: value }).eq('id', id)
    if (error) {
      setPatchErr({ id, field, message: error.message })
    } else {
      setGroups(prev => prev.map(g => g.id === id ? { ...g, [field]: value } : g))
    }
  }

  async function move(idx, delta) {
    const next = idx + delta
    if (next < 0 || next >= groups.length) return
    const a = groups[idx]
    const b = groups[next]
    let aOrder = b.sort_order
    let bOrder = a.sort_order
    if (aOrder === bOrder) {
      aOrder = b.sort_order + (delta > 0 ? -1 : 1)
      bOrder = a.sort_order + (delta > 0 ? 1 : -1)
    }
    const updated = groups.map(g => {
      if (g.id === a.id) return { ...g, sort_order: aOrder }
      if (g.id === b.id) return { ...g, sort_order: bOrder }
      return g
    }).sort((x, y) => x.sort_order - y.sort_order || x.name.localeCompare(y.name))
    setGroups(updated)
    await supabase.from('whatsapp_groups').update({ sort_order: aOrder }).eq('id', a.id)
    await supabase.from('whatsapp_groups').update({ sort_order: bOrder }).eq('id', b.id)
  }

  function startEdit(g) {
    setEditingId(g.id)
    setEditingName(g.name)
    setRenameErr('')
  }

  async function saveRename(id) {
    const name = editingName.trim()
    if (!name) { setRenameErr('Name is required.'); return }
    if (groups.some(g => g.id !== id && g.name.toLowerCase() === name.toLowerCase())) {
      setRenameErr('A group with that name already exists.')
      return
    }
    setRenameSaving(true)
    setRenameErr('')
    const { error } = await supabase.from('whatsapp_groups').update({ name }).eq('id', id)
    setRenameSaving(false)
    if (error) {
      setRenameErr(error.code === '23505' ? 'A group with that name already exists.' : error.message)
    } else {
      setGroups(prev => prev.map(g => g.id === id ? { ...g, name } : g))
      setEditingId(null)
    }
  }

  async function handleAdd(e) {
    e.preventDefault()
    const name = addName.trim()
    if (!name) return
    setAddErr('')
    if (groups.some(g => g.name.toLowerCase() === name.toLowerCase())) {
      setAddErr('A group with that name already exists.')
      return
    }
    setSaving(true)
    const maxOrder = groups.length > 0 ? Math.max(...groups.map(g => g.sort_order)) : 0
    const { error } = await supabase.from('whatsapp_groups').insert({ name, sort_order: maxOrder + 10 })
    setSaving(false)
    if (error) {
      setAddErr(error.code === '23505' ? 'A group with that name already exists.' : error.message)
    } else {
      setAddName('')
      await load()
    }
  }

  if (loading) return <p className="text-sm text-gray-400">Loading groups…</p>

  return (
    <div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
            <th className="text-left font-medium py-2 pr-4">Group</th>
            <th className="text-left font-medium py-2 pr-6">Members</th>
            <th className="text-left font-medium py-2 pr-4">Visibility</th>
            <th className="py-2 w-16" />
          </tr>
        </thead>
        <tbody>
          {groups.map((g, idx) => (
            <tr key={g.id} className="border-b border-gray-50 last:border-0">
              {/* Name / inline rename */}
              <td className="py-3 pr-4">
                {editingId === g.id ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      value={editingName}
                      onChange={e => { setEditingName(e.target.value); setRenameErr('') }}
                      onKeyDown={e => {
                        if (e.key === 'Enter')  saveRename(g.id)
                        if (e.key === 'Escape') { setEditingId(null); setRenameErr('') }
                      }}
                      autoFocus
                      className="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#1742b5]/20 focus:border-[#1742b5] w-52"
                    />
                    <button
                      onClick={() => saveRename(g.id)}
                      disabled={renameSaving}
                      className="text-xs font-medium text-[#1742b5] hover:text-[#1330a0] disabled:opacity-50"
                    >
                      {renameSaving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={() => { setEditingId(null); setRenameErr('') }}
                      className="text-xs text-gray-400 hover:text-gray-600"
                    >
                      Cancel
                    </button>
                    {renameErr && <span className="text-xs text-red-500">{renameErr}</span>}
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className={`font-medium ${g.is_active ? 'text-gray-800' : 'text-gray-400'}`}>
                      {g.name}
                    </span>
                    <button
                      onClick={() => startEdit(g)}
                      className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
                    >
                      Rename
                    </button>
                  </div>
                )}
              </td>
              {/* Member count */}
              <td className="py-3 pr-6 text-sm text-gray-500 tabular-nums">{g.member_count}</td>
              {/* Active toggle */}
              <td className="py-3 pr-4">
                <div className="flex items-center gap-2">
                  <Toggle checked={g.is_active} onChange={val => patch(g.id, 'is_active', val)} />
                  <span className={`text-xs ${g.is_active ? 'text-gray-500' : 'text-gray-400'}`}>
                    {g.is_active ? 'Visible' : 'Hidden'}
                  </span>
                  {patchErr?.id === g.id && patchErr?.field === 'is_active' && (
                    <span className="text-xs text-red-500">{patchErr.message}</span>
                  )}
                </div>
              </td>
              {/* Reorder */}
              <td className="py-3">
                <div className="flex gap-1">
                  <button
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0}
                    className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    onClick={() => move(idx, 1)}
                    disabled={idx === groups.length - 1}
                    className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-xs text-gray-400 mt-3 mb-5">
        Hiding a group removes it from the Students filter and the add-to-group dropdown,
        but existing memberships are kept.
      </p>

      <form onSubmit={handleAdd} className="flex items-center gap-3">
        <input
          type="text"
          value={addName}
          onChange={e => { setAddName(e.target.value); setAddErr('') }}
          placeholder="New group name"
          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1742b5]/20 focus:border-[#1742b5]"
        />
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-[#1742b5] text-white text-sm font-semibold rounded-lg hover:bg-[#1338a0] transition-colors disabled:opacity-60"
        >
          Add group
        </button>
        {addErr && <span className="text-xs text-red-500">{addErr}</span>}
      </form>
    </div>
  )
}

export default function Settings() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Settings</h1>
      <p className="text-gray-400 text-sm">CRM configuration</p>

      <div className="mt-8 bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-1">Courses</h2>
        <p className="text-sm text-gray-400 mb-5">Manage the courses available in lead and enrolment forms.</p>
        <CoursesSection />
      </div>

      <div className="mt-6 bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-1">WhatsApp groups</h2>
        <p className="text-sm text-gray-400 mb-5">Manage groups. Renaming a group does not affect existing memberships.</p>
        <WhatsAppGroupsSection />
      </div>
    </div>
  )
}
