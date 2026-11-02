-- v1.1 (Percy, 2 Nov 2026): the record form follows fee schedules 01–03 (version of 28 Oct 2569) and the
-- decisions in the project log.
--   * Table 1 rates in whole baht (D-45, D-61); fillings: one code and one price, 1 surface 360 (D-69);
--     PRR 172 and fillings are paid only on the mobile dental unit (D-49, D-52, D-59); primary teeth 0 (D-54).
--   * NHSO first, the project tops up (D-43, D-47, D-49): exam 174 and fluoride 170 once per NHSO (fiscal) year
--     at 100 baht; sealant 171 from the third tooth in the year (D-45). No public coverage: the project pays the
--     full rate (D-68); in the control arm also the van filling (Percy 2 Nov, D-70).
--   * Capitation (01) pays no items; the shared-savings ceiling (02) and the capitation are computed in the app
--     from the round-1 care plans.
--   * Transfers with slips (research team → unit), cohort submission and deleting a child before it (Percy 2 Nov).

-- ------------------------------------------------------------------ prices
alter table public.price_list add column nhso_rate numeric(10, 2);   -- NHSO pays this first, once per fiscal year

update public.price_list set price_lc = 143, nhso_rate = 100, control_claimable = true,  control_per_year = 1 where code = '174';
update public.price_list set price_lc = 193 where code = '173';
update public.price_list set price_lc = 159 where code = '176';
update public.price_list set price_lc = 79  where code = '175';
update public.price_list set price_lc = 208 where code = '177';
update public.price_list set price_lc = 256, nhso_rate = 100, control_claimable = true,  control_per_year = 1 where code = '170';
update public.price_list set price_lc = 242, control_claimable = true where code = '171';
update public.price_list set price_lc = 324, control_claimable = false where code = '172';
-- Old v0.7 filling codes and extraction: no longer project items (treatment goes to the NHSO dental fund).
update public.price_list set outside = true, control_claimable = false, name = name || ' (รหัสเดิม ใช้ 67210)' where code in ('55', '56', '57');
update public.price_list set outside = true, control_claimable = false where code = '1';

insert into public.price_list (code, name, short, unit, price_lc, price_full, tooth_rule, group_kind, unpriced, outside, control_claimable, control_per_year)
values ('67210', 'อุดฟัน 1 ด้าน (บนรถทันตกรรม)', 'อุด', 'ซี่', 360, 360, 'any', null, false, false, false, null);

-- ------------------------------------------------------------------ units: van fillings, cohort
alter table public.units add column van_fills boolean;                -- the unit's mobile dental unit can fill (01, 02 §2); null = not known yet
alter table public.units add column cohort_submitted_at timestamptz;   -- after this the unit cannot delete children
alter table public.units add column cohort_submitted_by uuid;

