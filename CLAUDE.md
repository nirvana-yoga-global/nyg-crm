# NYG CRM — Claude Code Context

## What this is
NYG CRM is a laptop-first web dashboard for Nirvana Yoga Global admins to manage leads, students, enrollments, fees, and Araiki attunements. It is a separate app from NYG Connect PWA but shares the same Supabase database.

## Live URLs
- Production: crm.nirvanayogaglobal.com
- GitHub: github.com/nirvana-yoga-global/nyg-crm
- Supabase: jlfmrligwbxklijugeui.supabase.co (Nirvana Yoga Global organisation)

## Tech Stack
- Frontend: React + Vite
- Styling: Tailwind CSS (install if not present)
- Database: Supabase (same project as NYG Connect)
- Routing: React Router DOM
- Charts: Recharts
- Hosting: Vercel (nirvanayogaglobal account)

## Brand
- Primary blue: #1742b5
- Orange accent: #f97316
- Background: #f8fafc
- Tone: professional, clean, efficient — this is an admin tool

## Layout
- Sidebar navigation on the left (fixed, always visible)
- Main content area on the right
- Laptop optimized — minimum width 1024px
- No mobile optimization needed

## Sidebar Navigation
- Dashboard (home/overview)
- Leads (enquiry pipeline)
- Connect Students (practitioners with an NYG Connect account)
- Fees (payment tracking)
- Araiki (attunement tracker)
- Meetups (bi-weekly attendance)
- Settings

## Authentication
- Same Supabase auth as NYG Connect
- Only users with role = 'admin' in profiles table can access
- Non-admins get redirected to a "Access Denied" page
- Use supabase.rpc('is_admin') to verify server-side

## Supabase Tables (shared with NYG Connect)
- profiles — id, full_name, role, avatar_url
- students — profile_id, name, phone, email, xp, level_number, streak
- practice_logs — student_id, practice_type, duration_minutes, xp_earned, created_at
- enquiries — id, name, phone, email, location, source, course_interested, lead_type, next_step, status, follow_up_date, notes, language_preference, mode_preference, created_at, person_id

## New CRM Tables
- people — id, full_name, phone, phone_normalized, email, location, source, notes, profile_id (→ profiles, nullable), created_at, updated_at
- enrollments — id, student_profile_id, person_id, course, status, start_date, fee_type, total_fee_agreed, notes
- installments — id, enrollment_id, amount, due_date, paid_date, payment_method, status, receipt_notes
- araiki_attunements — id, student_profile_id, person_id, attunement_number (1-6), date_attended, practice_start_date, ready_for_next, admin_notes
- meetups — id, title, date, type (online/offline/hybrid), language, location, description, event_code (unique), xp_reward, created_at
- meetup_attendance — id, meetup_id, student_profile_id (nullable), person_id, name, phone, is_student, attended_at
- lead_notes — id, enquiry_id, admin_id, note, follow_up_type, created_at
- student_notes — id, student_profile_id, person_id, admin_id, note, created_at
- intake_forms — unified student intake/assessment form linked to profiles.id; person_id added
- progress_entries — periodic health/vitals snapshots; student_profile_id, person_id

## Shared Tables (from NYG Connect, readable by CRM)
- notifications, parchments, practice_logs, students, profiles — all in same Supabase project, CRM reads these directly

## People

`people` is the CRM's master person record — one row per real person regardless of whether they have a NYG Connect account.

### Columns
- id uuid PK
- full_name text NOT NULL
- phone text — raw as entered by the admin
- phone_normalized text — output of normalize_phone(); NOT UNIQUE (families share numbers)
- email text
- location text
- source text
- notes text
- profile_id uuid UNIQUE — nullable FK to profiles(id) ON DELETE SET NULL; present when the person has a PWA account
- created_at / updated_at timestamptz (updated_at maintained by trigger)

### person_id in child tables
enquiries, enrollments, intake_forms, araiki_attunements, progress_entries, student_notes, meetup_attendance all carry a nullable `person_id uuid REFERENCES people(id)`. ON DELETE is RESTRICT for enrollments (financial records must not vanish); CASCADE for all others.

### normalize_phone()
IMMUTABLE PostgreSQL function. After stripping non-digits and one leading `00`:
- empty / null → NULL
- 10 digits starting 6–9 → prepend 91 (Indian mobile)
- 11 digits starting 0 followed by 6–9 → strip leading 0, prepend 91
- 12 digits starting 91 → already normalised, return as-is
- anything else → return digits unchanged

phone_normalized is NOT UNIQUE. Families share one number; multiple people rows per phone_normalized value are expected and allowed. Use it for fuzzy matching only, never as a unique key.

### student_profile_id transition
The old student_profile_id columns are kept on all child tables for now. All new code for Fees, Enrollments, and any future People-aware feature must use person_id, not student_profile_id. student_profile_id will be removed in a later migration once all screens are ported.

### students ≠ People
The `students` table is the NYG Connect PWA table that tracks XP, level_number, and streak. It is not the CRM people list. Do not use `students` as a person directory — use `people`.

### RLS
All new policies (people, enrollments, installments, araiki_attunements, student_notes) use the inline role check:
`(select role from profiles where id = auth.uid()) = 'admin'`
Never use is_admin() for new policies — it is not guaranteed to exist in all environments.

