// Scripted UI smoke test of v1.0 (jsdom) against the TEST project with the test accounts.
// Run: NODE_PATH=<dir with jsdom and @supabase/supabase-js> node scripts/test-ui.cjs
// Walks: login → home → cards → enrol (and "save and next") → baseline exam → save → plan tick → untick → claims
// → research view. Since UX review R1 it also checks the "ผู้บันทึก" guard, PI/GI (fill or skip), the auto-recorded
// exam service 174, consent filtering of group activities, monthly submission and deleting a returned claim.
// Since R2: the issued-ID banner, no preselected child on the claims form, focus kept on PI/GI boxes, the exam
// service following a corrected exam date, and late plan months closed from the grid and from the claims page.
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
  Object.assign(w, { fetch, Headers, Request, Response, confirm: () => true, prompt: () => 'ทดสอบส่งกลับ (test-ui)', scrollTo: () => {}, print: () => {} });
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
const noNull = d => !/\bnull\b|\bundefined\b/.test(d.body.textContent);   // R1-01
const toastText = d => d.querySelector('#toast').textContent;
// Answer the 8 risk items (fluoride toothpaste and plaque "yes", the rest "no").
function answerRisk(w, d) { for (const tr of d.querySelectorAll('#riskBody tr:not(.sec)')) { const b = [...tr.querySelectorAll('button')]; click(w, /ฟลูออไรด์/.test(tr.textContent) ? b[0] : (/คราบจุลินทรีย์/.test(tr.textContent) ? b[0] : b[1])); } }
// Fill all 12 PI/GI boxes; the table re-renders after each change, so look the box up again each time.
function fillPigi(w, d, v = '1') { for (let i = 0; i < 12; i++) set(w, d.querySelectorAll('#pigiBody select')[i], v); }
// Very high risk (score 7): white spot, plaque and sugar "yes", fluoride toothpaste "no", the rest "no".
function answerRiskHigh(w, d) { for (const tr of d.querySelectorAll('#riskBody tr:not(.sec)')) { const b = [...tr.querySelectorAll('button')]; click(w, /ขาวขุ่น|คราบจุลินทรีย์|น้ำตาล/.test(tr.textContent) ? b[0] : b[1]); } }
const iso = dt => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
const daysAgo = n => { const t = new Date(); return iso(new Date(t.getFullYear(), t.getMonth(), t.getDate() - n)); };
const planRow = (d, re) => [...d.querySelectorAll('#planGrid tbody tr')].find(tr => re.test(tr.textContent));

