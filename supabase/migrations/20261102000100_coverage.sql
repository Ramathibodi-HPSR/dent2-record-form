-- D-68 (Percy, 2 Nov 2026): health coverage at enrolment, three choices instead of the UC tick.
--   uc    UC (บัตรทอง)
--   other another public scheme (civil servant, social security, state enterprise, local government):
--         claimed the same way as UC (the unit claims NHSO first, the project tops up per the fee schedule)
--   none  no public coverage, e.g. a foreign child: the project pays the full project rate
-- null = not checked yet. uc_verified stays and is kept in step, so older readers still work.

alter table public.children add column coverage text check (coverage in ('uc', 'other', 'none'));
update public.children set coverage = 'uc' where uc_verified;

create function app.sync_coverage() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.coverage is null and new.uc_verified then new.coverage := 'uc'; end if;
  elsif new.coverage is not distinct from old.coverage and new.uc_verified is distinct from old.uc_verified then
    new.coverage := case when new.uc_verified then 'uc' end;   -- an older page that only knows the UC tick
  end if;
  new.uc_verified := case when new.coverage is not null then new.coverage = 'uc' end;
  return new;
end $$;
create trigger children_coverage before insert or update on public.children for each row execute function app.sync_coverage();

create or replace function public.enrol_child(p_child jsonb) returns text
language plpgsql security invoker set search_path = '' as $$
declare v_unit text := app.my_unit(); v_id text;
begin
  if v_unit is null then raise exception 'บัญชีนี้ไม่ใช่บัญชีหน่วยบริการ'; end if;
  insert into public.children (unit_id, school_id, class, sex, birth_ym, consent_on, assent, coverage, uc_verified, uc_checked_on, uc_method,
                               conditions, allergy_silver, allergy_colophony, is_test)
  values (v_unit, p_child ->> 'school_id', p_child ->> 'class', nullif(p_child ->> 'sex', ''), nullif(p_child ->> 'birth_ym', ''),
          nullif(p_child ->> 'consent_on', '')::date, coalesce((p_child ->> 'assent')::boolean, false),
          nullif(p_child ->> 'coverage', ''),
          (p_child ->> 'uc_verified')::boolean, nullif(p_child ->> 'uc_checked_on', '')::date, nullif(p_child ->> 'uc_method', ''),
          nullif(p_child ->> 'conditions', ''), coalesce((p_child ->> 'allergy_silver')::boolean, false),
          coalesce((p_child ->> 'allergy_colophony')::boolean, false),
          (select u.is_test from public.units u where u.id = v_unit))
  returning study_id into v_id;
  return v_id;
end $$;

-- Services carry the child's coverage. nhso_first: the unit claims NHSO first and the project pays the
-- difference (uc, other); false: the project pays the full rate (none); null: coverage not recorded or a
-- group activity. unit_price is still the project reference rate; the NHSO share comes with v1.2.
create or replace view public.v_services_priced with (security_invoker = true) as
select s.*, u.arm, u.ptype, p.name as code_name,
       (s.tooth between 51 and 85) as primary_tooth,
       case when p.outside or p.unpriced or s.tooth between 51 and 85 then 0
            when u.arm = 'control' or u.ptype = 'public' then p.price_lc
            else p.price_full end as unit_price,
       p.price_full as full_cost,
       c.coverage,
       case when c.coverage is not null then c.coverage <> 'none' end as nhso_first
from public.services s
join public.units u on u.id = s.unit_id
left join public.price_list p on p.code = s.code
     and s.service_date >= p.valid_from and (p.valid_to is null or s.service_date < p.valid_to)
left join public.children c on c.study_id = s.study_id;

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
       x.n_fpm_need_seal, x.n_need_refer, x.urgent, x.pi_mean, x.gi_mean, x.recall_date, c.is_test,
       c.coverage
from public.children c
join public.units u on u.id = c.unit_id
join public.schools s on s.id = c.school_id
left join public.v_exam_summary x on x.study_id = c.study_id
left join public.exams e on e.id = x.exam_id;