-- ------------------------------------------------------------------ transfers (research team → unit)
create table public.transfers (
  id         bigint generated always as identity primary key,
  unit_id    text not null references public.units,
  kind       text not null check (kind in ('advance', 'claims', 'withhold', 'savings', 'data_fee', 'other')),
  amount     numeric(12, 2) not null check (amount > 0),
  paid_on    date not null,
  period     text,                                   -- e.g. claims month '2026-11'
  note       text,
  slip_path  text,                                   -- object in storage bucket 'slips': <unit_id>/<file>
  seen_at    timestamptz,                            -- when the unit opened it (the unit's notice)
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index transfers_unit on public.transfers (unit_id, paid_on);
create trigger transfers_audit after insert or update or delete on public.transfers for each row execute function app.audit('id');
alter table public.transfers enable row level security;
create policy transfers_read on public.transfers for select to authenticated
  using (unit_id = (select app.my_unit()) or (select app.is_research()));
create policy transfers_insert on public.transfers for insert to authenticated
  with check ((select app.my_role()) = 'research');
create policy transfers_seen on public.transfers for update to authenticated
  using (unit_id = (select app.my_unit())) with check (unit_id = (select app.my_unit()));
revoke all on public.transfers from anon;
revoke update, delete on public.transfers from authenticated;
grant select, insert on public.transfers to authenticated;
grant update (seen_at) on public.transfers to authenticated;

alter table public.services add column place text check (place in ('van', 'clinic'));   -- where a filling or PRR was done
alter table public.services add column transfer_id bigint references public.transfers;

-- Research records a transfer and, for a claims transfer, marks the approved services it pays.
create function public.record_transfer(p_transfer jsonb, p_service_ids bigint[] default '{}') returns bigint
language plpgsql security invoker set search_path = '' as $$
declare v_id bigint; v_n int;
begin
  if coalesce(app.my_role(), '') <> 'research' then raise exception 'เฉพาะทีมวิจัยบันทึกการโอนเงิน'; end if;
  insert into public.transfers (unit_id, kind, amount, paid_on, period, note, slip_path)
  values (p_transfer ->> 'unit_id', p_transfer ->> 'kind', (p_transfer ->> 'amount')::numeric, (p_transfer ->> 'paid_on')::date,
          nullif(p_transfer ->> 'period', ''), nullif(p_transfer ->> 'note', ''), nullif(p_transfer ->> 'slip_path', ''))
  returning id into v_id;
  if cardinality(p_service_ids) > 0 then
    update public.services set status = 'paid', transfer_id = v_id
     where id = any(p_service_ids) and unit_id = p_transfer ->> 'unit_id' and status = 'approved';
    get diagnostics v_n = row_count;
    if v_n <> cardinality(p_service_ids) then raise exception 'บางรายการยังไม่อนุมัติหรือไม่ใช่ของหน่วยนี้'; end if;
  end if;
  return v_id;
end $$;
revoke all on function public.record_transfer(jsonb, bigint[]) from public, anon;
grant execute on function public.record_transfer(jsonb, bigint[]) to authenticated;

-- Slips: private bucket; the research team uploads, the unit reads its own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('slips', 'slips', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;
create policy slips_read on storage.objects for select to authenticated
  using (bucket_id = 'slips' and ((select app.is_research()) or (storage.foldername(name))[1] = (select app.my_unit())));
create policy slips_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'slips' and (select app.my_role()) = 'research');

-- ------------------------------------------------------------------ cohort and deleting a child
create function public.submit_cohort() returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare v_unit text := app.my_unit(); v_at timestamptz;
begin
  if v_unit is null then raise exception 'บัญชีนี้ไม่ใช่บัญชีหน่วยบริการ'; end if;
  update public.units set cohort_submitted_at = now(), cohort_submitted_by = auth.uid()
   where id = v_unit and cohort_submitted_at is null
  returning cohort_submitted_at into v_at;
  if v_at is null then select cohort_submitted_at into v_at from public.units where id = v_unit; end if;
  return v_at;
end $$;

create function public.reopen_cohort(p_unit text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_research() then raise exception 'เฉพาะทีมวิจัยเปิด cohort ใหม่'; end if;
  update public.units set cohort_submitted_at = null, cohort_submitted_by = null where id = p_unit;
end $$;

-- A unit deletes a child it enrolled by mistake or for practice, with the child's exams and services, until it
-- submits its cohort. Claims already sent to the research team block the delete. The audit log keeps the rows.
create function public.delete_child(p_study_id text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_unit text := app.my_unit(); v_child_unit text; v_locked timestamptz;
begin
  if v_unit is null then raise exception 'บัญชีนี้ไม่ใช่บัญชีหน่วยบริการ'; end if;
  select c.unit_id into v_child_unit from public.children c where c.study_id = p_study_id;
  if v_child_unit is null or v_child_unit <> v_unit then raise exception 'ไม่พบนักเรียน % ในหน่วยนี้', p_study_id; end if;
  select u.cohort_submitted_at into v_locked from public.units u where u.id = v_unit;
  if v_locked is not null then raise exception 'ส่ง cohort แล้ว ลบแฟ้มนักเรียนไม่ได้ ติดต่อทีมวิจัย'; end if;
  if exists (select 1 from public.services s where s.study_id = p_study_id and s.status in ('submitted', 'approved', 'paid', 'returned')) then
    raise exception 'นักเรียนคนนี้มีรายการที่ส่งเบิกแล้ว ลบไม่ได้';
  end if;
  delete from public.services where study_id = p_study_id;
  delete from public.exams where study_id = p_study_id;
  delete from public.child_identifiers where study_id = p_study_id;
  delete from public.children where study_id = p_study_id;
end $$;
revoke all on function public.submit_cohort(), public.reopen_cohort(text), public.delete_child(text) from public, anon;
grant execute on function public.submit_cohort(), public.reopen_cohort(text), public.delete_child(text) to authenticated;

-- ------------------------------------------------------------------ what the project pays per service
-- Rules per fee schedule; "once a year" is the NHSO (Thai fiscal) year, Oct–Sep.
create function app.project_pay(p_arm text, p_coverage text, p_code text, p_place text, p_rate numeric, p_nhso numeric,
                                p_nth_fy bigint, p_nth_month bigint, p_primary boolean, p_outside boolean, p_group boolean,
                                out pay numeric, out note text)
language plpgsql immutable set search_path = '' as $$
declare v_none boolean := p_coverage = 'none';   -- null (not recorded yet) is treated as UC
begin
  pay := 0; note := null;
  if p_primary then note := 'ฟันน้ำนม ไม่นับในโครงการ'; return; end if;
  if p_arm = 'cap' then note := 'เหมาจ่ายรายหัว ไม่เบิกรายการ'; return; end if;
  if p_rate is null or p_outside then note := 'นอกรายการโครงการ เบิกตามระบบปกติ'; return; end if;
  if p_code in ('67210', '172') and coalesce(p_place, '') <> 'van' then note := 'ไม่ได้ทำบนรถทันตกรรม เบิกกองทุนทันตกรรม สปสช.'; return; end if;

  if p_arm = 'ffs' then
    if p_code = '170' and p_nth_month > 1 then note := 'ฟลูออไรด์เกินเดือนละ 1 ครั้ง'; return; end if;
    if p_code in ('174', '170') then
      if v_none then pay := p_rate;
      elsif p_nth_fy = 1 then pay := p_rate - p_nhso; note := 'เบิก สปสช. ' || p_nhso::int || ' บาทก่อน โครงการจ่ายส่วนต่าง';
      else pay := p_rate; note := 'ครั้งที่ ' || p_nth_fy || ' ในปีงบ สปสช. ไม่จ่าย'; end if;
    elsif p_code = '171' then
      if v_none then pay := p_rate;
      elsif p_nth_fy <= 2 then note := 'ซี่ที่ ' || p_nth_fy || ' ในปีงบ เบิก สปสช. (เหมา 500 บาท)';
      else pay := p_rate; end if;
    elsif p_code in ('173', '175', '176', '177', '172', '67210') then pay := p_rate;
    else note := 'รักษา เบิกกองทุนทันตกรรม สปสช.'; end if;
    return;
  end if;

  -- control (03): only 174, 170, 171 under NHSO rules; children with no public coverage also the van filling
  if p_code in ('174', '170') then
    if p_nth_fy > 1 then note := 'เกินปีละ 1 ครั้งตามข้อกำหนด สปสช.';
    elsif v_none then pay := p_rate;
    else pay := p_rate - p_nhso; note := 'เบิก สปสช. ' || p_nhso::int || ' บาทก่อน โครงการจ่ายส่วนต่าง'; end if;
  elsif p_code = '171' then
    if v_none then pay := p_rate;
    elsif p_nth_fy <= 2 then note := 'ซี่ที่ ' || p_nth_fy || ' ในปีงบ เบิก สปสช. (เหมา 500 บาท)';
    else pay := p_rate; end if;
  elsif p_code = '67210' and v_none then pay := p_rate;
  else note := 'กลุ่มควบคุม ไม่อยู่ในรายการที่เบิกจากโครงการ'; end if;
end $$;
grant execute on function app.project_pay(text, text, text, text, numeric, numeric, bigint, bigint, boolean, boolean, boolean) to authenticated;

create view public.v_services_pay with (security_invoker = true) as
with b as (
  select s.id, s.unit_id, s.study_id, s.code, s.tooth, s.service_date, s.status, s.place, s.group_id, s.transfer_id,
         u.arm, u.ptype, c.coverage, p.name as code_name, p.nhso_rate,
         case when p.code is null then null when u.arm = 'control' or u.ptype = 'public' then p.price_lc else p.price_full end as rate,
         coalesce(p.outside or p.unpriced, false) as outside,
         (s.tooth between 51 and 85) as primary_tooth,
         row_number() over (partition by s.study_id, s.code, extract(year from s.service_date + interval '3 months')
                            order by s.service_date, s.id) as nth_fy,
         row_number() over (partition by s.study_id, s.code, date_trunc('month', s.service_date)
                            order by s.service_date, s.id) as nth_month
    from public.services s
    join public.units u on u.id = s.unit_id
    left join public.children c on c.study_id = s.study_id
    left join public.price_list p on p.code = s.code
         and s.service_date >= p.valid_from and (p.valid_to is null or s.service_date < p.valid_to)
)
select b.*, (extract(year from b.service_date + interval '3 months'))::int + 543 as fiscal_year_be, x.pay as project_pay, x.note as pay_note
  from b
 cross join lateral app.project_pay(b.arm, b.coverage, b.code, b.place, b.rate, coalesce(b.nhso_rate, 0),
                                    b.nth_fy, b.nth_month, coalesce(b.primary_tooth, false), b.outside, b.study_id is null) x;
grant select on public.v_services_pay to authenticated;
revoke all on public.v_services_pay from anon;