(async () => {
  console.log('unit public-cap');
  const { w, d, errors } = boot();
  ok(!d.querySelector('#login').hidden, 'login screen shows first');
  await login(w, d, 'public-cap');
  ok(await until(() => d.querySelector('#home .tiles')), 'home dashboard renders after login');
  ok(/หน่วยทดสอบ ข/.test(d.querySelector('#acctChip').textContent), 'account chip shows the unit');
  ok(noNull(d), 'no "null" text on the home screen (R1-01)');
  ok(d.querySelector('#verTag').textContent === 'v1.0 · หน่วยทดสอบ', 'version tag says test unit (R1-16)', d.querySelector('#verTag').textContent);
  ok(d.querySelector('#provSel').value === '' && d.querySelector('#provSel').classList.contains('is-missing'), '"ผู้บันทึก" starts empty and marked (R1-02)');
  ok(d.querySelectorAll('#home .tile--link').length >= 3, 'home tiles open the student list (R1-19)');
  set(w, d.querySelector('#provSel'), 'TEST-B2');
  ok(!d.querySelector('#provSel').classList.contains('is-missing'), 'mark goes once a code is chosen');
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
  ok(noNull(d), 'no "null" text on the child file (R1-01)');

  // "save and next" (R1-08): child B without consent, then child C with consent; the class stays, consent does not
  click(w, byText(d, '#file button', /นักเรียนทั้งหมด/));
  click(w, byText(d, '#kids button', /ลงทะเบียนนักเรียน/));
  ok(d.querySelector('#enClass').value === 'ป.1/3', 'enrol form remembers the last class (R1-08)', d.querySelector('#enClass').value);
  set(w, d.querySelector('#enSex'), 'M');
  click(w, d.querySelector('#enSaveNext'));
  ok(await until(() => /ลงทะเบียนแล้ว TB-\d{3}/.test(d.querySelector('#enDone').textContent)), '"บันทึกแล้วลงทะเบียนคนถัดไป" saves; the ID banner sits above the form (R2-03)', d.querySelector('#enMsg').textContent);
  const idB = (d.querySelector('#enDone').textContent.match(/TB-\d{3}/) || [])[0];
  ok(d.activeElement === d.querySelector('#enSex'), 'focus goes to sex for the next child');
  ok(!d.querySelector('#enrol').hidden && d.querySelector('#enClass').value === 'ป.1/3' && d.querySelector('#enSex').value === '', 'class kept, sex cleared for the next child');
  set(w, d.querySelector('#enSex'), 'F');
  d.querySelector('#enConsent').value = '2569-10-30';
  click(w, d.querySelector('#enSaveNext'));
  ok(await until(() => /ค\.ศ\./.test(d.querySelector('#enMsg').textContent)), 'a Buddhist-era year is refused with a hint (R1-18)', d.querySelector('#enMsg').textContent);
  d.querySelector('#enConsent').value = '2026-06-01';
  d.querySelector('#enAssent').checked = true;
  click(w, d.querySelector('#enSaveNext'));
  ok(await until(() => /รหัสที่ออกรอบนี้ \(2 คน\)/.test(d.querySelector('#enDone').textContent)), 'IDs issued in this sitting are listed', d.querySelector('#enMsg').textContent);
  const idC = (d.querySelector('#enDone').textContent.match(/ลงทะเบียนแล้ว (TB-\d{3})/) || [])[1];
  ok(d.querySelector('#enConsent').value === '' && !d.querySelector('#enAssent').checked, 'consent and assent are not carried to the next child');

  // baseline exam of the first child
  click(w, byText(d, '#enrol button', /นักเรียนทั้งหมด/));
  set(w, d.querySelector('#kfQ'), newId.toLowerCase(), 'input');
  ok(d.querySelectorAll('#kidGroups .kcard').length === 1, 'ID search ignores case (R1-19)', d.querySelectorAll('#kidGroups .kcard').length);
  click(w, d.querySelector('#kidGroups .kcard'));
  set(w, d.querySelector('#kfQ'), '', 'input');
  const startBtn = await until(() => byText(d, '#examStart button', /เริ่มบันทึกผลตรวจ/));
  ok(!!startBtn, 'start-exam button for a new child');
  click(w, startBtn);
  ok(await until(() => !d.querySelector('#examBody').hidden && d.querySelectorAll('#archU .tooth').length === 12 && d.querySelectorAll('#archL .tooth').length === 12), 'tooth chart: 12 positions per jaw');
  ok(!d.querySelector('#saveBar').hidden, 'save bar appears for unsaved exam');
  ok(d.querySelector('#vExam').value === 'TEST-B2', 'examiner = the chosen "ผู้บันทึก", not the first code (R1-02)', d.querySelector('#vExam').value);
  ok(/แบบประเมิน 0\/8 ข้อ · PI\/GI 0\/12/.test(d.querySelector('#saveMsg').textContent), 'save bar says what is left (R1-04)', d.querySelector('#saveMsg').textContent);
  ok([...d.querySelectorAll('#pigiBody select')].every(s => s.value === ''), 'PI/GI boxes start empty (R1-14)');
  d.querySelector('#saveExamBtn').click();
  ok(await until(() => /ตอบแล้ว \d\/8/.test(toastText(d))), 'save blocked until 8 risk answers', toastText(d));
  ok(d.querySelectorAll('#riskBody tr.is-missing').length === 8 && d.querySelectorAll('#pigiBody select.is-missing').length === 12, 'unanswered items are marked (R1-04)');
  answerRisk(w, d);
  ok(/คะแนน/.test(d.querySelector('#riskChip').textContent), 'risk chip shows score after 8 answers', d.querySelector('#riskChip').textContent);
  ok(d.querySelectorAll('#riskBody tr.is-missing').length === 0, 'marks go once answered');
  // tooth 36: ICDAS 3 on the occlusal surface
  click(w, [...d.querySelectorAll('#archL .tooth .tcode')][11]);
  const occBtns = await until(() => { const groups = d.querySelectorAll('#editor .codes'); return groups.length >= 3 ? groups[2].querySelectorAll('button') : null; });
  click(w, occBtns[3]);
  ok(/ผุ/.test(d.querySelector('#archL').textContent), '"ผุ" badge after ICDAS 3 on 36');
  click(w, d.querySelector('#toothNext'));
  ok(/ตำแหน่ง 16/.test(d.querySelector('#editor h4').textContent), '"ซี่ถัดไป" steps from 36 to 16 (R1-06)', d.querySelector('#editor h4').textContent);
  d.querySelector('#saveExamBtn').click();
  ok(await until(() => /PI\/GI กรอกแล้ว 0\/12/.test(toastText(d))), 'save blocked until PI/GI is filled or skipped (R1-14)', toastText(d));
  set(w, d.querySelectorAll('#pigiBody select')[0], '1');
  ok(d.activeElement && d.activeElement.getAttribute('aria-label') === 'PI 16B', 'focus stays on the PI/GI box after it re-renders (R2-06)', d.activeElement && d.activeElement.tagName);
  fillPigi(w, d);
  ok(/1\.00 · 1\.00/.test(d.querySelector('#summary').textContent), 'PI/GI means over filled boxes', d.querySelector('#summary').textContent);
  d.querySelector('#saveExamBtn').click();
  ok(await until(() => d.querySelector('#saveBar').hidden && !d.querySelector('#fp-plan').hidden), 'exam saved; plan opens', toastText(d));
  ok(await until(() => /บันทึกบริการตรวจช่องปาก \(174\) เดือนที่ 1/.test(toastText(d))), 'first exam records service 174 (R1-03)', toastText(d));
  ok(d.querySelectorAll('#planGrid tbody tr').length >= 6, 'plan grid has rows', d.querySelectorAll('#planGrid tbody tr').length);
  const examRow = [...d.querySelectorAll('#planGrid tbody tr')].find(tr => /ตรวจช่องปากและประเมินความเสี่ยง/.test(tr.textContent));
  ok(examRow && examRow.querySelectorAll('td')[0].querySelector('button[aria-pressed="true"]'), 'plan: exam cell in month 1 is done');
  // the exam date is corrected after the first save: the exam service moves with it (R2-08)
  click(w, d.querySelector('#ft-exam'));
  set(w, d.querySelector('#vDate'), daysAgo(1));
  d.querySelector('#saveExamBtn').click();
  ok(await until(() => /ย้ายวันที่บริการตรวจ \(174\)/.test(toastText(d))), 'corrected exam date moves the 174 service (R2-08)', toastText(d));
  click(w, d.querySelector('#ft-tx'));
  const yd = new Date(); yd.setDate(yd.getDate() - 1);
  ok([...d.querySelectorAll('#kidTxBody tr')].some(tr => /ตรวจ/.test(tr.textContent) && tr.textContent.startsWith(`${yd.getDate()} `)), 'services tab shows the exam service on the new date');
  click(w, d.querySelector('#ft-plan'));

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
  ok(/ตรวจ/.test(d.querySelector('#kidTxBody').textContent) && d.querySelectorAll('#kidTxBody tr').length >= 2, 'services tab lists the exam service too');
  click(w, d.querySelector('#ft-plan'));
  click(w, [...d.querySelectorAll('#planGrid tbody tr')].find(tr => /เคลือบหลุมร่องฟัน ซี่ 16/.test(tr.textContent)).querySelector('.anycol button'));
  ok(await until(() => /ยกเลิกแล้ว/.test(toastText(d))), 'untick deletes it (after a confirm, R1-05)');

  // child C: very high risk, examined 130 days ago (plan month 4), PI/GI skipped and saved as {} (R1-14)
  set(w, d.querySelector('#kidSel'), idC);
  click(w, d.querySelector('#ft-exam'));
  click(w, await until(() => byText(d, '#examStart button', /เริ่มบันทึกผลตรวจ/)));
  answerRiskHigh(w, d);
  set(w, d.querySelector('#vDate'), daysAgo(130));
  const skip = d.querySelector('#pigiSkip'); skip.checked = true; skip.dispatchEvent(new w.Event('change', { bubbles: true }));
  ok([...d.querySelectorAll('#pigiBody select')].every(s => s.disabled) && /ไม่ได้ตรวจ/.test(d.querySelector('#saveMsg').textContent), '"ไม่ได้ตรวจ PI/GI ครั้งนี้" disables the boxes');
  d.querySelector('#saveExamBtn').click();
  ok(await until(() => d.querySelector('#saveBar').hidden && !d.querySelector('#fp-plan').hidden), 'exam with PI/GI skipped is saved', toastText(d));
  click(w, d.querySelector('#ft-exam'));
  ok(d.querySelector('#pigiSkip').checked && /ไม่ได้ตรวจ/.test(d.querySelector('#summary').textContent), 'saved exam shows PI/GI as not done');
  // late month-3 recall exam: tick it on the grid (today's date, plan_month 3), untick, then close it from the claims page (R1-05)
  click(w, d.querySelector('#ft-plan'));
  const late = () => planRow(d, /ตรวจช่องปากและประเมินความเสี่ยง/).querySelectorAll('td')[2].querySelector('button');
  ok(late() && late().classList.contains('is-late'), 'month-3 recall shows as late', late() && late().className);
  click(w, late());
  ok(await until(() => /\(ของเดือนที่ 3\)/.test(toastText(d))), 'late tick is recorded today for month 3', toastText(d));
  ok(late().getAttribute('aria-pressed') === 'true', 'month-3 cell shows done');
  click(w, late());
  ok(await until(() => /ยกเลิกแล้ว/.test(toastText(d)) && late().getAttribute('aria-pressed') === 'false'), 'late tick undone');
  click(w, d.querySelector('#t-claims'));
  await until(() => !d.querySelector('#claims').hidden);
  set(w, d.querySelector('#cKid'), idC);
  set(w, d.querySelector('#cCode'), '174');
  ok(/ตามแผน \(เลยกำหนด\) เดือนที่ 3/.test(d.querySelector('#cPreview').textContent), 'claims preview: a service today closes the late month 3 (R1-05 follow-up)', d.querySelector('#cPreview').textContent);
  d.querySelector('#fOne').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  ok(await until(() => /เดือนที่ 3 ที่เลยกำหนด/.test(toastText(d))), 'claims entry saved against month 3', toastText(d));
  set(w, d.querySelector('#kidSel'), idC);
  click(w, d.querySelector('#ft-plan'));
  ok(late() && late().getAttribute('aria-pressed') === 'true', 'plan: month-3 cell is done from the claims entry');
  // child C's assent is withdrawn after the exam: no more per-child services (R1-20)
  click(w, byText(d, '#fileHead button', /แก้ไขข้อมูลลงทะเบียน/));
  ok(!d.querySelector('#enrol').hidden && d.querySelector('#enSaveNext').hidden, 'edit mode hides "บันทึกแล้วลงทะเบียนคนถัดไป"');
  d.querySelector('#enAssent').checked = false;
  d.querySelector('#enForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  ok(await until(() => !d.querySelector('#file').hidden && /บันทึกการแก้ไขแล้ว/.test(toastText(d))), 'enrolment edit saved', toastText(d));
  click(w, d.querySelector('#ft-plan'));
  click(w, [...d.querySelectorAll('#planGrid tbody tr')].find(tr => /เคลือบหลุมร่องฟัน ซี่ 16/.test(tr.textContent)).querySelector('.anycol button'));
  ok(await until(() => /ยังไม่มีความยินยอมครบ/.test(toastText(d))), 'plan tick refused for a child without consent', toastText(d));
  // claims page: out-of-plan fluoride and a group brushing session
  click(w, d.querySelector('#t-claims'));
  ok(await until(() => !d.querySelector('#claims').hidden && d.querySelectorAll('#clStats .tile').length >= 3), 'claims page opens (capitation: "บันทึกบริการ")', d.querySelector('#t-claims').textContent);
  ok(d.querySelector('#cCode').value === '' && d.querySelector('#cSave').disabled, 'no service is preselected (R1-20)');
  ok(d.querySelector('#cKid').value === '' && /เลือกนักเรียน/.test(d.querySelector('#cPreview').textContent), 'no child is preselected (R2-04)', d.querySelector('#cKid').value);
  ok(![...d.querySelectorAll('#cKid option')].some(o => o.value === idB || o.value === idC) && [...d.querySelectorAll('#cKid option')].some(o => o.value === newId), 'examined child without consent is not in the individual-service list (R1-20)');
  set(w, d.querySelector('#cKid'), newId);
  set(w, d.querySelector('#cCode'), '170');
  ok(/นอกแผน|ตรงกับแผน/.test(d.querySelector('#cPreview').textContent), 'preview says in or out of plan');
  d.querySelector('#fOne').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  ok(await until(() => /บันทึกแล้ว/.test(d.querySelector('#toast').textContent)), 'individual service saved', d.querySelector('#toast').textContent);
  set(w, d.querySelector('#gCode'), '177');
  ok(/\bTB-/.test(d.querySelector('#gList').textContent) && d.querySelector('#gList').textContent.includes(idB), 'per-session 177 lists every child in the rooms');
  set(w, d.querySelector('#gCode'), '176');
  ok(!d.querySelector('#gList').textContent.includes(idB) && !d.querySelector('#gList').textContent.includes(idC) && /ไม่แสดง \d+ คน/.test(d.querySelector('#gList').textContent), 'per-person 176 leaves out children without consent (R1-20)');
  click(w, d.querySelector('#gAll'));
  ok(/เลือกแล้ว [1-9]/.test(d.querySelector('#gCount').textContent), '"ทำให้ทุกคน" selects the rooms', d.querySelector('#gCount').textContent);
  ok(d.querySelector('#gTopic').value === '' && /เช่น/.test(d.querySelector('#gTopic').placeholder), 'topic is a placeholder, not a value (R1-20)');
  d.querySelector('#gMin').value = '999';
  d.querySelector('#fGroup').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  ok(await until(() => /5–240 นาที/.test(toastText(d))), 'minutes outside 5–240 are refused (R1-20)', toastText(d));
  d.querySelector('#gMin').value = '30';
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
  ok(await until(() => /เลือก "ผู้บันทึก"/.test(F.d.querySelector('#toast').textContent)), 'nothing is saved before "ผู้บันทึก" is chosen (R1-02)', F.d.querySelector('#toast').textContent);
  set(F.w, F.d.querySelector('#provSel'), F.d.querySelector('#provSel').options[1].value);
  F.d.querySelector('#fGroup').dispatchEvent(new F.w.Event('submit', { bubbles: true, cancelable: true }));
  ok(await until(() => /บันทึกกิจกรรมแล้ว/.test(F.d.querySelector('#toast').textContent)), 'school session saved as draft', F.d.querySelector('#toast').textContent);
  // a second session, so research can return one claim and still approve another
  F.d.querySelector('#toast').textContent = '';
  click(F.w, F.d.querySelector('#gAll'));
  F.d.querySelector('#fGroup').dispatchEvent(new F.w.Event('submit', { bubbles: true, cancelable: true }));
  ok(await until(() => /บันทึกกิจกรรมแล้ว/.test(F.d.querySelector('#toast').textContent)), 'second school session saved', F.d.querySelector('#toast').textContent);
  set(F.w, F.d.querySelector('#lMonth'), F.d.querySelector('#lMonth').options[1].value);
  const sendBtn = await until(() => [...F.d.querySelectorAll('#ledgerActions button')].find(b => /ส่งเบิกเดือน .+ \([1-9]\d*\)/.test(b.textContent) && !b.disabled));
  ok(!!sendBtn, 'with a month chosen, the button sends that month only (R1-15)', F.d.querySelector('#ledgerActions').textContent);
  click(F.w, sendBtn);
  ok(await until(() => /ส่งเบิกแล้ว/.test(F.d.querySelector('#toast').textContent)), 'drafts submitted', F.d.querySelector('#toast').textContent);
  ok(F.errors.length === 0, 'no script errors (ffs)', F.errors.join(' | '));

  console.log('research');
  const R = boot();
  await login(R.w, R.d, 'research');
  // 6 TEST units; real units were added on 31 Oct (11:45), so count the TEST ones and accept more in total
  const unitRows = () => [...R.d.querySelectorAll('#research section:first-child tbody tr')];
  ok(await until(() => unitRows().filter(tr => /· ทดสอบ/.test(tr.textContent)).length === 6), 'research overview lists the 6 TEST units (and any real units)', unitRows().length);
  ok(noNull(R.d), 'no "null" text on the research screen (R1-01)');
  const cRow = await until(() => [...R.d.querySelectorAll('#research tbody tr')].find(tr => tr.querySelectorAll('td')[1] && tr.querySelectorAll('td')[1].textContent === 'C' && byText(R.d, '#research tbody tr button', /ส่งกลับ/)));
  const backBtn = cRow && [...cRow.querySelectorAll('button')].find(b => /ส่งกลับ/.test(b.textContent));
  ok(!!backBtn, 'research sees a submitted claim of unit C');
  if (backBtn) { click(R.w, backBtn); ok(await until(() => /ส่งกลับแล้ว/.test(R.d.querySelector('#toast').textContent)), 'research returns one claim'); }
  const apprAll = await until(() => [...R.d.querySelectorAll('#research button')].find(b => /อนุมัติทั้งหมดที่รอตรวจ \([1-9]/.test(b.textContent)));
  ok(!!apprAll, 'research sees submitted claims to review');
  if (apprAll) { click(R.w, apprAll); ok(await until(() => /อนุมัติแล้ว/.test(R.d.querySelector('#toast').textContent)), 'research approves them'); }
  ok(R.errors.length === 0, 'no script errors (research)', R.errors.join(' | '));

  console.log('unit public-ffs: delete a returned claim');
  const G = boot();
  await login(G.w, G.d, 'public-ffs');
  await until(() => G.d.querySelector('#home .tiles'));
  click(G.w, G.d.querySelector('#t-claims'));
  await until(() => !G.d.querySelector('#claims').hidden);
  set(G.w, G.d.querySelector('#lStatus'), 'returned');
  const delBtn = await until(() => byText(G.d, '#ledgerBody button', /^ลบ$/));
  ok(!!delBtn, 'a returned claim has "ลบ" (R1-15)');
  if (delBtn) { click(G.w, delBtn); ok(await until(() => /ลบแล้ว/.test(G.d.querySelector('#toast').textContent)), 'returned claim deleted', G.d.querySelector('#toast').textContent); }
  ok(G.errors.length === 0, 'no script errors (ffs delete)', G.errors.join(' | '));

  console.log(`\n${pass} passed, ${fail} failed · enrolled ${newId}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(2); });
