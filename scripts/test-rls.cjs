// API test of the record form against the TEST project: logins, row-level security, enrolment without personal
// data (D-64), health coverage (D-68), exams, services and the claims cycle (D-65), what the project pays by fee
// schedule (v1.1), cohort and deleting a child, transfers with slips, views, audit.
// Run: NODE_PATH=<dir with @supabase/supabase-js> node scripts/test-rls.cjs
// Uses the test accounts in scripts/test-accounts.local.json (never real staff). Leaves its test children in place.
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const cfgText = fs.readFileSync(path.join(__dirname, '..', 'config.js'), 'utf8');
const URL = cfgText.match(/url:\s*'([^']+)'/)[1];
const KEY = cfgText.match(/anonKey:\s*'([^']+)'/)[1];
const ACCTS = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(__dirname, 'test-accounts.local.json'), 'utf8')).map(a => [a.username, a]));

let pass = 0, fail = 0;
const ok = (cond, label, extra) => { if (cond) { pass++; console.log('  ✓', label); } else { fail++; console.log('  ✗', label, extra ?? ''); } };
const client = () => createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
async function login(user) {
  const c = client();
  const { error } = await c.auth.signInWithPassword({ email: ACCTS[user].email, password: ACCTS[user].password });
  if (error) throw new Error(`login ${user}: ${error.message}`);
  return c;
}
const POS = [16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36];
const EARLY = [16, 26, 36, 46, 11, 21, 31, 32, 41, 42];
function mouth(edits = {}) {
  const m = {};
  for (const p of POS) m[p] = EARLY.includes(p) ? { t: 'p', A: 0, B: 0, act: null, need: [16, 26, 36, 46].includes(p) ? 2 : 0 } : { t: 'd', A: 0, B: 0, act: null, need: 0 };
  for (const [p, e] of Object.entries(edits)) Object.assign(m[p], e);
  for (const p of [16, 26, 36, 46]) if (m[p].t === 'p') m[p].partial = !!m[p].partial;
  return m;
}
const PIGI = { '16B': { pi: 1, gi: 0 }, '11La': { pi: 1, gi: 0 }, '26B': { pi: 1, gi: 1 }, '46Li': { pi: 2, gi: 1 }, '31La': { pi: 0, gi: 0 }, '36Li': { pi: 1, gi: 1 } };
const RISK_HIGH = { r1: 'n', r2: 'y', r3: 'y', r4: 'n', r5: 'y', r6: 'n', r7: 'y', r8: 'y' };   // 7 → very high
const consented = { class: 'ป.1/1', sex: 'F', birth_ym: '2019-06', consent_on: '2026-10-28', assent: true, coverage: 'uc', uc_checked_on: '2026-10-29', uc_method: 'ตรวจสิทธิออนไลน์' };

