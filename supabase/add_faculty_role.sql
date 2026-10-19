begin;

-- 1. Real teacher link on each batch (teacher_name stays as display text)
alter table public.batches
  add column if not exists teacher_profile_id uuid
  references public.profiles(id) on delete set null;

-- 2. Helper: the batches that belong to the logged-in faculty member
create or replace function public.my_batch_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select b.id
  from public.batches b
  where b.teacher_profile_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'faculty'
    );
$$;

revoke execute on function public.my_batch_ids() from public, anon;
grant execute on function public.my_batch_ids() to authenticated;

-- 3. Faculty read access: own batches
drop policy if exists "Faculty read own batches" on public.batches;
create policy "Faculty read own batches" on public.batches
  for select to authenticated
  using (id in (select public.my_batch_ids()));

-- 4. Faculty read access: members of own batches
drop policy if exists "Faculty read own batch members" on public.batch_members;
create policy "Faculty read own batch members" on public.batch_members
  for select to authenticated
  using (batch_id in (select public.my_batch_ids()));

-- 5. Faculty: class sessions of own batches (read, add, edit)
drop policy if exists "Faculty read own sessions" on public.batch_sessions;
create policy "Faculty read own sessions" on public.batch_sessions
  for select to authenticated
  using (batch_id in (select public.my_batch_ids()));

drop policy if exists "Faculty add own sessions" on public.batch_sessions;
create policy "Faculty add own sessions" on public.batch_sessions
  for insert to authenticated
  with check (batch_id in (select public.my_batch_ids()));

drop policy if exists "Faculty edit own sessions" on public.batch_sessions;
create policy "Faculty edit own sessions" on public.batch_sessions
  for update to authenticated
  using (batch_id in (select public.my_batch_ids()))
  with check (batch_id in (select public.my_batch_ids()));

-- 6. Faculty: attendance of own batches (read, add, edit)
drop policy if exists "Faculty read own attendance" on public.batch_attendance;
create policy "Faculty read own attendance" on public.batch_attendance
  for select to authenticated
  using (exists (
    select 1 from public.batch_sessions s
    where s.id = session_id and s.batch_id in (select public.my_batch_ids())
  ));

drop policy if exists "Faculty add own attendance" on public.batch_attendance;
create policy "Faculty add own attendance" on public.batch_attendance
  for insert to authenticated
  with check (exists (
    select 1 from public.batch_sessions s
    where s.id = session_id and s.batch_id in (select public.my_batch_ids())
  ));

drop policy if exists "Faculty edit own attendance" on public.batch_attendance;
create policy "Faculty edit own attendance" on public.batch_attendance
  for update to authenticated
  using (exists (
    select 1 from public.batch_sessions s
    where s.id = session_id and s.batch_id in (select public.my_batch_ids())
  ))
  with check (exists (
    select 1 from public.batch_sessions s
    where s.id = session_id and s.batch_id in (select public.my_batch_ids())
  ));

-- 7. Faculty: read details of students who are in their own batches only
drop policy if exists "Faculty read own batch students" on public.people;
create policy "Faculty read own batch students" on public.people
  for select to authenticated
  using (id in (
    select bm.person_id from public.batch_members bm
    where bm.batch_id in (select public.my_batch_ids())
  ));

commit;
