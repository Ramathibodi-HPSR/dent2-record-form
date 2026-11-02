-- Percy 2 Nov 2026 (10:57):
--   * Each unit states at set-up whether its mobile dental unit can fill teeth (01, 02 §2: fillings count in the
--     capitation and the ceiling only when the van can fill). Locked once the unit sends its cohort; the research
--     team can still change it.
--   * Activity evidence (D-62): photos of brushing training and oral health education, and the class list signed
--     by the class teacher, uploaded with the record. Photos must not show children's faces or identify them
--     (PDPA); the app says so at the upload. Units may remove a file uploaded by mistake.

-- ------------------------------------------------------------------ van fillings
create function public.set_van_fills(p_fills boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_unit text := app.my_unit(); v_locked timestamptz;
begin
  if v_unit is null then raise exception 'บัญชีนี้ไม่ใช่บัญชีหน่วยบริการ'; end if;
  if p_fills is null then raise exception 'เลือกว่ารถทันตกรรมอุดฟันได้หรือไม่ได้'; end if;
  select u.cohort_submitted_at into v_locked from public.units u where u.id = v_unit;
  if v_locked is not null then raise exception 'ส่ง cohort แล้ว เปลี่ยนไม่ได้ ติดต่อทีมวิจัย'; end if;
  update public.units set van_fills = p_fills where id = v_unit;
  return p_fills;
end $$;

create function public.set_unit_van_fills(p_unit text, p_fills boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(app.my_role(), '') <> 'research' then raise exception 'เฉพาะทีมวิจัย'; end if;
  update public.units set van_fills = p_fills where id = p_unit;
end $$;
revoke all on function public.set_van_fills(boolean), public.set_unit_van_fills(text, boolean) from public, anon;
grant execute on function public.set_van_fills(boolean), public.set_unit_van_fills(text, boolean) to authenticated;

-- ------------------------------------------------------------------ activity evidence
create table public.evidence (
  id         bigint generated always as identity primary key,
  unit_id    text not null references public.units,
  group_id   uuid not null,                          -- the group activity (services.group_id)
  path       text not null unique,                   -- object in storage bucket 'evidence': <unit_id>/<group_id>/<file>
  file_name  text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (path like unit_id || '/' || group_id || '/%')
);
create index evidence_group on public.evidence (unit_id, group_id);
create trigger evidence_audit after insert or update or delete on public.evidence for each row execute function app.audit('id');
alter table public.evidence enable row level security;
create policy evidence_read on public.evidence for select to authenticated
  using (unit_id = (select app.my_unit()) or (select app.is_research()));
create policy evidence_insert on public.evidence for insert to authenticated
  with check (unit_id = (select app.my_unit()));
create policy evidence_delete on public.evidence for delete to authenticated
  using (unit_id = (select app.my_unit()));
revoke all on public.evidence from anon;
revoke update on public.evidence from authenticated;
grant select, insert, delete on public.evidence to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidence', 'evidence', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;
create policy evidence_obj_read on storage.objects for select to authenticated
  using (bucket_id = 'evidence' and ((select app.is_research()) or (storage.foldername(name))[1] = (select app.my_unit())));
create policy evidence_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'evidence' and (storage.foldername(name))[1] = (select app.my_unit()));
create policy evidence_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'evidence' and (storage.foldername(name))[1] = (select app.my_unit()));
