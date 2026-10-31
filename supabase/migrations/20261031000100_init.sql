-- Dent-II record form v1.0: schema, row-level security, audit trail and formula views.
-- Plan: Dent-II Record Form Plan §7 (data model), §8.1 (Supabase set-up), §9 (privacy).
-- Decisions: D-18 (identifiers for own-unit staff and the PI only), D-37 (final exam form),
-- D-39 (month-grid plan; services one row each), D-42 (one account per unit), D-54 (primary teeth
-- not counted in the unit budget).

create extension if not exists pgcrypto;
create schema if not exists app;   -- helper functions; not exposed through the Data API

-- ------------------------------------------------------------------ reference tables
create table public.units (
  id         text primary key,                       -- e.g. 'public-cap'
  letter     text not null unique check (letter ~ '^[A-Z]$'),   -- study ID prefix
  name       text not null,
  arm        text not null check (arm in ('control', 'cap', 'ffs')),
  ptype      text not null check (ptype in ('public', 'private')),
  day1       date,                                   -- first baseline exam day
  is_test    boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.schools (
  id      text primary key,                          -- e.g. 'B-01'
  unit_id text not null references public.units,
  seq     int  not null check (seq between 1 and 99),
  name    text not null,
  classes text[] not null default '{ป.1/1,ป.1/2,ป.1/3}',
  unique (unit_id, seq)
);

-- One row per login. v1.0: one account per unit (D-42) plus research and PI accounts.
create table public.staff (
  user_id      uuid primary key references auth.users on delete cascade,
  unit_id      text references public.units,
  role         text not null check (role in ('unit', 'research', 'pi')),
  display_name text not null,
  check ((role = 'unit') = (unit_id is not null))
);

-- Calibrated examiners (WS1-5): exams take an examiner code from this list only.
create table public.examiners (
  code          text primary key,
  unit_id       text not null references public.units,
  kappa         numeric(3, 2),
  calibrated_on date,
  active        boolean not null default true
);

-- Versioned price list. v1.0 uses the cost-study prices of prototype v0.7 as reference values;
-- the fee schedules (WS3-8) replace them before v1.2 (budget dashboard).
create table public.price_list (
  code       text not null,
  valid_from date not null default '2026-10-01',
  valid_to   date,
  name       text not null,
  short      text not null,
  unit       text not null,
  price_lc   numeric(10, 2) not null default 0,      -- no labour cost (ศบส., control)
  price_full numeric(10, 2) not null default 0,      -- 100% labour cost (private clinics)
  tooth_rule text check (tooth_rule in ('fpm', 'any', 'prim', 'opt')),
  group_kind text check (group_kind in ('person', 'session')),
  unpriced   boolean not null default false,
  outside    boolean not null default false,         -- outside the project budget (normal NHSO route)
  control_claimable boolean not null default false,
  control_per_year  int,
  primary key (code, valid_from)
);

-- ------------------------------------------------------------------ children
create table public.children (
  study_id     text primary key,                     -- letter-school-seq, e.g. 'B-01-007'
  unit_id      text not null references public.units,
  school_id    text not null references public.schools,
  class        text not null,
  sex          text check (sex in ('M', 'F')),
  dob          date,
  enrolled_on  date not null default current_date,
  consent_on   date,                                 -- parent consent signed
  assent       boolean not null default false,       -- child assent
  uc_verified  boolean,
  uc_checked_on date,
  uc_method    text,
  conditions   text,                                 -- medical conditions, special needs (risk item 1)
  allergy_silver    boolean not null default false,  -- blocks SDF
  allergy_colophony boolean not null default false,  -- caution for varnish
  status       text not null default 'enrolled' check (status in ('enrolled', 'withdrawn')),
  is_test      boolean not null default true,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_by   uuid,
  updated_at   timestamptz not null default now(),
  unique (study_id, unit_id)
);

-- Identifiers sit apart (D-18): readable by the child's own unit and the PI only.
create table public.child_identifiers (
  study_id         text primary key,
  unit_id          text not null,
  national_id      text check (national_id ~ '^[0-9]{13}$'),
  prefix           text,
  first_name       text,
  last_name        text,
  guardian_name    text,
  guardian_relation text,
  guardian_phone   text,
  updated_at       timestamptz not null default now(),
  foreign key (study_id, unit_id) references public.children (study_id, unit_id) on update cascade
);

-- ------------------------------------------------------------------ exams (final form, D-37)
create table public.exams (
  id            uuid primary key default gen_random_uuid(),
  study_id      text not null,
  unit_id       text not null,
  round         text not null check (round in ('baseline', 'm6', 'm12', 'recall', 'urgent')),
  exam_date     date not null,
  place         text check (place in ('school', 'van', 'clinic')),
  examiner_code text references public.examiners,
  attended      boolean not null default true,       -- false = absent on exam day
  risk          jsonb not null default '{}',         -- {r1..r8: 'y'|'n'}
  teeth         jsonb not null default '{}',         -- {position: {t, A, B, act, occ, partial, need}}
  pigi          jsonb not null default '{}',         -- {'16B': {pi, gi}, ...}
  urgent        jsonb not null default '{}',         -- {pain, swell, big}
  need_override jsonb not null default '{}',         -- {position: need} where the examiner differs
  override_reason jsonb not null default '{}',
  fl_override   int check (fl_override in (3, 6)),
  notes         text,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_by    uuid,
  updated_at    timestamptz not null default now(),
  foreign key (study_id, unit_id) references public.children (study_id, unit_id) on update cascade
);
create unique index exams_one_per_study_round on public.exams (study_id, round) where round in ('baseline', 'm6', 'm12');

-- ------------------------------------------------------------------ services (claims ledger, D-39)
create table public.services (
  id           bigint generated always as identity primary key,
  unit_id      text not null references public.units,
  study_id     text,                                 -- null for a school session (177)
  code         text not null,
  tooth        int,
  service_date date not null,
  plan_key     text,                                 -- plan row it fulfils, e.g. 'seal-16', 'fl'
  plan_month   int check (plan_month between 1 and 12),
  from_plan    boolean not null default false,       -- created by ticking the plan grid
  group_id     uuid,
  group_note   text,
  n_participants int,
  minutes      int,
  reseal       boolean not null default false,
  outcome      text,                                 -- referral outcome
  provider     text,                                 -- examiner / provider code on the device
  note         text,
  status       text not null default 'draft'
               check (status in ('draft', 'submitted', 'returned', 'approved', 'paid', 'recorded')),
  return_note  text,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_by   uuid,
  updated_at   timestamptz not null default now(),
  foreign key (study_id, unit_id) references public.children (study_id, unit_id) on update cascade
);
create index services_unit_study on public.services (unit_id, study_id);

-- ------------------------------------------------------------------ audit trail
create table public.audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  user_id    uuid,
  table_name text not null,
  row_pk     text,
  action     text not null,
  old_row    jsonb,
  new_row    jsonb
);

