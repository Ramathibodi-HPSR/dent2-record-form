// Scripted UI smoke test of v1.0 (jsdom) against the TEST project with the test accounts.
// Run: NODE_PATH=<dir with jsdom and @supabase/supabase-js> node scripts/test-ui.cjs
// Walks: login → home → cards → enrol → baseline exam → save → plan tick → untick → research view.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const APP = path.join(__dirname, '..');
const ACCTS = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(__dirname, 'test-accounts.local.json'), 'utf8')).map(a => [a.username, a]));
let pass = 0, fail = 0;
const ok = (cond, label, extra) => { if (cond) { pass++; console.log('  ✓', label); } else { fail++; console.log('  ✗', label, extra ?? ''); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch (e) { /* not yet */ } await sleep(150); } return null; }

function boot() {
  const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8').replace(/<script src="[^"]+"><\/script>/g, '');
  const dom = new JSDOM(html, { url: 'http://localhost:8765/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  Object.assign(w, { fetch, Headers, Request, Response, confirm: () => true, scrollTo: () => {}, print: () => {} });
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {};
  const errors = [];
  w.addEventListener('error', e => errors.push(String(e.error || e.message)));
  w.addEventListener('unhandledrejection', e => errors.push('unhandled: ' + String(e.reason && e.reason.message || e.reason)));
  w.console.error = (...a) => errors.push(a.join(' '));
  w.supabase = require('@supabase/supabase-js');   // the browser loads vendor/supabase.js (UMD); jsdom uses the Node build
  for (const f of ['config.js', 'app.js']) w.eval(fs.readFileSync(path.join(APP, f), 'utf8'));
  return { w, d: w.document, errors };
}
const click = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const set = (w, el, v, ev = 'change') => { el.value = v; el.dispatchEvent(new w.Event(ev, { bubbles: true })); };
async function login(w, d, user) {
  d.querySelector('#lgUser').value = user;
  d.querySelector('#lgPass').value = ACCTS[user].password;
  d.querySelector('#loginForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
}
const byText = (d, sel, re) => [...d.querySelectorAll(sel)].find(e => re.test(e.textContent));

(async () => {
  console.log('unit public-cap');
  const { w, d, errors } = boot();
  ok(!d.querySelector('#login').hidden, 'login screen shows first');
  await login(w, d, 'public-cap');
  ok(await until(() => d.querySelector('#home .tiles')), 'home dashboard renders after login');
  ok(/หน่วยทดสอบ ข/.test(d.querySelector('#acctChip').textContent), 'account chip shows the unit');
  set(w, d.querySelector('#provSel'), 'TEST-B2');
  click(w, d.querySelector('#t-kids'));
  ok(await until(() => d.querySelectorAll('#kidGroups .kcard').length >= 2), 'student cards render', d.querySelectorAll('#kidGroups .kcard').length);

  // enrol through the form
  click(w, byText(d, '#kids button', /ลงทะเบียนนักเรียน/));
  ok(!d.querySelector('#enrol').hidden, 'enrol screen opens');
  ok(!d.querySelector('#enFirst') && !d.querySelector('#enNid'), 'enrol form has no name or national ID fields (D-64)');
  set(w, d.querySelector('#enClass'), 'ป.1/3');
  d.querySelector('#enForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  ok(await until(() => /เลือกเพศ/.test(d.querySelector('#enMsg').textContent)), 'sex is required');
  set(w, d.querySelector('#enSex'), 'F');
  d.querySelector('#enBym').value = '2019-03';
  d.querySelector('#enConsent').value = '2026-10-30';
  d.querySelector('#enAssent').checked = true;
  d.querySelector('#enForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  ok(await until(() => !d.querySelector('#file').hidden && /TB-\d{3}/.test(d.querySelector('#fileHead').textContent)), 'enrolment saved; child file opens', d.querySelector('#enMsg').textContent);
  const newId = (d.querySelector('#fileHead').textContent.match(/TB-\d{3}/) || [])[0];
  ok(/เขียนรหัสนี้ไว้ข้างชื่อเด็ก/.test(d.querySelector('#fileHead').textContent), 'new study ID shown with "write it on your name list"');

  // baseline exam
  const startBtn = await until(() => byText(d, '#examStart button', /เริ่มบันทึกผลตรวจ/));
  ok(!!startBtn, 'start-exam button for a new child');
  click(w, startBtn);
  ok(await until(() => !d.querySelector('#examBody').hidden && d.querySelectorAll('#archU .tooth').length === 12 && d.querySelectorAll('#archL .tooth').length === 12), 'tooth chart: 12 positions per jaw');
  ok(!d.querySelector('#saveBar').hidden, 'save bar appears for unsaved exam');
  d.querySelector('#saveExamBtn').click();
  ok(await until(() => /ตอบแล้ว \d\/8/.test(d.querySelector('#toast').textContent)), 'save blocked until 8 risk answers', d.querySelector('#toast').textContent);
  for (const tr of d.querySelectorAll('#riskBody tr:not(.sec)')) { const b = [...tr.querySelectorAll('button')]; click(w, /ฟลูออไรด์/.test(tr.textContent) ? b[0] : (/คราบจุลินทรีย์/.test(tr.textContent) ? b[0] : b[1])); }
  ok(/คะแนน/.test(d.querySelector('#riskChip').textContent), 'risk chip shows score after 8 answers', d.querySelector('#riskChip').textContent);
  // tooth 36: ICDAS 3 on the occlusal surface
  click(w, [...d.querySelectorAll('#archL .tooth .tcode')][11]);
  const occBtns = await until(() => { const groups = d.querySelectorAll('#editor .codes'); return groups.length >= 3 ? groups[2].querySelectorAll('button') : null; });
  click(w, occBtns[3]);
  ok(/ผุ/.test(d.querySelector('#archL').textContent), '"ผุ" badge after ICDAS 3 on 36');
  d.querySelector('#saveExamBtn').click();
  ok(await until(() => d.querySelector('#saveBar').hidden && !d.querySelector('#fp-plan').hidden), 'exam saved; plan opens', d.querySelector('#toast').textContent);
  ok(d.querySelectorAll('#planGrid tbody tr').length >= 6, 'plan grid has rows', d.querySelectorAll('#planGrid tbody tr').length);

  // tick the sealant row for 16 ("no set month" column), then untick
  const sealRow = [...d.querySelectorAll('#planGrid tbody tr')].find(tr => /เคลือบหลุมร่องฟัน ซี่ 16/.test(tr.textContent));
  const cell = sealRow && sealRow.querySelector('.anycol button');
  ok(!!cell, 'sealant 16 row has a tick cell');
  click(w, cell);
  ok(await until(() => /บันทึกแล้ว/.test(d.querySelector('#toast').textContent)), 'tick saves a service', d.querySelector('#toast').textContent);
  const after = [...d.querySelectorAll('#planGrid tbody tr')].find(tr => /เคลือบหลุมร่องฟัน ซี่ 16/.test(tr.textContent)).querySelector('.anycol button');
  ok(after.getAttribute('aria-pressed') === 'true', 'cell shows done');
  click(w, d.querySelector('#ft-tx'));
  ok(/TEST-B2/.test(d.querySelector('#kidTxBody').textContent) && /เคลือบหลุมร่องฟัน/.test(d.querySelector('#kidTxBody').textContent), 'services tab lists it with the provider code');
  click(w, d.querySelector('#ft-plan'));
  click(w, [...d.querySelectorAll('#planGrid tbody tr')].find(tr => /เคลือบหลุมร่องฟัน ซี่ 16/.test(tr.textContent)).querySelector('.anycol button'));
  ok(await until(() => /ยกเลิกแล้ว/.test(d.querySelector('#toast').textContent)), 'untick deletes it');
  // claims page: out-of-plan fluoride and a group brushing session
  click(w, d.querySelector('#t-claims'));
  ok(await until(() => !d.querySelector('#claims').hidden && d.querySelectorAll('#clStats .tile').length >= 3), 'claims page opens (capitation: "บันทึกบริการ")', d.querySelector('#t-claims').textContent);
  set(w, d.querySelector('#cKid'), newId);
  set(w, d.querySelector('#cCode'), '170');
  ok(/นอกแผน|ตรงกับแผน/.test(d.querySelector('#cPreview').textContent), 'preview says in or out of plan');
  d.querySelector('#fOne').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  ok(await until(() => /บันทึกแล้ว/.test(d.querySelector('#toast').textContent)), 'individual service saved', d.querySelector('#toast').textContent);
  set(w, d.querySelector('#gCode'), '176');
  click(w, d.querySelector('#gAll'));
  ok(/เลือกแล้ว [1-9]/.test(d.querySelector('#gCount').textContent), '"ทำให้ทุกคน" selects the rooms', d.querySelector('#gCount').textContent);
  d.querySelector('#fGroup').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  ok(await until(() => /บันทึกกิจกรรมแล้ว/.test(d.querySelector('#toast').textContent)), 'group activity saved', d.querySelector('#toast').textContent);
  ok(/กิจกรรมกลุ่ม/.test(d.querySelector('#ledgerBody').textContent), 'ledger shows the group row');
  ok(errors.length === 0, 'no script errors (unit)', errors.join(' | '));

  console.log('unit public-ffs: submit');
  const F = boot();
  await login(F.w, F.d, 'public-ffs');
  await until(() => F.d.querySelector('#home .tiles'));
  click(F.w, F.d.querySelector('#t-claims'));
  await until(() => !F.d.querySelector('#claims').hidden);
  set(F.w, F.d.querySelector('#gCode'), '177');
  click(F.w, F.d.querySelector('#gAll'));
  F.d.querySelector('#fGroup').dispatchEvent(new F.w.Event('submit', { bubbles: true, cancelable: true }));
  ok(await until(() => /บันทึกกิจกรรมแล้ว/.test(F.d.querySelector('#toast').textContent)), 'school session saved as draft', F.d.querySelector('#toast').textContent);
  const sendBtn = await until(() => [...F.d.querySelectorAll('#ledgerActions button')].find(b => /ส่งเบิก/.test(b.textContent) && !b.disabled));
  ok(!!sendBtn, 'submit button enabled with drafts');
  click(F.w, sendBtn);
  ok(await until(() => /ส่งเบิกแล้ว/.test(F.d.querySelector('#toast').textContent)), 'drafts submitted', F.d.querySelector('#toast').textContent);
  ok(F.errors.length === 0, 'no script errors (ffs)', F.errors.join(' | '));

  console.log('research');
  const R = boot();
  await login(R.w, R.d, 'research');
  ok(await until(() => R.d.querySelectorAll('#research section:first-child tbody tr').length === 6), 'research overview lists 6 units', R.d.querySelectorAll('#research section:first-child tbody tr').length);
  const apprAll = await until(() => [...R.d.querySelectorAll('#research button')].find(b => /อนุมัติทั้งหมดที่รอตรวจ \([1-9]/.test(b.textContent)));
  ok(!!apprAll, 'research sees submitted claims to review');
  if (apprAll) { click(R.w, apprAll); ok(await until(() => /อนุมัติแล้ว/.test(R.d.querySelector('#toast').textContent)), 'research approves them'); }
  ok(R.errors.length === 0, 'no script errors (research)', R.errors.join(' | '));

  console.log(`\n${pass} passed, ${fail} failed · enrolled ${newId}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(2); });
