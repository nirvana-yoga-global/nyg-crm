import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

let _cache = null
let _fetching = false
const _listeners = new Set()

function _notify() {
  _listeners.forEach(fn => fn())
}

async function _load() {
  if (_fetching) return
  _fetching = true
  const { data } = await supabase
    .from('courses')
    .select('id, name, runs_batches, is_active, sort_order')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  _cache = data || []
  _fetching = false
  _notify()
}

export function refetchCourses() {
  _cache = null
  _fetching = false
  _load()
}

export function useCourses({ batchesOnly = false, includeValue } = {}) {
  const [, rerender] = useState(0)

  useEffect(() => {
    const notify = () => rerender(n => n + 1)
    _listeners.add(notify)
    if (_cache === null) _load()
    return () => _listeners.delete(notify)
  }, [])

  const all = _cache || []
  let list = all.filter(c => {
    if (batchesOnly && !c.runs_batches) return false
    if (!c.is_active) return includeValue != null && c.name === includeValue
    return true
  })

  if (includeValue != null && includeValue !== '' && !list.some(c => c.name === includeValue)) {
    list = [...list, { id: `__legacy__${includeValue}`, name: includeValue, runs_batches: false, is_active: false, sort_order: 9999 }]
  }

  return list
}