-- ------------------------------------------------------------------ helper functions
create function app.my_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.staff where user_id = auth.uid()
$$;

create function app.my_unit() returns text
language sql stable security definer set search_path = '' as $$
  select unit_id from public.staff where user_id = auth.uid() and role = 'unit'
$$;

create function app.is_research() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role in ('research', 'pi') from public.staff where user_id = auth.uid()), false)
$$;

create function app.n_keys(j jsonb) returns int
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(j) = 'object' then (select count(*)::int from jsonb_object_keys(j)) else 0 end
$$;

create function app.valid_risk(r jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(r) = 'object'
     and not exists (select 1 from jsonb_each_text(r) j where j.key !~ '^r[1-8]$' or j.value is null or j.value not in ('y', 'n'))
$$;

-- 24 positions of the final form: 16–11, 21–26, 46–41, 31–36. Primary teeth sit at x1–x5.
create function app.valid_teeth(t jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(t) = 'object' and not exists (
    select 1 from jsonb_each(t) j
    where j.key !~ '^[1-4][1-6]$'
       or jsonb_typeof(j.value) <> 'object'
       or coalesce(j.value ->> 't', '') not in ('p', 'd', 'n')
       or (j.value ->> 't' = 'd' and right(j.key, 1) not in ('1', '2', '3', '4', '5'))
       or (j.value ->> 't' = 'n' and coalesce(j.value ->> 'A', '') not in ('96', '97', '98', '99'))
       or (j.value ->> 't' in ('p', 'd') and (coalesce(j.value ->> 'A', '') !~ '^[0-9]$' or coalesce(j.value ->> 'B', '') !~ '^[0-6]$'))
       or (j.value ->> 'occ' is not null and j.value ->> 'occ' !~ '^[0-6]$')
       or (j.value ->> 'need' is not null and j.value ->> 'need' !~ '^[0-8]$')
       or (j.value ->> 'act' is not null and j.value ->> 'act' not in ('a', 'i'))
  )
$$;

create function app.valid_pigi(p jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(p) = 'object' and not exists (
    select 1 from jsonb_each(p) j
    where j.key not in ('16B', '11La', '26B', '46Li', '31La', '36Li')
       or coalesce(j.value ->> 'pi', '') !~ '^[0-3]$'
       or coalesce(j.value ->> 'gi', '') !~ '^[0-3]$'
  )
$$;

-- TDA caries risk, ages 6–12 (paper form part 1). An unanswered item scores as "no", as in the form logic.
create function app.risk_score(r jsonb) returns int
language sql immutable set search_path = '' as $$
  select (case when r ->> 'r1' = 'y' then 1 else 0 end)
       + (case when r ->> 'r2' = 'y' then 3 else 0 end)
       + (case when r ->> 'r3' = 'y' then 1 else 0 end)
       + (case when r ->> 'r4' = 'y' then 1 else 0 end)
       + (case when r ->> 'r5' = 'y' then 2 else 0 end)
       + (case when r ->> 'r6' = 'y' then 2 else 0 end)
       + (case when r ->> 'r7' = 'y' then 0 else 1 end)
       + (case when r ->> 'r8' = 'y' then 1 else 0 end)
$$;

create function app.risk_level(score int) returns text
language sql immutable set search_path = '' as $$
  select case when score <= 2 then 'low' when score <= 5 then 'high' else 'vhigh' end
$$;

alter table public.exams add constraint exams_complete check (
  not attended or (
    app.valid_risk(risk) and app.n_keys(risk) = 8
    and app.valid_teeth(teeth) and app.n_keys(teeth) = 24
    and app.valid_pigi(pigi)
  )
);

-- ------------------------------------------------------------------ triggers
create function app.touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_table_name <> 'child_identifiers' then new.updated_by := auth.uid(); end if;
  return new;
end $$;

create trigger children_touch before update on public.children for each row execute function app.touch();
create trigger identifiers_touch before update on public.child_identifiers for each row execute function app.touch();
create trigger exams_touch before update on public.exams for each row execute function app.touch();
create trigger services_touch before update on public.services for each row execute function app.touch();

-- Study ID = unit letter - school number - running number in that school, e.g. B-01-007 (plan §3.1).
create function app.set_study_id() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_letter text; v_seq int; v_next int;
begin
  if new.study_id is not null then return new; end if;
  select u.letter, s.seq into v_letter, v_seq
    from public.schools s join public.units u on u.id = s.unit_id
   where s.id = new.school_id and s.unit_id = new.unit_id
   for update of s;
  if v_letter is null then
    raise exception 'โรงเรียน % ไม่ได้อยู่ในหน่วย %', new.school_id, new.unit_id;
  end if;
  select coalesce(max(split_part(c.study_id, '-', 3)::int), 0) + 1 into v_next
    from public.children c where c.school_id = new.school_id;
  new.study_id := v_letter || '-' || lpad(v_seq::text, 2, '0') || '-' || lpad(v_next::text, 3, '0');
  return new;
end $$;
create trigger children_study_id before insert on public.children for each row execute function app.set_study_id();

-- No exam is saved without parent consent and child assent (plan §3.1).
create function app.check_consent() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.attended and not exists (
    select 1 from public.children c where c.study_id = new.study_id and c.consent_on is not null and c.assent
  ) then
    raise exception 'ยังไม่มีความยินยอมของผู้ปกครองและเด็ก จึงบันทึกผลตรวจไม่ได้' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger exams_consent before insert or update on public.exams for each row execute function app.check_consent();

-- Every insert, update and delete goes to audit_log. Identifier changes keep the field names only (D-18).
create function app.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_old jsonb; v_new jsonb; v_pk text;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new := to_jsonb(new); end if;
  v_pk := coalesce(v_new, v_old) ->> tg_argv[0];
  if tg_table_name = 'child_identifiers' then
    v_new := jsonb_build_object('changed', (
      select coalesce(jsonb_agg(k.key), '[]'::jsonb)
        from jsonb_object_keys(coalesce(v_new, v_old)) k(key)
       where k.key not in ('study_id', 'unit_id', 'updated_at')
         and (v_old -> k.key) is distinct from (v_new -> k.key)));
    v_old := null;
  end if;
  insert into public.audit_log (user_id, table_name, row_pk, action, old_row, new_row)
  values (auth.uid(), tg_table_name, v_pk, tg_op, v_old, v_new);
  return coalesce(new, old);
end $$;

create trigger children_audit after insert or update or delete on public.children for each row execute function app.audit('study_id');
create trigger identifiers_audit after insert or update or delete on public.child_identifiers for each row execute function app.audit('study_id');
create trigger exams_audit after insert or update or delete on public.exams for each row execute function app.audit('id');
create trigger services_audit after insert or update or delete on public.services for each row execute function app.audit('id');
create trigger staff_audit after insert or update or delete on public.staff for each row execute function app.audit('user_id');
create trigger examiners_audit after insert or update or delete on public.examiners for each row execute function app.audit('code');
create trigger price_audit after insert or update or delete on public.price_list for each row execute function app.audit('code');

-- ------------------------------------------------------------------ row-level security
alter table public.units enable row level security;
alter table public.schools enable row level security;
alter table public.staff enable row level security;
alter table public.examiners enable row level security;
alter table public.price_list enable row level security;
alter table public.children enable row level security;
alter table public.child_identifiers enable row level security;
alter table public.exams enable row level security;
alter table public.services enable row level security;
alter table public.audit_log enable row level security;

create policy units_read on public.units for select to authenticated
  using (id = (select app.my_unit()) or (select app.is_research()));
create policy schools_read on public.schools for select to authenticated
  using (unit_id = (select app.my_unit()) or (select app.is_research()));
create policy staff_read on public.staff for select to authenticated
  using (user_id = (select auth.uid()) or (select app.is_research()));
create policy examiners_read on public.examiners for select to authenticated
  using (unit_id = (select app.my_unit()) or (select app.is_research()));
create policy examiners_research_write on public.examiners for all to authenticated
  using ((select app.my_role()) = 'research') with check ((select app.my_role()) = 'research');
create policy price_read on public.price_list for select to authenticated using (true);

create policy children_read on public.children for select to authenticated
  using (unit_id = (select app.my_unit()) or (select app.is_research()));
create policy children_insert on public.children for insert to authenticated
  with check (unit_id = (select app.my_unit()));
create policy children_update on public.children for update to authenticated
  using (unit_id = (select app.my_unit())) with check (unit_id = (select app.my_unit()));

-- D-18: the research team never reads identifiers; the PI does.
create policy identifiers_read on public.child_identifiers for select to authenticated
  using (unit_id = (select app.my_unit()) or (select app.my_role()) = 'pi');
create policy identifiers_insert on public.child_identifiers for insert to authenticated
  with check (unit_id = (select app.my_unit()));
create policy identifiers_update on public.child_identifiers for update to authenticated
  using (unit_id = (select app.my_unit())) with check (unit_id = (select app.my_unit()));

create policy exams_read on public.exams for select to authenticated
  using (unit_id = (select app.my_unit()) or (select app.is_research()));
create policy exams_insert on public.exams for insert to authenticated
  with check (unit_id = (select app.my_unit()));
create policy exams_update on public.exams for update to authenticated
  using (unit_id = (select app.my_unit())) with check (unit_id = (select app.my_unit()));

create policy services_read on public.services for select to authenticated
  using (unit_id = (select app.my_unit()) or (select app.is_research()));
create policy services_insert on public.services for insert to authenticated
  with check (unit_id = (select app.my_unit()) and status in ('draft', 'recorded'));
create policy services_update_unit on public.services for update to authenticated
  using (unit_id = (select app.my_unit()) and status in ('draft', 'recorded', 'returned'))
  with check (unit_id = (select app.my_unit()) and status in ('draft', 'recorded', 'submitted'));
create policy services_update_research on public.services for update to authenticated
  using ((select app.my_role()) = 'research') with check ((select app.my_role()) = 'research');
create policy services_delete on public.services for delete to authenticated
  using (unit_id = (select app.my_unit()) and status in ('draft', 'recorded'));

create policy audit_read on public.audit_log for select to authenticated using ((select app.is_research()));

-- The public (anon) key gets nothing; logged-in users get only what the policies allow.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke insert, update, delete on public.units, public.schools, public.staff, public.price_list, public.audit_log from authenticated;
grant usage on schema app to authenticated;
revoke all on all functions in schema app from public, anon;
grant execute on function app.my_role(), app.my_unit(), app.is_research(), app.n_keys(jsonb), app.valid_risk(jsonb),
  app.valid_teeth(jsonb), app.valid_pigi(jsonb), app.risk_score(jsonb), app.risk_level(int) to authenticated;
alter default privileges in schema public revoke all on tables from anon;

-- ------------------------------------------------------------------ formula views (plan §8.1)
-- Views run with the caller's rights, so row-level security applies to them too.

-- One row per exam × tooth position.
create view public.v_tooth_findings with (security_invoker = true) as
select e.id as exam_id, e.study_id, e.unit_id, e.round, e.exam_date,
       j.key::int as position,
       j.value ->> 't' as presence,                                   -- p permanent, d primary, n none
       case j.value ->> 't' when 'p' then j.key::int when 'd' then j.key::int + 40 end as tooth_no,
       (j.value ->> 'A')::int as code_a,
       (j.value ->> 'B')::int as code_b,
       j.value ->> 'act' as activity,
       (j.value ->> 'occ')::int as occlusal_icdas,
       coalesce((j.value ->> 'partial')::boolean, false) as partly_erupted,
       (j.value ->> 'need')::int as need,
       coalesce((j.value ->> 'B')::int >= 3, false) as decayed           -- D-10: ICDAS ≥3
from public.exams e
cross join lateral jsonb_each(e.teeth) j
where e.attended;

-- One row per exam: risk, dmft/DMFT, first permanent molars, urgent and referral flags.
create view public.v_exam_summary with (security_invoker = true) as
select e.id as exam_id, e.study_id, e.unit_id, e.round, e.exam_date, e.attended, e.examiner_code, e.place,
       case when e.attended then app.risk_score(e.risk) end as risk_score,
       case when e.attended then app.risk_level(app.risk_score(e.risk)) end as risk_level,
       t.d, t.m, t.f, t.d + t.m + t.f as dmft,
       t."D", t."M", t."F", t."D" + t."M" + t."F" as "DMFT",
       t.n_perm, t.n_fpm, t.n_fpm_partial, t.n_fpm_need_seal, t.n_need_refer,
       (coalesce((e.urgent ->> 'pain')::boolean, false) or coalesce((e.urgent ->> 'swell')::boolean, false)
         or coalesce((e.urgent ->> 'big')::boolean, false)) as urgent,
       (select round(avg((p.value ->> 'pi')::numeric), 2) from jsonb_each(e.pigi) p) as pi_mean,
       (select round(avg((p.value ->> 'gi')::numeric), 2) from jsonb_each(e.pigi) p) as gi_mean,
       case when e.attended then (e.exam_date + make_interval(months => case when app.risk_level(app.risk_score(e.risk)) = 'vhigh' then 3 else 6 end))::date end as recall_date
from public.exams e
left join lateral (
  select count(*) filter (where presence = 'd' and code_b >= 3) as d,
         count(*) filter (where presence = 'n' and code_a = 97 and right(position::text, 1) in ('1','2','3','4','5')
                           and position not in (11, 21, 31, 32, 41, 42)) as m,
         count(*) filter (where presence = 'd' and code_b < 3 and code_a between 3 and 8) as f,
         count(*) filter (where presence = 'p' and code_b >= 3) as "D",
         count(*) filter (where presence = 'n' and code_a = 97 and not (right(position::text, 1) in ('1','2','3','4','5')
                           and position not in (11, 21, 31, 32, 41, 42))) as "M",
         count(*) filter (where presence = 'p' and code_b < 3 and code_a between 3 and 8) as "F",
         count(*) filter (where presence = 'p') as n_perm,
         count(*) filter (where presence = 'p' and position in (16, 26, 36, 46)) as n_fpm,
         count(*) filter (where presence = 'p' and position in (16, 26, 36, 46) and partly_erupted) as n_fpm_partial,
         count(*) filter (where presence = 'p' and position in (16, 26, 36, 46) and need = 2) as n_fpm_need_seal,
         count(*) filter (where need >= 5) as n_need_refer
    from public.v_tooth_findings tf where tf.exam_id = e.id
) t on true;

-- Services with the unit's project price and the full cost. Primary-tooth services are outside the
-- unit budget (D-54); referrals and unpriced items carry 0. Arm rules (caps, ceilings) come in v1.2.
create view public.v_services_priced with (security_invoker = true) as
select s.*, u.arm, u.ptype, p.name as code_name,
       (s.tooth between 51 and 85) as primary_tooth,
       case when p.outside or p.unpriced or s.tooth between 51 and 85 then 0
            when u.arm = 'control' or u.ptype = 'public' then p.price_lc
            else p.price_full end as unit_price,
       p.price_full as full_cost
from public.services s
join public.units u on u.id = s.unit_id
left join public.price_list p on p.code = s.code
     and s.service_date >= p.valid_from and (p.valid_to is null or s.service_date < p.valid_to);

-- De-identified research dataset: one row per child × exam. No names, national ID or date of birth.
create view public.v_export_children with (security_invoker = true) as
select c.study_id, u.letter as unit_letter, u.arm, u.ptype, s.seq as school_seq, c.class, c.sex,
       case when c.dob is not null and x.exam_date is not null
            then (extract(year from age(x.exam_date, c.dob)) * 12 + extract(month from age(x.exam_date, c.dob)))::int end as age_months,
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

grant select on public.v_tooth_findings, public.v_exam_summary, public.v_services_priced, public.v_export_children to authenticated;
revoke all on public.v_tooth_findings, public.v_exam_summary, public.v_services_priced, public.v_export_children from anon;

-- ------------------------------------------------------------------ enrolment in one transaction
-- One child per national ID across the trial (a child enrolled twice is caught at entry).
create unique index child_identifiers_national_id on public.child_identifiers (national_id) where national_id is not null;

-- Runs with the caller's rights, so row-level security still decides what the unit may write.
create function public.enrol_child(p_child jsonb, p_ident jsonb) returns text
language plpgsql security invoker set search_path = '' as $$
declare v_unit text := app.my_unit(); v_id text;
begin
  if v_unit is null then raise exception 'บัญชีนี้ไม่ใช่บัญชีหน่วยบริการ'; end if;
  insert into public.children (unit_id, school_id, class, sex, dob, consent_on, assent, uc_verified, uc_checked_on, uc_method,
                               conditions, allergy_silver, allergy_colophony, is_test)
  values (v_unit, p_child ->> 'school_id', p_child ->> 'class', nullif(p_child ->> 'sex', ''), nullif(p_child ->> 'dob', '')::date,
          nullif(p_child ->> 'consent_on', '')::date, coalesce((p_child ->> 'assent')::boolean, false),
          (p_child ->> 'uc_verified')::boolean, nullif(p_child ->> 'uc_checked_on', '')::date, nullif(p_child ->> 'uc_method', ''),
          nullif(p_child ->> 'conditions', ''), coalesce((p_child ->> 'allergy_silver')::boolean, false),
          coalesce((p_child ->> 'allergy_colophony')::boolean, false),
          (select u.is_test from public.units u where u.id = v_unit))
  returning study_id into v_id;
  insert into public.child_identifiers (study_id, unit_id, national_id, prefix, first_name, last_name, guardian_name, guardian_relation, guardian_phone)
  values (v_id, v_unit, nullif(p_ident ->> 'national_id', ''), nullif(p_ident ->> 'prefix', ''), nullif(p_ident ->> 'first_name', ''),
          nullif(p_ident ->> 'last_name', ''), nullif(p_ident ->> 'guardian_name', ''), nullif(p_ident ->> 'guardian_relation', ''),
          nullif(p_ident ->> 'guardian_phone', ''));
  return v_id;
end $$;
revoke all on function public.enrol_child(jsonb, jsonb) from public, anon;
grant execute on function public.enrol_child(jsonb, jsonb) to authenticated;
