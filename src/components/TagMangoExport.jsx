import { useState, useMemo, forwardRef, useImperativeHandle } from 'react'
import { X } from 'lucide-react'

// Sorted longest-prefix first so 965/966/etc. match before 9x or 1.
// country: null = shared by multiple countries, needs inference from location.
const DIAL_CODES = [
  { code: '965', country: 'Kuwait' },
  { code: '966', country: 'Saudi Arabia' },
  { code: '968', country: 'Oman' },
  { code: '971', country: 'UAE' },
  { code: '973', country: 'Bahrain' },
  { code: '974', country: 'Qatar' },
  { code: '20',  country: 'Egypt' },
  { code: '27',  country: 'South Africa' },
  { code: '31',  country: 'Netherlands' },
  { code: '33',  country: 'France' },
  { code: '34',  country: 'Spain' },
  { code: '36',  country: 'Hungary' },
  { code: '39',  country: 'Italy' },
  { code: '40',  country: 'Romania' },
  { code: '41',  country: 'Switzerland' },
  { code: '43',  country: 'Austria' },
  { code: '44',  country: 'UK' },
  { code: '45',  country: 'Denmark' },
  { code: '46',  country: 'Sweden' },
  { code: '47',  country: 'Norway' },
  { code: '48',  country: 'Poland' },
  { code: '49',  country: 'Germany' },
  { code: '52',  country: 'Mexico' },
  { code: '55',  country: 'Brazil' },
  { code: '60',  country: 'Malaysia' },
  { code: '61',  country: 'Australia' },
  { code: '62',  country: 'Indonesia' },
  { code: '63',  country: 'Philippines' },
  { code: '64',  country: 'New Zealand' },
  { code: '65',  country: 'Singapore' },
  { code: '66',  country: 'Thailand' },
  { code: '81',  country: 'Japan' },
  { code: '82',  country: 'South Korea' },
  { code: '86',  country: 'China' },
  { code: '90',  country: 'Turkey' },
  { code: '92',  country: 'Pakistan' },
  { code: '94',  country: 'Sri Lanka' },
  { code: '95',  country: 'Myanmar' },
  { code: '98',  country: 'Iran' },
  { code: '1',   country: null },  // US / Canada — shared, needs location inference
  { code: '7',   country: 'Russia' },
]

function normalizeDigits(raw) {
  if (!raw) return ''
  const d = raw.replace(/[^0-9]/g, '')
  return d.startsWith('00') ? d.slice(2) : d
}

// Returns { group: 'A'|'B', dialCode, phone, country } or null if unrecognised.
function classifyPhone(raw) {
  const digits = normalizeDigits(raw)
  if (!digits) return null

  // Group A: Indian mobile
  if (digits.length === 12 && digits.startsWith('91') && /^[6-9]/.test(digits[2])) {
    return { group: 'A', dialCode: '91', phone: digits.slice(2), country: '' }
  }
  if (digits.length === 11 && digits[0] === '0' && /^[6-9]/.test(digits[1])) {
    return { group: 'A', dialCode: '91', phone: digits.slice(1), country: '' }
  }
  if (digits.length === 10 && /^[6-9]/.test(digits[0])) {
    return { group: 'A', dialCode: '91', phone: digits, country: '' }
  }

  // Group B: international — longest-prefix match
  for (const { code, country } of DIAL_CODES) {
    if (digits.startsWith(code)) {
      const num = digits.slice(code.length)
      if (num.length >= 7 && num.length <= 15) {
        return { group: 'B', dialCode: code, phone: num, country }
      }
    }
  }

  return null
}

// Strip leading ~ or @ from names used as CRM placeholders.
function usableName(raw) {
  if (!raw) return null
  let name = raw.trim()
  if (name[0] === '~' || name[0] === '@') name = name.slice(1).trim()
  return name || null
}

// For dial code '1' (US/CA shared), guess country from location text.
function inferCountry1(location) {
  const loc = (location || '').toLowerCase()
  if (/\bus\b|usa|united states?|america/.test(loc)) return 'US'
  if (/\bcanada\b/.test(loc)) return 'CA'
  return null
}