## Course Types
- Regular Yoga (monthly: Rs 1,500 existing / Rs 2,000 after first month / Rs 2,500 first month with registration / Rs 1,000 kids)
- Araiki Local (donation — variable)
- Araiki Foreigner (one-time Rs 20,000)
- Amasana / Inner Mastery Circle (monthly Rs 499 or annual Rs 5,000)
- TTC (flexible — scholarship/partial/full, installments possible)
- Free Workshop (Rs 0)

## Enquiry Pipeline Stages
New → Contacted → Interested → Enrolled → Lost

## Key Business Rules
- When lead status changes to Enrolled → automatically create student enrollment record
- Araiki has 6 attunements — student must practice 21 days between each
- Students can be enrolled in multiple courses simultaneously
- Amasana annual payment (Rs 5,000) auto-marks 12 months as paid
- TTC fees are fully flexible per student

## Student Profile Page (src/pages/StudentProfile.jsx)
A People list for everyone enrolled, with or without a PWA account, is planned.
Six-tab student profile accessible by clicking any student in the Students list:
- Intake Form — full health/lifestyle/NYG assessment form (IntakeFormTab.jsx)
- Progress — periodic health/vitals snapshots, before/after comparison (ProgressTab.jsx + progress_entries table)
- Practice Activity — live practice logs from NYG Connect (PracticeActivityTab.jsx)
- Fees — enrollments and installments with ₹ tracking (FeesTab.jsx)
- Araiki — attunement progress and challenge status per student (AraikiTab.jsx)
- Notes — admin notes log with timestamps (NotesTab.jsx)

## Araiki Page (src/pages/Araiki.jsx)
Global dashboard showing all students currently in an active 21-day challenge:
- Summary stats: Active Challenges, On Track, At Risk, Inactive
- Live challenge tracker table with days elapsed and last Araiki practice log date
- Status badges: green (logged within 3 days), yellow (3 days ago), red (4+ days / never)
- "Launch All Challenges" button sets today as practice_start_date for pending attunements
- Links to individual student profiles

## Leads Page (src/pages/Leads.jsx)
Kanban board across pipeline stages (New → Contacted → Interested → Enrolled → Lost):
- Add lead modal with: name, phone, email, location, source, course_interested, lead_type, next_step, language_preference, mode_preference, follow_up_date, notes
- Lead card shows language (indigo badge) and mode (teal badge) if set
- Side panel with inline field editing: lead_type, next_step, language_preference, mode_preference, pipeline stage
- Activity notes log per lead (follow_up_type + note text)
- Delete lead with confirmation (cascades to lead_notes)
- Enroll confirmation modal when moving to Enrolled stage

## Meetups Page (src/pages/Meetups.jsx)
Event management for bi-weekly sessions:
- List view with date block, type badge (online/offline/hybrid), location, attendance count, event code
- Stats: Total Meetups, This Month, Upcoming
- Add meetup modal: title, date/time, type (online/offline/hybrid), language (Malayalam/English/Both), location/link, description, event_code (auto-generated, editable), xp_reward
  - Location label/placeholder adapts per type (Venue / Meeting Link / Venue+Link for hybrid)
  - Type + Language share a row; Date is full-width above them
- Detail side panel: full info, type badge (hybrid = purple), language badge, copyable event code, XP reward
- Attendance section: mark attendance (name, phone, existing student toggle + dropdown), attendee list with Student badges
- Araiki Leads button: opens modal showing all active (non-enrolled/non-lost) leads
  - Filterable by course_interested dropdown
  - Table: Name, Phone, Language Preference (indigo badge), Mode Preference (teal badge), Status
  - "Copy All Numbers" footer button — copies all visible phone numbers comma-separated for WhatsApp broadcast
- Delete meetup with confirmation (cascades attendance)

## Debugging Protocol

### Deployment Issues (Vercel + React)
When a feature is built but not showing on production:
1. Confirm code is correct locally
2. Run npm run build — confirm zero errors
3. Confirm git push was successful
4. Check Vercel Deployments — is the latest commit SHA showing as Ready?
5. If code is correct + build clean + still not working → pipeline problem, NOT code
6. Fix: Vercel → Settings → Git → Disconnect → Reconnect GitHub
7. Never spend more than 10 minutes debugging confirmed-correct code

### Supabase Schema Changes
- NEVER use Supabase CLI or Docker for migrations — always write SQL to supabase/*.sql and tell the user to run it manually in the Supabase SQL Editor
- For RLS policies, use an inline role check instead of is_admin() to avoid function availability issues:
  `(select role from profiles where id = auth.uid()) = 'admin'`
- If a table has RLS enabled but no policies applied, all operations are blocked by default
- When adding a value to a column with a CHECK constraint (e.g. meetups.type), drop and recreate the constraint in the migration SQL

### Supabase RLS Issues
If data is not loading after correct code is confirmed:
- Check Network tab for 4xx errors on Supabase requests
- Check RLS policies on the relevant table in the Supabase dashboard
- Most likely cause: policy creation errored during setup (e.g. is_admin() not found), leaving table with RLS on but no policies
- Fix: run supabase/fix_*_rls.sql pattern — drop and recreate policies with the inline role check

## Do NOT
- Build mobile layouts — laptop only
- Use any paid external services
- Touch NYG Connect PWA code
- Over-engineer — keep it clean and functional
