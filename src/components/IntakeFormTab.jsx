import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useCourses } from '../hooks/useCourses'

// ── Option lists ──────────────────────────────────────────────────────────────
const SEX_OPTS     = ['Male', 'Female', 'Other']
const MARITAL_OPTS = ['Single', 'Married', 'Divorced', 'Widowed']
const SOURCE_OPTS  = ['Walk-in', 'Referral', 'Social Media', 'Website', 'WhatsApp', 'Other']
const FOOD_OPTS    = ['Vegetarian', 'Non-vegetarian']
const APPETITE_OPTS = ['Normal', 'Poor']
const SLEEP_OPTS   = ['Normal', 'Disturbed']
const BOWELS_OPTS  = ['Normal', 'Constipation', 'Loose']
const BLADDER_OPTS = ['Normal', 'Intermittent']
const COLOUR_OPTS  = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Indigo', 'Violet', 'White', 'Black', 'Brown']
const TASTE_OPTS   = ['Sweet', 'Sour', 'Salty', 'Bitter', 'Pungent', 'Astringent']

const EMPTY = {
  full_name: '', date_of_birth: '', sex: '', marital_status: '', profession: '',
  education: '', address: '', pin_code: '', phone: '', email: '', source: '',
  registration_date: '',
  course: '', venue: '', previous_yoga_experience: false, previous_yoga_details: '',
  protocol_assigned: '', practices_prescribed: '',
  current_conditions: false, current_conditions_details: '', chief_complaints: '',
  symptoms: '', treatment_details: '', present_state: '',
  history_of_illness: '', past_history: '', family_history: '',
  food_type: '', appetite: '', sleep: '', waking_time: '', bowels: '', bladder: '',
  smoking: false, alcohol: false, cigarettes_per_day: '', drug_use: '', exercise_pattern: '',
  favourite_colour: '', favourite_taste: '', preferred_number_1: '', preferred_number_2: '',
  height_cm: '', weight_kg: '', pulse_bpm: '', systolic_bp: '', diastolic_bp: '',
  respiratory_rate: '',
  photo_path: '',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function calcBMI(h, w) {
  const hf = parseFloat(h), wf = parseFloat(w)
  if (!hf || !wf || hf <= 0) return ''
  return (wf / ((hf / 100) ** 2)).toFixed(1)
}

function clampNum(val, min, max) {
  const n = parseInt(val, 10)
  if (isNaN(n)) return ''
  return Math.min(max, Math.max(min, n))
}

// Converts the form state object into a DB-safe payload.
// Empty strings → null; numeric/integer fields → number or null; booleans pass through.
const NUMERIC_FIELDS = new Set(['height_cm', 'weight_kg'])
const INT_FIELDS = new Set([
  'pulse_bpm', 'systolic_bp', 'diastolic_bp', 'respiratory_rate',
  'preferred_number_1', 'preferred_number_2', 'cigarettes_per_day',
])

function sanitizeForDb(obj) {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => {
      if (typeof v === 'boolean') return [k, v]
      if (v === '' || v == null) return [k, null]
      if (NUMERIC_FIELDS.has(k)) {
        const n = parseFloat(v)
        return [k, isNaN(n) ? null : n]
      }
      if (INT_FIELDS.has(k)) {
        const n = parseInt(v, 10)
        return [k, isNaN(n) ? null : n]
      }
      return [k, v]
    })
  )
}

async function processPhotoToBlob(file) {
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.src = url
  await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject })
  URL.revokeObjectURL(url)

  const TARGET = 7 / 9
  const { naturalWidth: srcW, naturalHeight: srcH } = img
  let sx, sy, sw, sh
  if (srcW / srcH > TARGET) {
    sh = srcH; sw = Math.round(srcH * TARGET); sx = Math.round((srcW - sw) / 2); sy = 0
  } else {
    sw = srcW; sh = Math.round(srcW / TARGET); sx = 0; sy = Math.round((srcH - sh) / 2)
  }

  const scale = Math.min(1, 560 / sw)
  const outW = Math.round(sw * scale)
  const outH = Math.round(sh * scale)

  const canvas = document.createElement('canvas')
  canvas.width = outW; canvas.height = outH
  canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH)

  return new Promise((resolve, reject) =>
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas empty')), 'image/jpeg', 0.85)
  )
}