function csvCell(val) {
  return '"' + String(val ?? '').replace(/"/g, '""') + '"'
}

const TagMangoExport = forwardRef(function TagMangoExport(
  { people, sortedFiltered, selectedIds },
  ref
) {
  const [open, setOpen]               = useState(false)
  const [sourceChoice, setSourceChoice] = useState('selected') // 'selected' | 'filtered'
  const [groupBChecked, setGroupBChecked] = useState(new Set())
  const [batchSize, setBatchSize]     = useState(300)
  const [partIndex, setPartIndex]     = useState(0)

  const hasSelection = selectedIds.size > 0

  function doOpen() {
    setSourceChoice(selectedIds.size > 0 ? 'selected' : 'filtered')
    setGroupBChecked(new Set())
    setPartIndex(0)
    setOpen(true)
  }

  function doClose() {
    setOpen(false)
  }

  useImperativeHandle(ref, () => ({ open: doOpen }))

  // ── Resolve source list ───────────────────────────────────────────────────
  const sourcePeople = useMemo(() => {
    if (!hasSelection || sourceChoice === 'filtered') return sortedFiltered
    return people.filter(p => selectedIds.has(p.id))
  }, [hasSelection, sourceChoice, sortedFiltered, people, selectedIds])

  // ── Process into Group A / Group B / skip counts ─────────────────────────
  const { groupA, groupB, skipDeclined, skipName, skipPhone, skipDup } = useMemo(() => {
    const groupA = [], groupB = []
    let skipDeclined = 0, skipName = 0, skipPhone = 0, skipDup = 0
    const seen = new Set()

    for (const p of sourcePeople) {
      if (p.community_status === 'declined') { skipDeclined++; continue }
      const name = usableName(p.full_name)
      if (!name) { skipName++; continue }
      const c = classifyPhone(p.phone)
      if (!c) { skipPhone++; continue }
      const key = `${c.dialCode}:${c.phone}`
      if (seen.has(key)) { skipDup++; continue }
      seen.add(key)

      if (c.group === 'A') {
        groupA.push({ person: p, name, dialCode: '91', phone: c.phone, country: '' })
      } else {
        // c.country: null = code shared by multiple countries (currently only '1')
        let country = c.country
        let countryUnsure = false
        if (c.country === null) {
          country = inferCountry1(p.location) || ''
          countryUnsure = !country
        }
        groupB.push({
          person: p,
          name,
          dialCode: c.dialCode,
          phone: c.phone,
          country: country ?? '',
          countryUnsure,
        })
      }
    }

    return { groupA, groupB, skipDeclined, skipName, skipPhone, skipDup }
  }, [sourcePeople])

  // ── Final export list ────────────────────────────────────────────────────
  const tickedGroupB = groupB.filter(item => groupBChecked.has(item.person.id))
  const finalList    = [...groupA, ...tickedGroupB]
  const size         = Math.max(1, batchSize)
  const totalParts   = Math.max(1, Math.ceil(finalList.length / size))
  const clampedPart  = Math.min(partIndex, totalParts - 1)
  const partRowCount = Math.min(size, Math.max(0, finalList.length - clampedPart * size))

  // ── Download ─────────────────────────────────────────────────────────────
  function handleDownload() {
    const partRows = finalList.slice(clampedPart * size, (clampedPart + 1) * size)
    const header   = 'name,dial_code,country,email,phone,validity_days,valid_until'
    const lines    = [header]
    for (const item of partRows) {
      lines.push([
        item.name,
        item.dialCode,
        item.country,
        item.person.email || '',
        item.phone,
        '',
        '',
      ].map(csvCell).join(','))
    }
    const csv  = '﻿' + lines.join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const now  = new Date()
    const d    = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const a    = document.createElement('a')
    a.href     = url
    a.download = `tagmango-upload-${d}-part${clampedPart + 1}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <button
        onClick={doOpen}
        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 bg-white hover:border-gray-300 hover:bg-gray-50 transition-colors whitespace-nowrap"
      >
        Download CSV for TagMango
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={doClose}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-xl shadow-xl max-h-[88vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
              <h2 className="text-base font-semibold text-gray-900">Download CSV for TagMango</h2>
              <button
                onClick={doClose}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 p-6 space-y-5">

              {/* Source choice — only shown when there is a selection */}
              {hasSelection && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Source</p>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="radio"
                      name="tmSource"
                      value="selected"
                      checked={sourceChoice === 'selected'}
                      onChange={() => { setSourceChoice('selected'); setPartIndex(0) }}
                      className="accent-[#1742b5]"
                    />
                    <span className="text-sm text-gray-700">
                      Selected people{' '}
                      <span className="text-gray-400">({selectedIds.size.toLocaleString()})</span>
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="radio"
                      name="tmSource"
                      value="filtered"
                      checked={sourceChoice === 'filtered'}
                      onChange={() => { setSourceChoice('filtered'); setPartIndex(0) }}
                      className="accent-[#1742b5]"
                    />
                    <span className="text-sm text-gray-700">
                      All in current list{' '}
                      <span className="text-gray-400">({sortedFiltered.length.toLocaleString()})</span>
                    </span>
                  </label>
                </div>
              )}

              {/* Counts summary */}
              <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-500">People considered</span>
                  <span className="font-medium text-gray-800">{sourcePeople.length.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Group A — India (ready)</span>
                  <span className="font-medium text-gray-800">{groupA.length.toLocaleString()}</span>
                </div>
                {groupB.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">
                      Group B — International (review
                      {tickedGroupB.length > 0 ? `, ${tickedGroupB.length} ticked` : ''})
                    </span>
                    <span className="font-medium text-gray-800">{groupB.length.toLocaleString()}</span>
                  </div>
                )}
                {(skipDeclined + skipName + skipPhone + skipDup) > 0 && (
                  <div className="pt-2 border-t border-gray-200 space-y-1">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Skipped</p>
                    {skipDeclined > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400">Declined community</span>
                        <span className="text-gray-600">{skipDeclined.toLocaleString()}</span>
                      </div>
                    )}
                    {skipName > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400">No usable name</span>
                        <span className="text-gray-600">{skipName.toLocaleString()}</span>
                      </div>
                    )}
                    {skipPhone > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400">No usable phone</span>
                        <span className="text-gray-600">{skipPhone.toLocaleString()}</span>
                      </div>
                    )}
                    {skipDup > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400">Duplicate number</span>
                        <span className="text-gray-600">{skipDup.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                )}
                <div className="flex justify-between pt-2 mt-1 border-t border-gray-200">
                  <span className="font-semibold text-gray-700">To export</span>
                  <span className="font-bold text-[#1742b5]">{finalList.length.toLocaleString()}</span>
                </div>
              </div>

              {/* Group B review list */}
              {groupB.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                      International numbers — tick to include
                    </p>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setGroupBChecked(new Set(groupB.map(i => i.person.id)))}
                        className="text-xs text-[#1742b5] hover:underline"
                      >
                        Tick all
                      </button>
                      {groupBChecked.size > 0 && (
                        <button
                          onClick={() => setGroupBChecked(new Set())}
                          className="text-xs text-gray-400 hover:text-gray-600 hover:underline"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-52 overflow-y-auto">
                    {groupB.map(item => (
                      <label
                        key={item.person.id}
                        className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50"
                      >
                        <input
                          type="checkbox"
                          checked={groupBChecked.has(item.person.id)}
                          onChange={e => setGroupBChecked(prev => {
                            const n = new Set(prev)
                            e.target.checked ? n.add(item.person.id) : n.delete(item.person.id)
                            return n
                          })}
                          className="mt-0.5 w-4 h-4 rounded border-gray-300 accent-[#1742b5] flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-800">{item.name}</span>
                          <span className="text-xs font-mono text-gray-500">+{item.dialCode} {item.phone}</span>
                          {item.person.location && (
                            <span className="text-xs text-gray-400">{item.person.location}</span>
                          )}
                          {item.country && (
                            <span className="text-xs font-medium bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                              {item.country}
                            </span>
                          )}
                          {item.countryUnsure && (
                            <span className="text-xs font-medium bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                              country unsure
                            </span>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Rows per file + part selector */}
              <div className="flex items-end gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                    Rows per file
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={batchSize}
                    onChange={e => {
                      setBatchSize(Math.max(1, parseInt(e.target.value, 10) || 1))
                      setPartIndex(0)
                    }}
                    className="w-28 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1742b5]/20 focus:border-[#1742b5]"
                  />
                </div>
                {totalParts > 1 && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                      File part
                    </label>
                    <select
                      value={clampedPart}
                      onChange={e => setPartIndex(Number(e.target.value))}
                      className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1742b5]/20 focus:border-[#1742b5]"
                    >
                      {Array.from({ length: totalParts }, (_, i) => (
                        <option key={i} value={i}>Part {i + 1} of {totalParts}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
              <button
                onClick={doClose}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDownload}
                disabled={finalList.length === 0}
                className="px-5 py-2 text-sm font-medium bg-[#1742b5] text-white rounded-lg hover:bg-[#1330a0] disabled:opacity-50 transition-colors"
              >
                Download{totalParts > 1 ? ` Part ${clampedPart + 1}` : ''}{' '}
                ({partRowCount.toLocaleString()} rows)
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
})

export default TagMangoExport
