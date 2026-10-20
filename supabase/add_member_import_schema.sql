begin;

-- ── 1. New columns on people ──────────────────────────────────────────────────

alter table public.people
  add column if not exists register_no          integer,
  add column if not exists country              text,
  add column if not exists country_code         text,
  add column if not exists language             text,
  add column if not exists referred_by          text,
  add column if not exists contact_via          text,
  add column if not exists alternate_phone      text,
  add column if not exists person_type          text not null default 'student',
  add column if not exists needs_review         boolean not null default false,
  add column if not exists review_type          text,
  add column if not exists review_note          text,
  add column if not exists review_pair          text,
  add column if not exists community_status     text,
  add column if not exists community_invited_on date;

-- CHECK: person_type (idempotent via DO block)
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'people_person_type_check'
      and conrelid = 'public.people'::regclass
  ) then
    alter table public.people
      add constraint people_person_type_check
      check (person_type in ('student','contact'));
  end if;
end $$;

-- CHECK: community_status (idempotent via DO block)
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'people_community_status_check'
      and conrelid = 'public.people'::regclass
  ) then
    alter table public.people
      add constraint people_community_status_check
      check (community_status in ('not_invited','invited','joined','declined','cant_reach'));
  end if;
end $$;

-- Indexes on people
create index if not exists idx_people_needs_review
  on public.people (needs_review) where needs_review = true;

create index if not exists idx_people_register_no
  on public.people (register_no);

-- ── 2. whatsapp_groups ───────────────────────────────────────────────────────

create table if not exists public.whatsapp_groups (
  id         uuid        primary key default gen_random_uuid(),
  name       text        unique not null,
  is_active  boolean     not null default true,
  sort_order integer     not null default 0,
  created_at timestamptz not null default now()
);

alter table public.whatsapp_groups enable row level security;

drop policy if exists "Admin all whatsapp_groups" on public.whatsapp_groups;
create policy "Admin all whatsapp_groups" on public.whatsapp_groups
  for all to authenticated
  using  ((select role from public.profiles where id = auth.uid()) = 'admin')
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');

insert into public.whatsapp_groups (name, sort_order) values
  ('Araiki first degree practitioners', 10),
  ('Araiki Advanced practitioners',     20),
  ('Araiki Lifetime practitioners',     30),
  ('Jnana Sweekaranam',                 40)
on conflict (name) do nothing;

-- ── 3. person_whatsapp_groups ─────────────────────────────────────────────────

create table if not exists public.person_whatsapp_groups (
  id            uuid        primary key default gen_random_uuid(),
  person_id     uuid        not null references public.people(id) on delete cascade,
  group_id      uuid        not null references public.whatsapp_groups(id) on delete restrict,
  name_in_group text,
  created_at    timestamptz not null default now(),
  unique (person_id, group_id)
);

alter table public.person_whatsapp_groups enable row level security;

drop policy if exists "Admin all person_whatsapp_groups" on public.person_whatsapp_groups;
create policy "Admin all person_whatsapp_groups" on public.person_whatsapp_groups
  for all to authenticated
  using  ((select role from public.profiles where id = auth.uid()) = 'admin')
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');

-- ── 4. person_programmes ──────────────────────────────────────────────────────

create table if not exists public.person_programmes (
  id          uuid        primary key default gen_random_uuid(),
  person_id   uuid        not null references public.people(id) on delete cascade,
  programme   text        not null,
  source      text,
  detail      text,
  created_at  timestamptz not null default now(),
  unique (person_id, programme)
);

alter table public.person_programmes enable row level security;

drop policy if exists "Admin all person_programmes" on public.person_programmes;
create policy "Admin all person_programmes" on public.person_programmes
  for all to authenticated
  using  ((select role from public.profiles where id = auth.uid()) = 'admin')
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');

-- ── 5. araiki_history ─────────────────────────────────────────────────────────

create table if not exists public.araiki_history (
  id                    uuid        primary key default gen_random_uuid(),
  person_id             uuid        not null references public.people(id) on delete cascade,
  reg_no                text,
  enquiry_date          text,
  class_dates           text,
  first_degree_mode     text,
  practice_status       text,
  event_confirmation    text,
  current_level         text,
  follow_up_date        text,
  second_degree_mode    text,
  second_degree_remarks text,
  found_in_tabs         text,
  created_at            timestamptz not null default now(),
  unique (person_id)
);

alter table public.araiki_history enable row level security;

drop policy if exists "Admin all araiki_history" on public.araiki_history;
create policy "Admin all araiki_history" on public.araiki_history
  for all to authenticated
  using  ((select role from public.profiles where id = auth.uid()) = 'admin')
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');

commit;