// ── Primitive field components ────────────────────────────────────────────────
function Label({ text }) {
  return <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{text}</span>
}

function Field({ label, col, children }) {
  return (
    <div className={`flex flex-col gap-1.5 ${col ? `col-span-${col}` : ''}`}>
      <Label text={label} />
      {children}
    </div>
  )
}

function Input({ type = 'text', value, onChange, placeholder, readOnly }) {
  return (
    <input
      type={type}
      value={value ?? ''}
      onChange={e => onChange && onChange(e.target.value)}
      placeholder={placeholder}
      readOnly={readOnly}
      className={`px-3 py-2 border rounded-lg text-sm focus:outline-none transition-colors ${
        readOnly
          ? 'bg-gray-50 border-gray-100 text-gray-600 cursor-default'
          : 'bg-white border-gray-200 focus:ring-2 focus:ring-[#1742b5]/20 focus:border-[#1742b5]'
      }`}
    />
  )
}

function Select({ value, onChange, options }) {
  return (
    <select
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1742b5]/20 focus:border-[#1742b5]"
    >
      <option value="">— Select —</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

function Textarea({ value, onChange, placeholder, rows = 3 }) {
  return (
    <textarea
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1742b5]/20 focus:border-[#1742b5] resize-none"
    />
  )
}

function Toggle({ value, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="flex items-center gap-2.5 w-fit"
    >
      <div className={`w-10 h-5 rounded-full relative transition-colors ${value ? 'bg-[#1742b5]' : 'bg-gray-200'}`}>
        <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 shadow-sm transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </div>
      <span className={`text-sm font-medium ${value ? 'text-[#1742b5]' : 'text-gray-400'}`}>
        {value ? 'Yes' : 'No'}
      </span>
    </button>
  )
}

function SectionHeader({ n, title }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-7 h-7 rounded-lg bg-[#1742b5] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
        {n}
      </div>
      <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">{title}</h3>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
  )
}

// ── Passport photo box ────────────────────────────────────────────────────────
function Silhouette() {
  return (
    <svg viewBox="0 0 70 90" fill="none" xmlns="http://www.w3.org/2000/svg"
         style={{ width: '55%', height: '55%' }}>
      <circle cx="35" cy="28" r="18" fill="#d1d5db" />
      <path d="M5 90 Q5 62 35 62 Q65 62 65 90 Z" fill="#d1d5db" />
    </svg>
  )
}

function PhotoBox({ editable, photoPreviewUrl, photoSignedUrl, photoError, onPhotoChange, onPhotoRemove }) {
  const fileRef = useRef(null)
  const displaySrc = photoPreviewUrl || photoSignedUrl

  return (
    <div className="flex flex-col items-center gap-2 flex-shrink-0">
      <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Photo</span>
      <div
        style={{ width: '140px', height: '180px' }}
        className="border-2 border-dashed border-gray-200 rounded-lg overflow-hidden bg-gray-50 flex items-center justify-center"
      >
        {displaySrc
          ? <img src={displaySrc} alt="Passport photo" className="w-full h-full object-cover" />
          : <Silhouette />
        }
      </div>
      {editable && (
        <>
          <div className="flex gap-1.5">
            <label className="cursor-pointer px-2.5 py-1.5 text-xs font-medium bg-[#1742b5] text-white rounded-lg hover:bg-[#1338a0] transition-colors">
              {displaySrc ? 'Replace' : 'Upload'}
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={onPhotoChange}
              />
            </label>
            {displaySrc && (
              <button
                type="button"
                onClick={onPhotoRemove}
                className="px-2.5 py-1.5 text-xs font-medium border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
              >
                Remove
              </button>
            )}
          </div>
          {photoError && (
            <p className="text-[11px] text-red-500 text-center" style={{ maxWidth: '140px' }}>{photoError}</p>
          )}
        </>
      )}
    </div>
  )
}

// ── View mode ─────────────────────────────────────────────────────────────────
function ViewCell({ label, value, col }) {
  if (value === null || value === undefined || value === '') return null
  const display = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)
  return (
    <div className={`flex flex-col gap-0.5 ${col ? `col-span-${col}` : ''}`}>
      <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</span>
      <span className="text-sm text-gray-900 leading-snug">{display}</span>
    </div>
  )
}

function ViewSection({ n, title, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <SectionHeader n={n} title={title} />
      <div className="grid grid-cols-3 gap-x-8 gap-y-5">{children}</div>
    </div>
  )
}

function ViewMode({ form, photoSignedUrl, onEdit }) {
  const bmi = calcBMI(form.height_cm, form.weight_kg)
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <PhotoBox editable={false} photoSignedUrl={photoSignedUrl} />
        <button
          onClick={onEdit}
          className="px-4 py-2 text-sm font-medium bg-[#1742b5] text-white rounded-lg hover:bg-[#1330a0] transition-colors"
        >
          Edit
        </button>
      </div>

      <ViewSection n="1" title="Basic Info">
        <ViewCell label="Full Name"         value={form.full_name} />
        <ViewCell label="Date of Birth"     value={form.date_of_birth} />
        <ViewCell label="Sex"               value={form.sex} />
        <ViewCell label="Marital Status"    value={form.marital_status} />
        <ViewCell label="Profession"        value={form.profession} />
        <ViewCell label="Education"         value={form.education} />
        <ViewCell label="Phone"             value={form.phone} />
        <ViewCell label="Email"             value={form.email} />
        <ViewCell label="Pin Code"          value={form.pin_code} />
        <ViewCell label="Source"            value={form.source} />
        <ViewCell label="Registration Date" value={form.registration_date} />
        <ViewCell label="Address"           value={form.address} col={3} />
      </ViewSection>

      <ViewSection n="2" title="Program">
        <ViewCell label="Course"                   value={form.course} />
        <ViewCell label="Venue"                    value={form.venue} />
        <ViewCell label="Previous Yoga Experience" value={form.previous_yoga_experience} />
        {form.previous_yoga_experience &&
          <ViewCell label="Experience Details"     value={form.previous_yoga_details} />}
        <ViewCell label="Protocol Assigned"        value={form.protocol_assigned} />
        <ViewCell label="Practices Prescribed"     value={form.practices_prescribed} col={3} />
      </ViewSection>

      <ViewSection n="3" title="Health Background">
        <ViewCell label="Current Conditions"   value={form.current_conditions} />
        {form.current_conditions &&
          <ViewCell label="Condition Details"  value={form.current_conditions_details} col={2} />}
        <ViewCell label="Chief Complaints"     value={form.chief_complaints}    col={3} />
        <ViewCell label="Symptoms"             value={form.symptoms}             col={3} />
        <ViewCell label="Treatment Details"    value={form.treatment_details}   col={3} />
        <ViewCell label="Present State"        value={form.present_state}       col={3} />
        <ViewCell label="History of Illness"   value={form.history_of_illness}  col={3} />
        <ViewCell label="Past History"         value={form.past_history}        col={3} />
        <ViewCell label="Family History"       value={form.family_history}      col={3} />
      </ViewSection>

      <ViewSection n="4" title="Lifestyle">
        <ViewCell label="Food Type"         value={form.food_type} />
        <ViewCell label="Appetite"          value={form.appetite} />
        <ViewCell label="Sleep"             value={form.sleep} />
        <ViewCell label="Waking Time"       value={form.waking_time} />
        <ViewCell label="Bowels"            value={form.bowels} />
        <ViewCell label="Bladder"           value={form.bladder} />
        <ViewCell label="Smoking"           value={form.smoking} />
        {form.smoking && <ViewCell label="Cigarettes / Day" value={form.cigarettes_per_day} />}
        <ViewCell label="Alcohol"           value={form.alcohol} />
        <ViewCell label="Drug Use"          value={form.drug_use} />
        <ViewCell label="Exercise Pattern"  value={form.exercise_pattern} col={3} />
      </ViewSection>

      <ViewSection n="5" title="NYG Assessment">
        <ViewCell label="Favourite Colour"   value={form.favourite_colour} />
        <ViewCell label="Favourite Taste"    value={form.favourite_taste} />
        <ViewCell label="Preferred Number 1" value={form.preferred_number_1} />
        <ViewCell label="Preferred Number 2" value={form.preferred_number_2} />
      </ViewSection>

      <ViewSection n="6" title="Vitals">
        <ViewCell label="Height (cm)"      value={form.height_cm} />
        <ViewCell label="Weight (kg)"      value={form.weight_kg} />
        <ViewCell label="BMI"              value={bmi || '—'} />
        <ViewCell label="Pulse (bpm)"      value={form.pulse_bpm} />
        <ViewCell label="Systolic BP"      value={form.systolic_bp ? `${form.systolic_bp} mmHg` : ''} />
        <ViewCell label="Diastolic BP"     value={form.diastolic_bp ? `${form.diastolic_bp} mmHg` : ''} />
        <ViewCell label="Respiratory Rate" value={form.respiratory_rate ? `${form.respiratory_rate} /min` : ''} />
      </ViewSection>
    </div>
  )
}

