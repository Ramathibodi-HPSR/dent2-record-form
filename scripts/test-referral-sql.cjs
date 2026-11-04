// Offline check of migration 20261104000100_referral_d80.sql (D-80) in PGlite (Postgres in WebAssembly) against a stub
// of the tables it touches, for when the migration is not applied to the Supabase project yet.
// Run: NODE_PATH=<dir with @electric-sql/pglite> node scripts/test-referral-sql.cjs supabase/migrations/20261104000100_referral_d80.sql
const { PGlite } = require('@electric-sql/pglite');
const fs = require('fs');
(async () => {

const mig = fs.readFileSync(process.argv[2], 'utf8');
const db = new PGlite();
let pass = 0, fail = 0;
const ok = (c, label, extra) => { if (c) { pass++; console.log('  ✓', label); } else { fail++; console.log('  ✗', label, extra ?? ''); } };
const err = async (sql, params) => { try { await db.query(sql, params); return null; } catch (e) { return e.message; } };

await db.exec(`
  create role anon; create role authenticated;
  create schema app;
  create function app.my_unit() returns text language sql stable as $$ select nullif(current_setting('t.unit', true), '') $$;
  create function app.is_research() returns boolean language sql stable as $$ select coalesce(current_setting('t.research', true), '') = 'y' $$;
  create table public.children (study_id text, unit_id text, is_test boolean default true, primary key (study_id), unique (study_id, unit_id));
  create table public.exams (id bigint generated always as identity primary key, study_id text, unit_id text, round text, exam_date date, attended boolean, teeth jsonb);
  create table public.services (id bigint generated always as identity primary key, unit_id text not null, study_id text, code text not null,
    tooth int, service_date date not null, plan_key text, outcome text, status text not null default 'draft');
  create view public.v_tooth_findings as
    select e.id as exam_id, e.study_id, e.unit_id, e.round, e.exam_date, j.key::int as position,
           case j.value ->> 't' when 'p' then j.key::int when 'd' then j.key::int + 40 end as tooth_no,
           (j.value ->> 'B')::int as code_b, (j.value ->> 'need')::int as need
      from public.exams e cross join lateral jsonb_each(e.teeth) j(key, value) where e.attended;
  insert into public.children values ('TB-1', 'U1'), ('TC-1', 'U2');
  insert into public.exams (study_id, unit_id, round, exam_date, attended, teeth) values
    ('TB-1', 'U1', 'baseline', '2026-11-01', true, '{"46": {"t": "p", "B": 5, "need": 8}, "15": {"t": "d", "B": 6, "need": 8}}');
  insert into public.services (unit_id, study_id, code, tooth, service_date, status) values
    ('U1', 'TB-1', 'REF', 46, '2026-11-01', 'submitted'),
    ('U1', 'TB-1', '171', 16, '2026-11-01', 'draft'),
    ('U2', 'TC-1', 'REF', 36, '2026-11-01', 'draft'),
    ('U1', 'TB-1', 'REF', 55, '2026-11-01', 'paid');
`);
await db.exec(mig);
console.log('migration applied');

const as = async (unit, research = false) => { await db.exec(`select set_config('t.unit', '${unit || ''}', false), set_config('t.research', '${research ? 'y' : ''}', false)`); };
const call = (id, st, d, note) => db.query('select * from public.set_referral($1, $2, $3, $4)', [id, st, d, note]);

await as('U1');
const r1 = await call(1, 'no_pulp', '2026-11-03', '  ไปกับผู้ปกครอง ');
ok(r1.rows[0].ref_status === 'no_pulp' && String(r1.rows[0].ref_date).length > 0 && r1.rows[0].outcome === 'ไปกับผู้ปกครอง', 'unit records the result on its own REF row even after it was sent (submitted)', JSON.stringify(r1.rows[0]));
const r2 = await call(1, 'waiting', '2026-11-03', null);
ok(r2.rows[0].ref_status === 'waiting' && r2.rows[0].ref_date === null && r2.rows[0].outcome === null, 'back to "not seen yet" clears the date and the note');
ok(/ใส่วันที่/.test(await err('select public.set_referral(1, $1, null, null)', ['pulp'])), 'a result other than "not seen yet" needs a date');
ok(/อนาคต/.test(await err("select public.set_referral(1, 'treated', current_date + 1, null)")), 'a future date is refused');
ok(/ไม่ถูกต้อง/.test(await err("select public.set_referral(1, 'gone', null, null)")), 'an unknown result is refused');
ok(/ไม่พบรายการ/.test(await err("select public.set_referral(2, 'treated', '2026-11-03', null)")), 'a non-REF service is refused');
ok(/ไม่พบรายการ/.test(await err("select public.set_referral(3, 'treated', '2026-11-03', null)")), "another unit's referral is refused");
await as(null);
ok(/ไม่พบรายการ/.test(await err("select public.set_referral(1, 'treated', '2026-11-03', null)")), 'a login with no unit and not research (PI) is refused');
await as(null, true);
ok(!(await err("select public.set_referral(3, 'pulp', '2026-11-02', null)")), 'the research team can record a result');
ok(/services_ref_only/.test(await err("update public.services set ref_status = 'waiting' where id = 2")), 'ref_status only on REF rows (constraint)');
ok(/services_ref_date/.test(await err("update public.services set ref_status = 'waiting', ref_date = '2026-11-03' where id = 1")), 'a date needs a seen or treated result (constraint)');
const v = await db.query('select * from public.v_referrals order by id');
const v1 = v.rows.find(r => r.id === 1), v4 = v.rows.find(r => r.id === 4), v3 = v.rows.find(r => r.id === 3);
ok(v.rows.length === 3 && v1.icdas_first_exam === 5 && v1.need_first_exam === 8 && v1.ref_status === 'waiting', 'v_referrals: one row per REF with ICDAS and need at the first exam', JSON.stringify(v.rows));
ok(v4.icdas_first_exam === 6 && v4.ref_status === 'waiting' && v3.ref_status === 'pulp', 'v_referrals: primary tooth 55 matched to position 15; empty status reads "waiting"', JSON.stringify([v3, v4]));
const g = await db.query(`select has_function_privilege('anon', 'public.set_referral(bigint, text, date, text)', 'execute') as anon_fn,
  has_function_privilege('authenticated', 'public.set_referral(bigint, text, date, text)', 'execute') as auth_fn,
  has_table_privilege('authenticated', 'public.v_referrals', 'select') as auth_view`);
ok(!g.rows[0].anon_fn && g.rows[0].auth_fn && g.rows[0].auth_view, 'grants: authenticated may call and read, anon may not call', JSON.stringify(g.rows[0]));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(2); });
