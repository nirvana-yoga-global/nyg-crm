import { useState, useRef } from 'react'
import { X } from 'lucide-react'

// Handles quoted fields, commas inside quotes, and newlines inside quotes (RFC 4180).
function parseCSV(text) {
  const rows = []
  let i = 0
  const n = text.length
  while (i < n) {
    const row = []
    while (i < n) {
      let field = ''
      if (text[i] === '"') {
        i++
        while (i < n) {
          if (text[i] === '"') {
            if (i + 1 < n && text[i + 1] === '"') {
              field += '"'
              i += 2
            } else {
              i++
              break
            }
          } else {
            field += text[i++]
          }
        }
      } else {
        while (i < n && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') {
          field += text[i++]
        }
      }
      row.push(field)
      if (i < n && text[i] === ',') {
        i++
      } else {
        break
      }
    }
    if (i < n && text[i] === '\r') i++
    if (i < n && text[i] === '\n') i++
    if (row.length > 1 || (row.length === 1 && row[0] !== '')) rows.push(row)
  }
  return rows
}

// Returns the last 10 digits of a phone string as a matching key.
// Returns null if fewer than 7 digits are present (too short to be useful).
function last10Key(raw) {
  if (!raw) return null
  const digits = raw.replace(/[^0-9]/g, '')
  if (digits.length < 7) return null
  return digits.slice(-10)
}

// Derives an international-format phone string from a people row.
function toIntlPhone(p) {
  if (p.phone_normalized) return '+' + p.phone_normalized
  if (!p.phone) return ''
  const digits = p.phone.replace(/[^0-9]/g, '')
  if (digits.length === 10) return '+91' + digits
  return '+' + digits
}

// Always double-quotes the cell value so phone numbers are never parsed as numbers.
function csvCell(val) {
  return '"' + String(val ?? '').replace(/"/g, '""') + '"'
}

export default function ContactsExport({ people }) {
  const [open, setOpen]           = useState(false)
  const [contacts, setContacts]   = useState(null)   // Set<string> of last-10-digit keys
  const [phoneCount, setPhoneCount] = useState(0)    // unique keys from the file
  const [batchSize, setBatchSize] = useState(200)
  const [fileError, setFileError] = useState('')
  const fileRef = useRef(null)

  function handleClose() {
    setOpen(false)
    setContacts(null)
    setPhoneCount(0)
    setFileError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileError('')
    setContacts(null)

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        let text = evt.target.result
        // Strip BOM if present
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1)

        const rows = parseCSV(text)
        if (rows.length < 2) {
          setFileError('File appears empty or has no data rows.')
          return
        }

        const headers = rows[0]
        const phoneColIdxs = headers.reduce((acc, h, idx) => {
          if (/^Phone \d+ - Value$/i.test(h.trim())) acc.push(idx)
          return acc
        }, [])

        if (phoneColIdxs.length === 0) {
          setFileError('No "Phone N - Value" columns found. Make sure this is a Google Contacts export.')
          return
        }

        const keys = new Set()
        for (let r = 1; r < rows.length; r++) {
          const row = rows[r]
          for (const ci of phoneColIdxs) {
            const cell = row[ci] ?? ''
            // Google Contacts separates multiple numbers with ' ::: '
            for (const part of cell.split(' ::: ')) {
              const k = last10Key(part)
              if (k) keys.add(k)
            }
          }
        }

        setPhoneCount(keys.size)
        setContacts(keys)
      } catch (err) {
        setFileError('Failed to parse file: ' + err.message)
      }
    }
    reader.onerror = () => setFileError('Failed to read file.')
    reader.readAsText(file)
  }

  // Derive export list and counts from the current people list.
  let skipJoinedDeclined = 0
  let skipNoPhone = 0
  let alreadySaved = 0
  const seenKeys = new Set()
  const toExportList = []

  for (const p of people) {
    const st = p.community_status
    if (st === 'joined' || st === 'declined') {
      skipJoinedDeclined++
      continue
    }
    const key = last10Key(p.phone)
    if (!key) {
      skipNoPhone++
      continue
    }
    if (contacts?.has(key)) {
      alreadySaved++
      continue
    }
    if (seenKeys.has(key)) continue
    seenKeys.add(key)
    toExportList.push(p)
  }

  const skipDuplicates = people.length - skipJoinedDeclined - skipNoPhone - alreadySaved - toExportList.length

  function handleDownload() {
    const now = new Date()
    const monthYear = now.toLocaleString('en-US', { month: 'short', year: 'numeric' })
    const prefix = `NYG ${monthYear}`
    const size = Math.max(1, batchSize)

    const header = ['First Name', 'Last Name', 'Phone 1 - Label', 'Phone 1 - Value', 'Labels']
    const lines = [header.map(csvCell).join(',')]

    toExportList.forEach((p, idx) => {
      const batchNum = Math.floor(idx / size) + 1
      lines.push([
        'NYG ' + p.full_name,
        '',
        'Mobile',
        toIntlPhone(p),
        `${prefix} - Batch ${batchNum}`,
      ].map(csvCell).join(','))
    })

    const csv = '﻿' + lines.join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `nyg-contacts-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 bg-white hover:border-gray-300 hover:bg-gray-50 transition-colors whitespace-nowrap"
      >
        Export for Google Contacts
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={handleClose}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-lg shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Export for Google Contacts</h2>
              <button
                onClick={handleClose}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <p className="text-sm text-gray-600">
                Load your existing Google Contacts export to find people in the CRM who are not yet saved in your phone.
                Everything is processed in your browser — the file is never uploaded or stored anywhere.
              </p>

              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                  Your Google Contacts CSV
                </label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-gray-200 file:bg-gray-50 file:text-xs file:font-medium file:text-gray-600 hover:file:bg-gray-100 cursor-pointer"
                />
                {fileError && <p className="mt-2 text-xs text-red-600">{fileError}</p>}
              </div>

              {contacts && (
                <>
                  <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Numbers in your contacts file</span>
                      <span className="font-medium text-gray-800">{phoneCount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">People in current list</span>
                      <span className="font-medium text-gray-800">{people.length.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Already saved in phone</span>
                      <span className="font-medium text-gray-800">{alreadySaved.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Skipped (joined / declined / no phone / duplicates)</span>
                      <span className="font-medium text-gray-800">
                        {(skipJoinedDeclined + skipNoPhone + skipDuplicates).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between pt-2 mt-1 border-t border-gray-200">
                      <span className="font-semibold text-gray-700">To export</span>
                      <span className="font-bold text-[#1742b5]">{toExportList.length.toLocaleString()}</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                      People per batch
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={batchSize}
                      onChange={e => setBatchSize(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-28 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1742b5]/20 focus:border-[#1742b5]"
                    />
                    <p className="mt-1 text-xs text-gray-400">
                      Each batch gets a label like "NYG Oct 2026 - Batch 1", "NYG Oct 2026 - Batch 2"…
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
              >
                Cancel
              </button>
              {contacts && (
                <button
                  onClick={handleDownload}
                  disabled={toExportList.length === 0}
                  className="px-5 py-2 text-sm font-medium bg-[#1742b5] text-white rounded-lg hover:bg-[#1330a0] disabled:opacity-50 transition-colors"
                >
                  Download CSV ({toExportList.length.toLocaleString()})
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
