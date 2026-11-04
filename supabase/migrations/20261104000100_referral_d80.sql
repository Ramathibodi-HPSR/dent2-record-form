-- D-80 (Percy, 4 Nov 2026): a tooth with ICDAS 5–6 is referred to the centre's dentist, who confirms whether the pulp
-- is involved before treatment, and the record tracks whether the child went. The app plans the referral (service REF,
-- v1.4; ICDAS 5 keeps need 4 with the referral beside it, ICDAS 6 is need 8); this adds a structured result to the REF
-- row beside the free-text note (outcome):
--   ref_status  null or 'waiting' = not seen yet; 'no_pulp' = seen, pulp not involved; 'pulp' = seen, pulp involved;
--               'treated' = treated
--   ref_date    the day the child saw the dentist or was treated
-- Units record it with set_referral(), also after the REF row was sent with the month's claims (the claim columns stay
-- locked). v_referrals lists every referral with its result for the CSV export.
-- ICDAS 5 teeth stay in the round-1 filling budget as need 4 (D-60; Percy 4 Nov evening); nothing here pays for
-- treatment at the centre. Applied to the live project on 4 Nov 2026 (22:23) with Percy's OK.

alter table public.services
  add column ref_status text check (ref_status in ('waiting', 'no_pulp', 'pulp', 'treated')),
  add column ref_date   date;
alter table public.services
  add constraint services_ref_only check (code = 'REF' or (ref_status is null and ref_date is null)),
  add constraint services_ref_date check (ref_date is null or ref_status in ('no_pulp', 'pulp', 'treated'));

create function public.set_referral(p_id bigint, p_status text, p_date date, p_note text) returns public.services
language plpgsql security definer set search_path = '' as $$
declare r public.services;
begin
  select * into r from public.services s where s.id = p_id;
  if r.id is null or r.code <> 'REF' or not (coalesce(r.unit_id = app.my_unit(), false) or app.is_research()) then
    raise exception 'ไม่พบรายการส่งต่อนี้ในหน่วย';
  end if;
  if p_status is not null and p_status not in ('waiting', 'no_pulp', 'pulp', 'treated') then
    raise exception 'ผลการส่งต่อไม่ถูกต้อง';
  end if;
  if p_status in ('no_pulp', 'pulp', 'treated') and p_date is null then raise exception 'ใส่วันที่นักเรียนไปพบทันตแพทย์'; end if;
  if p_date > (now() at time zone 'Asia/Bangkok')::date then raise exception 'วันที่ไปพบทันตแพทย์อยู่ในอนาคต'; end if;
  update public.services
     set ref_status = p_status,
         ref_date = case when p_status in ('no_pulp', 'pulp', 'treated') then p_date end,
         outcome = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_id
  returning * into r;
  return r;
end $$;
revoke all on function public.set_referral(bigint, text, date, text) from public, anon;
grant execute on function public.set_referral(bigint, text, date, text) to authenticated;

-- One row per referral with the tooth's ICDAS and need at the first exam (empty for a referral for urgent signs).
create view public.v_referrals with (security_invoker = true) as
select s.id, s.unit_id, s.study_id, s.tooth, s.service_date as referred_on, s.plan_key,
       f.code_b as icdas_first_exam, f.need as need_first_exam,
       coalesce(s.ref_status, 'waiting') as ref_status, s.ref_date, s.outcome as ref_note, s.status, c.is_test
  from public.services s
  join public.children c on c.study_id = s.study_id and c.unit_id = s.unit_id
  left join lateral (
    select tf.code_b, tf.need
      from public.v_tooth_findings tf
     where tf.study_id = s.study_id and tf.round = 'baseline' and tf.tooth_no = s.tooth
     limit 1) f on true
 where s.code = 'REF';
grant select on public.v_referrals to authenticated;
revoke all on public.v_referrals from anon;
