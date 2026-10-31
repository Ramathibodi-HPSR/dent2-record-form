-- D-64 (Percy, 31 Oct 2026): the record form stores no personal data. No names, national ID or guardian
-- contact; birth month and year instead of the date of birth. Study ID = the unit's centre number + a running
-- number (e.g. 53-001); the unit keeps its own list of names. Logins are named by the dental clinic code.

alter table public.units add column id_prefix text unique check (id_prefix ~ '^[0-9A-Z]{1,4}$');
alter table public.units add column clinic_code text;
update public.units set id_prefix = 'T' || letter where is_test;   -- TEST units: TA-001, TB-001 …

alter table public.children add column birth_ym text check (birth_ym ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
update public.children set birth_ym = to_char(dob, 'YYYY-MM'), dob = null where dob is not null;
alter table public.children add constraint children_no_dob check (dob is null);

-- Identifiers: the table stays (empty) so old audit rows still make sense, but nothing can be written to it.
delete from public.child_identifiers;
drop policy identifiers_insert on public.child_identifiers;
drop policy identifiers_update on public.child_identifiers;
revoke insert, update on public.child_identifiers from authenticated;
drop function public.enrol_child(jsonb, jsonb);

-- Study ID: <id_prefix>-<running number in the unit>. Units without a prefix keep the letter-school-seq form.
create or replace function app.set_study_id() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_letter text; v_prefix text; v_seq int; v_next int;
begin
  if new.study_id is not null then return new; end if;
  select u.letter, u.id_prefix, s.seq into v_letter, v_prefix, v_seq
    from public.schools s join public.units u on u.id = s.unit_id
   where s.id = new.school_id and s.unit_id = new.unit_id
   for update of u;
  if v_letter is null then
    raise exception 'โรงเรียน % ไม่ได้อยู่ในหน่วย %', new.school_id, new.unit_id;
  end if;
  if v_prefix is not null then
    select coalesce(max(substring(c.study_id from '^' || v_prefix || '-([0-9]+)$')::int), 0) + 1 into v_next
      from public.children c where c.unit_id = new.unit_id;
    new.study_id := v_prefix || '-' || lpad(v_next::text, 3, '0');
  else
    select coalesce(max(split_part(c.study_id, '-', 3)::int), 0) + 1 into v_next
      from public.children c where c.school_id = new.school_id;
    new.study_id := v_letter || '-' || lpad(v_seq::text, 2, '0') || '-' || lpad(v_next::text, 3, '0');
  end if;
  return new;
end $$;

create function public.enrol_child(p_child jsonb) returns text
language plpgsql security invoker set search_path = '' as $$
declare v_unit text := app.my_unit(); v_id text;
begin
  if v_unit is null then raise exception 'บัญชีนี้ไม่ใช่บัญชีหน่วยบริการ'; end if;
  insert into public.children (unit_id, school_id, class, sex, birth_ym, consent_on, assent, uc_verified, uc_checked_on, uc_method,
                               conditions, allergy_silver, allergy_colophony, is_test)
  values (v_unit, p_child ->> 'school_id', p_child ->> 'class', nullif(p_child ->> 'sex', ''), nullif(p_child ->> 'birth_ym', ''),
          nullif(p_child ->> 'consent_on', '')::date, coalesce((p_child ->> 'assent')::boolean, false),
          (p_child ->> 'uc_verified')::boolean, nullif(p_child ->> 'uc_checked_on', '')::date, nullif(p_child ->> 'uc_method', ''),
          nullif(p_child ->> 'conditions', ''), coalesce((p_child ->> 'allergy_silver')::boolean, false),
          coalesce((p_child ->> 'allergy_colophony')::boolean, false),
          (select u.is_test from public.units u where u.id = v_unit))
  returning study_id into v_id;
  return v_id;
end $$;
revoke all on function public.enrol_child(jsonb) from public, anon;
grant execute on function public.enrol_child(jsonb) to authenticated;

-- Age in months from the birth month (taken as the 15th, so the error is at most half a month).
create or replace view public.v_export_children with (security_invoker = true) as
select c.study_id, u.letter as unit_letter, u.arm, u.ptype, s.seq as school_seq, c.class, c.sex,
       case when c.birth_ym is not null and x.exam_date is not null
            then (extract(year from age(x.exam_date, (c.birth_ym || '-15')::date)) * 12
                  + extract(month from age(x.exam_date, (c.birth_ym || '-15')::date)))::int end as age_months,
       c.enrolled_on, c.consent_on is not null and c.assent as consented, c.uc_verified, c.status as child_status,
       x.round, x.exam_date, x.attended, x.examiner_code, x.place,
       e.risk ->> 'r1' as r1, e.risk ->> 'r2' as r2, e.risk ->> 'r3' as r3, e.risk ->> 'r4' as r4,
       e.risk ->> 'r5' as r5, e.risk ->> 'r6' as r6, e.risk ->> 'r7' as r7, e.risk ->> 'r8' as r8,
       x.risk_score, x.risk_level, x.dmft, x."DMFT", x.d, x."D", x.n_perm, x.n_fpm, x.n_fpm_partial,
       x.n_fpm_need_seal, x.n_need_refer, x.urgent, x.pi_mean, x.gi_mean, x.recall_date, c.is_test
from public.children c
join public.units u on u.id = c.unit_id
join public.schools s on s.id = c.school_id
left join public.v_exam_summary x on x.study_id = c.study_id
left join public.exams e on e.id = x.exam_id;