(async () => {
  console.log('anon key only');
  const anon = client();
  const a1 = await anon.from('children').select('*');
  ok(a1.error || a1.data.length === 0, 'anon reads no children');
  const a2 = await anon.rpc('enrol_child', { p_child: { school_id: 'B-01', class: 'ป.1/1' } });
  ok(!!a2.error, 'anon cannot enrol');
  const a3 = await anon.auth.signUp({ email: `probe${Date.now()}@dent2.test`, password: 'x' + Date.now() + 'Yz!' });
  ok(!!a3.error, 'sign-ups are off', a3.error ? '' : 'sign-up succeeded');

  console.log('unit public-cap (B, capitation)');
  const B = await login('public-cap');
  const units = await B.from('units').select('id,id_prefix');
  ok(units.data.length === 1 && units.data[0].id_prefix === 'TB', 'sees only its own unit (prefix TB)', JSON.stringify(units.data));
  const e1 = await B.rpc('enrol_child', { p_child: { school_id: 'B-01', ...consented } });
  ok(!e1.error && /^TB-\d{3}$/.test(e1.data), 'enrol → study ID TB-nnn (centre prefix + running number)', e1.error ? e1.error.message : e1.data);
  const kid1 = e1.data;
  const e2 = await B.rpc('enrol_child', { p_child: { school_id: 'B-01', class: 'ป.1/2', sex: 'M' } });
  ok(!e2.error, 'enrol without consent (allowed; exam blocked later)');
  const kid2 = e2.data;
  ok(+kid2.slice(3) === +kid1.slice(3) + 1, 'running number goes up by one', `${kid1} → ${kid2}`);
  const id1 = await B.from('child_identifiers').insert({ study_id: kid1, unit_id: 'public-cap', first_name: 'x' });
  ok(!!id1.error, 'names cannot be stored (D-64)');
  const dob = await B.from('children').update({ dob: '2019-06-12' }).eq('study_id', kid1).select();
  ok(!!dob.error, 'full date of birth cannot be stored (birth month only)');
  const cv = await B.from('children').select('coverage,uc_verified').eq('study_id', kid1).single();
  ok(cv.data && cv.data.coverage === 'uc' && cv.data.uc_verified === true, 'coverage UC saved, UC tick kept in step', JSON.stringify(cv.data));
  const eN = await B.rpc('enrol_child', { p_child: { school_id: 'B-01', ...consented, coverage: 'none' } });
  const kidN = eN.data;
  const cn = eN.error ? null : (await B.from('children').select('coverage,uc_verified').eq('study_id', kidN).single()).data;
  ok(cn && cn.coverage === 'none' && cn.uc_verified === false, 'no public coverage (e.g. foreign child) saved', eN.error ? eN.error.message : JSON.stringify(cn));
  const eBad = await B.rpc('enrol_child', { p_child: { school_id: 'B-01', class: 'ป.1/1', coverage: 'private' } });
  ok(!!eBad.error, 'unknown coverage value is refused');
  const wrongSchool = await B.rpc('enrol_child', { p_child: { school_id: 'C-01', class: 'ป.1/1' } });
  ok(!!wrongSchool.error, "cannot enrol into another unit's school");

  const exam = { study_id: kid1, unit_id: 'public-cap', round: 'baseline', exam_date: '2026-10-31', place: 'van', examiner_code: 'TEST-B1', attended: true,
    risk: RISK_HIGH, teeth: mouth({ 36: { B: 3, occ: 3, act: 'a', need: 2 }, 14: { B: 5, act: 'a', need: 4 }, 26: { partial: true } }), pigi: PIGI, urgent: { pain: false, swell: false, big: false } };
  const x1 = await B.from('exams').insert(exam).select().single();
  ok(!x1.error, 'baseline exam saved', x1.error && x1.error.message);
  const x2 = await B.from('exams').insert({ ...exam, study_id: kid2 }).select().single();
  ok(!!x2.error && /ความยินยอม/.test(x2.error.message), 'exam without consent is refused');
  const x3 = await B.from('exams').insert({ ...exam }).select().single();
  ok(!!x3.error, 'second baseline for the same child is refused');
  const bad = await B.from('exams').insert({ ...exam, study_id: kid2, risk: { r1: 'n' } }).select().single();
  ok(!!bad.error, 'incomplete exam is refused');
  const sum = await B.from('v_exam_summary').select('*').eq('study_id', kid1).single();
  ok(sum.data && sum.data.risk_level === 'vhigh' && sum.data.risk_score === 7 && sum.data.dmft === 1 && sum.data.DMFT === 1 && sum.data.n_fpm === 4 && sum.data.n_fpm_partial === 1,
    'summary view: risk 7 very high, dmft 1, DMFT 1, 4 FPMs, 1 partial', JSON.stringify(sum.data));
  const s1 = await B.from('services').insert({ unit_id: 'public-cap', study_id: kid1, code: '171', tooth: 16, service_date: '2026-10-31', plan_key: 'seal-16', from_plan: true, provider: 'TEST-B1', status: 'recorded' }).select().single();
  const s2 = await B.from('services').insert({ unit_id: 'public-cap', study_id: kid1, code: '55', tooth: 54, service_date: '2026-10-31', status: 'recorded' }).select().single();
  ok(!s1.error && !s2.error, 'services saved (plan tick and out-of-plan)');
  const pr = await B.from('v_services_priced').select('code,unit_price,primary_tooth').in('id', [s1.data.id, s2.data.id]);
  const p171 = pr.data.find(r => r.code === '171'), p55 = pr.data.find(r => r.code === '55');
  ok(+p171.unit_price === 242 && +p55.unit_price === 0 && p55.primary_tooth, 'priced view: sealant 242 (fee schedule Table 1), primary-tooth filling 0 (D-54)');
  const sN = await B.from('services').insert({ unit_id: 'public-cap', study_id: kidN, code: '170', service_date: '2026-10-31', status: 'recorded' }).select().single();
  const pc = await B.from('v_services_priced').select('id,coverage,nhso_first').in('id', [s1.data.id, sN.data && sN.data.id].filter(Boolean));
  const pc1 = pc.data && pc.data.find(r => r.id === s1.data.id), pcN = pc.data && sN.data && pc.data.find(r => r.id === sN.data.id);
  ok(pc1 && pc1.coverage === 'uc' && pc1.nhso_first === true && pcN && pcN.coverage === 'none' && pcN.nhso_first === false,
    'priced view: UC claims NHSO first, no public coverage paid in full by the project (D-68)', sN.error ? sN.error.message : JSON.stringify(pc.data));
  const ex = await B.from('v_export_children').select('*').eq('study_id', kid1).single();
  ok(ex.data && ex.data.age_months >= 87 && ex.data.age_months <= 89 && !('dob' in ex.data), 'export: age in months from birth month, no birth date', ex.data && ex.data.age_months);
  ok(ex.data && ex.data.coverage === 'uc', 'export carries coverage');

  console.log('unit public-ffs (C, shared savings): claims cycle');
  const C = await login('public-ffs');
  const c1 = await C.from('children').select('study_id').eq('study_id', kid1);
  const c3 = await C.from('exams').select('id').eq('study_id', kid1);
  const c4 = await C.from('services').select('id').eq('study_id', kid1);
  ok(!c1.data.length && !c3.data.length && !c4.data.length, "C sees none of B's child, exams or services");
  const c5 = await C.from('services').insert({ unit_id: 'public-cap', study_id: kid1, code: '170', service_date: '2026-10-31' });
  ok(!!c5.error, "C cannot add a service to B's child");
  const kc = await C.rpc('enrol_child', { p_child: { school_id: 'C-01', ...consented } });
  ok(!kc.error && /^TC-\d{3}$/.test(kc.data), 'C enrols its own child TC-nnn', kc.data);
  const gid = require('crypto').randomUUID();
  const g = await C.from('services').insert([
    { unit_id: 'public-ffs', study_id: null, code: '177', service_date: '2026-10-31', group_id: gid, group_note: 'ทดสอบ · 30 นาที', n_participants: 25, minutes: 30, status: 'draft' },
    { unit_id: 'public-ffs', study_id: kc.data, code: '170', service_date: '2026-10-31', status: 'draft' }]).select();
  ok(!g.error && g.data.length === 2, 'group session + individual service saved as drafts');
  const ids = g.data.map(r => r.id);
  const sub = await C.from('services').update({ status: 'submitted' }).in('id', ids).select();
  ok(!sub.error && sub.data.length === 2, 'unit submits its drafts');
  const ap = await C.from('services').update({ status: 'approved' }).in('id', ids).select();
  ok(ap.error || ap.data.length === 0, 'unit cannot approve its own claims');
  const dl = await C.from('services').delete().in('id', ids).select();
  ok(dl.error || dl.data.length === 0, 'submitted services cannot be deleted by the unit');

  console.log('research');
  const RS = await login('research');
  const r1 = await RS.from('children').select('study_id').in('study_id', [kid1, kc.data]);
  ok(r1.data.length === 2, 'research sees children of all units');
  const r2 = await RS.from('services').update({ status: 'returned', return_note: 'ทดสอบส่งกลับ' }).eq('id', ids[1]).select();
  const r3 = await RS.from('services').update({ status: 'approved' }).eq('id', ids[0]).select();
  ok(!r2.error && r2.data.length === 1 && !r3.error && r3.data.length === 1, 'research returns one claim and approves the other');
  const r4 = await RS.from('children').insert({ unit_id: 'public-cap', school_id: 'B-01', class: 'x' });
  ok(!!r4.error, 'research cannot enrol');
  const r5 = await RS.from('audit_log').select('id').eq('table_name', 'services').in('row_pk', ids.map(String));
  ok(r5.data.length >= 6, 'audit log records each status change', r5.data.length);
  const re = await C.from('services').update({ status: 'submitted' }).eq('id', ids[1]).select();
  ok(!re.error && re.data.length === 1, 'unit resubmits the returned claim');

  // ---------------------------------------------------------------- v1.1: what the project pays (fee schedules 01–03)
  const pay = async (c, ids) => Object.fromEntries(((await c.from('v_services_pay').select('id,project_pay,pay_note').in('id', ids)).data || []).map(r => [r.id, +r.project_pay]));
  const svc = (unit_id, study_id, code, service_date, extra = {}) => ({ unit_id, study_id, code, service_date, status: 'draft', ...extra });
  console.log('fee schedule 02 (shared savings, C)');
  const kcN = (await C.rpc('enrol_child', { p_child: { school_id: 'C-01', ...consented, coverage: 'none' } })).data;
  const p2 = await C.from('services').insert([
    svc('public-ffs', kc.data, '174', '2026-10-30'), svc('public-ffs', kc.data, '170', '2026-10-30'), svc('public-ffs', kc.data, '170', '2026-11-01'),
    svc('public-ffs', kc.data, '170', '2026-11-02'), svc('public-ffs', kc.data, '171', '2026-11-01', { tooth: 16 }), svc('public-ffs', kc.data, '171', '2026-11-01', { tooth: 26 }),
    svc('public-ffs', kc.data, '171', '2026-11-01', { tooth: 36 }), svc('public-ffs', kc.data, '67210', '2026-11-01', { tooth: 46, place: 'van' }),
    svc('public-ffs', kc.data, '67210', '2026-11-02', { tooth: 36, place: 'clinic' }), svc('public-ffs', kc.data, '67210', '2026-11-02', { tooth: 54, place: 'van' }),
    svc('public-ffs', kc.data, '172', '2026-11-02', { tooth: 26, place: 'van' }), svc('public-ffs', kcN, '174', '2026-11-01'), svc('public-ffs', kcN, '171', '2026-11-01', { tooth: 16 }),
  ]).select('id');
  ok(!p2.error, 'services saved with place (van / clinic)', p2.error && p2.error.message);
  const i2 = (p2.data || []).map(r => r.id), q2 = await pay(C, i2), v2 = i2.map(id => q2[id]);
  ok(JSON.stringify(v2) === JSON.stringify([43, 156, 256, 0, 0, 0, 242, 360, 0, 0, 324, 143, 242]),
    'UC: 174 = 143−100, fluoride 256−100 then 256, twice in a month 0, sealants from the 3rd tooth, van filling 360, clinic 0, primary 0, PRR 324; no coverage: full rate', JSON.stringify(v2));

  console.log('fee schedule 03 (control, A)');
  const A = await login('public-control');
  const kaU = (await A.rpc('enrol_child', { p_child: { school_id: 'A-01', ...consented } })).data;
  const kaN = (await A.rpc('enrol_child', { p_child: { school_id: 'A-01', ...consented, coverage: 'none' } })).data;
  const p3 = await A.from('services').insert([
    svc('public-control', kaU, '174', '2026-10-30'), svc('public-control', kaU, '174', '2026-11-01'), svc('public-control', kaU, '170', '2026-11-01'),
    svc('public-control', kaU, '171', '2026-11-01', { tooth: 16 }), svc('public-control', kaU, '171', '2026-11-01', { tooth: 26 }), svc('public-control', kaU, '171', '2026-11-01', { tooth: 36 }),
    svc('public-control', kaU, '67210', '2026-11-01', { tooth: 46, place: 'van' }), svc('public-control', kaU, '176', '2026-11-01'),
    svc('public-control', kaN, '174', '2026-11-01'), svc('public-control', kaN, '67210', '2026-11-01', { tooth: 46, place: 'van' }),
  ]).select('id');
  const i3 = (p3.data || []).map(r => r.id), q3 = await pay(A, i3), v3 = i3.map(id => q3[id]);
  ok(JSON.stringify(v3) === JSON.stringify([43, 0, 156, 0, 0, 242, 360, 0, 143, 360]),
    'control: top-up of 174/170 once a year, sealants from the 3rd tooth, van filling for every child (D-74), brushing 0; no coverage: 174 in full', JSON.stringify(v3));
  const capPay = await pay(B, [s1.data.id]);
  ok(capPay[s1.data.id] === 0, 'capitation: no item payments');

  console.log('cohort and deleting a child');
  const kd = (await C.rpc('enrol_child', { p_child: { school_id: 'C-01', ...consented } })).data;
  const dB = await B.rpc('delete_child', { p_study_id: kd });
  ok(!!dB.error, "another unit cannot delete C's child");
  const dR = await RS.rpc('delete_child', { p_study_id: kd });
  ok(!!dR.error, 'the research team cannot delete a child');
  const sc = await C.rpc('submit_cohort');
  ok(!sc.error && sc.data, 'unit submits its cohort', sc.error && sc.error.message);
  const dLocked = await C.rpc('delete_child', { p_study_id: kd });
  ok(!!dLocked.error && /cohort/.test(dLocked.error.message), 'after the cohort, deleting is refused', dLocked.error && dLocked.error.message);
  const vLocked = await C.rpc('set_van_fills', { p_fills: true });
  ok(!!vLocked.error, 'after the cohort, the unit cannot change "van can fill"');
  const ro = await RS.rpc('reopen_cohort', { p_unit: 'public-ffs' });
  const roU = await C.rpc('reopen_cohort', { p_unit: 'public-ffs' });
  ok(!ro.error && !!roU.error, 'research reopens the cohort; a unit cannot');
  const dSent = await C.rpc('delete_child', { p_study_id: kc.data });
  ok(!!dSent.error, 'a child with claims already sent cannot be deleted');
  const dOk = await C.rpc('delete_child', { p_study_id: kd });
  const gone = await C.from('children').select('study_id').eq('study_id', kd);
  ok(!dOk.error && gone.data.length === 0, 'unit deletes a child before the cohort', dOk.error && dOk.error.message);

  console.log('transfers with slips');
  const slipPath = `public-ffs/test-${Date.now()}.pdf`;
  const upU = await C.storage.from('slips').upload(`public-ffs/unit-${Date.now()}.pdf`, new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }), { contentType: 'application/pdf' });
  ok(!!upU.error, 'a unit cannot upload slips');
  const up = await RS.storage.from('slips').upload(slipPath, new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }), { contentType: 'application/pdf' });
  ok(!up.error, 'research uploads a slip', up.error && up.error.message);
  const apIds = (await RS.from('services').select('id').eq('unit_id', 'public-ffs').eq('status', 'approved')).data.map(r => r.id);
  const tr = await RS.rpc('record_transfer', { p_transfer: { unit_id: 'public-ffs', kind: 'claims', amount: 199, paid_on: '2026-11-02', period: '2026-11', slip_path: slipPath }, p_service_ids: apIds });
  ok(!tr.error && tr.data, 'research records a transfer and marks the approved claims paid', tr.error && tr.error.message);
  const paidNow = (await C.from('services').select('status,transfer_id').in('id', apIds)).data;
  ok(apIds.length > 0 && paidNow.every(r => r.status === 'paid' && r.transfer_id === tr.data), 'the claims now say paid, with the transfer', JSON.stringify(paidNow));
  const tC = await C.from('transfers').select('*').eq('id', tr.data);
  const tB = await B.from('transfers').select('*').eq('id', tr.data);
  ok(tC.data.length === 1 && tB.data.length === 0, 'the unit sees its transfer; another unit does not');
  const seen = await C.from('transfers').update({ seen_at: new Date().toISOString() }).eq('id', tr.data).select();
  const cheat = await C.from('transfers').update({ amount: 999999 }).eq('id', tr.data).select();
  ok(!seen.error && seen.data.length === 1 && !!cheat.error, 'the unit marks it seen but cannot change the amount');
  const tIns = await C.from('transfers').insert({ unit_id: 'public-ffs', kind: 'other', amount: 1, paid_on: '2026-11-02' });
  ok(!!tIns.error, 'a unit cannot record transfers');
  const sC = await C.storage.from('slips').createSignedUrl(slipPath, 60);
  const sB = await B.storage.from('slips').createSignedUrl(slipPath, 60);
  ok(!sC.error && sC.data && !!sB.error, 'the unit opens its own slip; another unit cannot', sB.error ? '' : 'B got a URL');

  console.log('unit set-up: can the van fill');
  const vB = await B.rpc('set_van_fills', { p_fills: true });
  const vBrow = (await B.from('units').select('van_fills').eq('id', 'public-cap').single()).data;
  ok(!vB.error && vBrow.van_fills === true, 'a unit says its van can fill', vB.error && vB.error.message);
  const vBother = await B.rpc('set_unit_van_fills', { p_unit: 'public-ffs', p_fills: true });
  ok(!!vBother.error, "a unit cannot set another unit's setting");
  const vR = await RS.rpc('set_unit_van_fills', { p_unit: 'public-cap', p_fills: null });
  const vRrow = (await RS.from('units').select('van_fills').eq('id', 'public-cap').single()).data;
  ok(!vR.error && vRrow.van_fills === null, 'research can reset it');

  console.log('activity evidence (D-62)');
  const evPath = `public-ffs/${gid}/test-${Date.now()}.pdf`;
  const evUp = await C.storage.from('evidence').upload(evPath, new Blob(['%PDF-1.4 evidence'], { type: 'application/pdf' }), { contentType: 'application/pdf' });
  const evRow = await C.from('evidence').insert({ unit_id: 'public-ffs', group_id: gid, path: evPath, file_name: 'test.pdf' }).select().single();
  ok(!evUp.error && !evRow.error, 'a unit uploads evidence for its group activity', (evUp.error || evRow.error || {}).message);
  const evOther = await B.storage.from('evidence').upload(`public-ffs/${gid}/b-${Date.now()}.pdf`, new Blob(['x'], { type: 'application/pdf' }), { contentType: 'application/pdf' });
  const evRowOther = await B.from('evidence').insert({ unit_id: 'public-ffs', group_id: gid, path: `public-ffs/${gid}/b.pdf` });
  ok(!!evOther.error && !!evRowOther.error, "another unit cannot add evidence to C's folder");
  const evBad = await C.from('evidence').insert({ unit_id: 'public-ffs', group_id: gid, path: `public-cap/${gid}/x.pdf` });
  ok(!!evBad.error, 'the file path must sit in the unit and activity folder');
  const evB = await B.from('evidence').select('id').eq('path', evPath);
  const evBurl = await B.storage.from('evidence').createSignedUrl(evPath, 60);
  const evR = await RS.from('evidence').select('id').eq('path', evPath);
  const evRurl = await RS.storage.from('evidence').createSignedUrl(evPath, 60);
  ok(evB.data.length === 0 && !!evBurl.error && evR.data.length === 1 && !evRurl.error, 'research sees the evidence; another unit does not');
  const evRm = await C.storage.from('evidence').remove([evPath]);
  const evDel = await C.from('evidence').delete().eq('id', evRow.data.id).select();
  ok(!evRm.error && !evDel.error && evDel.data.length === 1, 'the unit removes a file uploaded by mistake');

  console.log(`\n${pass} passed, ${fail} failed · test children ${kid1}, ${kid2}, ${kidN}, ${kc.data}, ${kcN}, ${kaU}, ${kaN}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(2); });
