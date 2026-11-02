-- D-78 (Percy, 2 Nov 2026, on the v1.3.0 follow-up exams):
-- (2) A lost sealant or filling is Code A 7, as on the form. Where it matters the tooth also carries "lost": 's' (7s,
--     sealant lost) or 'r' (7r, filling lost). A lost sealant is not a filling, so 7s is left out of f/F in dmft/DMFT.
-- (5) The fluoride interval of the first exam is fixed when the unit sends its cohort; the unit may give fluoride more
--     often, but the round-1 budget does not change. The research team can reopen the cohort to correct it.

create or replace view public.v_tooth_findings with (security_invoker = true) as
select e.id as exam_id, e.study_id, e.unit_id, e.round, e.exam_date,
       j.key::int as position,
       j.value ->> 't' as presence,
       case j.value ->> 't' when 'p' then j.key::int when 'd' then j.key::int + 40 end as tooth_no,
       (j.value ->> 'A')::int as code_a,
       (j.value ->> 'B')::int as code_b,
       j.value ->> 'act' as activity,
       (j.value ->> 'occ')::int as occlusal_icdas,
       coalesce((j.value ->> 'partial')::boolean, false) as partly_erupted,
       (j.value ->> 'need')::int as need,
       coalesce((j.value ->> 'B')::int >= 3, false) as decayed,
       j.value ->> 'lost' as lost_material   -- with code_a 7: 's' sealant lost, 'r' filling lost (D-78)
  from public.exams e
 cross join lateral jsonb_each(e.teeth) j(key, value)
 where e.attended;

create or replace view public.v_exam_summary with (security_invoker = true) as
select e.id as exam_id, e.study_id, e.unit_id, e.round, e.exam_date, e.attended, e.examiner_code, e.place,
       case when e.attended then app.risk_score(e.risk) end as risk_score,
       case when e.attended then app.risk_level(app.risk_score(e.risk)) end as risk_level,
       t.d, t.m, t.f, t.d + t.m + t.f as dmft,
       t."D", t."M", t."F", t."D" + t."M" + t."F" as "DMFT",
       t.n_perm, t.n_fpm, t.n_fpm_partial, t.n_fpm_need_seal, t.n_need_refer,
       coalesce((e.urgent ->> 'pain')::boolean, false) or coalesce((e.urgent ->> 'swell')::boolean, false)
         or coalesce((e.urgent ->> 'big')::boolean, false) as urgent,
       (select round(avg((p.value ->> 'pi')::numeric), 2) from jsonb_each(e.pigi) p(key, value)) as pi_mean,
       (select round(avg((p.value ->> 'gi')::numeric), 2) from jsonb_each(e.pigi) p(key, value)) as gi_mean,
       case when e.attended then (e.exam_date + make_interval(months =>
         case when app.risk_level(app.risk_score(e.risk)) = 'vhigh' then 3 else 6 end))::date end as recall_date
  from public.exams e
  left join lateral (
    select count(*) filter (where tf.presence = 'd' and tf.code_b >= 3) as d,
           count(*) filter (where tf.presence = 'n' and tf.code_a = 97 and right(tf.position::text, 1) = any (array['1', '2', '3', '4', '5'])
                            and tf.position <> all (array[11, 21, 31, 32, 41, 42])) as m,
           count(*) filter (where tf.presence = 'd' and tf.code_b < 3 and tf.code_a between 3 and 8
                            and not (tf.code_a = 7 and tf.lost_material is not distinct from 's')) as f,
           count(*) filter (where tf.presence = 'p' and tf.code_b >= 3) as "D",
           count(*) filter (where tf.presence = 'n' and tf.code_a = 97 and not (right(tf.position::text, 1) = any (array['1', '2', '3', '4', '5'])
                            and tf.position <> all (array[11, 21, 31, 32, 41, 42]))) as "M",
           count(*) filter (where tf.presence = 'p' and tf.code_b < 3 and tf.code_a between 3 and 8
                            and not (tf.code_a = 7 and tf.lost_material is not distinct from 's')) as "F",
           count(*) filter (where tf.presence = 'p') as n_perm,
           count(*) filter (where tf.presence = 'p' and tf.position = any (array[16, 26, 36, 46])) as n_fpm,
           count(*) filter (where tf.presence = 'p' and tf.position = any (array[16, 26, 36, 46]) and tf.partly_erupted) as n_fpm_partial,
           count(*) filter (where tf.presence = 'p' and tf.position = any (array[16, 26, 36, 46]) and tf.need = 2) as n_fpm_need_seal,
           count(*) filter (where tf.need >= 5) as n_need_refer
      from public.v_tooth_findings tf
     where tf.exam_id = e.id) t on true;

grant select on public.v_tooth_findings, public.v_exam_summary to authenticated;
revoke all on public.v_tooth_findings, public.v_exam_summary from anon;

create or replace function app.fl_locked() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.round = 'baseline' and new.fl_override is distinct from old.fl_override
     and exists (select 1 from public.units u where u.id = new.unit_id and u.cohort_submitted_at is not null) then
    raise exception 'ความถี่ฟลูออไรด์ล็อกตั้งแต่ส่ง cohort ให้บริการบ่อยกว่านี้ได้ แต่งบไม่เปลี่ยน (D-78)';
  end if;
  return new;
end $$;
revoke all on function app.fl_locked() from public, anon;
drop trigger if exists exams_fl_locked on public.exams;
create trigger exams_fl_locked before update of fl_override on public.exams
  for each row execute function app.fl_locked();
