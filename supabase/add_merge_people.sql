begin;

-- ── public.merge_people(p_keep, p_remove) ─────────────────────────────────────
-- Moves all records from p_remove to p_keep, fills blank fields on p_keep,
-- then deletes p_remove — all in the caller's transaction.
-- Admin-only, SECURITY DEFINER.

create or replace function public.merge_people(
  p_keep   uuid,
  p_remove uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_keep              people%rowtype;
  v_remove            people%rowtype;
  v_conflict_batch    text;
  v_keep_form         intake_forms%rowtype;
  v_remove_form       intake_forms%rowtype;
  v_keep_araiki       araiki_history%rowtype;
  v_remove_araiki     araiki_history%rowtype;
  v_araiki_summary    text;
  v_merge_note        text;
begin

  -- ── 0. Admin guard ──────────────────────────────────────────────────────────
  if (select role from profiles where id = auth.uid()) != 'admin' then
    raise exception 'Permission denied';
  end if;

  -- ── 1. Validate inputs ──────────────────────────────────────────────────────
  if p_keep = p_remove then
    raise exception 'Cannot merge a person with themselves';
  end if;

  select * into v_keep from people where id = p_keep;
  if not found then
    raise exception 'Person to keep (%) does not exist', p_keep;
  end if;

  select * into v_remove from people where id = p_remove;
  if not found then
    raise exception 'Person to remove (%) does not exist', p_remove;
  end if;

  -- ── 2. Conflict guards ──────────────────────────────────────────────────────
  if v_keep.profile_id is not null and v_remove.profile_id is not null then
    raise exception 'Both people have an app account. Merge not allowed.';
  end if;

  select b.name into v_conflict_batch
  from   batch_members bk
  join   batch_members br on br.batch_id = bk.batch_id
  join   batches b         on b.id = bk.batch_id
  where  bk.person_id = p_keep
    and  br.person_id = p_remove
    and  bk.status in ('active', 'paused')
    and  br.status in ('active', 'paused')
  limit 1;

  if found then
    raise exception 'Both are active in %. Fix this first.', v_conflict_batch;
  end if;

  -- ── 3. Simple child tables ──────────────────────────────────────────────────
  update enquiries          set person_id = p_keep where person_id = p_remove;
  update enrollments        set person_id = p_keep where person_id = p_remove;
  update araiki_attunements set person_id = p_keep where person_id = p_remove;
  update progress_entries   set person_id = p_keep where person_id = p_remove;
  update student_notes      set person_id = p_keep where person_id = p_remove;
  update meetup_attendance  set person_id = p_keep where person_id = p_remove;

  -- ── 4. batch_members (conflict already checked above) ───────────────────────
  update batch_members set person_id = p_keep where person_id = p_remove;

  -- ── 5. batch_attendance — unique on (session_id, person_id) ─────────────────
  -- Drop p_remove rows where p_keep already has attendance
  delete from batch_attendance
  where  person_id = p_remove
    and  session_id in (
           select session_id from batch_attendance where person_id = p_keep
         );

  -- Move the rest
  update batch_attendance set person_id = p_keep where person_id = p_remove;

  -- ── 6. person_whatsapp_groups — keep any name_in_group already on p_keep ────
  insert into person_whatsapp_groups (person_id, group_id, name_in_group)
  select p_keep, group_id, name_in_group
  from   person_whatsapp_groups
  where  person_id = p_remove
  on conflict (person_id, group_id) do nothing;

  -- ── 7. person_programmes ────────────────────────────────────────────────────
  insert into person_programmes (person_id, programme, source, detail)
  select p_keep, programme, source, detail
  from   person_programmes
  where  person_id = p_remove
  on conflict (person_id, programme) do nothing;

  -- ── 8. intake_forms — unique per person ─────────────────────────────────────
  select * into v_keep_form   from intake_forms where person_id = p_keep   limit 1;
  select * into v_remove_form from intake_forms where person_id = p_remove limit 1;

  if v_remove_form.id is not null then
    if v_keep_form.id is null then
      -- Only p_remove has a form: move it
      update intake_forms set person_id = p_keep where person_id = p_remove;
    else
      -- Both have forms: optionally copy health fields into p_keep's form
      if v_keep_form.current_conditions_details is null
         or trim(v_keep_form.current_conditions_details) = '' then
        update intake_forms set
          current_conditions         = coalesce(current_conditions,         v_remove_form.current_conditions),
          current_conditions_details = v_remove_form.current_conditions_details,
          chief_complaints           = coalesce(chief_complaints,           v_remove_form.chief_complaints)
        where person_id = p_keep;
      end if;
      -- Record the merged health data as a note
      insert into student_notes (person_id, admin_id, note, created_at)
      values (
        p_keep,
        auth.uid(),
        'Merged record - health details: '
          || coalesce(v_remove_form.current_conditions_details, ''),
        now()
      );
    end if;
  end if;

  -- ── 9. araiki_history — unique per person ────────────────────────────────────
  select * into v_keep_araiki   from araiki_history where person_id = p_keep   limit 1;
  select * into v_remove_araiki from araiki_history where person_id = p_remove limit 1;

  if v_remove_araiki.id is not null then
    if v_keep_araiki.id is null then
      -- Only p_remove has history: move it
      update araiki_history set person_id = p_keep where person_id = p_remove;
    else
      -- Both have history: summarise p_remove's non-empty fields into a note
      v_araiki_summary := '';
      if v_remove_araiki.enquiry_date         is not null then v_araiki_summary := v_araiki_summary || 'enquiry: '     || v_remove_araiki.enquiry_date         || '; '; end if;
      if v_remove_araiki.current_level        is not null then v_araiki_summary := v_araiki_summary || 'level: '       || v_remove_araiki.current_level        || '; '; end if;
      if v_remove_araiki.practice_status      is not null then v_araiki_summary := v_araiki_summary || 'practice: '    || v_remove_araiki.practice_status      || '; '; end if;
      if v_remove_araiki.first_degree_mode    is not null then v_araiki_summary := v_araiki_summary || '1st degree: '  || v_remove_araiki.first_degree_mode    || '; '; end if;
      if v_remove_araiki.second_degree_mode   is not null then v_araiki_summary := v_araiki_summary || '2nd degree: '  || v_remove_araiki.second_degree_mode   || '; '; end if;
      if v_remove_araiki.second_degree_remarks is not null then v_araiki_summary := v_araiki_summary || 'remarks: '    || v_remove_araiki.second_degree_remarks || '; '; end if;
      if v_remove_araiki.found_in_tabs        is not null then v_araiki_summary := v_araiki_summary || 'tabs: '        || v_remove_araiki.found_in_tabs         || '; '; end if;
      insert into student_notes (person_id, admin_id, note, created_at)
      values (
        p_keep,
        auth.uid(),
        'Merged record - Araiki history: ' || rtrim(v_araiki_summary, '; '),
        now()
      );
    end if;
  end if;

  -- ── 10. profile_id — move from p_remove to p_keep if p_keep has none ────────
  if v_remove.profile_id is not null and v_keep.profile_id is null then
    update people set profile_id = null               where id = p_remove;
    update people set profile_id = v_remove.profile_id where id = p_keep;
  end if;

  -- ── 11. Fill blank fields on p_keep (never overwrite) ───────────────────────
  update people set
    email                = coalesce(email,                v_remove.email),
    location             = coalesce(location,             v_remove.location),
    country              = coalesce(country,              v_remove.country),
    country_code         = coalesce(country_code,         v_remove.country_code),
    language             = coalesce(language,             v_remove.language),
    referred_by          = coalesce(referred_by,          v_remove.referred_by),
    contact_via          = coalesce(contact_via,          v_remove.contact_via),
    community_status     = case
                             when (community_status is null or community_status = 'not_invited')
                                  and v_remove.community_status is not null
                             then v_remove.community_status
                             else community_status
                           end,
    community_invited_on = coalesce(community_invited_on, v_remove.community_invited_on)
  where id = p_keep;

  -- ── 12. Phone handling ──────────────────────────────────────────────────────
  if v_remove.phone is not null then
    if v_keep.phone is null then
      -- p_keep has no phone: copy both raw and normalised
      update people set
        phone            = v_remove.phone,
        phone_normalized = v_remove.phone_normalized
      where id = p_keep;
    elsif v_keep.phone_normalized is distinct from v_remove.phone_normalized then
      -- Different number: put in alternate_phone if empty, else append to review_note
      if v_keep.alternate_phone is null then
        update people set alternate_phone = v_remove.phone where id = p_keep;
      else
        update people set
          review_note = coalesce(review_note || ' | ', '') || 'Alt phone from merge: ' || v_remove.phone
        where id = p_keep;
      end if;
    end if;
  end if;

  -- ── 13. Audit note and clear needs_review ───────────────────────────────────
  v_merge_note := 'Merged with ' || v_remove.full_name
    || ' (register #' || coalesce(v_remove.register_no::text, '-') || ')';

  update people set
    needs_review = false,
    review_note  = case
                     when review_note is null then v_merge_note
                     else review_note || ' | ' || v_merge_note
                   end
  where id = p_keep;

  -- ── 14. Delete p_remove (child tables cascade or are already moved) ──────────
  delete from people where id = p_remove;

end;
$$;

revoke execute on function public.merge_people(uuid, uuid) from public;
revoke execute on function public.merge_people(uuid, uuid) from anon;
grant  execute on function public.merge_people(uuid, uuid) to   authenticated;

commit;