// ── Edit / New mode ───────────────────────────────────────────────────────────
function EditMode({
  form, setForm, onSave, onCancel, saving, error, isNew,
  photoPreviewUrl, photoSignedUrl, photoError, onPhotoChange, onPhotoRemove,
}) {
  const set = key => val => setForm(prev => ({ ...prev, [key]: val }))
  const bmi = calcBMI(form.height_cm, form.weight_kg)
  const bottomErrorRef = useRef(null)
  useEffect(() => {
    if (error && bottomErrorRef.current) {
      bottomErrorRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [error])

  return (
    <div className="space-y-5">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Passport photo */}
      <PhotoBox
        editable
        photoPreviewUrl={photoPreviewUrl}
        photoSignedUrl={photoSignedUrl}
        photoError={photoError}
        onPhotoChange={onPhotoChange}
        onPhotoRemove={onPhotoRemove}
      />

      {/* Section 1 — Basic Info */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <SectionHeader n="1" title="Basic Info" />
        <div className="grid grid-cols-3 gap-x-6 gap-y-5">
          <Field label="Full Name">
            <Input value={form.full_name} onChange={set('full_name')} placeholder="Student's full name" />
          </Field>
          <Field label="Date of Birth">
            <Input type="date" value={form.date_of_birth} onChange={set('date_of_birth')} />
          </Field>
          <Field label="Sex">
            <Select value={form.sex} onChange={set('sex')} options={SEX_OPTS} />
          </Field>
          <Field label="Marital Status">
            <Select value={form.marital_status} onChange={set('marital_status')} options={MARITAL_OPTS} />
          </Field>
          <Field label="Profession">
            <Input value={form.profession} onChange={set('profession')} placeholder="e.g. Teacher" />
          </Field>
          <Field label="Education">
            <Input value={form.education} onChange={set('education')} placeholder="Highest qualification" />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={set('phone')} placeholder="+91 XXXXX XXXXX" />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={set('email')} placeholder="email@example.com" />
          </Field>
          <Field label="Pin Code">
            <Input value={form.pin_code} onChange={set('pin_code')} placeholder="6-digit pin" />
          </Field>
          <Field label="Source">
            <Select value={form.source} onChange={set('source')} options={SOURCE_OPTS} />
          </Field>
          <Field label="Registration Date">
            <Input type="date" value={form.registration_date} onChange={set('registration_date')} />
          </Field>
          <Field label="Address" col={3}>
            <Input value={form.address} onChange={set('address')} placeholder="Full address" />
          </Field>
        </div>
      </div>

      {/* Section 2 — Program */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <SectionHeader n="2" title="Program" />
        <div className="grid grid-cols-3 gap-x-6 gap-y-5">
          <Field label="Course">
            <Select value={form.course} onChange={set('course')} options={courseOptions.map(c => c.name)} />
          </Field>
          <Field label="Venue">
            <Input value={form.venue} onChange={set('venue')} placeholder="Class venue or meeting link" />
          </Field>
          <Field label="Previous Yoga Experience">
            <div className="py-1.5">
              <Toggle value={form.previous_yoga_experience} onChange={set('previous_yoga_experience')} />
            </div>
          </Field>
          {form.previous_yoga_experience && (
            <Field label="Experience Details">
              <Input value={form.previous_yoga_details} onChange={set('previous_yoga_details')} placeholder="Describe prior yoga practice" />
            </Field>
          )}
          <Field label="Protocol Assigned">
            <Input value={form.protocol_assigned} onChange={set('protocol_assigned')} placeholder="Protocol name or code" />
          </Field>
          <Field label="Practices Prescribed" col={3}>
            <Textarea value={form.practices_prescribed} onChange={set('practices_prescribed')} placeholder="List all prescribed practices…" />
          </Field>
        </div>
      </div>

      {/* Section 3 — Health Background */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <SectionHeader n="3" title="Health Background" />
        <div className="grid grid-cols-3 gap-x-6 gap-y-5">
          <Field label="Current Conditions">
            <div className="py-1.5">
              <Toggle value={form.current_conditions} onChange={set('current_conditions')} />
            </div>
          </Field>
          {form.current_conditions && (
            <Field label="Condition Details" col={2}>
              <Input value={form.current_conditions_details} onChange={set('current_conditions_details')} placeholder="Describe current health conditions" />
            </Field>
          )}
          <Field label="Chief Complaints" col={3}>
            <Textarea value={form.chief_complaints} onChange={set('chief_complaints')} placeholder="Primary complaints…" />
          </Field>
          <Field label="Symptoms" col={3}>
            <Textarea value={form.symptoms} onChange={set('symptoms')} placeholder="Current symptoms…" />
          </Field>
          <Field label="Treatment Details" col={3}>
            <Textarea value={form.treatment_details} onChange={set('treatment_details')} placeholder="Treatments undergone, medicines currently taken…" />
          </Field>
          <Field label="Present State" col={3}>
            <Textarea value={form.present_state} onChange={set('present_state')} placeholder="Current condition / present state…" />
          </Field>
          <Field label="History of Illness" col={3}>
            <Textarea value={form.history_of_illness} onChange={set('history_of_illness')} placeholder="Previous illnesses and treatments…" />
          </Field>
          <Field label="Past History" col={3}>
            <Textarea value={form.past_history} onChange={set('past_history')} placeholder="Surgical history, injuries, hospitalisations…" />
          </Field>
          <Field label="Family History" col={3}>
            <Textarea value={form.family_history} onChange={set('family_history')} placeholder="Relevant family medical history…" />
          </Field>
        </div>
      </div>

      {/* Section 4 — Lifestyle */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <SectionHeader n="4" title="Lifestyle" />
        <div className="grid grid-cols-3 gap-x-6 gap-y-5">
          <Field label="Food Type">
            <Select value={form.food_type} onChange={set('food_type')} options={FOOD_OPTS} />
          </Field>
          <Field label="Appetite">
            <Select value={form.appetite} onChange={set('appetite')} options={APPETITE_OPTS} />
          </Field>
          <Field label="Sleep">
            <Select value={form.sleep} onChange={set('sleep')} options={SLEEP_OPTS} />
          </Field>
          <Field label="Waking Time">
            <Input type="time" value={form.waking_time} onChange={set('waking_time')} />
          </Field>
          <Field label="Bowels">
            <Select value={form.bowels} onChange={set('bowels')} options={BOWELS_OPTS} />
          </Field>
          <Field label="Bladder">
            <Select value={form.bladder} onChange={set('bladder')} options={BLADDER_OPTS} />
          </Field>
          <Field label="Smoking">
            <div className="py-1.5">
              <Toggle value={form.smoking} onChange={set('smoking')} />
            </div>
          </Field>
          {form.smoking && (
            <Field label="Cigarettes / Day">
              <Input
                type="number"
                value={form.cigarettes_per_day}
                onChange={val => set('cigarettes_per_day')(val === '' ? '' : Math.max(0, parseInt(val, 10) || 0))}
                placeholder="e.g. 5"
              />
            </Field>
          )}
          <Field label="Alcohol">
            <div className="py-1.5">
              <Toggle value={form.alcohol} onChange={set('alcohol')} />
            </div>
          </Field>
          <Field label="Drug Use">
            <Input value={form.drug_use} onChange={set('drug_use')} placeholder="Specify if any…" />
          </Field>
          <Field label="Exercise Pattern" col={3}>
            <Input value={form.exercise_pattern} onChange={set('exercise_pattern')} placeholder="Describe exercise habits…" />
          </Field>
        </div>
      </div>

      {/* Section 5 — NYG Assessment */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <SectionHeader n="5" title="NYG Assessment" />
        <div className="grid grid-cols-3 gap-x-6 gap-y-5">
          <Field label="Favourite Colour">
            <Select value={form.favourite_colour} onChange={set('favourite_colour')} options={COLOUR_OPTS} />
          </Field>
          <Field label="Favourite Taste">
            <Select value={form.favourite_taste} onChange={set('favourite_taste')} options={TASTE_OPTS} />
          </Field>
          <Field label="Preferred Number 1 (1–9)">
            <Input
              type="number"
              value={form.preferred_number_1}
              onChange={val => set('preferred_number_1')(val === '' ? '' : clampNum(val, 1, 9))}
              placeholder="1–9"
            />
          </Field>
          <Field label="Preferred Number 2 (1–9)">
            <Input
              type="number"
              value={form.preferred_number_2}
              onChange={val => set('preferred_number_2')(val === '' ? '' : clampNum(val, 1, 9))}
              placeholder="1–9"
            />
          </Field>
        </div>
      </div>

      {/* Section 6 — Vitals */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <SectionHeader n="6" title="Vitals" />
        <div className="grid grid-cols-3 gap-x-6 gap-y-5">
          <Field label="Height (cm)">
            <Input type="number" value={form.height_cm} onChange={set('height_cm')} placeholder="e.g. 165" />
          </Field>
          <Field label="Weight (kg)">
            <Input type="number" value={form.weight_kg} onChange={set('weight_kg')} placeholder="e.g. 62" />
          </Field>
          <Field label="BMI (auto-calculated)">
            <div className="px-3 py-2 border border-gray-100 bg-gray-50 rounded-lg text-sm text-gray-700 font-semibold">
              {bmi || <span className="font-normal text-gray-400">—</span>}
            </div>
          </Field>
          <Field label="Pulse (bpm)">
            <Input type="number" value={form.pulse_bpm} onChange={set('pulse_bpm')} placeholder="e.g. 72" />
          </Field>
          <Field label="Systolic BP (mmHg)">
            <Input type="number" value={form.systolic_bp} onChange={set('systolic_bp')} placeholder="e.g. 120" />
          </Field>
          <Field label="Diastolic BP (mmHg)">
            <Input type="number" value={form.diastolic_bp} onChange={set('diastolic_bp')} placeholder="e.g. 80" />
          </Field>
          <Field label="Respiratory Rate (/min)">
            <Input type="number" value={form.respiratory_rate} onChange={set('respiratory_rate')} placeholder="e.g. 16" />
          </Field>
        </div>
      </div>

      {/* Action bar */}
      <div className="space-y-3 py-2">
        {error && (
          <div ref={bottomErrorRef} className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
            {error}
          </div>
        )}
        <div className="flex items-center justify-end gap-3">
          {!isNew && (
            <button
              onClick={onCancel}
              className="px-5 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:border-gray-300 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            onClick={onSave}
            disabled={saving}
            className="px-6 py-2 text-sm font-medium bg-[#1742b5] text-white rounded-lg hover:bg-[#1330a0] disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save Intake Form'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
// Accepts personId (People profile), enquiryId (lead form), or studentProfileId (student form).
// When personId is provided it tries three lookups: person_id → student_profile_id → enquiry_id.
// prefill: object of field values to pre-populate when creating a new form.
// onSave: called after a successful save (e.g. to refresh parent state).
export default function IntakeFormTab({ studentProfileId, enquiryId, personId, prefill, onSave }) {
  const [form, setForm]             = useState({ ...EMPTY })
  const [existing, setExisting]     = useState(null)
  const [editing, setEditing]       = useState(false)
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')

  const [photoFile, setPhotoFile]           = useState(null)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState(null)
  const [photoSignedUrl, setPhotoSignedUrl] = useState(null)
  const [photoRemoved, setPhotoRemoved]     = useState(false)
  const [photoError, setPhotoError]         = useState('')

  const courseOptions = useCourses({ includeValue: form.course || undefined })

  useEffect(() => {
    setLoading(true)
    setPhotoFile(null)
    setPhotoPreviewUrl(null)
    setPhotoSignedUrl(null)
    setPhotoRemoved(false)
    setPhotoError('')
    setEditing(false)
    setError('')

    async function load() {
      let data = null

      if (personId) {
        // 1. direct person_id lookup
        const { data: byPerson } = await supabase.from('intake_forms').select('*').eq('person_id', personId).maybeSingle()
        data = byPerson

        // 2. fallback: student_profile_id (PWA account)
        if (!data && studentProfileId) {
          const { data: byProfile } = await supabase.from('intake_forms').select('*').eq('student_profile_id', studentProfileId).maybeSingle()
          data = byProfile
        }

        // 3. fallback: via any enquiry linked to this person
        if (!data) {
          const { data: enquiries } = await supabase.from('enquiries').select('id').eq('person_id', personId)
          if (enquiries?.length) {
            const ids = enquiries.map(e => e.id)
            const { data: byEnquiry } = await supabase.from('intake_forms').select('*').in('enquiry_id', ids).maybeSingle()
            data = byEnquiry
          }
        }
      } else if (enquiryId) {
        const { data: d } = await supabase.from('intake_forms').select('*').eq('enquiry_id', enquiryId).maybeSingle()
        data = d
      } else if (studentProfileId) {
        const { data: d } = await supabase.from('intake_forms').select('*').eq('student_profile_id', studentProfileId).maybeSingle()
        data = d
      }

      if (data) {
        setExisting(data)
        setForm(data)
        if (data.photo_path) {
          const { data: urlData } = await supabase.storage.from('registration-photos').createSignedUrl(data.photo_path, 3600)
          setPhotoSignedUrl(urlData?.signedUrl || null)
        }
      } else {
        setExisting(null)
        const base = { ...EMPTY }
        if (prefill) {
          Object.entries(prefill).forEach(([k, v]) => {
            if (k in base && v !== undefined && v !== null && v !== '') base[k] = v
          })
        }
        setForm(base)
      }
      setLoading(false)
    }

    load()
  }, [personId, enquiryId, studentProfileId]) // eslint-disable-line react-hooks/exhaustive-deps

  function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setPhotoError('Upload a JPEG, PNG, or WebP image')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError('Photo must be under 5 MB')
      return
    }
    setPhotoError('')
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl)
    setPhotoFile(file)
    setPhotoPreviewUrl(URL.createObjectURL(file))
    setPhotoRemoved(false)
  }

  function handlePhotoRemove() {
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl)
    setPhotoFile(null)
    setPhotoPreviewUrl(null)
    setPhotoSignedUrl(null)
    if (form.photo_path) setPhotoRemoved(true)
    setPhotoError('')
  }

  async function handleSave() {
    setSaving(true)
    setError('')

    try {
      const ownerId = personId || enquiryId || studentProfileId

      let newPhotoPath = form.photo_path || null
      if (photoFile) {
        const blob = await processPhotoToBlob(photoFile)
        const path = `${ownerId}/photo.jpg`
        const { error: uploadErr } = await supabase.storage
          .from('registration-photos')
          .upload(path, blob, { contentType: 'image/jpeg', upsert: true })
        if (uploadErr) throw uploadErr
        newPhotoPath = path
      } else if (photoRemoved) {
        if (form.photo_path) {
          supabase.storage.from('registration-photos').remove([form.photo_path]).catch(() => {})
        }
        newPhotoPath = null
      }

      const { id: _id, created_at: _ca, updated_at: _ua, bmi: _bmi,
              enquiry_id: _ei, student_profile_id: _sp, person_id: _pid, ...rest } = form

      const payload = {
        ...sanitizeForDb(rest),
        photo_path: newPhotoPath,
        ...(personId && { person_id: personId }),
        ...(enquiryId && { enquiry_id: enquiryId }),
        ...(studentProfileId && !personId && { student_profile_id: studentProfileId }),
        // when using personId, preserve existing owner links already on the row
        ...(personId && existing?.enquiry_id && !enquiryId && { enquiry_id: existing.enquiry_id }),
        ...(personId && existing?.student_profile_id && !studentProfileId && { student_profile_id: existing.student_profile_id }),
      }

      const result = existing
        ? await supabase.from('intake_forms').update(payload).eq('id', existing.id).select().single()
        : await supabase.from('intake_forms').insert(payload).select().single()

      if (result.error) throw result.error

      setExisting(result.data)
      setForm(result.data)

      if (result.data.photo_path) {
        const { data: urlData } = await supabase.storage
          .from('registration-photos')
          .createSignedUrl(result.data.photo_path, 3600)
        setPhotoSignedUrl(urlData?.signedUrl || null)
      } else {
        setPhotoSignedUrl(null)
      }

      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl)
      setPhotoFile(null)
      setPhotoPreviewUrl(null)
      setPhotoRemoved(false)
      setEditing(false)
      onSave?.()
    } catch (err) {
      setError(err.message || 'Failed to save')
    }

    setSaving(false)
  }

  function handleCancel() {
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl)
    setPhotoFile(null)
    setPhotoPreviewUrl(null)
    setPhotoRemoved(false)
    setPhotoError('')
    setForm(existing || { ...EMPTY })
    setEditing(false)
    setError('')
  }

  if (loading) {
    return <div className="py-14 text-center text-gray-400 text-sm">Loading intake form…</div>
  }

  if (existing && !editing) {
    return (
      <ViewMode
        form={form}
        photoSignedUrl={photoSignedUrl}
        onEdit={() => setEditing(true)}
      />
    )
  }

  return (
    <EditMode
      form={form}
      setForm={setForm}
      onSave={handleSave}
      onCancel={handleCancel}
      saving={saving}
      error={error}
      isNew={!existing}
      photoPreviewUrl={photoPreviewUrl}
      photoSignedUrl={photoSignedUrl}
      photoError={photoError}
      onPhotoChange={handlePhotoChange}
      onPhotoRemove={handlePhotoRemove}
    />
  )
}
