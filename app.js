/* Dent-II record form v1.0 on Supabase. Screens and clinical logic come from prototype v0.7
   (record-form-prototype.html, D-37…D-42); data now live in the database with row-level security.
   v1.0 scope (WS2-5): per-unit logins, enrolment, baseline screening on the final form, month-grid
   care plan (ticks write services), claims page with group activities and monthly submission (D-65), CSV export.
   No personal data (D-64): children are known by study ID only. Payable amounts by fee schedule → v1.2. */
(() => {
'use strict';
const CFG = window.DENT2_CONFIG || {};
const sb = window.supabase.createClient(CFG.url, CFG.anonKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'dent2-auth' } });

/* ================================================================ helpers */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = n => Math.round(n).toLocaleString('th-TH');
const fmt2 = n => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids) if (c != null && c !== false) e.append(c);
  return e;
};
// Elements added in v1.0.1 and later may be missing from a cached old index.html: set them softly (R2-01).
const setIf = (sel, key, v) => { const e = $(sel); if (e) e[key] = v; };
// replaceChildren() prints null and false as text ("null"); this skips them, like el() does (R1-01).
const fill = (node, ...kids) => node.replaceChildren(...kids.filter(c => c != null && c !== false));
const TH_M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const thDate = d => `${d.getDate()} ${TH_M[d.getMonth()]} ${d.getFullYear() + 543}`;
const thShort = d => `${d.getDate()} ${TH_M[d.getMonth()]} ${String(d.getFullYear() + 543).slice(2)}`;
const thMon = d => `${TH_M[d.getMonth()]} ${String(d.getFullYear() + 543).slice(2)}`;
// Same day m months later, clamped to the month's last day (31 Oct + 1 = 30 Nov, not 1 Dec) (R1-12).
const addMonths = (d, m) => { const x = new Date(d.getFullYear(), d.getMonth() + m, 1); x.setDate(Math.min(d.getDate(), new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate())); return x; };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const monKey = d => `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;   // sortable month key (0-based month)
const monKeyLabel = key => { const [y, m] = key.split('-').map(Number); return thMon(new Date(y, m, 1)); };
const toInput = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromInput = s => { const [y, m, dd] = String(s || '').split('-').map(Number); return y && m && dd ? new Date(y, m - 1, dd) : null; };
const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
let TODAY = startOfDay(new Date());
const monthOf = (base, d) => Math.min(12, Math.max(1, Math.round((d - base) / 864e5 / 30.44)));
// Days that monthOf() puts into plan month m (month 1 starts on the exam day, month 12 has no end).
const monthRange = (base, m) => ({ from: addDays(base, m === 1 ? 0 : Math.ceil((m - .5) * 30.44)), to: m === 12 ? null : addDays(base, Math.ceil((m + .5) * 30.44) - 1) });
// Plan month a service fills: the plan_month it was ticked for, else the month of its date (R1-05).
const txMonth = (k, t) => (t.planMonth != null ? t.planMonth : monthOf(k.base, t.date));
// Date inputs take Christian-era years; the app shows Buddhist-era dates (R1-18).
function dateProblem(s, label) {
  if (!s) return '';
  const y = +String(s).slice(0, 4);
  if (y > 2400) return `${label}: ช่องวันที่ใช้ปี ค.ศ. (พ.ศ. ลบ 543) เช่น 2026`;
  const d = fromInput(s);
  if (!d) return `${label}: วันที่ไม่ถูกต้อง`;
  if (d > TODAY) return `${label}อยู่ในอนาคต`;
  return '';
}
// "= 31 ต.ค. 2569" under each date box, and a warning for a Buddhist-era year (R1-18).
function beHint(inp) {
  let h = inp.nextElementSibling;
  if (!h || !h.classList.contains('be-hint')) { h = el('span', { class: 'be-hint tiny muted' }); inp.after(h); }
  const v = inp.value.trim();
  let t = '', warn = false;
  if (v) {
    const ym = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(v), d = fromInput(v);
    if (+v.slice(0, 4) > 2400) { t = 'ช่องนี้ใช้ปี ค.ศ. (พ.ศ. ลบ 543) เช่น 2026'; warn = true; }
    else if (inp.getAttribute('type') === 'month') { if (ym) t = `= ${TH_M[+ym[2] - 1]} ${+ym[1] + 543}`; else { t = 'ใส่ปี ค.ศ.-เดือน เช่น 2019-05'; warn = true; } }
    else if (d) t = `= ${thDate(d)}`;
  }
  h.textContent = t;
  h.classList.toggle('be-warn', warn);
}
const beAll = (root = document) => $$('input[type="date"], input[type="month"]', root).forEach(beHint);
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* per-device convenience only */ } };

/* ================================================================ reference tables (v0.7) */
let PRICE = {};   // filled from price_list
const CODE_A = { 0: 'ไม่มีวัสดุอุดหรือเคลือบ', 1: 'เคลือบหลุมร่องฟันบางส่วน', 2: 'เคลือบหลุมร่องฟันเต็มซี่', 3: 'อุดสีเหมือนฟัน', 4: 'อุดอมัลกัม', 5: 'ครอบฟันสเตนเลส (SSC)', 6: 'ครอบฟัน / วีเนียร์', 7: 'วัสดุแตกหรือหลุด', 8: 'อุดชั่วคราว', 9: 'อื่น ๆ' };
const CODE_N = { 99: 'ฟันยังไม่ขึ้น', 97: 'ฟันหายเพราะฟันผุ', 98: 'ฟันหายสาเหตุอื่น', 96: 'ประเมินไม่ได้' };
const CODE_B = { 0: 'ผิวฟันปกติ', 1: 'เปลี่ยนแปลงแรก เห็นเมื่อเป่าแห้ง', 2: 'เปลี่ยนแปลงชัดขณะเปียก', 3: 'ผิวเคลือบฟันแตกเฉพาะที่', 4: 'เงาเข้มของเนื้อฟันใต้ผิวเคลือบ', 5: 'รูผุเห็นเนื้อฟัน น้อยกว่าครึ่งด้าน', 6: 'รูผุใหญ่ มากกว่าครึ่งด้าน' };
const NEED = { 0: 'ไม่ต้องรักษา', 1: 'ฟลูออไรด์โดยทันตบุคลากร', 2: 'เคลือบหลุมร่องฟัน', 3: 'SDF 38%', 4: 'บูรณะฟัน', 5: 'รักษาโพรงประสาทฟัน', 6: 'ครอบฟัน', 7: 'ถอนฟัน', 8: 'ส่งต่อ' };
const RISK = [
  { sec: 'สภาวะสุขภาพ' },
  { id: 'r1', q: 'มีภาวะที่ทำให้การทำความสะอาดช่องปากมีประสิทธิภาพลดลง หรือน้ำลายน้อย', y: 1, n: 0 },
  { sec: 'การตรวจช่องปากและภาพรังสี' },
  { id: 'r2', q: 'พบรอยโรคฟันผุขาวขุ่นระยะลุกลาม (active white spot) หรือฟันผุเป็นรู หรือพบจากภาพรังสี', y: 3, n: 0 },
  { id: 'r3', q: 'พบคราบจุลินทรีย์ที่เห็นชัดเจน', y: 1, n: 0 },
  { id: 'r4', q: 'พบความผิดปกติของโครงสร้างฟัน', y: 1, n: 0 },
  { sec: 'ปัจจัยอื่น ๆ' },
  { id: 'r5', q: 'กินอาหาร ขนม หรือเครื่องดื่มที่มีน้ำตาลนอกมื้ออาหาร มากกว่า 2 ครั้งต่อวัน', y: 2, n: 0 },
  { id: 'r6', q: 'ใส่เครื่องมือในช่องปาก', y: 2, n: 0 },
  { id: 'r7', q: 'แปรงฟันด้วยยาสีฟันผสมฟลูออไรด์ 1,000 ppm ขึ้นไป อย่างน้อยวันละ 2 ครั้ง', y: 0, n: 1 },
  { id: 'r8', q: 'พี่หรือน้องมีฟันผุ (ซักประวัติ · ไม่มีพี่น้องให้ตอบ "ไม่ใช่")', y: 1, n: 0 },
];
const RISK_IDS = RISK.filter(q => q.id).map(q => q.id);
const LEVEL = {
  low: { th: 'เสี่ยงต่ำ', recall: 6, chip: 'chip--ok' },
  high: { th: 'เสี่ยงสูง', recall: 6, chip: 'chip--warn' },
  vhigh: { th: 'เสี่ยงสูงมาก', recall: 3, chip: 'chip--crit' },
};
const ARM = {
  control: { name: 'กลุ่มควบคุม (จ่ายตามรายการบริการ)', key: 'key--ctrl' },
  cap: { name: 'เหมาจ่ายรายหัว (capitation)', key: 'key--cat4' },
  ffs: { name: 'งบรวมแบ่งปันส่วนประหยัด (shared savings)', key: 'key--cat3a' },
};
const STATUS = {
  draft: { th: 'ร่าง ยังไม่ส่ง', c: 'var(--m-draft)' },
  submitted: { th: 'รอตรวจ', c: 'var(--m-sub)' },
  returned: { th: 'ส่งกลับแก้ไข', c: 'var(--warn)' },
  approved: { th: 'อนุมัติ รอโอน', c: 'var(--m-appr)' },
  paid: { th: 'โอนแล้ว', c: 'var(--m-paid)' },
  recorded: { th: 'บันทึกแล้ว', c: 'var(--text-muted)' },
};
const PLACE = { van: 'รถทันตกรรมที่โรงเรียน', school: 'ที่โรงเรียน', clinic: 'ที่หน่วยบริการ' };

/* ================================================================ teeth (final form: 12 positions per jaw) */
const UPPER = [16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26];
const LOWER = [46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36];
const POS = [...UPPER, ...LOWER];
const PRIM = { 15: 55, 14: 54, 13: 53, 12: 52, 11: 51, 21: 61, 22: 62, 23: 63, 24: 64, 25: 65, 45: 85, 44: 84, 43: 83, 42: 82, 41: 81, 31: 71, 32: 72, 33: 73, 34: 74, 35: 75 };
const FPM = [16, 26, 36, 46];
const PERM_EARLY = [16, 26, 36, 46, 11, 21, 31, 32, 41, 42];
const PIGI_TEETH = ['16B', '11La', '26B', '46Li', '31La', '36Li'];
const toothNo = (pos, t) => (t.t === 'd' ? PRIM[pos] : pos);
const isPrimNo = no => no >= 51 && no <= 85;

function typicalMouth() {
  const m = {};
  for (const pos of POS) m[pos] = PERM_EARLY.includes(pos) ? { t: 'p', A: 0, B: 0, act: null } : { t: 'd', A: 0, B: 0, act: null };
  return m;
}
// PI/GI start empty: a skipped section must not look like a real score of 0 (R1-14).
const emptyPigi = () => Object.fromEntries(PIGI_TEETH.map(t => [t, { pi: null, gi: null }]));
const pigiFilled = k => PIGI_TEETH.reduce((n, t) => n + (k.pigi[t].pi != null) + (k.pigi[t].gi != null), 0);   // of 12
const pigiMean = (k, idx) => { const v = PIGI_TEETH.map(t => k.pigi[t][idx]).filter(x => x != null); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(2) : '–'; };

/* ================================================================ clinical logic (v0.7; dental team validates, WS2-3) */
function riskScore(k) { let s = 0; for (const q of RISK) if (q.id) s += k.risk[q.id] === 'y' ? q.y : q.n; return s; }
const riskLevel = s => (s <= 2 ? 'low' : s <= 5 ? 'high' : 'vhigh');
const lvlOf = k => riskLevel(riskScore(k));
const riskAnswered = k => RISK_IDS.filter(id => k.risk[id] === 'y' || k.risk[id] === 'n').length;
function suggestNeed(pos, t, lvl) {
  if (t.t === 'n') return null;
  const fpm = t.t === 'p' && FPM.includes(pos);
  if (t.A === 1 || t.A === 7) return fpm ? 2 : 4;
  if (t.B >= 6) return t.t === 'd' ? 5 : 8;
  if (t.B >= 4) return 4;
  if (t.B === 3) return fpm ? 2 : (lvl === 'low' ? 0 : 1);
  if (fpm && t.A === 0) return 2;
  return lvl === 'low' ? 0 : 1;
}
function needOf(pos, k) { const ov = k.needOv[pos]; return ov != null ? ov : suggestNeed(pos, k.teeth[pos], lvlOf(k)); }
// Fluoride interval from the final form: ICDAS 0 -> high/very high every 6 months; ICDAS 1-3 -> high 3-6, very high 3.
function flFreq(k) {
  const lvl = lvlOf(k);
  const lesion = POS.some(p => k.teeth[p].t !== 'n' && k.teeth[p].B >= 1);
  if (lvl === 'low') return { f: lesion ? 6 : 0, why: lesion ? 'เสี่ยงต่ำ มีรอยโรคเริ่มต้นที่หยุดลุกลาม' : '' };
  if (lvl === 'high') return { f: lesion ? (k.flOv || 6) : 6, why: lesion ? 'เสี่ยงสูง + รอยโรคเริ่มต้น (แบบฟอร์ม: ทุก 3–6 เดือน)' : 'เสี่ยงสูง ฟันปกติ', sel: lesion };
  return { f: lesion ? 3 : 6, why: lesion ? 'เสี่ยงสูงมาก + รอยโรคเริ่มต้น' : 'เสี่ยงสูงมาก ฟันปกติ' };
}
const range = (step, max = 12) => { const a = []; for (let m = step; m <= max; m += step) a.push(m); return a; };
const examined = k => k.status === 'examined';
function buildPlan(k) {
  if (!examined(k)) return [];
  const lvl = lvlOf(k), rows = [];
  const urgent = Object.values(k.urgent).some(Boolean);
  rows.push({ key: 'exam', code: '174', codes: ['174', '173'], label: 'ตรวจช่องปากและประเมินความเสี่ยง', sub: lvl === 'vhigh' ? 'ครั้งแรก + ตรวจติดตามเดือนที่ 3 และ 9 (เสี่ยงสูงมาก)' : 'ครั้งแรก · ตรวจติดตามรวมกับรอบ 6 และ 12 เดือน', months: lvl === 'vhigh' ? [1, 3, 9] : [1] });
  rows.push({ key: 'study', code: 'STUDY', codes: [], label: 'ตรวจรอบโครงการ (เก็บข้อมูล)', sub: 'ค่าตอบแทน 100 บาทต่อการตรวจ แยกจากงบบริการ', months: [6, 12], study: true });
  const fl = flFreq(k);
  if (fl.f) rows.push({ key: 'fl', code: '170', codes: ['170'], label: 'เคลือบฟลูออไรด์', sub: `ทุก ${fl.f} เดือน · ${fl.why}`, months: range(fl.f), freqSel: fl.sel });
  const ku = S.units[k.unit];
  rows.push({ key: 'brush', code: '176', codes: ['176', '175'], label: 'ฝึกแปรงฟัน + อุปกรณ์', sub: `ทำเป็นกิจกรรมกลุ่มได้ที่หน้า "${ku ? claimTab(ku) : 'บันทึกบริการ'}"`, anytime: true });
  const teethRows = [];
  for (const pos of [...FPM, ...POS.filter(p => !FPM.includes(p))]) {
    const t = k.teeth[pos];
    const n = needOf(pos, k);
    if (n == null) continue;
    const no = toothNo(pos, t), prim = t.t === 'd', fpm = FPM.includes(pos) && t.t === 'p';
    const base = { tooth: no, anytime: true, prim };
    const primNote = prim ? ' · ฟันน้ำนม ไม่นับในงบโครงการ' : '';
    if (n === 2 && fpm) {
      const occ = t.occ ?? t.B;
      // PRR only at ICDAS 3; ICDAS 4 and above are filled (D-52).
      teethRows.push({ ...base, key: `seal-${no}`, code: '171', codes: occ === 3 ? ['171', '172'] : ['171'], label: 'เคลือบหลุมร่องฟัน', sub: (t.A === 1 || t.A === 7 ? 'เคลือบซ้ำ · ' : '') + (occ >= 1 ? `ICDAS ${occ} ด้านบดเคี้ยว` : 'ฟันกรามแท้ขึ้นแล้ว') + (t.partial ? ' · ขึ้นไม่เต็มซี่' : '') + (occ === 3 ? ' · หรือ PRR' : '') });
    } else if (n === 4) {
      // One filling code and price, 1 surface (D-69); more than one surface goes to the centre.
      teethRows.push({ ...base, key: `tx-${no}`, code: '67210', codes: ['67210', '55', '56', '57', 'SDF'], label: 'อุดฟัน', sub: `ICDAS ${t.B ?? '-'}` + (prim ? '' : ' · อุด 1 ด้านบนรถทันตกรรม ถ้าต้องอุดมากกว่า 1 ด้าน ส่งรักษาที่ศูนย์ฯ') + ' · หรือ SDF 38%' + primNote });
    } else if (n === 3) {
      teethRows.push({ ...base, key: `tx-${no}`, code: 'SDF', codes: ['SDF', '67210', '55', '56', '57'], label: 'ทา SDF 38%', sub: `ICDAS ${t.B} · ยังไม่มีราคา` + primNote });
    } else if (n === 5) {
      teethRows.push({ ...base, key: `tx-${no}`, code: prim ? '68' : 'REF', codes: ['68', 'REF', '1'], label: prim ? 'รักษาโพรงประสาทฟัน' : 'ส่งต่อ รักษาโพรงประสาทฟัน', sub: `ICDAS ${t.B} · ` + (prim ? 'ทำในหน่วย (pulpotomy) หรือส่งต่อ' : 'เบิกตามระบบปกติ นอกงบโครงการ') + primNote, urgent: true });
    } else if (n === 6) {
      teethRows.push({ ...base, key: `tx-${no}`, code: prim ? '178' : 'REF', codes: ['178', 'REF'], label: 'ครอบฟัน', sub: (prim ? 'SSC หรือส่งต่อ' : 'ส่งต่อ') + primNote });
    } else if (n === 7) {
      teethRows.push({ ...base, key: `tx-${no}`, code: '1', codes: ['1', 'REF'], label: 'ถอนฟัน', sub: `ICDAS ${t.B ?? '-'}` + primNote });
    } else if (n === 8) {
      teethRows.push({ ...base, key: `tx-${no}`, code: 'REF', codes: ['REF'], label: 'ส่งต่อ', sub: 'ทันตแพทย์เฉพาะทาง / โรงพยาบาล · นอกงบโครงการ', urgent: true });
    }
  }
  if (urgent && !teethRows.some(r => r.code === 'REF')) teethRows.push({ key: 'tx-urg', code: 'REF', codes: ['REF'], tooth: null, anytime: true, label: 'ส่งต่อ อาการเร่งด่วน', sub: 'ปวด เสียว บวม หนอง หรือฟันแท้ผุขนาดใหญ่', urgent: true });
  teethRows.sort((a, b) => (a.prim ? 1 : 0) - (b.prim ? 1 : 0));
  return [...rows, ...teethRows];
}

/* ================================================================ money: Table 1 value of a service */
// Table 1 rate of the unit's fee schedule (no LC for ศบส. and control, 100% LC for private trial arms). Primary
// teeth are outside the unit budget (D-54). What the project actually pays is v_services_pay (payOf).
function refValue(u, code, tooth) {
  const p = PRICE[code];
  if (!p || p.outside || p.unpriced || isPrimNo(tooth)) return 0;
  return u.arm === 'control' || u.ptype === 'public' ? p.lc : p.full;
}

/* ================================================================ money by fee schedule (01–03) */
const rateOf = (u, code) => (PRICE[code] ? (u.arm === 'control' || u.ptype === 'public' ? PRICE[code].lc : PRICE[code].full) : 0);
// Round-1 budget of one child (01 §2, 02 §2): the care plan at Table 1 rates (exams, fluoride, brushing kit,
// sealants); fillings = permanent teeth needing restoration × the 1-surface rate. NHSO's share is a flat 700 baht per
// child (exam 100 + fluoride 100 + sealants 500, which every child gets; Percy 2 Nov, D-76), none for a child with no
// public coverage (D-68). Primary teeth and referrals are not counted (D-54).
const NHSO_FLAT = 700;
function childBudget(u, k) {
  let plan = 0, fillN = 0;
  for (const r of buildPlan(k)) {
    if (r.study || r.prim) continue;
    if (r.key === 'exam') plan += rateOf(u, '174') * r.months.length;
    else if (r.key === 'fl') plan += rateOf(u, '170') * r.months.length;
    else if (r.key === 'brush') plan += rateOf(u, '176');
    else if (r.code === '171') plan += rateOf(u, '171');
    else if (r.code === '67210') fillN++;
  }
  const nhso = k.c.coverage === 'none' ? 0 : NHSO_FLAT;
  return { plan, fillN, fill: fillN * rateOf(u, '67210'), nhso };
}
// Unit totals from the children examined at round 1. Capitation (01) = plan + fillings − NHSO; ceiling (02) =
// (plan + fillings) × 1.2 − NHSO. Fillings count only when the unit's van can fill (van_fills, set by the team).
function unitBudget(u) {
  const t = { n: 0, plan: 0, fill: 0, fillN: 0, nhso: 0, noCov: 0, unknownCov: 0 };
  for (const k of u.kids) {
    if (!examined(k)) continue;
    const b = childBudget(u, k);
    t.n++; t.plan += b.plan; t.fill += b.fill; t.fillN += b.fillN; t.nhso += b.nhso;
    if (k.c.coverage === 'none') t.noCov++; else if (!k.c.coverage) t.unknownCov++;
  }
  t.fillIn = u.van_fills === true ? t.fill : 0;
  t.cap = t.plan + t.fillIn - t.nhso;
  t.ceil = (t.plan + t.fillIn) * 1.2 - t.nhso;
  t.dataFee = 100 * t.n;   // data-collection fee per round-1 exam, apart from services (D-36, D-50)
  return t;
}
// Claim arms: project amounts of sent, approved and paid services; drafts and returned ones apart.
function unitClaims(u) {
  const by = st => u.tx.filter(t => st.includes(t.status)).reduce((a, t) => a + txAmt(u, t), 0);
  return { claimed: by(['submitted', 'approved', 'paid']), approved: by(['approved']), paid: by(['paid']), draft: by(['draft', 'returned']) };
}
const transferred = u => (u.transfers || []).reduce((a, t) => a + +t.amount, 0);

/* ================================================================ per-child plan state */
const CAT = { '171': 'seal', '172': 'seal', '170': 'fl', '174': 'recall', '173': 'recall', '176': 'brush', '175': 'brush', 'REF': 'ref' };
const CAT_TH = { seal: 'เคลือบหลุมร่องฟัน', fl: 'ฟลูออไรด์', recall: 'ตรวจติดตาม', tx: 'รักษา', ref: 'ส่งต่อ (ยังไม่ส่งหรือรอผล)', brush: 'ฝึกแปรงฟัน', exam: 'ยังไม่ได้ตรวจ', none: 'ครบตามแผนถึงเดือนนี้' };
const catOf = row => CAT[row.code] || 'tx';
const rowTx = (u, k, row) => (u.txByKid[k.id] || []).filter(t => row.codes.includes(t.code) && (row.tooth == null || t.tooth === row.tooth));
const pname = code => (PRICE[code] ? PRICE[code].name : code);
const pshort = code => (PRICE[code] ? PRICE[code].short : code);
const chipText = (row, m) => {
  const c = catOf(row);
  if (c === 'seal') return `เคลือบ ${row.tooth}`;
  if (c === 'fl') return `ฟลูออไรด์ ด.${m}`;
  if (c === 'recall') return m === 1 ? 'ติ๊กบริการตรวจ ด.1' : `ตรวจติดตาม ด.${m}`;   // month 1 is the first exam (R1-03)
  if (c === 'brush') return 'ฝึกแปรงฟัน';
  if (c === 'ref') return `ส่งต่อ${row.tooth ? ' ' + row.tooth : ''}`;
  return `${pshort(row.code)} ${row.tooth ?? ''}`.trim();
};
function kidState(u, k) {
  if (!examined(k)) return { absent: true, miss: [], due: [], cats: new Set(['exam']), done: 0, total: 0, refWait: false, next: '' };
  const cm = monthOf(k.base, TODAY);
  const miss = [], due = [], cats = new Set();
  let done = 0, total = 0, refWait = false, next = null;
  for (const row of buildPlan(k)) {
    if (row.study) { const m = row.months.find(x => x > cm); if (m && (!next || m < next.m)) next = { m, t: 'ตรวจรอบโครงการ' }; continue; }
    const txs = rowTx(u, k, row);
    if (row.anytime) {
      total++;
      if (txs.length) { done++; if (txs.some(t => t.code === 'REF' && !t.outcome)) { refWait = true; cats.add('ref'); } }
      else { const late = (TODAY - k.base) / 864e5 > 30; (late ? miss : due).push({ c: catOf(row), t: chipText(row) }); cats.add(catOf(row)); }
      continue;
    }
    for (const m of row.months) {
      if (m > cm) { if (!next || m < next.m) next = { m, t: row.label }; continue; }
      total++;
      if (txs.some(t => txMonth(k, t) === m)) done++;
      else { (m < cm ? miss : due).push({ c: catOf(row), t: chipText(row, m) }); cats.add(catOf(row)); }
    }
  }
  return { absent: false, miss, due, cats, done, total, refWait, next: next ? `${next.t} เดือนที่ ${next.m} (${thMon(addMonths(k.base, next.m))})` : '' };
}
const stFlags = st => ({ absent: st.absent, miss: st.miss.length > 0, due: st.due.length > 0, ref: st.refWait, ok: !st.absent && !st.miss.length && !st.due.length && !st.refWait });

/* ================================================================ data: load and map */
const S = {
  me: null, units: {}, acct: null, tab: 'home', kid: null, ftab: 'exam', sel: 16, prov: '', editId: null, newId: null, gsel: new Set(), loadedAt: 0, enBatch: [],
  kf: { q: '', cls: 'all', risk: 'all', st: 'all', miss: 'all', group: 'cls' },
  lf: { month: 'all', status: 'all', kind: 'all', q: '', limit: 40 },
};
const unit = () => S.units[S.acct];
const curKid = () => (unit() ? unit().byId[S.kid] : null);
const hasConsent = k => !!(k.c.consent_on && k.c.assent);
// Per-child services need complete consent and an enrolled (not withdrawn) child (R1-20).
const canServe = k => hasConsent(k) && k.c.status !== 'withdrawn';

async function fetchAll(table, order) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let qb = sb.from(table).select('*').range(from, from + 999);
    for (const o of order) qb = qb.order(o);
    const { data, error } = await qb;
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}
// What the project pays per service comes from the database view v_services_pay (fee schedules 01–03). It is
// fetched again after services or coverage change; money screens re-render when it arrives.
let payVer = -1, payBusy = false;
function setPay(rows) { S.pay = new Map(rows.map(r => [r.id, { pay: +r.project_pay || 0, note: r.pay_note || '' }])); }
const payOf = tx => (S.pay && S.pay.get(tx.id)) || null;
async function refreshPay() {
  if (payBusy || payVer === S.txVer) return;
  payBusy = true;
  const ver = S.txVer;
  try { setPay(await fetchAll('v_services_pay', ['service_date', 'id'])); payVer = ver; } catch (e) { /* the next render tries again */ }
  payBusy = false;
  if (payVer !== ver) return;
  if (payVer !== S.txVer) refreshPay();
  else if (['home', 'claims', 'research'].includes(S.tab)) render(S.tab, true);
}
// Amount shown per service: what the project pays in the claim arms; in the capitation arm the Table 1 value
// (cost of the unit's work, no item claims).
const txAmt = (u, tx) => (u.arm !== 'cap' && payOf(tx) ? payOf(tx).pay : refValue(u, tx.code, tx.tooth));
const amtLabel = u => (u.arm === 'cap' ? 'มูลค่าตามอัตรา' : 'ยอดเบิกโครงการ');
function txFrom(s) {
  return { id: s.id, kid: s.study_id, code: s.code, tooth: s.tooth, date: fromInput(s.service_date), status: s.status, fromPlan: s.from_plan,
    planKey: s.plan_key, planMonth: s.plan_month ?? null, by: s.provider || '', outcome: s.outcome, gid: s.group_id, gnote: s.group_note, n: s.n_participants, note: s.note, returnNote: s.return_note };
}
const clone = o => JSON.parse(JSON.stringify(o || {}));
function applyExam(k, ex) {
  k.exam = ex || null; k.dirty = false; k.editing = false;
  k.status = !ex ? 'new' : ex.attended ? 'examined' : 'absent';
  k.base = ex && ex.attended ? fromInput(ex.exam_date) : null;
  k.examDate = ex ? fromInput(ex.exam_date) : null;
  k.risk = ex && ex.attended ? clone(ex.risk) : {};
  k.teeth = ex && ex.attended ? clone(ex.teeth) : null;
  k.pigi = ex && ex.attended && ex.pigi && Object.keys(ex.pigi).length ? { ...emptyPigi(), ...clone(ex.pigi) } : emptyPigi();
  k.pigiSkip = !!(ex && ex.attended && !(ex.pigi && Object.keys(ex.pigi).length));   // saved as {} = PI/GI not done (R1-14)
  k.showMiss = false;   // after a failed save, mark every missing item (R1-04)
  k.urgent = { pain: false, swell: false, big: false, ...(ex ? ex.urgent : {}) };
  k.needOv = ex ? clone(ex.need_override) : {};
  k.ovReason = ex ? clone(ex.override_reason) : {};
  k.flOv = ex ? ex.fl_override : null;
  k.examiner = ex ? ex.examiner_code || '' : '';
  k.place = ex && ex.place ? ex.place : 'van';
}
// No names in the system (D-64): the unit matches study IDs to its own name list.
function setChild(k, c) {
  S.txVer = (S.txVer || 0) + 1;   // coverage can change what the project pays
  k.c = c; k.cls = c.class; k.female = c.sex === 'F';
  k.birth = c.birth_ym ? fromInput(c.birth_ym + '-15') : null;
  k.name = '';
}
function kidFrom(c, ex) {
  const k = { id: c.study_id, unit: c.unit_id };
  setChild(k, c);
  applyExam(k, ex);
  return k;
}
const sexTh = k => (k.c.sex === 'F' ? 'หญิง' : k.c.sex === 'M' ? 'ชาย' : '');
// Health coverage (D-68): another public scheme is claimed like UC; with no public coverage (e.g. a foreign
// child) the unit does not claim NHSO and the project pays its full rate.
const COV = {
  uc: { th: 'UC (บัตรทอง)', ex: '', rule: 'เบิก สปสช. ตามปกติ และเบิกโครงการตามอัตราค่าบริการของหน่วย' },
  other: { th: 'สิทธิรัฐอื่น', ex: ' เช่น ข้าราชการ ประกันสังคม รัฐวิสาหกิจ อปท.', rule: 'เบิกเหมือนเด็กสิทธิ UC' },
  none: { th: 'ไม่มีสิทธิรัฐ', ex: ' เช่น เด็กต่างด้าวที่ไม่มีหลักประกันสุขภาพภาครัฐ', rule: 'ไม่ต้องเบิก สปสช. โครงการจ่ายเต็มอัตราตามอัตราค่าบริการของหน่วย' },
};
const covText = c => (COV[c.coverage] ? `${COV[c.coverage].th} · ${COV[c.coverage].rule}` : 'ยังไม่ตรวจสิทธิ');
const kidLabel = k => [k.cls, sexTh(k)].filter(Boolean).join(' · ');
function reindex(u) {
  S.txVer = (S.txVer || 0) + 1;   // services changed: the project amounts are fetched again (refreshPay)
  u.txByKid = {};
  for (const tx of u.tx) if (tx.kid) (u.txByKid[tx.kid] ||= []).push(tx);
}
function sortKids(u) { u.kids.sort((a, b) => a.id.localeCompare(b.id)); }

async function loadAll() {
  const [units, schools, examiners, prices, children, exams, services, transfers, pay, evidence] = await Promise.all([
    fetchAll('units', ['letter']), fetchAll('schools', ['id']), fetchAll('examiners', ['code']), fetchAll('price_list', ['code', 'valid_from']),
    fetchAll('children', ['study_id']), fetchAll('exams', ['id']), fetchAll('services', ['service_date', 'id']),
    fetchAll('transfers', ['paid_on', 'id']), fetchAll('v_services_pay', ['service_date', 'id']), fetchAll('evidence', ['id']),
  ]);
  PRICE = {};
  const today = toInput(TODAY);
  for (const p of prices) {
    if (p.valid_from > today || (p.valid_to && p.valid_to <= today)) continue;
    PRICE[p.code] = { name: p.name, short: p.short, unit: p.unit, lc: +p.price_lc, full: +p.price_full, tooth: p.tooth_rule, group: p.group_kind, unpriced: p.unpriced, outside: p.outside, nhso: +(p.nhso_rate || 0) };
  }
  S.units = {};
  for (const r of units) S.units[r.id] = { ...r, schools: [], examiners: [], kids: [], byId: {}, tx: [], txByKid: {}, exams: [], transfers: [], evidence: new Map() };
  for (const s of schools) S.units[s.unit_id]?.schools.push(s);
  for (const x of examiners) if (x.active) S.units[x.unit_id]?.examiners.push(x.code);
  const examBy = {};
  for (const e of exams) { if (e.round === 'baseline') examBy[e.study_id] = e; S.units[e.unit_id]?.exams.push(e); }
  for (const c of children) { const u = S.units[c.unit_id]; if (!u) continue; const k = kidFrom(c, examBy[c.study_id]); u.kids.push(k); u.byId[k.id] = k; }
  for (const s of services) S.units[s.unit_id]?.tx.push(txFrom(s));
  for (const t of transfers) S.units[t.unit_id]?.transfers.push(t);
  for (const ev of evidence) { const u = S.units[ev.unit_id]; if (u) (u.evidence.get(ev.group_id) || u.evidence.set(ev.group_id, []).get(ev.group_id)).push(ev); }
  Object.values(S.units).forEach(reindex);
  setPay(pay); payVer = S.txVer;
}

/* ================================================================ errors and toasts */
let toastT = null;
// ms = 0 keeps the toast until the next tap. The toast sits above the save bar so it never covers "บันทึกผลตรวจ" (R1-04).
function toast(msg, ms = 4200) {
  const t = $('#toast'), bar = $('#saveBar');
  t.textContent = msg; t.hidden = false;
  t.style.bottom = bar.hidden ? '' : `calc(${bar.offsetHeight + 12}px + env(safe-area-inset-bottom, 0px))`;
  clearTimeout(toastT);
  if (ms) toastT = setTimeout(() => { t.hidden = true; }, ms);
}
const loadedText = () => { const d = new Date(S.loadedAt || Date.now()); return `ข้อมูล ณ ${thDate(TODAY)} เวลา ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} น.`; };
function errText(e) {
  const m = String((e && (e.message || e.error_description)) || e || '');
  if (/row-level security|permission denied/i.test(m)) return 'บัญชีนี้ไม่มีสิทธิ์บันทึกข้อมูลนี้';
  if (/exams_one_per_study_round/.test(m)) return 'นักเรียนคนนี้มีผลตรวจครั้งที่ 1 แล้ว (โหลดหน้าใหม่แล้วลองอีกครั้ง)';
  if (/Invalid login credentials/i.test(m)) return 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'เชื่อมต่ออินเทอร์เน็ตไม่ได้ ข้อมูลยังไม่ถูกบันทึก ลองอีกครั้ง';
  if (/JWT expired|refresh token/i.test(m)) return 'หมดเวลาเข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่';
  return m;
}
const toastErr = e => toast('บันทึกไม่สำเร็จ · ' + errText(e));

/* ================================================================ auth, navigation */
const TABS_UNIT = [['home', 'หน้าแรก'], ['kids', 'นักเรียน'], ['file', 'แฟ้มนักเรียน'], ['claims', null]];
const TABS_RESEARCH = [['research', 'ภาพรวมทุกหน่วย']];
const SCREENS = ['login', 'home', 'kids', 'enrol', 'file', 'claims', 'research'];

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const user = $('#lgUser').value.trim(), pass = $('#lgPass').value;
  const msg = $('#lgMsg'); msg.replaceChildren();
  if (!user || !pass) { msg.append(el('div', { class: 'err', text: 'กรอกชื่อผู้ใช้และรหัสผ่าน' })); return; }
  const email = user.includes('@') ? user : `${user}@${CFG.loginDomain}`;
  $('#lgBtn').disabled = true;
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  $('#lgBtn').disabled = false;
  if (error) { msg.append(el('div', { class: 'err', text: errText(error) })); return; }
  $('#lgPass').value = '';
  await afterLogin();
});

async function afterLogin() {
  $('#login').hidden = true;
  const main = $('#home'); main.hidden = false; main.replaceChildren(el('p', { class: 'loading', text: 'กำลังโหลดข้อมูล…' }));
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) throw new Error('JWT expired');
    const { data: me, error } = await sb.from('staff').select('*').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    if (!me) { await sb.auth.signOut(); main.hidden = true; show('login'); $('#lgMsg').replaceChildren(el('div', { class: 'err', text: 'บัญชีนี้ยังไม่ได้ผูกกับหน่วยบริการหรือทีมวิจัย ติดต่อทีมวิจัย' })); return; }
    S.me = me;
    TODAY = startOfDay(new Date());
    await loadAll();
    S.loadedAt = Date.now();
  } catch (err) {
    main.replaceChildren(el('div', { class: 'err', text: 'โหลดข้อมูลไม่สำเร็จ · ' + errText(err) }), el('button', { class: 'btn', type: 'button', text: 'ลองใหม่', onclick: afterLogin }));
    return;
  }
  S.acct = S.me.role === 'unit' ? S.me.unit_id : 'research';
  const tabs = $('#tabs'); tabs.replaceChildren();
  for (const [sid, label] of (S.me.role === 'unit' ? TABS_UNIT : TABS_RESEARCH)) tabs.append(el('button', { type: 'button', role: 'tab', id: 't-' + sid, 'aria-controls': sid, 'aria-selected': 'false', text: label || claimTab(unit()), onclick: () => show(sid) }));
  tabs.hidden = false;
  const chip = $('#acctChip');
  if (S.me.role === 'unit') {
    const u = unit();
    fill(chip, el('i', { class: 'key ' + ARM[u.arm].key }), el('b', { text: u.name }), u.is_test ? el('span', { class: 'testflag', text: 'ทดสอบ' }) : null);
    const ps = $('#provSel');
    ps.replaceChildren(el('option', { value: '', text: '– เลือกรหัสของคุณ –' }), ...u.examiners.map(c => el('option', { value: c, text: c })));
    S.prov = lsGet('dent2-prov-' + u.id) || '';
    if (!u.examiners.includes(S.prov)) S.prov = '';
    ps.value = S.prov;
    ps.classList.toggle('is-missing', !S.prov);
    $('#provBox').hidden = false;
    S.kid = null;   // the file tab waits for a chosen child (R1-19)
    $('#verTag').textContent = u.is_test ? 'v1.2 · หน่วยทดสอบ' : 'v1.2';
  } else {
    fill(chip, el('i', { class: 'key key--ref' }), el('b', { text: S.me.display_name }), S.me.role === 'pi' ? 'PI' : 'ทีมวิจัย');
    $('#provBox').hidden = true;
    $('#verTag').textContent = 'v1.2';
  }
  $('#acctBox').hidden = false;
  show(S.me.role === 'unit' ? 'home' : 'research');
}
$('#provSel').addEventListener('change', e => { S.prov = e.target.value; lsSet('dent2-prov-' + S.acct, S.prov); e.target.classList.toggle('is-missing', !S.prov); });
// Every write that records "ผู้บันทึก" needs a chosen code; nothing falls back to a default examiner (R1-02).
function needProv() {
  if (S.prov) return true;
  const p = $('#provSel'); p.classList.add('is-missing'); p.focus();
  toast('เลือก "ผู้บันทึก" (รหัสของคุณ) ที่แถบด้านบนก่อนบันทึก');
  return false;
}

async function logout(reason) {
  // One login per unit (D-42): the next person on this device picks their own code.
  if (S.acct && S.acct !== 'research') lsSet('dent2-prov-' + S.acct, '');
  await sb.auth.signOut();
  Object.assign(S, { me: null, units: {}, acct: null, kid: null, editId: null, prov: '' });
  $('#tabs').hidden = true; $('#acctBox').hidden = true; hideSaveBar();
  $('#verTag').textContent = 'v1.2';
  show('login');
  if (reason) $('#lgMsg').replaceChildren(el('div', { class: 'hint', text: reason }));
}
$('#logoutBtn').addEventListener('click', () => { if (dirtyGuard()) logout(); });

// Two devices on one unit login: reload on demand, and by itself when the tab comes back after 5 minutes (R1-09).
let reloading = false;
async function reloadData(auto) {
  if (!S.me || reloading || busy) return;
  const k = curKid();
  if (auto ? k && k.dirty : !dirtyGuard()) return;
  reloading = true;
  setIf('#reloadBtn', 'disabled', true);
  try {
    TODAY = startOfDay(new Date());
    await loadAll();
    S.loadedAt = Date.now();
    if (S.tab !== 'enrol') render(S.tab, true);   // a half-filled enrolment form keeps its values
    if (!auto) toast('โหลดข้อมูลล่าสุดแล้ว');
  } catch (e) { if (!auto) toast('โหลดข้อมูลไม่สำเร็จ · ' + errText(e)); }
  finally { reloading = false; setIf('#reloadBtn', 'disabled', false); }
}
$('#reloadBtn')?.addEventListener('click', () => reloadData(false));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !S.me) return;
  if (idleCheck()) return;
  if (Date.now() - S.loadedAt > 5 * 60e3) reloadData(true);
});

// Shared clinic devices: warn after 25 minutes without use, sign out after 30 (R1-09).
let lastAct = Date.now(), idleWarned = false;
['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => {
  lastAct = Date.now();
  if (idleWarned) { idleWarned = false; $('#toast').hidden = true; }
}, { passive: true }));
function idleCheck() {
  if (!S.me) return false;
  const idle = Date.now() - lastAct;
  if (idle > 30 * 60e3) { idleWarned = false; logout('ออกจากระบบอัตโนมัติ เพราะไม่มีการใช้งาน 30 นาที ผลตรวจที่ยังไม่กดบันทึกจะไม่ถูกเก็บ'); return true; }
  if (idle > 25 * 60e3 && !idleWarned) {
    idleWarned = true;
    const k = curKid();
    toast(`ไม่มีการใช้งาน 25 นาที ระบบจะออกจากระบบใน 5 นาที แตะหน้าจอเพื่อใช้งานต่อ${k && k.dirty ? ' (มีผลตรวจที่ยังไม่บันทึก)' : ''}`, 0);
  }
  return false;
}
setInterval(idleCheck, 30e3);

function dirtyGuard() {
  const k = curKid();
  if (k && k.dirty) return confirm('มีผลตรวจที่ยังไม่บันทึก ออกจากหน้านี้โดยไม่บันทึกหรือไม่?') && (discardExam(k), true);
  return true;
}
window.addEventListener('beforeunload', e => { const k = curKid(); if (k && k.dirty) { e.preventDefault(); e.returnValue = ''; } });

function show(id) {
  if (!S.me) id = 'login';
  if (S.tab === 'file' && id !== 'file' && !dirtyGuard()) return;
  for (const s of SCREENS) $('#' + s).hidden = s !== id;
  $$('#tabs button').forEach(b => b.setAttribute('aria-selected', String(b.getAttribute('aria-controls') === id)));
  S.tab = id;
  render(id);
  window.scrollTo({ top: 0 });
}
// keep = re-render after a data reload: forms on the claims page keep what the user already chose.
function render(id, keep) {
  if (id === 'home') renderHome();
  else if (id === 'kids') renderKids();
  else if (id === 'enrol') renderEnrol();
  else if (id === 'file') renderFile();
  else if (id === 'claims') { setupClaimsForm(keep); renderClaims(); }
  else if (id === 'research') renderResearch();
}
function openKid(id, ft) { if (S.kid !== id && !dirtyGuard()) return; S.kid = id; S.sel = 16; if (ft) S.ftab = ft; show('file'); }
document.addEventListener('click', e => {
  const g = e.target.closest('[data-go]'); if (g) { if (g.dataset.go === 'enrol') S.editId = null; show(g.dataset.go); return; }
  const f = e.target.closest('[data-ft]'); if (f) { S.ftab = f.dataset.ft; renderFile(); }
});

/* ================================================================ CSV export (no names, no national ID) */
function toCsv(rows) {
  if (!rows.length) return 'ไม่มีข้อมูล';
  const cols = Object.keys(rows[0]).filter(c => !['created_by', 'updated_by'].includes(c));
  const esc = v => {
    if (v == null) return '';
    let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/^[=+@]/.test(s)) s = "'" + s;   // keep spreadsheet formulas out
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\r\n');
}
function download(name, text) {
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
  const a = el('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
const EXPORTS = [
  ['v_export_children', 'ผลตรวจรายคน', ['study_id', 'round']],
  ['v_tooth_findings', 'ผลตรวจรายซี่', ['study_id', 'position']],
  ['v_services_priced', 'บริการที่บันทึก', ['service_date', 'id']],
  ['v_services_pay', 'ยอดเบิกรายบริการ', ['service_date', 'id']],
];
async function exportCsv(view, label, order, btn) {
  btn.disabled = true;
  try {
    const rows = await fetchAll(view, order);
    const who = S.me.role === 'unit' ? unit().letter : 'all';
    download(`dent2_${view.replace(/^v_/, '')}_${who}_${toInput(new Date())}.csv`, toCsv(rows));
    toast(`ดาวน์โหลด ${label} ${fmt(rows.length)} แถว (ไม่มีชื่อและเลขบัตรประชาชน)`);
  } catch (e) { toast('ดาวน์โหลดไม่สำเร็จ · ' + errText(e)); }
  btn.disabled = false;
}
const exportButtons = () => el('div', { class: 'dl-list' }, ...EXPORTS.map(([v, lab, ord]) => el('button', { class: 'btn', type: 'button', text: `CSV ${lab}`, onclick: e => exportCsv(v, lab, ord, e.currentTarget) })));

/* ================================================================ HOME (unit) */
const tile = (label, value, sub) => el('div', { class: 'card tile' }, el('span', { class: 'tile__label', text: label }), el('span', { class: 'tile__value' }, value), sub ? el('span', { class: 'tiny muted', text: sub }) : null);
// A home tile that opens the student cards filtered to what it counts (R1-19).
const tileLink = (label, value, sub, st, go = 'ดูรายชื่อ →') => el('button', { type: 'button', class: 'card tile tile--link', 'aria-label': `${label} ${value} · ${go.replace(' →', '')}`,
  onclick: () => { Object.assign(S.kf, { q: '', cls: 'all', risk: 'all', miss: 'all', st }); show('kids'); } },
  el('span', { class: 'tile__label', text: label }), el('span', { class: 'tile__value' }, value), sub ? el('span', { class: 'tiny muted', text: sub }) : null,
  el('span', { class: 'tile__go', text: go }));
const KIND = { advance: 'ค่าเหมาจ่ายงวดแรก', claims: 'ค่าบริการตามรายการเบิก', withhold: 'เงินที่หักไว้ (ตามตัวชี้วัด)', savings: 'ส่วนแบ่งส่วนที่ประหยัดได้', data_fee: 'ค่าตอบแทนเก็บข้อมูล', other: 'อื่น ๆ' };
const periodLabel = p => (p && /^\d{4}-\d{2}$/.test(p) ? thMon(fromInput(p + '-01')) : p || '–');
// Money on the unit's home page (D-42): from the round-1 screening and the fee schedule of the unit's arm.
function moneySection(u) {
  const b = unitBudget(u), c = unitClaims(u), got = transferred(u);
  const tiles = [];
  if (u.arm === 'cap') {
    tiles.push(tile('ค่าเหมาจ่ายรายหัวทั้งปี', `${fmt(b.cap)} บาท`, `คำนวณจากผลตรวจครั้งแรก ${b.n} คน`),
      tile('งวดแรก 70% (ภายใน ธ.ค. 2569)', `${fmt(b.cap * 0.7)} บาท`, `หักไว้ 30% = ${fmt(b.cap * 0.3)} บาท คืนตามตัวชี้วัดหลังตรวจรอบ 12 เดือน`));
  } else if (u.arm === 'ffs') {
    tiles.push(tile('เพดานงบประมาณรวม', `${fmt(b.ceil)} บาท`, `คำนวณจากผลตรวจครั้งแรก ${b.n} คน`),
      tile('เบิกแล้ว', `${fmt(c.claimed)} บาท`, `อนุมัติแล้ว ${fmt(c.approved + c.paid)} บาท · ร่างยังไม่ส่ง ${fmt(c.draft)} บาท`),
      b.ceil - c.claimed >= 0 ? tile('เหลือในเพดาน', `${fmt(b.ceil - c.claimed)} บาท`, b.ceil > 0 ? `ใช้ไป ${Math.round(c.claimed / b.ceil * 100)}% · ถ้าจบปีที่ยอดนี้และผ่านตัวชี้วัดครบ 4 ตัว ได้ส่วนแบ่ง 30% = ${fmt((b.ceil - c.claimed) * 0.3)} บาท (02 ข้อ 2)` : '')
        : tile('เกินเพดาน', `${fmt(c.claimed - b.ceil)} บาท`, 'ยอดเบิกรวมทั้งปีต้องไม่เกินเพดาน (02 ข้อ 2)'));
  } else {
    tiles.push(tile('เบิกแล้ว', `${fmt(c.claimed)} บาท`, `อนุมัติแล้ว ${fmt(c.approved + c.paid)} บาท`), tile('ร่างยังไม่ส่ง', `${fmt(c.draft)} บาท`));
  }
  tiles.push(tile('ได้รับโอนแล้ว', `${fmt(got)} บาท`, `${u.transfers.length} รายการ`),
    tile('ค่าตอบแทนเก็บข้อมูลรอบ 1', `${fmt(b.dataFee)} บาท`, `${b.n} คน × 100 บาท แยกจากค่าบริการ`));
  const notes = [];
  if (u.arm !== 'control') {
    notes.push(`ที่มาของยอด: แผนการดูแลตามอัตราค่าบริการ ${fmt(b.plan)} บาท` + (u.van_fills === true ? ` + อุดฟัน ${b.fillN} ซี่ ${fmt(b.fill)} บาท` : '')
      + (u.arm === 'ffs' ? ' แล้วบวกส่วนเพิ่ม 20%' : '') + ` − ส่วนที่เบิกจาก สปสช. ${fmt(b.nhso)} บาท (คนละ 700 บาท: ตรวจ 100 ฟลูออไรด์ 100 เคลือบหลุมร่องฟัน 500)`);
    if (u.van_fills == null && b.fillN) notes.push(`ยังไม่รวมค่าอุดฟัน ${b.fillN} ซี่ (${fmt(b.fill)} บาท) จนกว่าหน่วยจะตั้งค่าว่ารถทันตกรรมอุดฟันได้ (ด้านบน)`);
    if (u.van_fills === false) notes.push('รถทันตกรรมของหน่วยอุดฟันไม่ได้ จึงไม่รวมค่าอุดฟัน นักเรียนที่ต้องอุดฟันส่งต่อตามระบบปกติของ สปสช.');
  }
  if (b.unknownCov) notes.push(`ยังไม่ระบุสิทธิการรักษา ${b.unknownCov} คน ระบบคิดเหมือนสิทธิ UC`);
  if (b.noCov) notes.push(`ไม่มีสิทธิรัฐ ${b.noCov} คน โครงการจ่ายเต็มอัตรา ไม่หักส่วนของ สปสช.`);
  notes.push('ยอดเปลี่ยนตามผลตรวจครั้งแรกที่บันทึก ทีมวิจัยตรวจยอดก่อนโอนทุกครั้ง');
  return el('section', {}, el('h3', { text: 'เงินของหน่วย' }), el('div', { class: 'tiles' }, ...tiles),
    el('ul', { class: 'olist small muted' }, ...notes.map(t => el('li', { text: t })), vanLine(u)), transfersBlock(u));
}
function transfersBlock(u) {
  const list = [...u.transfers].sort((a, b) => b.paid_on.localeCompare(a.paid_on) || b.id - a.id);
  const unseen = list.filter(t => !t.seen_at).length;
  const det = el('details', { class: 'card', id: 'trList' },
    el('summary', {}, `รายการโอนเงิน (${list.length})`, unseen ? el('span', { class: 'chip chip--warn', style: 'margin-left:8px', text: `ใหม่ ${unseen}` }) : null),
    list.length ? el('div', { class: 'tablewrap' }, el('table', { class: 'ledger' },
      el('thead', {}, el('tr', {}, ...['วันที่โอน', 'รายการ', 'งวด', 'จำนวนเงิน (บาท)', 'สลิป'].map((h, i) => el('th', { scope: 'col', class: i === 3 ? 'num' : '', text: h })))),
      el('tbody', {}, ...list.map(t => el('tr', {},
        el('td', { text: thShort(fromInput(t.paid_on)) }),
        el('td', { class: 'wrapcell' }, KIND[t.kind] || t.kind, t.note ? el('div', { class: 'tiny muted', text: t.note }) : null, t.seen_at ? null : el('div', { class: 'tiny', style: 'color:var(--warn)', text: 'ใหม่' })),
        el('td', { text: periodLabel(t.period) }), el('td', { class: 'num', text: fmt2(+t.amount) }),
        el('td', {}, t.slip_path ? el('button', { class: 'linkbtn', type: 'button', text: 'ดูสลิป', onclick: () => openSlip(t.slip_path) }) : '–'))))))
      : el('p', { class: 'small muted', text: 'ยังไม่มีการโอนเงิน เมื่อทีมวิจัยโอนเงินและแนบสลิป รายการจะขึ้นที่นี่' }));
  return det;
}
// The unit's notice of a new transfer: a banner until someone in the unit opens the list (seen_at).
function transferBanner(u) {
  const unseen = u.transfers.filter(t => !t.seen_at);
  if (!unseen.length || S.me.role !== 'unit') return null;
  return el('div', { class: 'ok', id: 'trBanner' }, el('b', { text: `ทีมวิจัยโอนเงินใหม่ ${unseen.length} รายการ รวม ${fmt2(unseen.reduce((a, t) => a + +t.amount, 0))} บาท` }), ' ',
    el('button', { class: 'btn', type: 'button', text: 'ดูและรับทราบ', onclick: async () => {
      const det = $('#trList'); if (det) { det.open = true; det.scrollIntoView({ block: 'start' }); }
      const now = new Date().toISOString();
      const { error } = await sb.from('transfers').update({ seen_at: now }).in('id', unseen.map(t => t.id));
      if (error) { toastErr(error); return; }
      unseen.forEach(t => { t.seen_at = now; });
      setIf('#trBanner', 'hidden', true);
    } }));
}
async function openSlip(path) {
  const w = window.open('', '_blank');   // opened before the await so pop-up blockers allow it
  const { data, error } = await sb.storage.from('slips').createSignedUrl(path, 300);
  if (error || !data) { if (w) w.close(); toastErr(error || { message: 'เปิดสลิปไม่ได้' }); return; }
  if (w) w.location = data.signedUrl; else window.location.assign(data.signedUrl);
}
// Unit set-up (Percy 2 Nov): the unit says whether its mobile dental unit can fill teeth. Fillings count in the
// capitation and the ceiling only then (01, 02 §2). The unit can change it until it sends its cohort.
async function setVanFills(u, v) {
  const { error } = await sb.rpc('set_van_fills', { p_fills: v });
  if (error) { toastErr(error); return; }
  u.van_fills = v; toast(v ? 'บันทึกแล้ว: รถทันตกรรมของหน่วยอุดฟันได้' : 'บันทึกแล้ว: รถทันตกรรมของหน่วยอุดฟันไม่ได้'); renderHome();
}
function setupCard(u) {
  if (S.me.role !== 'unit' || u.van_fills != null) return null;
  return el('section', { class: 'card stack', id: 'setupCard' },
    el('h3', { text: 'ตั้งค่าหน่วยครั้งแรก: รถทันตกรรมของหน่วยอุดฟันได้หรือไม่' }),
    el('p', { class: 'small', text: 'อุดฟันได้: ค่าอุดฟันซี่ละ 360 บาท (อุด 1 ด้าน) รวมในค่าเหมาจ่ายหรือเพดานงบของหน่วย ตามจำนวนฟันแท้ที่ผลตรวจครั้งแรกระบุว่าต้องบูรณะ · อุดฟันไม่ได้: ไม่รวมค่าอุดฟัน ส่งต่อนักเรียนที่ต้องอุดฟันตามระบบปกติของ สปสช. · เปลี่ยนได้จนกว่าจะส่ง cohort' }),
    el('div', { class: 'row' },
      el('button', { class: 'btn btn--primary', type: 'button', id: 'vanYes', text: 'อุดฟันได้', onclick: () => setVanFills(u, true) }),
      el('button', { class: 'btn', type: 'button', id: 'vanNo', text: 'อุดฟันไม่ได้', onclick: () => setVanFills(u, false) })));
}
const vanLine = u => (u.van_fills == null ? null : el('li', {}, `รถทันตกรรมของหน่วย: ${u.van_fills ? 'อุดฟันได้' : 'อุดฟันไม่ได้'} `,
  !u.cohort_submitted_at && S.me.role === 'unit' ? el('button', { class: 'linkbtn', type: 'button', text: 'เปลี่ยน', onclick: () => { if (confirm(`เปลี่ยนเป็น "${u.van_fills ? 'อุดฟันไม่ได้' : 'อุดฟันได้'}"?`)) setVanFills(u, !u.van_fills); } }) : null));
// Cohort (Percy 2 Nov): until the unit submits it, children enrolled by mistake or for practice can be deleted.
function cohortSection(u) {
  const n = u.kids.length, ex = u.kids.filter(examined).length;
  if (u.cohort_submitted_at) return el('section', {}, el('h3', { text: 'cohort' }),
    el('p', { class: 'small', text: `ส่ง cohort แล้วเมื่อ ${thDate(new Date(u.cohort_submitted_at))} ลบแฟ้มนักเรียนไม่ได้แล้ว ถ้าต้องแก้ไขติดต่อทีมวิจัย` }));
  return el('section', {}, el('h3', { text: 'ส่ง cohort (ยืนยันรายชื่อตรวจครั้งแรก)' }),
    el('p', { class: 'small muted', text: 'ก่อนส่ง cohort ลบแฟ้มนักเรียนที่บันทึกผิดหรือที่ใช้ซ้อมได้ (แฟ้มนักเรียน → ข้อมูลลงทะเบียน → ลบแฟ้มนักเรียนนี้) เมื่อลงทะเบียนและตรวจครั้งแรกครบทุกห้องแล้ว กด "ส่ง cohort" หลังส่งแล้วลบแฟ้มไม่ได้อีก' }),
    el('button', { class: 'btn', type: 'button', id: 'cohortBtn', text: `ส่ง cohort (ลงทะเบียน ${n} คน · ตรวจแล้ว ${ex} คน)`, onclick: async () => {
      if (!confirm(`ส่ง cohort ของ ${u.name}?\nลงทะเบียน ${n} คน ตรวจครั้งแรกแล้ว ${ex} คน\nหลังส่งจะลบแฟ้มนักเรียนไม่ได้อีก`)) return;
      const { data, error } = await sb.rpc('submit_cohort');
      if (error) { toastErr(error); return; }
      u.cohort_submitted_at = data; toast('ส่ง cohort แล้ว'); renderHome();
    } }));
}
function needsReferral(k) { return examined(k) && (Object.values(k.urgent).some(Boolean) || POS.some(p => { const n = needOf(p, k); return n != null && n >= 5; })); }
function renderHome() {
  const u = unit();
  const all = u.kids.map(k => ({ k, st: kidState(u, k) }));
  const n = u.kids.length, ex = u.kids.filter(examined).length, absent = u.kids.filter(k => k.status === 'absent').length;
  const lv = { low: 0, high: 0, vhigh: 0 };
  u.kids.filter(examined).forEach(k => { lv[lvlOf(k)]++; });
  const noConsent = u.kids.filter(k => !hasConsent(k)).length;
  const miss = all.filter(x => x.st.miss.length).length, due = all.filter(x => x.st.due.length).length;
  const ref = u.kids.filter(needsReferral).length;
  const schoolNames = u.schools.map(s => s.name).join(', ');
  $('#home').replaceChildren(
    transferBanner(u) || '',
    setupCard(u) || '',
    el('section', {},
      el('div', { class: 'row between' },
        el('div', { class: 'stack' }, el('p', { class: 'eyebrow', text: `${schoolNames} · ลงทะเบียน ${n} คน` }), el('h1', { class: 'h-unit', text: u.name })),
        el('span', { class: 'chip chip--plain' }, el('i', { class: 'key ' + ARM[u.arm].key }), ARM[u.arm].name)),
      el('p', { class: 'small muted', text: `${loadedText()}${u.is_test ? ' · หน่วยทดสอบ ใช้ข้อมูลสมมติเท่านั้น' : ''}` }),
      el('div', { class: 'tiles' },
        tile('ลงทะเบียน', `${n} คน`, noConsent ? `ยังไม่มีความยินยอมครบ ${noConsent} คน` : 'มีความยินยอมครบทุกคน'),
        tileLink('ตรวจครั้งแรกแล้ว', `${ex}/${n}`, absent ? `ขาดเรียนวันตรวจ ${absent} คน` : '', 'absent', 'ดูคนที่ยังไม่ได้ตรวจ →'),
        tile('ความเสี่ยง', `${lv.vhigh} · ${lv.high} · ${lv.low}`, 'สูงมาก · สูง · ต่ำ'),
        tileLink('ต้องส่งต่อหรือรักษาโพรงประสาท', `${ref} คน`, '', 'refneed'),
        tileLink('ขาดบริการตามแผน', `${miss} คน`, 'เลยกำหนดแล้วยังไม่ได้รับ', 'miss'),
        tileLink('ถึงกำหนดเดือนนี้', `${due} คน`, '', 'due')),
      el('div', { class: 'row' },
        el('button', { class: 'btn btn--primary', type: 'button', 'data-go': 'enrol', text: '+ ลงทะเบียนนักเรียน' }),
        el('button', { class: 'btn', type: 'button', 'data-go': 'kids', text: 'รายชื่อนักเรียน' }))),
    moneySection(u),
    cohortSection(u),
    el('section', {},
      el('h3', { text: 'ดาวน์โหลดข้อมูลของหน่วย' }),
      el('p', { class: 'small muted', text: 'ไฟล์ CSV ใช้รหัสวิจัยแทนชื่อ ไม่มีเลขบัตรประชาชน เปิดใน Excel ได้' }),
      exportButtons()),
    el('section', {},
      el('h3', { text: 'อยู่ใน v1.1 และรุ่นถัดไป' }),
      el('ul', { class: 'olist' },
        el('li', { text: 'ตอนนี้ (v1.1): ลงทะเบียน ผลตรวจครั้งแรก แผนการดูแลรายเดือน สมุดผู้ปกครอง บันทึกบริการ กิจกรรมกลุ่ม ส่งเบิกรายเดือน เงินของหน่วยตามอัตราค่าบริการ รายการโอนเงิน ส่ง cohort ดาวน์โหลด CSV' }),
        el('li', { text: 'รุ่นถัดไป: ตรวจรอบ 6 และ 12 เดือน และตัวชี้วัดคุณภาพ' })),
      el('p', { class: 'small' }, el('a', { href: 'guide.html', target: '_blank', rel: 'noopener', text: 'คู่มือการใช้งาน' }), ' · ', el('a', { href: 'guide.pdf', target: '_blank', rel: 'noopener', text: 'คู่มือ PDF (พิมพ์ได้)' }))));
  refreshPay();
}

/* ================================================================ STUDENTS: cards */
function fpmMap(u, k) {
  const box = el('span', { class: 'fpm', 'aria-label': 'ฟันกรามแท้ซี่ที่หนึ่ง' });
  for (const p of [16, 26, 46, 36]) {
    const t = k.teeth ? k.teeth[p] : null;
    let cls = 'f-none', lab = 'ยังไม่ขึ้น';
    if (t && t.t === 'p') {
      const sealed = t.A === 2 || (u.txByKid[k.id] || []).some(x => (x.code === '171' || x.code === '172') && x.tooth === p);
      if (t.B >= 3 && !sealed) { cls = 'f-car'; lab = 'ผุ'; } else if (sealed) { cls = 'f-seal'; lab = 'เคลือบแล้ว'; } else { cls = 'f-need'; lab = 'ต้องเคลือบ'; }
    }
    box.append(el('span', { class: cls, title: `${p} ${lab}`, text: String(p) }));
  }
  return box;
}
function statusChip(k) {
  if (examined(k)) return el('span', { class: 'chip ' + LEVEL[lvlOf(k)].chip, text: LEVEL[lvlOf(k)].th });
  return el('span', { class: 'chip chip--due', text: k.status === 'absent' ? 'ขาดเรียนวันตรวจ' : 'ยังไม่ได้ตรวจ' });   // red stays for no consent (R1-19)
}
function kidCard(u, k, st) {
  const prog = st.total ? st.done / st.total * 100 : 0;
  const m = el('span', { class: 'meter', 'aria-hidden': 'true' }, el('span'));
  m.firstChild.style.width = prog + '%';
  const chips = el('span', { class: 'kc-chips' },
    !hasConsent(k) ? el('span', { class: 'chip chip--stop', text: 'ยังไม่มีความยินยอม' }) : null,
    k.c.coverage === 'none' ? el('span', { class: 'chip chip--plain', text: 'ไม่มีสิทธิรัฐ' }) : null,
    ...st.miss.slice(0, 4).map(x => el('span', { class: 'chip chip--warn', text: x.t })),
    ...st.due.slice(0, 3).map(x => el('span', { class: 'chip chip--due', text: x.t })),
    st.refWait ? el('span', { class: 'chip chip--stop', text: 'ส่งต่อ รอผล' }) : null,
    !st.absent && !st.miss.length && !st.due.length && !st.refWait ? el('span', { class: 'chip chip--ok', text: 'ครบตามแผน' }) : null);
  return el('button', { type: 'button', class: 'kcard', onclick: () => openKid(k.id, examined(k) ? 'plan' : 'exam') },
    el('span', { class: 'kc-top' }, el('span', { class: 'mono kc-id', text: k.id }), statusChip(k)),
    el('span', { class: 'kc-name', text: kidLabel(k) }),
    st.absent ? el('span', { class: 'kc-next', text: k.status === 'absent' ? 'ขาดเรียนวันตรวจ · นัดตรวจเก็บตก' : 'ยังไม่มีผลตรวจครั้งแรก' }) :
      el('span', { class: 'kc-mid' }, fpmMap(u, k), el('span', { class: 'kc-prog' }, el('span', { text: `ทำแล้ว ${st.done}/${st.total} รายการที่ถึงกำหนด` }), m)),
    chips,
    st.next ? el('span', { class: 'kc-next', text: 'ถัดไป: ' + st.next }) : null);
}
const unitClasses = u => [...new Set(u.schools.flatMap(s => s.classes))];
function renderKids() {
  const u = unit();
  const all = u.kids.map(k => ({ k, st: kidState(u, k) }));
  const counts = { miss: 0, due: 0, ref: 0, absent: 0, ok: 0 };
  all.forEach(x => { const f = stFlags(x.st); for (const key in counts) if (f[key]) counts[key]++; });
  $('#kidsSub').textContent = `${u.schools.map(s => s.name).join(', ')} · ${u.kids.length} คน · ${loadedText()}`;
  $('#qchips').replaceChildren(...[['all', 'ทั้งหมด', u.kids.length], ['miss', 'ขาดบริการ', counts.miss], ['due', 'ถึงกำหนดเดือนนี้', counts.due], ['ref', 'ส่งต่อรอผล', counts.ref], ['absent', 'ยังไม่ได้ตรวจ', counts.absent], ['ok', 'ครบตามแผน', counts.ok]].map(([v, lab, n]) =>
    el('button', { type: 'button', 'aria-pressed': String(S.kf.st === v), onclick: () => { S.kf.st = v; renderKids(); } }, lab, el('b', { text: String(n) }))));
  const classes = unitClasses(u);
  $('#kfCls').replaceChildren(el('option', { value: 'all', text: 'ทุกห้อง' }), ...classes.map(c => el('option', { value: c, text: c })));
  $('#kfQ').value = S.kf.q; $('#kfCls').value = S.kf.cls; $('#kfRisk').value = S.kf.risk; $('#kfSt').value = S.kf.st; $('#kfMiss').value = S.kf.miss; $('#kfGroup').value = S.kf.group;
  const q = S.kf.q.trim().toUpperCase();   // IDs are upper case; tablet keyboards type lower case (R1-19)
  const rows = all.filter(({ k, st }) => {
    const f = { ...stFlags(st), refneed: needsReferral(k) };
    if (q && !k.id.toUpperCase().includes(q)) return false;
    if (S.kf.cls !== 'all' && k.cls !== S.kf.cls) return false;
    if (S.kf.risk !== 'all' && (st.absent || lvlOf(k) !== S.kf.risk)) return false;
    if (S.kf.st !== 'all' && !f[S.kf.st]) return false;
    if (S.kf.miss !== 'all' && !st.cats.has(S.kf.miss)) return false;
    return true;
  });
  const groups = new Map();
  const put = (key, title, x) => { if (!groups.has(key)) groups.set(key, { title, items: [] }); groups.get(key).items.push(x); };
  for (const x of rows) {
    if (S.kf.group === 'cls') put(x.k.cls, `ห้อง ${x.k.cls}`, x);
    else if (S.kf.group === 'risk') { const l = x.st.absent ? 'none' : lvlOf(x.k); put(l, l === 'none' ? 'ยังไม่ได้ประเมิน' : LEVEL[l].th, x); }
    else if (S.kf.group === 'miss') { const cs = [...x.st.cats].filter(c => S.kf.miss === 'all' || c === S.kf.miss); if (!cs.length) put('none', CAT_TH.none, x); else cs.forEach(c => put(c, c === 'exam' ? CAT_TH.exam : `ยังไม่ได้รับ: ${CAT_TH[c]}`, x)); }
    else put('all', 'ทั้งหมด', x);
  }
  const order = { cls: classes, risk: ['vhigh', 'high', 'low', 'none'], miss: ['exam', 'seal', 'fl', 'recall', 'tx', 'ref', 'brush', 'none'], none: ['all'] }[S.kf.group];
  const box = $('#kidGroups');
  box.replaceChildren();
  if (!u.kids.length) { box.append(el('p', { class: 'hint', text: 'ยังไม่มีนักเรียนในหน่วยนี้ กด "+ ลงทะเบียนนักเรียน"' })); return; }
  if (!rows.length) { box.append(el('p', { class: 'hint', text: 'ไม่มีนักเรียนตรงกับตัวกรอง ลองล้างตัวกรองด้านบน' })); return; }
  for (const key of [...order, ...[...groups.keys()].filter(x => !order.includes(x))]) {
    const g = groups.get(key); if (!g) continue;
    const nMiss = g.items.filter(x => x.st.miss.length).length;
    box.append(el('section', { class: 'kgroup' },
      el('div', { class: 'kgroup__h' }, el('h3', { text: g.title }), el('span', { class: 'small muted', text: `${g.items.length} คน${S.kf.group === 'cls' ? ` · ขาดบริการ ${nMiss} คน` : ''}` })),
      el('div', { class: 'kcards' }, ...g.items.map(x => kidCard(u, x.k, x.st)))));
  }
}
$('#kfQ').addEventListener('input', e => { S.kf.q = e.target.value; renderKids(); });
[['#kfCls', 'cls'], ['#kfRisk', 'risk'], ['#kfSt', 'st'], ['#kfMiss', 'miss'], ['#kfGroup', 'group']].forEach(([s, key]) => $(s).addEventListener('change', e => { S.kf[key] = e.target.value; renderKids(); }));

/* ================================================================ ENROL / EDIT ENROLMENT (no personal data, D-64) */
function fillClasses(u, schoolId, keep) {
  const s = u.schools.find(x => x.id === schoolId) || u.schools[0];
  $('#enClass').replaceChildren(...(s ? s.classes : []).map(c => el('option', { value: c, text: c })));
  if (keep && s && s.classes.includes(keep)) $('#enClass').value = keep;
}
// The last school and class used for a new child, per unit, so a class is enrolled in one go (R1-08).
const lastClass = u => { try { return JSON.parse(lsGet('dent2-class-' + u.id) || 'null') || {}; } catch (e) { return {}; } };
// Clears everything about the child; school and class stay. Consent and assent are never carried over (R1-08).
function clearChildFields(c = {}) {
  $('#enSex').value = c.sex || '';
  $('#enBym').value = c.birth_ym || '';
  setIf('#enCov', 'value', c.coverage || ''); $('#enUcDate').value = c.uc_checked_on || ''; $('#enUcMethod').value = c.uc_method || ''; covHint();
  $('#enConsent').value = c.consent_on || ''; $('#enAssent').checked = !!c.assent;
  $('#enCond').value = c.conditions || ''; $('#enAgSilver').checked = !!c.allergy_silver; $('#enAgColo').checked = !!c.allergy_colophony;
  beAll($('#enForm'));
}
function renderEnrol() {
  const u = unit();
  const k = S.editId ? u.byId[S.editId] : null;
  $('#enTitle').textContent = k ? `แก้ไขข้อมูลลงทะเบียน · ${k.id}` : 'ลงทะเบียนนักเรียน';
  $('#enSave').textContent = k ? 'บันทึกการแก้ไข' : 'บันทึกการลงทะเบียน';
  setIf('#enSaveNext', 'hidden', !!k);
  $('#enMsg').replaceChildren();
  $('#enDone')?.replaceChildren();
  S.enBatch = [];
  $('#enSchool').replaceChildren(...u.schools.map(s => el('option', { value: s.id, text: s.name })));
  const c = k ? k.c : {}, last = k ? {} : lastClass(u);
  const school = c.school_id || (u.schools.some(s => s.id === last.s) ? last.s : (u.schools[0] && u.schools[0].id)) || '';
  $('#enSchool').value = school;
  $('#enSchool').disabled = !!k;
  fillClasses(u, $('#enSchool').value, k ? c.class : last.c);
  $('#enBym').max = toInput(TODAY).slice(0, 7);
  for (const id of ['#enUcDate', '#enConsent']) $(id).max = toInput(TODAY);
  clearChildFields(c);
}
$('#enSchool').addEventListener('change', e => fillClasses(unit(), e.target.value));
function covHint() {
  const v = $('#enCov') ? $('#enCov').value : '';
  setIf('#enCovHint', 'textContent', v ? `${COV[v].th}${COV[v].ex}: ${COV[v].rule}` : 'ยังไม่ตรวจสิทธิ: ลงทะเบียนและตรวจได้ เลือกสิทธิภายหลังได้ที่ "แก้ไขข้อมูลลงทะเบียน"');
}
$('#enCov')?.addEventListener('change', covHint);
let enNext = false;   // which submit button was used (also for browsers without SubmitEvent.submitter)
$('#enSaveNext')?.addEventListener('click', () => { enNext = true; });
$('#enSave').addEventListener('click', () => { enNext = false; });
$('#enForm').addEventListener('submit', async e => {
  e.preventDefault();
  const u = unit(), k = S.editId ? u.byId[S.editId] : null;
  const next = !k && (e.submitter ? e.submitter.id === 'enSaveNext' : enNext);
  enNext = false;
  const msg = $('#enMsg'); msg.replaceChildren();
  const bad = t => msg.replaceChildren(el('div', { class: 'err', text: t }));
  if (!$('#enClass').value) return bad('เลือกห้องเรียน');
  if (!$('#enSex').value) return bad('เลือกเพศ');
  const bym = $('#enBym').value.trim();
  // type="month" is a plain text box in Firefox and desktop Safari, so check the text (R1-18).
  if (bym && +bym.slice(0, 4) > 2400) return bad('เดือนปีเกิด: ช่องนี้ใช้ปี ค.ศ. (พ.ศ. ลบ 543) เช่น 2019-05');
  if (bym && !/^\d{4}-(0[1-9]|1[0-2])$/.test(bym)) return bad('เดือนปีเกิด: ใส่ปี ค.ศ.-เดือน เช่น 2019-05');
  if (bym && bym > toInput(TODAY).slice(0, 7)) return bad('เดือนปีเกิดอยู่ในอนาคต');
  if ($('#enCov') && !$('#enCov').value && ($('#enUcDate').value || $('#enUcMethod').value)) return bad('เลือกสิทธิการรักษา (ใส่วันที่หรือวิธีตรวจสิทธิไว้แล้ว)');
  for (const [id, lab] of [['#enUcDate', 'วันที่ตรวจสิทธิ'], ['#enConsent', 'วันที่ลงนามยินยอม']]) {
    const p = dateProblem($(id).value, lab); if (p) return bad(p);
  }
  const child = {
    school_id: $('#enSchool').value, class: $('#enClass').value, sex: $('#enSex').value, birth_ym: bym || null,
    consent_on: $('#enConsent').value || null, assent: $('#enAssent').checked, coverage: $('#enCov') ? $('#enCov').value || null : undefined,
    uc_checked_on: $('#enUcDate').value || null, uc_method: $('#enUcMethod').value || null, conditions: $('#enCond').value.trim() || null,
    allergy_silver: $('#enAgSilver').checked, allergy_colophony: $('#enAgColo').checked,
  };
  $('#enSave').disabled = true; setIf('#enSaveNext', 'disabled', true);
  try {
    let id;
    if (k) {
      const { school_id, ...upd } = child;
      const { data, error } = await sb.from('children').update(upd).eq('study_id', k.id).select().single();
      if (error) throw error;
      setChild(k, data);
      id = k.id;
      toast(`บันทึกการแก้ไขแล้ว · ${id}`);
    } else {
      const { data, error } = await sb.rpc('enrol_child', { p_child: child });
      if (error) throw error;
      id = data;
      const { data: c, error: e1 } = await sb.from('children').select('*').eq('study_id', id).single();
      if (e1) throw e1;
      const nk = kidFrom(c, null);
      u.kids.push(nk); u.byId[id] = nk; sortKids(u);
      S.newId = id;
      lsSet('dent2-class-' + u.id, JSON.stringify({ s: child.school_id, c: child.class }));
      S.enBatch.push(id);
    }
    if (next) {
      // Stay on the form for the next child of the same class (R1-08).
      S.newId = null;
      clearChildFields();
      // The banner sits above the form so a phone shows it with the next child's first field (R2-03).
      const done = $('#enDone') || msg;
      done.replaceChildren(el('div', { class: 'ok' }, el('b', { text: `ลงทะเบียนแล้ว ${id}` }), ' · เขียนรหัสนี้ข้างชื่อเด็กในรายชื่อของหน่วย',
        el('div', { class: 'tiny', style: 'margin-top:4px', text: `รหัสที่ออกรอบนี้ (${S.enBatch.length} คน): ${S.enBatch.join(', ')}` })));
      toast(`ลงทะเบียนแล้ว ${id} · ${child.class}`);
      done.scrollIntoView({ block: 'start' });
      $('#enSex').focus({ preventScroll: true });
    } else {
      S.editId = null; S.kid = id; S.ftab = 'exam';
      show('file');
    }
  } catch (err) { bad('บันทึกไม่สำเร็จ · ' + errText(err)); }
  $('#enSave').disabled = false; setIf('#enSaveNext', 'disabled', false);
});

/* ================================================================ CHILD FILE */
function ageText(k, d) {
  if (!k.birth) return 'ไม่ได้บันทึกเดือนปีเกิด';
  let m = (d.getFullYear() - k.birth.getFullYear()) * 12 + d.getMonth() - k.birth.getMonth();
  if (d.getDate() < k.birth.getDate()) m--;
  return `ราว ${Math.floor(m / 12)} ปี ${m % 12} เดือน`;
}
function renderFile() {
  const u = unit();
  const ks = $('#kidSel');
  if (!u.kids.length) {
    ks.replaceChildren();
    $('#fileHead').replaceChildren(el('p', { class: 'hint', text: 'ยังไม่มีนักเรียน ลงทะเบียนก่อนที่หน้า "นักเรียน"' }));
    for (const ft of ['exam', 'plan', 'tx']) $('#fp-' + ft).hidden = true;
    setIf('#fileTabs', 'hidden', true);
    return;
  }
  if (S.kid && !u.byId[S.kid]) S.kid = null;
  ks.replaceChildren(el('option', { value: '', text: '– เลือกนักเรียน –' }), ...u.kids.map(k => el('option', { value: k.id, text: `${k.id} · ${kidLabel(k)}${examined(k) ? '' : ' · ยังไม่ได้ตรวจ'}` })));
  ks.value = S.kid || '';
  // No child is opened by default; the first child in the list is rarely the one in the chair (R1-19).
  setIf('#fileTabs', 'hidden', !S.kid);
  if (!S.kid) {
    $('#fileHead').replaceChildren(el('p', { class: 'hint', text: 'เลือกนักเรียนจากช่อง "เปิดแฟ้ม" หรือหน้า "นักเรียน"' }));
    for (const ft of ['exam', 'plan', 'tx']) $('#fp-' + ft).hidden = true;
    hideSaveBar();
    return;
  }
  renderFileHead();
  for (const ft of ['exam', 'plan', 'tx']) { $('#fp-' + ft).hidden = S.ftab !== ft; $('#ft-' + ft).setAttribute('aria-selected', String(S.ftab === ft)); }
  if (S.ftab === 'exam') renderExam(); else if (S.ftab === 'plan') renderPlanGrid(); else renderKidTx();
  syncSaveBar();
}
$('#kidSel').addEventListener('change', e => { const id = e.target.value; e.target.value = S.kid || ''; if (id) openKid(id); });
function renderFileHead() {
  const u = unit(), k = curKid(), st = kidState(u, k);
  const kv = (label, value, cls) => el('div', { class: 'kv' + (cls ? ' ' + cls : '') }, el('span', { text: label }), el('b', {}, value));
  const school = u.schools.find(s => s.id === k.c.school_id);
  const fresh = S.newId === k.id;
  S.newId = null;
  fill($('#fileHead'),
    fresh ? el('div', { class: 'ok' }, el('b', { text: `ลงทะเบียนแล้ว รหัสนักเรียน ${k.id}` }), ' · เขียนรหัสนี้ไว้ข้างชื่อเด็กในรายชื่อของหน่วย ระบบไม่เก็บชื่อเด็ก') : null,
    el('div', { class: 'childbar' },
      kv('รหัสนักเรียน', el('span', { class: 'mono big-id', text: k.id })), kv('ชั้น', `${k.cls} · ${school ? school.name : ''}`), kv('เพศ', sexTh(k) || '–'),
      kv(examined(k) ? 'อายุ ณ วันตรวจ' : 'อายุวันนี้', ageText(k, k.base || TODAY)),
      kv('ความเสี่ยง', examined(k) ? el('span', { class: 'chip ' + LEVEL[lvlOf(k)].chip, text: `${LEVEL[lvlOf(k)].th} (${riskScore(k)})` }) : statusChip(k)),
      kv('ทำตามแผนถึงเดือนนี้', st.absent ? '–' : `${st.done}/${st.total} รายการ`, 'noprint')),
    !hasConsent(k) ? el('div', { class: 'alert', text: '⛔ ยังไม่มีความยินยอมของผู้ปกครองและเด็กครบ จึงบันทึกผลตรวจไม่ได้ กด "แก้ไขข้อมูลลงทะเบียน" เพื่อใส่วันที่ลงนามและติ๊กความยินยอมของเด็ก' }) : null,
    el('details', {}, el('summary', { text: 'ข้อมูลลงทะเบียน' }),
      el('div', { class: 'childbar', style: 'margin-top:10px' },
        kv('เดือนปีเกิด', k.birth ? thMon(k.birth) : '–'),
        kv('สิทธิการรักษา', `${covText(k.c)}${k.c.coverage && k.c.uc_method ? ' (' + k.c.uc_method + ')' : ''}${k.c.coverage && k.c.uc_checked_on ? ' ' + thShort(fromInput(k.c.uc_checked_on)) : ''}`),
        kv('ความยินยอม', `${k.c.consent_on ? 'ผู้ปกครองลงนาม ' + thShort(fromInput(k.c.consent_on)) : 'ผู้ปกครองยังไม่ลงนาม'} · ${k.c.assent ? 'เด็กยินยอม' : 'เด็กยังไม่ยินยอม'}`),
        kv('โรคประจำตัว · การแพ้', `${k.c.conditions || 'ไม่มี'} · ${[k.c.allergy_silver ? 'แพ้เงิน (ห้าม SDF)' : '', k.c.allergy_colophony ? 'แพ้โคโลโฟนี' : ''].filter(Boolean).join(', ') || 'ไม่มี'}`)),
      el('div', { class: 'row', style: 'margin-top:10px' }, el('button', { class: 'btn', type: 'button', text: 'แก้ไขข้อมูลลงทะเบียน', onclick: () => { if (dirtyGuard()) { S.editId = k.id; show('enrol'); } } }),
        !unit().cohort_submitted_at ? el('button', { class: 'btn btn--danger', type: 'button', id: 'delKidBtn', text: 'ลบแฟ้มนักเรียนนี้', onclick: () => deleteChild(k) }) : null)));
  if (!hasConsent(k)) $('#fileHead details').open = true;
}

// Deletes a child enrolled by mistake or for practice, with its exams and services, until the cohort is sent.
async function deleteChild(k) {
  const u = unit();
  const ans = prompt(`ลบแฟ้มนักเรียน ${k.id} พร้อมผลตรวจและบริการที่บันทึกไว้ทั้งหมด\nใช้กับข้อมูลที่บันทึกผิดหรือข้อมูลซ้อม ลบแล้วหน่วยกู้คืนเองไม่ได้\nพิมพ์รหัส ${k.id} เพื่อยืนยัน`);
  if (ans == null) return;
  if (ans.trim() !== k.id) { toast('รหัสไม่ตรง ยังไม่ได้ลบ'); return; }
  const { error } = await sb.rpc('delete_child', { p_study_id: k.id });
  if (error) { toastErr(error); return; }
  u.kids = u.kids.filter(x => x !== k); delete u.byId[k.id]; u.tx = u.tx.filter(t => t.kid !== k.id); reindex(u);
  k.dirty = false; k.editing = false; S.kid = null; hideSaveBar();
  toast(`ลบแฟ้ม ${k.id} แล้ว`);
  show('kids');
}

/* ---- exam */
function startExam(k) {
  const u = unit();
  k.editing = true; k.dirty = true;
  k.teeth = typicalMouth(); k.risk = {}; k.pigi = emptyPigi(); k.pigiSkip = false; k.showMiss = false; k.urgent = { pain: false, swell: false, big: false }; k.needOv = {}; k.ovReason = {}; k.flOv = null;
  // The examiner is the chosen "ผู้บันทึก" or nobody: never the first code in the list (R1-02).
  k.examDate = new Date(TODAY); k.examiner = u.examiners.includes(S.prov) ? S.prov : ''; k.place = 'van';
  S.sel = 16;
  renderFile();
}
async function markAbsent(k) {
  const u = unit();
  if (!needProv()) return;
  const row = { study_id: k.id, unit_id: u.id, round: 'baseline', exam_date: toInput(TODAY), attended: false, examiner_code: S.prov || null };
  const res = k.exam ? await sb.from('exams').update(row).eq('id', k.exam.id).select().single() : await sb.from('exams').insert(row).select().single();
  if (res.error) return toastErr(res.error);
  applyExam(k, res.data);
  toast(`บันทึกแล้ว · ${k.id} ขาดเรียนวันตรวจ`);
  renderFile();
}
function discardExam(k) { applyExam(k, k.exam); hideSaveBar(); }
function renderExam() {
  const u = unit(), k = curKid();
  const open = examined(k) || k.editing;
  const box = $('#examStart'); box.replaceChildren();
  $('#examBody').hidden = !open;
  if (!open) {
    if (!hasConsent(k)) { box.append(el('p', { class: 'hint', text: 'ยังไม่มีความยินยอมครบ บันทึกผลตรวจไม่ได้ แก้ไขข้อมูลลงทะเบียนก่อน' })); return; }
    box.append(el('section', {}, el('div', { class: 'card stack' },
      el('h3', { text: k.status === 'absent' ? `ขาดเรียนวันตรวจ (${thShort(k.examDate)})` : 'ยังไม่มีผลตรวจครั้งแรก' }),
      el('p', { class: 'small muted', text: 'ผลตรวจครั้งแรกบันทึกในระบบโดยตรง แผนการดูแลสร้างหลังกดบันทึกผลตรวจ' }),
      el('div', { class: 'row' },
        el('button', { class: 'btn btn--primary', type: 'button', text: k.status === 'absent' ? 'บันทึกผลตรวจเก็บตก' : 'เริ่มบันทึกผลตรวจครั้งแรก', onclick: () => startExam(k) }),
        k.status === 'new' ? el('button', { class: 'btn', type: 'button', text: 'นักเรียนขาดเรียนวันตรวจ', onclick: () => markAbsent(k) }) : null))));
    return;
  }
  if (k.editing) box.append(el('p', { class: 'note', text: 'ผลตรวจใหม่ ตั้งต้นจาก "ช่องปากเด็ก 7 ปีปกติ" แก้เฉพาะซี่ที่ต่าง ตอบแบบประเมินความเสี่ยงให้ครบ 8 ข้อ กรอก PI/GI ให้ครบ (หรือติ๊กว่าไม่ได้ตรวจ) แล้วกด "บันทึกผลตรวจ" ที่แถบด้านล่าง' }));
  const answered = riskAnswered(k), score = riskScore(k), lvl = riskLevel(score);
  $('#vDate').value = k.examDate ? toInput(k.examDate) : ''; $('#vDate').max = toInput(TODAY);
  beHint($('#vDate'));
  $('#vExam').replaceChildren(el('option', { value: '', text: '– เลือกรหัสผู้ตรวจ –' }), ...u.examiners.map(c => el('option', { value: c, text: c })));
  $('#vExam').value = k.examiner || '';
  // After a failed save every missing item stays marked until it is filled (R1-04).
  $('#vExam').classList.toggle('is-missing', k.showMiss && !k.examiner);
  $('#vDate').classList.toggle('is-missing', k.showMiss && !!examDateProblem(k));
  $('#vPlace').value = k.place || 'van';
  for (const b of $$('#urgent input')) b.checked = !!k.urgent[b.dataset.u];
  const urg = Object.values(k.urgent).some(Boolean);
  const refTeeth = POS.filter(p => { const n = needOf(p, k); return n != null && n >= 5; }).map(p => toothNo(p, k.teeth[p]));
  const um = $('#urgentMsg'); um.replaceChildren();
  if (urg) um.append(el('div', { class: 'alert', text: '⛔ ต้องได้รับการรักษาเร่งด่วน ระบบเพิ่มรายการส่งต่อในแผน ไม่ใช้ฟลูออไรด์หรือ SDF เป็นการรักษาเดียว' }));
  else if (refTeeth.length) um.append(el('div', { class: 'hint', text: `ฟัน ${refTeeth.join(', ')} ต้องประเมินโพรงประสาทฟัน ระบบเพิ่มรายการในแผน (ทำในหน่วยหรือส่งต่อ)` }));
  const body = $('#riskBody'); body.replaceChildren();
  for (const q of RISK) {
    if (q.sec) { body.append(el('tr', { class: 'sec' }, el('th', { colspan: '2', scope: 'colgroup', text: q.sec }))); continue; }
    const seg = el('div', { class: 'seg', role: 'group', 'aria-label': q.q });
    for (const [v, lab, sc] of [['y', 'ใช่', q.y], ['n', 'ไม่ใช่', q.n]]) seg.append(el('button', { type: 'button', 'data-v': v, 'aria-pressed': String(k.risk[q.id] === v), text: `${lab} = ${sc}`, onclick: () => { k.risk[q.id] = v; afterExamChange(); refocus('#riskBody .seg', q.q, `button[data-v="${v}"]`); } }));
    body.append(el('tr', { class: k.showMiss && !k.risk[q.id] ? 'is-missing' : null }, el('td', { text: q.q }), el('td', { class: 'num' }, seg)));
  }
  $('#riskTotal').textContent = answered === 8 ? score : `– (ตอบ ${answered}/8)`;
  $('#riskChip').replaceChildren(answered === 8 ? el('span', { class: 'chip ' + LEVEL[lvl].chip, text: `${score} คะแนน · ${LEVEL[lvl].th}` }) : el('span', { class: 'chip chip--warn', text: `ตอบแล้ว ${answered}/8 ข้อ` }));
  $$('#riskBand div').forEach(d => d.classList.toggle('on', answered === 8 && d.dataset.l === lvl));
  const rh = $('#riskHint'); rh.replaceChildren();
  const activeOrCav = POS.some(p => { const t = k.teeth[p]; return t.t !== 'n' && ((t.B >= 1 && t.B <= 4 && t.act === 'a') || t.B >= 5); });
  if (activeOrCav && k.risk.r2 !== 'y') rh.append(el('div', { class: 'hint', text: 'แผนภูมิฟันพบรอยโรคที่กำลังลุกลามหรือรูผุ แต่ข้อ "พบรอยโรคฟันผุขาวขุ่นระยะลุกลาม" ยังไม่ได้ตอบว่าใช่ โปรดตรวจสอบ' }));
  for (const [id, arr] of [['#archU', UPPER], ['#archL', LOWER]]) $(id).replaceChildren(...arr.map((pos, i) => toothCell(pos, k, i === 6)));
  renderEditor();
  renderPigi(k);
  renderSummary(k, lvl, score, urg, refTeeth, answered);
}
// After a re-render, put focus back on the same control (matched by aria-label) so Tab keeps working (R2-06).
function refocus(sel, label, inner) {
  const box = $$(sel).find(x => x.getAttribute('aria-label') === label);
  const target = box && inner ? box.querySelector(inner) : box;
  if (target) target.focus({ preventScroll: true });
}
function afterExamChange() { const k = curKid(); k.dirty = true; renderFileHead(); renderExam(); syncSaveBar(); }
$('#vDate').addEventListener('change', e => { const k = curKid(); k.examDate = fromInput(e.target.value); afterExamChange(); });
$('#vExam').addEventListener('change', e => { const k = curKid(); k.examiner = e.target.value; afterExamChange(); });
$('#vPlace').addEventListener('change', e => { const k = curKid(); k.place = e.target.value; afterExamChange(); });
function setPresence(k, pos, v) {
  const t = k.teeth[pos];
  if (v === 'n') Object.assign(t, { t: 'n', A: 99, B: null, act: null, occ: undefined, partial: false });
  else Object.assign(t, { t: v, A: 0, B: 0, act: null, occ: undefined });
  delete k.needOv[pos]; delete k.ovReason[pos];
  S.sel = pos;
  afterExamChange();
}
function toothCell(pos, k, mid) {
  const t = k.teeth[pos];
  const pres = el('div', { class: 'pres' },
    PRIM[pos] ? el('button', { type: 'button', class: 'pno' + (t.t === 'd' ? ' on' : ''), 'aria-pressed': String(t.t === 'd'), 'aria-label': `ฟันน้ำนม ${PRIM[pos]} ${t.t === 'd' ? 'พบในช่องปาก แตะเพื่อยกเลิก' : 'แตะเพื่อวงกลม'}`, onclick: () => setPresence(k, pos, t.t === 'd' ? 'n' : 'd'), text: String(PRIM[pos]) }) : el('span', { class: 'pno pno--blank', 'aria-hidden': 'true', text: '·' }),
    el('button', { type: 'button', class: 'pno' + (t.t === 'p' ? ' on' : ''), 'aria-pressed': String(t.t === 'p'), 'aria-label': `ฟันแท้ ${pos} ${t.t === 'p' ? 'พบในช่องปาก แตะเพื่อยกเลิก' : 'แตะเพื่อวงกลม'}`, onclick: () => setPresence(k, pos, t.t === 'p' ? 'n' : 'p'), text: String(pos) }));
  let cls = 'tcode', codes, need = '', label, decay = null;
  if (t.t === 'n') { cls += ' is-none'; codes = String(t.A); label = `ตำแหน่ง ${pos}: ${CODE_N[t.A]}`; }
  else {
    const n = needOf(pos, k);
    codes = `${t.A}·${t.B}`; need = n == null ? '' : String(n);
    if (t.B >= 5) cls += ' sev-high'; else if (t.B >= 3) cls += ' sev-mid'; else if (t.B >= 1) cls += ' sev-low';
    else if (t.A === 1 || t.A === 2) cls += ' is-sealed'; else if (t.A >= 3 && t.A <= 8) cls += ' is-restored';
    if (n >= 5) cls += ' need-ref';
    if (t.B >= 3) decay = el('span', { class: 'decay', 'aria-hidden': 'true', text: 'ผุ' });
    label = `ซี่ ${toothNo(pos, t)} ${t.t === 'd' ? 'ฟันน้ำนม' : 'ฟันแท้'} Code A ${t.A} ICDAS ${t.B}${t.B >= 3 ? ' ผุ' : ' ไม่ผุ'} ความต้องการ ${NEED[n]}`;
  }
  const btn = el('button', { type: 'button', class: cls, 'aria-label': label, onclick: () => { S.sel = pos; renderExam(); $('#editor').scrollIntoView({ block: 'nearest' }); } }, el('span', { class: 'tooth__codes', text: codes }), el('span', { class: 'tooth__need', text: need }), decay);
  return el('div', { class: 'tooth' + (FPM.includes(pos) ? ' is-fpm' : '') + (S.sel === pos ? ' is-sel' : '') + (mid ? ' mid' : '') }, pres, btn);
}
function codeButtons(values, current, onPick, labels, sugg) {
  const wrap = el('div', { class: 'codes' });
  for (const v of values) { const b = el('button', { type: 'button', 'aria-pressed': String(current === v), title: labels[v], text: String(v), onclick: () => onPick(v) }); if (sugg === v) b.classList.add('sugg'); wrap.append(b); }
  return wrap;
}
const OV_REASONS = ['ดุลยพินิจทางคลินิก', 'เด็กไม่ให้ความร่วมมือ', 'ผู้ปกครองปฏิเสธ', 'ส่งต่อแล้ว'];
function renderEditor() {
  const k = curKid(), pos = S.sel, box = $('#editor');
  box.replaceChildren();
  const t = k.teeth[pos];
  const set = patch => { Object.assign(t, patch); delete k.needOv[pos]; delete k.ovReason[pos]; afterExamChange(); };
  const typeSeg = el('div', { class: 'seg', role: 'group', 'aria-label': 'ซี่ที่พบ' });
  const types = [];
  if (PRIM[pos]) types.push(['d', `ฟันน้ำนม ${PRIM[pos]}`]);
  types.push(['p', `ฟันแท้ ${pos}`], ['n', 'ไม่มีฟัน / ยังไม่ขึ้น']);
  for (const [v, lab] of types) typeSeg.append(el('button', { type: 'button', 'aria-pressed': String(t.t === v), text: lab, onclick: () => setPresence(k, pos, v) }));
  // Step through the chart without scrolling back up, in chart order 16→26 then 46→36 (R1-06).
  const step = d => { const i = POS.indexOf(S.sel); S.sel = POS[(i + d + POS.length) % POS.length]; renderExam(); };
  const head = el('div', { class: 'stack' },
    el('div', { class: 'row between', style: 'gap:8px' },
      el('h4', { text: `ตำแหน่ง ${pos}${FPM.includes(pos) ? ' · ฟันกรามแท้ซี่ที่หนึ่ง' : ''}` }),
      el('span', { class: 'row', style: 'gap:6px' },
        el('button', { class: 'btn btn--ghost', type: 'button', id: 'toothPrev', text: '← ซี่ก่อนหน้า', onclick: () => step(-1) }),
        el('button', { class: 'btn btn--ghost', type: 'button', id: 'toothNext', text: 'ซี่ถัดไป →', onclick: () => step(1) }))),
    el('span', { class: 'small muted', text: 'ซี่ที่พบ (เท่ากับการวงกลมเลขซี่ในแบบกระดาษ)' }), typeSeg);
  if (t.t === 'n') {
    head.append(el('span', { class: 'small muted', text: 'เหตุผล' }), codeButtons([99, 97, 98, 96], t.A, v => set({ A: v }), CODE_N), el('p', { class: 'codedesc', text: CODE_N[t.A] }));
    box.append(el('div', { class: 'editor' }, head));
    return;
  }
  head.append(el('span', { class: 'small muted', text: 'ผุหรือไม่' }),
    el('span', {}, t.B >= 3 ? el('span', { class: 'chip chip--crit', text: `ผุ (ICDAS ${t.B})` }) : el('span', { class: 'chip chip--ok', text: `ไม่ผุ (ICDAS ${t.B})` })),
    el('p', { class: 'codedesc', text: t.t === 'd' ? 'ฟันน้ำนม: ใช้คำนวณ dmft และตัวชี้วัดฟันน้ำนมสูญเสียก่อนกำหนด การรักษาฟันน้ำนมไม่นับในงบโครงการ' : 'ฟันแท้: ใช้คำนวณ DMFT และฟันผุใหม่ในฟันกรามแท้' }));
  const colA = el('div', { class: 'stack' },
    el('span', { class: 'small muted', text: 'Code A · การอุด / เคลือบหลุมร่องฟัน' }),
    codeButtons([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], t.A, v => set({ A: v }), CODE_A),
    el('p', { class: 'codedesc', text: CODE_A[t.A] }),
    el('span', { class: 'small muted', text: 'Code B · รอยผุ ICDAS (ด้านที่รุนแรงที่สุด)' }),
    codeButtons([0, 1, 2, 3, 4, 5, 6], t.B, v => set({ B: v, act: v === 0 ? null : (t.act || 'a'), occ: t.occ != null && t.occ > v ? v : t.occ }), CODE_B),
    el('p', { class: 'codedesc', text: CODE_B[t.B] }));
  if (FPM.includes(pos) && t.t === 'p') {
    const occ = t.occ ?? t.B;
    colA.append(el('span', { class: 'small muted', text: 'ด้านบดเคี้ยว · ICDAS (เฉพาะฟันกรามแท้ซี่ที่หนึ่ง)' }),
      codeButtons([0, 1, 2, 3, 4, 5, 6], occ, v => { t.occ = v; if (v > t.B) { t.B = v; t.act = t.act || 'a'; } delete k.needOv[pos]; afterExamChange(); }, CODE_B),
      el('label', { class: 'chk' }, el('input', { type: 'checkbox', id: 'partialChk', checked: !!t.partial, onchange: e => { t.partial = e.target.checked; afterExamChange(); } }), 'ขึ้นไม่เต็มซี่ (นับเป็นฟันที่ขึ้นแล้ว)'));
  }
  if (t.B >= 1) {
    const act = el('div', { class: 'seg', role: 'group', 'aria-label': 'กิจกรรมของรอยโรค' });
    for (const [v, lab] of [['a', 'กำลังลุกลาม (active)'], ['i', 'หยุดลุกลาม (inactive)']]) act.append(el('button', { type: 'button', 'aria-pressed': String(t.act === v), text: lab, onclick: () => { t.act = v; afterExamChange(); } }));
    colA.append(el('span', { class: 'small muted', text: 'กิจกรรมของรอยโรค' }), act);
  }
  const lvl = lvlOf(k), sugg = suggestNeed(pos, t, lvl), cur = needOf(pos, k), ov = k.needOv[pos] != null;
  const colN = el('div', { class: 'stack' },
    el('span', { class: 'small muted', text: 'ความต้องการการรักษา' }),
    codeButtons([0, 1, 2, 3, 4, 5, 6, 7, 8], cur, v => { if (v === sugg) { delete k.needOv[pos]; delete k.ovReason[pos]; } else { k.needOv[pos] = v; k.ovReason[pos] ||= OV_REASONS[0]; } afterExamChange(); }, NEED, sugg),
    el('p', { class: 'codedesc', text: `${NEED[cur]} · ระบบแนะนำ: ${sugg} ${NEED[sugg]} (กรอบสีส้ม)` }));
  if (ov) {
    const sel = el('select', { 'aria-label': 'เหตุผลที่เลือกต่างจากระบบ', onchange: e => { k.ovReason[pos] = e.target.value; k.dirty = true; syncSaveBar(); } }, ...OV_REASONS.map(x => el('option', { value: x, text: x })));
    sel.value = k.ovReason[pos] || OV_REASONS[0];
    colN.append(el('div', { class: 'hint' }, 'ผู้ตรวจเลือกต่างจากที่ระบบแนะนำ บันทึกเหตุผล: ', sel));
  }
  box.append(el('div', { class: 'editor' }, head, colA, colN));
}
// One tap must not wipe a finished chart (R1-06).
$('#presetBtn').addEventListener('click', () => {
  const k = curKid();
  if ((JSON.stringify(k.teeth) !== JSON.stringify(typicalMouth()) || Object.keys(k.needOv).length) && !confirm('ล้างแผนภูมิฟันทั้ง 24 ซี่กลับเป็นค่าเริ่มต้นหรือไม่ สิ่งที่แก้ไว้ในแผนภูมิจะหายไป')) return;
  k.teeth = typicalMouth(); k.needOv = {}; k.ovReason = {}; afterExamChange();
});
$$('#urgent input').forEach(b => b.addEventListener('change', () => { curKid().urgent[b.dataset.u] = b.checked; afterExamChange(); }));
// PI/GI: all 12 boxes filled, or "ไม่ได้ตรวจ PI/GI ครั้งนี้" ticked (then saved as {}) (R1-14).
function renderPigi(k) {
  const tb = $('#pigiBody'); tb.replaceChildren();
  setIf('#pigiSkip', 'checked', !!k.pigiSkip);
  for (const [idx, lab] of [['pi', 'PI คราบจุลินทรีย์'], ['gi', 'GI เหงือกอักเสบ']]) {
    const tr = el('tr', {}, el('th', { scope: 'row', text: lab }));
    for (const t of PIGI_TEETH) {
      const cur = k.pigi[t][idx];
      tr.append(el('td', { class: 'num' }, el('select', {
        'aria-label': `${idx.toUpperCase()} ${t}`, disabled: k.pigiSkip ? true : null, class: k.showMiss && !k.pigiSkip && cur == null ? 'is-missing' : null,
        onchange: e => { const lab = e.target.getAttribute('aria-label'); k.pigi[t][idx] = e.target.value === '' ? null : +e.target.value; k.dirty = true; renderExam(); syncSaveBar(); refocus('#pigiBody select', lab); },
      }, el('option', { value: '', text: '–', selected: cur == null }), ...[0, 1, 2, 3].map(v => el('option', { value: String(v), text: String(v), selected: cur === v })))));
    }
    tr.append(el('td', { class: 'num', text: k.pigiSkip ? 'ไม่ได้ตรวจ' : pigiMean(k, idx) }));
    tb.append(tr);
  }
}
$('#pigiSkip')?.addEventListener('change', e => { const k = curKid(); if (!k) return; k.pigiSkip = e.target.checked; afterExamChange(); });
function indices(k) {
  let d = 0, m = 0, f = 0, D = 0, M = 0, F = 0;
  for (const p of POS) {
    const t = k.teeth[p];
    if (t.t === 'n') { if (t.A === 97) { if (PRIM[p] && !PERM_EARLY.includes(p)) m++; else M++; } continue; }
    const filled = t.A >= 3 && t.A <= 8;
    if (t.t === 'd') { if (t.B >= 3) d++; else if (filled) f++; } else { if (t.B >= 3) D++; else if (filled) F++; }
  }
  return { dmft: d + m + f, DMFT: D + M + F, d, D };
}
function renderSummary(k, lvl, score, urg, refTeeth, answered) {
  const kv = (label, value) => el('div', { class: 'kv' }, el('span', { text: label }), el('b', { text: value }));
  const ix = indices(k);
  const perm = POS.filter(p => k.teeth[p].t === 'p');
  const fpmUp = FPM.filter(p => k.teeth[p].t === 'p').length;
  const part = FPM.filter(p => k.teeth[p].t === 'p' && k.teeth[p].partial).length;
  const fpmSeal = FPM.filter(p => k.teeth[p].t === 'p' && needOf(p, k) === 2).length;
  const nPigi = pigiFilled(k);
  const pigiText = k.pigiSkip ? 'ไม่ได้ตรวจ' : nPigi ? `${pigiMean(k, 'pi')} · ${pigiMean(k, 'gi')}${nPigi < 12 ? ` (กรอก ${nPigi}/12)` : ''}` : 'ยังไม่ได้กรอก';
  const d0 = k.examDate || TODAY;
  $('#summary').replaceChildren(
    kv('ระดับความเสี่ยง', answered === 8 ? `${LEVEL[lvl].th} (${score})` : `ยังตอบไม่ครบ (${answered}/8)`), kv('dmft (ฟันน้ำนม)', String(ix.dmft)), kv('DMFT (ฟันแท้)', String(ix.DMFT)),
    kv('ฟันแท้ที่ขึ้นแล้ว', `${perm.length} ซี่ (ฟันกรามแท้ ${fpmUp}${part ? ` · ไม่เต็มซี่ ${part}` : ''} · ฟันหน้า ${perm.length - fpmUp})`),
    kv('ฟันผุ (ICDAS ≥3)', `ฟันแท้ ${ix.D} · ฟันน้ำนม ${ix.d} ซี่`), kv('ฟันกรามแท้ที่ต้องเคลือบ', `${fpmSeal} ซี่`),
    kv('PI · GI เฉลี่ย', pigiText), kv('นัดตรวจซ้ำ', answered === 8 ? thDate(addMonths(d0, LEVEL[lvl].recall)) : '–'),
    kv('ต้องส่งต่อหรือไม่', urg || refTeeth.length ? `ใช่ · ${refTeeth.join(', ') || 'อาการเร่งด่วน'}` : 'ไม่'));
}

/* ---- save bar and saving */
const examDateProblem = k => (!k.examDate ? 'ใส่วันที่ตรวจ' : dateProblem(toInput(k.examDate), 'วันที่ตรวจ'));
// Everything that still blocks saving the exam, in screen order.
function examProblems(k) {
  const out = [], a = riskAnswered(k), n = pigiFilled(k), dp = examDateProblem(k);
  if (dp) out.push(dp);
  if (!k.examiner) out.push('ยังไม่ได้เลือกรหัสผู้ตรวจ');
  if (a < 8) out.push(`แบบประเมินความเสี่ยงตอบแล้ว ${a}/8 ข้อ`);
  if (!k.pigiSkip && n < 12) out.push(`PI/GI กรอกแล้ว ${n}/12 ช่อง (หรือติ๊ก "ไม่ได้ตรวจ PI/GI ครั้งนี้")`);
  return out;
}
// The save bar always says what is left (R1-04).
function syncSaveBar() {
  const k = S.tab === 'file' ? curKid() : null;
  const on = !!(k && k.dirty && k.risk && k.pigi);
  $('#saveBar').hidden = !on;
  if (!on) return;
  const left = examProblems(k).length;
  $('#saveMsg').textContent = `ยังไม่บันทึก · แบบประเมิน ${riskAnswered(k)}/8 ข้อ · PI/GI ${k.pigiSkip ? 'ไม่ได้ตรวจ' : pigiFilled(k) + '/12'} · ผู้ตรวจ ${k.examiner || 'ยังไม่เลือก'}${left ? '' : ' · ครบแล้ว กดบันทึกผลตรวจ'}`;
}
function hideSaveBar() { $('#saveBar').hidden = true; }
$('#discardBtn').addEventListener('click', () => { const k = curKid(); if (!k) return; discardExam(k); toast('ยกเลิกการแก้ไขแล้ว'); renderFile(); });
$('#saveExamBtn').addEventListener('click', saveExam);
async function saveExam() {
  const u = unit(), k = curKid();
  if (!k || !k.dirty) return;
  if (!hasConsent(k)) { toast('ยังไม่มีความยินยอมครบ บันทึกผลตรวจไม่ได้'); return; }
  const probs = examProblems(k);
  if (probs.length) {
    // Mark every missing item and bring the first one into view (R1-04).
    k.showMiss = true;
    if (S.ftab !== 'exam') { S.ftab = 'exam'; renderFile(); } else renderExam();
    toast('ยังบันทึกไม่ได้ · ' + probs.join(' · '), 6000);
    const first = $('#examBody .is-missing');
    if (first) { first.scrollIntoView({ block: 'center' }); if (first.tagName !== 'TR') first.focus({ preventScroll: true }); }
    return;
  }
  const teeth = {};
  for (const pos of POS) {
    const t = k.teeth[pos];
    const o = { t: t.t, A: t.A, B: t.t === 'n' ? null : t.B, act: t.t === 'n' || !(t.B >= 1) ? null : (t.act || 'a') };
    if (FPM.includes(pos) && t.t === 'p') { if (t.occ != null) o.occ = t.occ; o.partial = !!t.partial; }
    o.need = t.t === 'n' ? null : needOf(pos, k);
    teeth[pos] = o;
  }
  const ovReason = Object.fromEntries(Object.keys(k.needOv).map(p => [p, k.ovReason[p] || OV_REASONS[0]]));
  const row = { study_id: k.id, unit_id: u.id, round: 'baseline', exam_date: toInput(k.examDate), place: k.place, examiner_code: k.examiner, attended: true,
    risk: k.risk, teeth, pigi: k.pigiSkip ? {} : k.pigi, urgent: k.urgent, need_override: k.needOv, override_reason: ovReason, fl_override: k.flOv };
  $('#saveExamBtn').disabled = true;
  const res = k.exam ? await sb.from('exams').update(row).eq('id', k.exam.id).select().single() : await sb.from('exams').insert(row).select().single();
  $('#saveExamBtn').disabled = false;
  if (res.error) { toastErr(res.error); return; }
  const first = !k.exam || !k.exam.attended;
  const oldDate = k.exam && k.exam.attended ? k.exam.exam_date : null;
  applyExam(k, res.data);
  hideSaveBar();
  let note = '';
  if (!first && oldDate && oldDate !== res.data.exam_date) note = await moveExamService(u, k, res.data.exam_date);
  if (first && !(u.txByKid[k.id] || []).some(t => t.code === '174' || t.code === '173')) {
    // The first exam is itself service 174, month 1, by the examiner on the exam date (team decision on R1-03).
    let err = null;
    const ok = await insertServices([{ unit_id: u.id, study_id: k.id, code: '174', tooth: null, service_date: toInput(k.examDate), plan_key: 'exam', plan_month: 1,
      from_plan: true, provider: k.examiner, status: u.arm === 'cap' ? 'recorded' : 'draft' }], e => { err = e; });
    note = ok ? ` · บันทึกบริการตรวจช่องปาก (174) เดือนที่ 1 ให้แล้ว${u.arm === 'cap' ? '' : ' (ร่าง ยังไม่ส่ง)'}`
      : ` · แต่บันทึกบริการตรวจ (174) ไม่สำเร็จ (${errText(err)}) ติ๊กช่อง "ตรวจช่องปาก" เดือนที่ 1 ในแผนแทน`;
  }
  toast(first ? `บันทึกผลตรวจแล้ว · ${k.id}${note}` : `บันทึกการแก้ไขผลตรวจแล้ว · ${k.id}${note}`, note && /ไม่สำเร็จ|ส่งเบิกไปแล้ว/.test(note) ? 8000 : 4200);
  if (first) S.ftab = 'plan';
  renderFile();
}

// The month-1 exam service (plan_key 'exam', from the plan or recorded at the first save) follows a corrected exam date,
// while it is still draft or recorded. A submitted one stays and the unit is told to inform the research team (R2-08).
async function moveExamService(u, k, date) {
  const mine = (u.txByKid[k.id] || []).filter(t => t.planKey === 'exam' && t.fromPlan && t.planMonth === 1 && (t.code === '174' || t.code === '173'));
  if (!mine.length) return '';
  const open = mine.filter(t => ['draft', 'recorded'].includes(t.status));
  let moved = 0;
  if (open.length) {
    const { data, error } = await sb.from('services').update({ service_date: date }).in('id', open.map(t => t.id)).in('status', ['draft', 'recorded']).select();
    if (error) return ` · แต่ย้ายวันที่บริการตรวจ (174) ไม่สำเร็จ (${errText(error)})`;
    for (const r of data || []) { const t = u.tx.find(x => x.id === r.id); if (t) Object.assign(t, txFrom(r)); }
    reindex(u);
    moved = (data || []).length;
  }
  if (moved < mine.length) return ' · วันที่ตรวจเปลี่ยนแล้ว แต่บริการตรวจ (174) ส่งเบิกไปแล้ว แจ้งทีมวิจัย';
  return ` · ย้ายวันที่บริการตรวจ (174) เป็น ${thShort(fromInput(date))} แล้ว`;
}

/* ---- care plan month grid */
function rowName(row) { return `${row.label}${row.tooth ? ' ซี่ ' + row.tooth : ''}`; }
let busy = false;
async function toggleCell(k, row, m, tx) {
  const u = unit();
  if (busy) return;
  if (k.dirty) { toast('มีผลตรวจที่ยังไม่บันทึก บันทึกผลตรวจก่อนแล้วค่อยติ๊กแผน'); return; }
  if (tx) {
    if (!['draft', 'recorded'].includes(tx.status)) { toast(`รายการนี้${STATUS[tx.status].th}แล้ว ยกเลิกในแผนไม่ได้`); return; }
    // A finger scrolling the grid can land on a done cell: ask before removing a recorded service (R1-05).
    if (!confirm(`ยกเลิกบริการ "${rowName(row)}" วันที่ ${thShort(tx.date)} ใช่หรือไม่`)) return;
  } else {
    if (!canServe(k)) { toast('นักเรียนคนนี้ยังไม่มีความยินยอมครบหรือถอนตัวแล้ว บันทึกบริการไม่ได้'); return; }
    if (!needProv()) return;
    if (PLACE_CODES.includes(row.code)) { goClaim(k, row); return; }
  }
  const cm = monthOf(k.base, TODAY);
  // A late cell is recorded with today's real date; plan_month keeps the month it fulfils (R1-05).
  if (!tx && m !== 'any' && m < cm && !confirm(`บันทึกบริการ "${rowName(row)}" ของเดือนที่ ${m} (เลยกำหนด) ว่าให้บริการวันนี้ ${thShort(TODAY)} ใช่หรือไม่\nถ้าให้บริการวันอื่น ให้บันทึกที่หน้า "${claimTab(u)}" ด้วยวันที่จริง`)) return;
  busy = true;
  try {
    if (tx) {
      const { data, error } = await sb.from('services').delete().eq('id', tx.id).select('id');
      if (error) { toastErr(error); return; }
      if (!data || !data.length) { toast('ยกเลิกไม่ได้ รายการนี้อาจถูกส่งเบิกจากอีกเครื่องแล้ว กด "โหลดข้อมูลใหม่"'); return; }
      u.tx = u.tx.filter(x => x !== tx); reindex(u);
      toast(`ยกเลิกแล้ว · ${rowName(row)}`);
    } else {
      const date = new Date(TODAY);
      const code = row.code === 'STUDY' ? '174' : row.code;
      const ins = { unit_id: u.id, study_id: k.id, code, tooth: row.tooth ?? null, service_date: toInput(date), plan_key: row.key, plan_month: m === 'any' ? null : m,
        from_plan: true, provider: S.prov, status: u.arm === 'cap' ? 'recorded' : 'draft' };
      const { data, error } = await sb.from('services').insert(ins).select().single();
      if (error) { toastErr(error); return; }
      u.tx.push(txFrom(data)); reindex(u);
      const v = refValue(u, code, row.tooth);
      toast(`บันทึกแล้ว · ${rowName(row)}${m !== 'any' && m < cm ? ` (ของเดือนที่ ${m})` : ''} · ${thShort(date)}${v ? ` · อัตรา ${fmt2(v)} บาท` : ''}`);
    }
  } finally { busy = false; }
  renderFileHead(); renderPlanGrid();
}
// Fillings and PRR need the place (only the mobile unit is paid), so a plan tick opens the claims form for them.
function goClaim(k, row) {
  show('claims');
  $('#cKid').value = k.id; $('#cCode').value = row.code; claimPreview();
  if (row.tooth != null && [...$('#cTooth').options].some(o => o.value === String(row.tooth))) { $('#cTooth').value = String(row.tooth); claimPreview(); }
  $('#fOne').scrollIntoView({ block: 'start' });
  if ($('#cPlace')) $('#cPlace').focus();
  toast(`${rowName(row)}: เลือกว่าทำบนรถทันตกรรมหรือที่ศูนย์บริการ แล้วกด "บันทึกบริการ"`);
}
function monthCell(k, row, m, cm, txs) {
  if (row.anytime) { const t = txs.find(x => monthOf(k.base, x.date) === m); return t ? el('span', { class: 'mdone', title: `ทำแล้ว ${thDate(t.date)}`, text: '✓' }) : ''; }
  const planned = row.months.includes(m);
  const inM = txs.filter(x => txMonth(k, x) === m);
  if (row.study) return planned ? el('span', { class: 'cellbtn is-study', title: `ตรวจรอบโครงการ ครั้งที่ ${m === 6 ? 2 : 3} (เปิดใช้ภายหลัง)`, 'aria-label': 'ตรวจรอบโครงการ' }) : el('span', { class: 'dash', 'aria-hidden': 'true', text: '–' });
  if (!planned) return inM.length ? el('span', { class: 'cellbtn is-extra', title: `ทำนอกแผน ${inM.map(x => thShort(x.date)).join(', ')}`, 'aria-label': `${rowName(row)} เดือนที่ ${m} ทำนอกแผน`, text: '●' }) : el('span', { class: 'dash', 'aria-hidden': 'true', text: '–' });
  const t = inM[0], late = !t && m < cm, future = m > cm;
  const cls = 'cellbtn' + (t ? ' is-done' : late ? ' is-late' : m === cm ? ' is-due' : '');
  const u = unit();
  return el('button', {
    type: 'button', class: cls, disabled: future && !t ? true : null, 'aria-pressed': String(!!t),
    'aria-label': `${rowName(row)} เดือนที่ ${m}${t ? ' ทำแล้ว' : late ? ' เลยกำหนด' : ''}`,
    title: t ? `ทำแล้ว ${thDate(t.date)} · ${STATUS[t.status].th}` : future ? `ยังไม่ถึงเดือนที่ ${m}` : `ติ๊กเมื่อให้บริการ ระบบ${u.arm === 'cap' ? 'บันทึกผลงาน' : 'สร้างรายการบริการ (ร่าง)'}ให้`,
    onclick: () => toggleCell(k, row, m, t),
  }, t ? '✓' : late ? '!' : '');
}
function anyCell(k, row, txs) {
  if (!row.anytime) return '';
  const t = txs[0];
  const late = !t && (TODAY - k.base) / 864e5 > 30;
  const u = unit();
  return el('span', { class: 'anycell' },
    el('button', { type: 'button', class: 'cellbtn' + (t ? ' is-done' : late ? ' is-late' : ' is-due'), 'aria-pressed': String(!!t), 'aria-label': `${rowName(row)} ${t ? 'ทำแล้ว' : late ? 'ค้าง' : 'ยังไม่ทำ'}`,
      title: t ? `${pname(t.code)} · ${thDate(t.date)} · ${STATUS[t.status].th}` : `ติ๊กเมื่อให้บริการ ระบบ${u.arm === 'cap' ? 'บันทึกผลงาน' : 'สร้างรายการบริการ (ร่าง)'}ให้`, onclick: () => toggleCell(k, row, 'any', t) }, t ? '✓' : late ? '!' : ''),
    t ? el('small', { text: thShort(t.date) + (t.code !== row.code ? ` · ${pshort(t.code)}` : '') + (t.code === 'REF' && !t.outcome ? ' · รอผล' : '') }) : null);
}
function renderPlanGrid() {
  const u = unit(), k = curKid();
  const wrap = $('#planGrid');
  const sameKid = wrap.dataset.kid === k.id, prevLeft = wrap.scrollLeft;
  wrap.replaceChildren(); wrap.dataset.kid = k.id;
  $('#planTitle').textContent = `แผนการดูแล · ${k.id}${k.name ? ' · ' + k.name : ''}`;
  if (!examined(k)) {
    $('#planSub').textContent = '';
    wrap.append(el('p', { class: 'hint', text: 'ยังไม่มีผลตรวจครั้งแรก แผนการดูแลสร้างหลังบันทึกผลตรวจ' }));
    $('#planTotals').replaceChildren(); $('#homecare').textContent = ''; $('#planHint').textContent = '';
    return;
  }
  const rows = buildPlan(k), cm = monthOf(k.base, TODAY), lvl = lvlOf(k);
  const fl = rows.find(r => r.key === 'fl');
  const sub = $('#planSub');
  sub.replaceChildren(el('span', { class: 'chip ' + LEVEL[lvl].chip, text: LEVEL[lvl].th }), ` ตรวจครั้งแรก ${thDate(k.base)} · ตอนนี้เดือนที่ ${cm}`);
  if (k.dirty) sub.append(el('div', { class: 'hint', style: 'margin-top:8px', text: 'มีผลตรวจที่ยังไม่บันทึก แผนนี้คิดจากผลตรวจที่กำลังแก้ บันทึกผลตรวจก่อนติ๊กแผน' }));
  if (fl && fl.freqSel) {
    const sel = el('select', { 'aria-label': 'ความถี่ฟลูออไรด์', onchange: e => { k.flOv = +e.target.value; k.dirty = true; syncSaveBar(); renderPlanGrid(); } }, el('option', { value: '6', text: 'ทุก 6 เดือน', selected: (k.flOv || 6) === 6 }), el('option', { value: '3', text: 'ทุก 3 เดือน', selected: k.flOv === 3 }));
    sub.append(el('label', { class: 'small noprint', style: 'margin-left:12px' }, 'ฟลูออไรด์ (แบบฟอร์ม: 3–6 เดือน) ', sel));
  }
  const table = el('table', { class: 'pgrid' });
  const h1 = el('tr', {}, el('th', { class: 'rowh', scope: 'col' }), el('th', { colspan: '12', scope: 'colgroup', class: 'grp-h', text: `เดือนที่ (นับจากตรวจครั้งแรก ${thShort(k.base)})` }), el('th', { class: 'anycol' }));
  const h2 = el('tr', {}, el('th', { class: 'rowh', scope: 'col', text: 'รายการ' }));
  for (let m = 1; m <= 12; m++) {
    const r = monthRange(k.base, m);   // the days that count as month m (R1-12)
    h2.append(el('th', { scope: 'col', class: m === cm ? 'cur' : '', title: `เดือนที่ ${m}: ${thShort(r.from)} – ${r.to ? thShort(r.to) : 'เป็นต้นไป'}` }, el('span', { class: 'mno', text: String(m) }), el('span', { class: 'mcal', text: thMon(addMonths(k.base, m)) })));
  }
  h2.append(el('th', { scope: 'col', class: 'anycol', text: 'ไม่ระบุเดือน' }));
  table.append(el('thead', {}, h1, h2));
  const tb = el('tbody');
  let lastGrp = null;
  for (const row of rows) {
    const grp = row.prim ? 'prim' : row.tooth || row.key === 'tx-urg' ? 'perm' : 'mouth';
    if (grp !== lastGrp) {
      const title = { mouth: 'ทั้งปาก / รายคน', perm: 'รายซี่ · ฟันแท้', prim: 'รายซี่ · ฟันน้ำนม (ไม่นับในงบโครงการ)' }[grp];
      tb.append(el('tr', { class: 'sec' }, el('th', { colspan: '14', scope: 'colgroup', text: title })));
      lastGrp = grp;
    }
    const txs = row.study ? [] : rowTx(u, k, row);
    const tr = el('tr', { class: row.study ? 'is-study-row' : null }, el('th', { scope: 'row', class: 'rowh' }, rowName(row), row.prim ? el('span', { class: 'chip chip--prim tiny', style: 'margin-left:6px', text: 'ฟันน้ำนม' }) : null, el('div', { class: 'tiny muted', text: row.sub })));
    for (let m = 1; m <= 12; m++) tr.append(el('td', { class: m === cm ? 'cur' : '' }, monthCell(k, row, m, cm, txs)));
    tr.append(el('td', { class: 'anycol' }, anyCell(k, row, txs)));
    tb.append(tr);
  }
  table.append(tb);
  wrap.append(table);
  // Same child: keep where the user scrolled. New child: open at the current month (R1-10).
  if (sameKid) wrap.scrollLeft = prevLeft;
  else { const c = table.querySelector('thead th.cur'), rh = table.querySelector('thead .rowh'); wrap.scrollLeft = c && cm > 4 ? Math.max(0, c.offsetLeft - (rh ? rh.offsetWidth : 210) - 3 * c.offsetWidth) : 0; }
  $('#planHint').textContent = (u.arm === 'cap' ? 'ติ๊กช่องในแผนเมื่อให้บริการ ระบบบันทึกเป็นผลงาน' : 'ติ๊กช่องในแผนเมื่อให้บริการ ระบบสร้างรายการบริการ (ร่าง) ให้')
    + ` แตะช่องที่ทำแล้วเพื่อยกเลิก วันที่บริการ = วันนี้ (ช่องที่เลยกำหนดก็บันทึกวันนี้) ผู้บันทึกมาจากช่อง "ผู้บันทึก" ด้านบน บริการที่ให้วันอื่น บริการนอกแผน และกิจกรรมกลุ่ม บันทึกที่หน้า "${claimTab(u)}"`;
  renderPlanTotals(u, k, rows, cm);
  $('#homecare').textContent = lvl === 'low'
    ? 'แปรงฟันด้วยยาสีฟันผสมฟลูออไรด์ 1,000 ppm ขึ้นไป วันละ 2 ครั้ง · ผู้ปกครองแปรงซ้ำก่อนนอน · ลดขนมและเครื่องดื่มหวานนอกมื้อ'
    : `แปรงฟันด้วยยาสีฟันผสมฟลูออไรด์ 1,450 ppm วันละ 2 ครั้ง · ผู้ปกครองแปรงซ้ำก่อนนอน · ขนมและเครื่องดื่มหวานนอกมื้อไม่เกินวันละ 2 ครั้ง · มาตามนัดทุก ${LEVEL[lvl].recall} เดือน`;
}
function renderPlanTotals(u, k, rows, cm) {
  let main = 0, primN = 0, unpriced = 0, done = 0, dueN = 0;
  for (const row of rows) {
    if (row.study) continue;
    const reps = row.anytime ? 1 : row.months.length;
    if (row.prim) primN++;
    else { if (PRICE[row.code] && PRICE[row.code].unpriced) unpriced += reps; main += refValue(u, row.code, row.tooth) * reps; }
    const txs = rowTx(u, k, row);
    if (row.anytime) { dueN++; if (txs.length) done++; }
    else for (const m of row.months) if (m <= cm) { dueN++; if (txs.some(t => txMonth(k, t) === m)) done++; }
  }
  const t = (label, value, note) => el('div', { class: 'stack' }, el('span', { class: 'small muted', text: label }), el('span', { class: 'big', text: value }), note ? el('span', { class: 'tiny muted', text: note }) : null);
  $('#planTotals').replaceChildren(
    t('มูลค่าแผนทั้งปี (ตามอัตราค่าบริการ)', `${fmt(main)} บาท`, `ฟันแท้และบริการรายคน · ไม่รวมตรวจรอบโครงการ${unpriced ? ` · ยังไม่มีราคา ${unpriced} รายการ` : ''} · เงินของหน่วยดูที่หน้าแรก`),
    t('รายการฟันน้ำนม', `${primN} รายการ`, 'บันทึกได้ ไม่นับในงบโครงการ'),
    t('ทำแล้วตามกำหนด', `${done}/${dueN}`, `รายการที่ถึงกำหนดถึงเดือนที่ ${cm}`));
}
// Parent booklet (one A4 sheet folded into four A5 pages, booklet.html). The data goes through localStorage
// and holds no names (D-64); the parent writes the child's name by hand.
function bookletData(u, k) {
  const school = u.schools.find(s => s.id === k.c.school_id), lvl = lvlOf(k);
  const teeth = POS.map(p => {
    const t = k.teeth[p], n = needOf(p, k);
    return { pos: p, no: t.t === 'n' ? p : toothNo(p, t), jaw: UPPER.includes(p) ? 'upper' : 'lower', type: t.t, n_code: t.t === 'n' ? t.A : null,
      A: t.t === 'n' ? null : t.A, B: t.t === 'n' ? null : t.B, active: t.act === 'a' ? true : t.act === 'i' ? false : null,
      need: n, need_label: n != null ? NEED[n] : '', partial: !!t.partial };
  });
  const cnt = f => teeth.filter(f).length;
  const plan = buildPlan(k).map(r => ({ label: rowName(r), tooth: r.tooth ?? null, category: r.study ? 'study' : catOf(r), months: r.anytime ? [] : r.months, anytime: !!r.anytime, prim: !!r.prim,
    done: r.study ? [] : rowTx(u, k, r).map(t => ({ month: r.anytime ? null : txMonth(k, t), date: toInput(t.date) })) }));
  return { v: 1, printed_on: toInput(TODAY),
    child: { study_id: k.id, school: school ? school.name : '', class: k.cls || '', sex: sexTh(k), age_text: k.birth ? ageText(k, k.base) : '' },
    unit: { name: u.name.split(' · ')[0] },   // TEST unit names carry the payment arm after " · "; parents never see it
    exam: { date: toInput(k.base), place: PLACE[k.place] || '', examiner_code: k.examiner || '',
      risk: { level: lvl, label: LEVEL[lvl].th, score: riskScore(k), recall_months: LEVEL[lvl].recall },
      urgent: { ...k.urgent }, needs_referral: needsReferral(k), teeth,
      counts: { decayed_perm: cnt(t => t.type === 'p' && t.B >= 3), decayed_prim: cnt(t => t.type === 'd' && t.B >= 3), filled: cnt(t => [3, 4, 5, 6].includes(t.A)),
        sealed: cnt(t => [1, 2].includes(t.A)), need_seal: cnt(t => t.need === 2), need_fill: cnt(t => t.need === 4), need_refer: cnt(t => t.need >= 5) } },
    plan, month_labels: Array.from({ length: 12 }, (_, i) => thMon(addMonths(k.base, i + 1))),
    // Date span of each plan month, as in the plan grid (monthRange): month 1 starts on the exam day.
    month_ranges: Array.from({ length: 12 }, (_, i) => { const r = monthRange(k.base, i + 1); return { from: toInput(r.from), to: r.to ? toInput(r.to) : null }; }),
    homecare: $('#homecare') ? $('#homecare').textContent : '', return_by: toInput(addMonths(k.base, 12)) };
}
$('#printBtn').addEventListener('click', () => {
  const u = unit(), k = curKid();
  if (!k || !examined(k)) { toast('ยังไม่มีผลตรวจครั้งแรก'); return; }
  if (k.dirty) { toast('มีผลตรวจที่ยังไม่บันทึก บันทึกผลตรวจก่อนพิมพ์สมุด'); return; }
  try { localStorage.setItem('dent2-booklet', JSON.stringify(bookletData(u, k))); } catch (e) { toast('เบราว์เซอร์ไม่ให้เก็บข้อมูลชั่วคราว พิมพ์สมุดไม่ได้'); return; }
  const w = window.open('booklet.html?v=1.2.3', '_blank');
  if (!w) toast('เบราว์เซอร์บล็อกหน้าต่างใหม่ อนุญาตป๊อปอัปของเว็บนี้แล้วกดอีกครั้ง');
});

/* ---- child's services */
// For a service about to be entered on the claims page: which plan row and month it fulfils.
// Month of its date when that month is planned and still open; else the earliest open planned month before it
// (a late cell closed with the real date); else the month of its date if planned (already done); else out of plan.
function planFor(k, { code, tooth, date }) {
  if (!k || !examined(k)) return null;
  const u = unit(), m = monthOf(k.base, date);
  for (const r of buildPlan(k)) {
    if (r.study || !r.codes.includes(code) || (r.tooth != null && r.tooth !== tooth)) continue;
    if (r.anytime) return { row: r, month: null, late: false };
    const done = new Set(rowTx(u, k, r).map(t => txMonth(k, t)));
    if (r.months.includes(m) && !done.has(m)) return { row: r, month: m, late: false };
    const earlier = r.months.filter(x => x < m && !done.has(x));
    if (earlier.length) return { row: r, month: earlier[0], late: true };
    if (r.months.includes(m)) return { row: r, month: m, late: false };
  }
  return null;
}
function planMatch(k, tx) {
  if (!k || !examined(k)) return null;
  const m = txMonth(k, tx);
  return buildPlan(k).find(r => !r.study && r.codes.includes(tx.code) && (r.tooth == null || r.tooth === tx.tooth) && (r.anytime || r.months.includes(m))) || null;
}
async function saveOutcome(tx) {
  const v = prompt('ผลการส่งต่อ (เช่น รักษาแล้วที่โรงพยาบาล / ยังไม่ไปตามนัด) ห้ามใส่ชื่อ', tx.outcome || '');
  if (v == null) return;
  const { error } = await sb.from('services').update({ outcome: v.trim() || null }).eq('id', tx.id);
  if (error) { toastErr(error); return; }
  tx.outcome = v.trim() || null;
  toast('บันทึกผลส่งต่อแล้ว');
  renderFileHead(); renderKidTx();
}
function renderKidTx() {
  const u = unit(), k = curKid();
  setIf('#kAmtHead', 'textContent', amtLabel(u));
  $('#kidAddBtn').hidden = !examined(k) || !canServe(k);
  const tb = $('#kidTxBody'); tb.replaceChildren();
  const list = [...(u.txByKid[k.id] || [])].sort((a, b) => b.date - a.date || b.id - a.id);
  if (!list.length) { tb.append(el('tr', {}, el('td', { colspan: '8', class: 'muted', text: 'ยังไม่มีบริการที่บันทึก' }))); return; }
  for (const tx of list) {
    const pm = planMatch(k, tx), v = txAmt(u, tx);
    tb.append(el('tr', {},
      el('td', { text: thShort(tx.date) }), el('td', { class: 'num', text: examined(k) ? String(monthOf(k.base, tx.date)) : '–' }),
      el('td', { class: 'wrapcell' }, pname(tx.code), isPrimNo(tx.tooth) ? el('div', { class: 'tiny muted', text: 'ฟันน้ำนม ไม่นับในงบโครงการ' }) : null),
      el('td', { class: 'mono', text: tx.tooth ? String(tx.tooth) : '–' }),
      el('td', {}, pm ? el('span', { class: 'chip chip--ok', text: pm.anytime ? 'ตามแผน' : `ตามแผน ด.${txMonth(k, tx)}` }) : el('span', { class: 'chip chip--plain', text: 'นอกแผน' })),
      el('td', { class: 'num' + (v ? '' : ' amt-0') }, fmt2(v), payNote(u, tx)),
      el('td', {}, statusEl(tx), tx.code === 'REF' ? el('div', { class: 'tiny' }, tx.outcome ? `ผล: ${tx.outcome}` : 'รอผลส่งต่อ ',
        canEdit(tx) ? el('button', { class: 'linkbtn', type: 'button', text: tx.outcome ? 'แก้ผล' : 'บันทึกผล', onclick: () => saveOutcome(tx) }) : null) : null),
      el('td', { text: tx.by || '–' })));
  }
}

/* ================================================================ CLAIMS / SERVICE RECORDING (D-65) */
$('#kidAddBtn').addEventListener('click', () => { show('claims'); $('#cKid').value = S.kid; claimPreview(); $('#fOne').scrollIntoView({ block: 'start' }); });
// Duplicate checks from v0.7 shown as notes; payable amounts follow the fee schedule (research team, v1.2).
function txFlags(u) {
  const out = new Map(), seen = {};
  const bump = key => (seen[key] = (seen[key] || 0) + 1);
  for (const tx of [...u.tx].sort((a, b) => a.date - b.date || a.id - b.id)) {
    const notes = [];
    if (isPrimNo(tx.tooth)) notes.push('ฟันน้ำนม ไม่นับในงบโครงการ');
    if (PRICE[tx.code] && PRICE[tx.code].outside && !isPrimNo(tx.tooth)) notes.push('นอกงบโครงการ เบิกตามระบบปกติ');
    if (PRICE[tx.code] && PRICE[tx.code].unpriced) notes.push('ยังไม่มีราคา (นับจำนวนไว้)');
    const kc = tx.kid && u.byId[tx.kid] ? u.byId[tx.kid].c : null;
    if (kc && kc.coverage === 'none') notes.push('ไม่มีสิทธิรัฐ: ไม่เบิก สปสช. โครงการจ่ายเต็มอัตรา');
    if (kc && !kc.coverage) notes.push('ยังไม่ระบุสิทธิการรักษา');
    if (tx.kid && tx.code === '170') {
      if (u.arm === 'control' ? bump(`170|${tx.kid}|${tx.date.getFullYear()}`) > 1 : bump(`170|${tx.kid}|${tx.date.getFullYear()}-${tx.date.getMonth()}`) > 1)
        notes.push(u.arm === 'control' ? 'ฟลูออไรด์เกินปีละ 1 ครั้ง (เงื่อนไข สปสช. รอยืนยัน)' : 'ฟลูออไรด์เกินเดือนละ 1 ครั้ง');
    }
    if (tx.kid && tx.code === '171' && bump(`171|${tx.kid}|${tx.tooth}`) > 1) notes.push('ซี่นี้เคลือบแล้ว เคลือบซ้ำเมื่อผลตรวจพบว่าหลุดหรือเหลือบางส่วน');
    if (tx.kid && tx.code === '176' && bump(`176|${tx.kid}|${tx.date.getFullYear()}`) > 1) notes.push('ชุดอุปกรณ์ปีละ 1 ครั้ง ฝึกซ้ำใช้รหัส 175');
    if (tx.kid && tx.code === '67210' && !isPrimNo(tx.tooth) && kc && u.byId[tx.kid].teeth && !fillFlagged(u.byId[tx.kid], tx.tooth)) notes.push('ซี่นี้ผลตรวจครั้งแรกไม่ได้ระบุว่าต้องบูรณะ');
    out.set(tx.id, notes);
  }
  return out;
}
const statusEl = tx => {
  const s = STATUS[tx.status] || { th: tx.status, c: 'var(--text-muted)' };
  return tx.status === 'returned' ? el('span', { class: 'chip chip--warn', text: s.th }) : el('span', { class: 'st' }, el('i', { style: `background:${s.c}` }), s.th);
};
const CODE_GROUPS = [['ตรวจ', ['174', '173']], ['ส่งเสริมและป้องกัน', ['170', '171', '172', '175', '176']], ['รักษา', ['67210', 'SDF', '68', '178', '1']], ['ส่งต่อ', ['REF']]];
// Fillings and PRR are paid only when done on the mobile dental unit (01, 02 §2; D-49, D-59): the unit says where.
const PLACE_CODES = ['67210', '172'];
const canEdit = tx => ['draft', 'recorded', 'returned'].includes(tx.status);
const claimTab = u => (u.arm === 'cap' ? 'บันทึกบริการ' : 'บันทึกและเบิก');
// keep = rebuilt after a data reload: what the user already picked stays (R1-09).
function setupClaimsForm(keep) {
  const u = unit();
  const prev = keep ? { kid: $('#cKid').value, code: $('#cCode').value, cDate: $('#cDate').value, gDate: $('#gDate').value, rooms: $$('#gRooms input:checked').map(x => x.value) } : null;
  // Individual services: examined children with complete consent, not withdrawn (team decision on R1-20).
  const kids = u.kids.filter(k => examined(k) && canServe(k));
  // No child is preselected unless one was opened from a file: a quick save must not land on the first ID (R2-04).
  $('#cKid').replaceChildren(el('option', { value: '', text: '– เลือกนักเรียน –' }), ...kids.map(k => el('option', { value: k.id, text: `${k.id} · ${kidLabel(k)}` })));
  const want = prev ? prev.kid : S.kid;
  $('#cKid').value = want && kids.some(k => k.id === want) ? want : '';
  // No service is preselected: a quick tap must not record an exam (R1-20).
  $('#cCode').replaceChildren(el('option', { value: '', text: '– เลือกบริการ –' }), ...CODE_GROUPS.map(([lab, codes]) => el('optgroup', { label: lab }, ...codes.filter(c => PRICE[c]).map(c => el('option', { value: c, text: `${c === 'SDF' || c === 'REF' ? '' : c + ' · '}${pname(c)}` })))));
  $('#cCode').value = prev && PRICE[prev.code] ? prev.code : '';
  for (const id of ['#cDate', '#gDate']) { $(id).value = prev ? prev[id.slice(1)] : toInput(TODAY); $(id).max = toInput(TODAY); }
  $('#gRooms').replaceChildren(el('legend', { class: 'small muted', text: 'ห้อง' }), ...unitClasses(u).map(c => el('label', { class: 'chk' }, el('input', { type: 'checkbox', value: c, checked: prev ? prev.rooms.includes(c) : true, onchange: renderGroupList }), ' ' + c)));
  if (!prev) { S.gsel = new Set(); $('#gTopic').value = ''; $('#gTopic').placeholder = topicHint($('#gCode').value); }
  beAll($('#claims'));
}
// 02 §2: a filling is claimed for a tooth the round-1 screening flagged as needing restoration (need 4).
const fillFlagged = (k, no) => POS.some(p => k.teeth[p].t !== 'n' && toothNo(p, k.teeth[p]) === no && needOf(p, k) === 4);
function toothOptions(k, code) {
  const kind = PRICE[code] && PRICE[code].tooth;
  if (!kind) return null;
  const opts = [];
  if (kind === 'opt') opts.push(['', 'ไม่ระบุซี่']);
  for (const p of POS) {
    const t = k.teeth[p];
    if (t.t === 'n') continue;
    if (kind === 'fpm' && !(t.t === 'p' && FPM.includes(p))) continue;
    if (kind === 'prim' && t.t !== 'd') continue;
    const no = toothNo(p, t);
    opts.push([String(no), `${no} · ${t.t === 'd' ? 'ฟันน้ำนม' : 'ฟันแท้'}${t.B >= 3 ? ' · ผุ' : ''}`]);
  }
  return opts;
}
function claimPreview() {
  const u = unit(), k = u.byId[$('#cKid').value], code = $('#cCode').value;
  const pv = $('#cPreview'); pv.replaceChildren();
  const none = $('#cKid').options.length <= 1;
  if (!k) { pv.append(el('span', { class: 'muted', text: none ? 'ยังไม่มีนักเรียนที่บันทึกผลตรวจแล้วและมีความยินยอมครบ บันทึกบริการรายคนได้หลังตรวจครั้งแรก' : 'เลือกนักเรียน' })); $('#cSave').disabled = true; $('#cToothWrap').hidden = true; setIf('#cPlaceWrap', 'hidden', true); return; }
  if (!code) { pv.append(el('span', { class: 'muted', text: 'เลือกบริการ' })); $('#cSave').disabled = true; $('#cToothWrap').hidden = true; setIf('#cPlaceWrap', 'hidden', true); return; }
  setIf('#cPlaceWrap', 'hidden', !PLACE_CODES.includes(code));
  const opts = toothOptions(k, code);
  const tSel = $('#cTooth');
  $('#cToothWrap').hidden = !opts;
  if (opts) { const prev = tSel.value; tSel.replaceChildren(...opts.map(([v, lab]) => el('option', { value: v, text: lab }))); if (opts.some(o => o[0] === prev)) tSel.value = prev; }
  const tooth = opts && tSel.value ? +tSel.value : null;
  const d = fromInput($('#cDate').value), dp = dateProblem($('#cDate').value, 'วันที่ให้บริการ');
  const line = (label, value) => el('div', { class: 'pl' }, el('span', { class: 'muted', text: label }), el('b', { text: value }));
  if (!d || dp || d < k.base) { pv.append(el('div', { class: 'hint', text: dp && dp.includes('ค.ศ.') ? dp : `วันที่ต้องอยู่ระหว่างวันตรวจครั้งแรก (${thShort(k.base)}) ถึงวันนี้ (${thShort(TODAY)})` })); $('#cSave').disabled = true; return; }
  if (opts && !opts.length) { pv.append(el('div', { class: 'hint', text: PRICE[code].tooth === 'fpm' ? 'นักเรียนคนนี้ยังไม่มีฟันกรามแท้ซี่ที่หนึ่งที่ขึ้นแล้ว เคลือบหลุมร่องฟันเฉพาะฟันกรามแท้ซี่ที่หนึ่ง' : 'ไม่มีซี่ที่เข้าเงื่อนไขของบริการนี้ในผลตรวจ' })); $('#cSave').disabled = true; return; }
  if (code === 'SDF' && k.c.allergy_silver) { pv.append(el('div', { class: 'alert', text: '⛔ นักเรียนคนนี้แพ้เงิน ห้ามใช้ SDF' })); $('#cSave').disabled = true; return; }
  if (PLACE_CODES.includes(code) && $('#cPlace') && !$('#cPlace').value) { pv.append(el('div', { class: 'hint', text: 'เลือกว่าทำที่ไหน: บนรถทันตกรรมที่โรงเรียน (โครงการจ่าย) หรือที่ศูนย์บริการ (เบิกกองทุนทันตกรรม สปสช.)' })); $('#cSave').disabled = true; return; }
  $('#cSave').disabled = false;
  const pf = planFor(k, { code, tooth, date: d });
  const v = refValue(u, code, tooth);
  pv.append(line('นักเรียน', `${k.id} · ${kidLabel(k)} · เดือนที่ ${monthOf(k.base, d)} หลังตรวจครั้งแรก`),
    line('สิทธิ', k.c.coverage ? covText(k.c) : 'ยังไม่ตรวจสิทธิ · เลือกได้ที่ "แก้ไขข้อมูลลงทะเบียน" ในแฟ้มนักเรียน'),
    line('แผน', !pf ? 'นอกแผน · บันทึกได้ ติดป้าย "นอกแผน"'
      : pf.late ? `ตามแผน (เลยกำหนด) เดือนที่ ${pf.month}: ${rowName(pf.row)} · ติ๊กช่องเดือนที่ ${pf.month} ให้`
        : `ตรงกับแผน: ${rowName(pf.row)}${pf.month ? ` เดือนที่ ${pf.month}` : ''} · ติ๊กในแผนให้`),
    line(u.arm === 'cap' ? 'มูลค่าตามอัตรา' : 'อัตราค่าบริการ', v ? `${fmt2(v)} บาท` : '0 บาท'));
  if (u.arm !== 'cap') pv.append(el('div', { class: 'note', text: 'ยอดที่โครงการจ่ายจริง (หักส่วนที่เบิกจาก สปสช. แล้ว) ขึ้นในรายการด้านล่างหลังบันทึก' }));
  if (isPrimNo(tooth)) pv.append(el('div', { class: 'note', text: 'ฟันน้ำนม: บันทึกเป็นผลงาน ไม่นับในงบโครงการ' }));
  if (code === '67210' && !isPrimNo(tooth)) pv.append(el('div', { class: 'note', text: 'อุดฟันเบิกได้ซี่ละ 1 ด้าน (360 บาท) ถ้าต้องอุดมากกว่า 1 ด้าน แนะนำส่งรักษาที่ศูนย์บริการ' + (tooth && !fillFlagged(k, tooth) ? ' · ซี่นี้ผลตรวจครั้งแรกไม่ได้ระบุว่าต้องบูรณะ' : '') }));
  if (PLACE_CODES.includes(code) && $('#cPlace') && $('#cPlace').value === 'clinic') pv.append(el('div', { class: 'note', text: 'ทำที่ศูนย์บริการ: บันทึกเป็นผลงาน โครงการไม่จ่าย เบิกกองทุนทันตกรรม สปสช. ตามปกติ' }));
  if (code === '170' && k.c.allergy_colophony) pv.append(el('div', { class: 'hint', text: 'นักเรียนคนนี้แพ้โคโลโฟนี ระวังฟลูออไรด์วาร์นิช' }));
}
['#cKid', '#cCode', '#cTooth', '#cDate', '#cPlace'].forEach(s => $(s)?.addEventListener('change', claimPreview));
async function insertServices(rows, onErr = toastErr) {
  const { data, error } = await sb.from('services').insert(rows).select();
  if (error) { onErr(error); return null; }
  const u = unit();
  data.forEach(r => u.tx.push(txFrom(r))); reindex(u);
  return data;
}
$('#fOne').addEventListener('submit', async e => {
  e.preventDefault();
  if ($('#cSave').disabled) return;
  if (!needProv()) return;
  const u = unit(), k = u.byId[$('#cKid').value], code = $('#cCode').value, d = fromInput($('#cDate').value);
  if (!k || !d || !code || !canServe(k)) return;
  const tooth = !$('#cToothWrap').hidden && $('#cTooth').value ? +$('#cTooth').value : null;
  const pf = planFor(k, { code, tooth, date: d });
  $('#cSave').disabled = true;
  const place = PLACE_CODES.includes(code) && $('#cPlace') ? $('#cPlace').value || null : null;
  const ok = await insertServices([{ unit_id: u.id, study_id: k.id, code, tooth, service_date: toInput(d), plan_key: pf ? pf.row.key : null,
    plan_month: pf ? pf.month : null, from_plan: false, provider: S.prov, place, status: u.arm === 'cap' ? 'recorded' : 'draft' }]);
  $('#cSave').disabled = false;
  if (ok) setIf('#cPlace', 'value', '');
  if (ok) { toast(`บันทึกแล้ว · ${k.id} · ${pname(code)}${tooth ? ' ซี่ ' + tooth : ''} · ${pf ? `ติ๊กในแผนให้แล้ว${pf.month ? ` (เดือนที่ ${pf.month}${pf.late ? ' ที่เลยกำหนด' : ''})` : ''}` : 'นอกแผน'}`); renderClaims(); }
});
// Activity evidence (D-62): photos and the teacher-signed class list, per group activity, in the private bucket
// 'evidence'. Photos must not identify children (PDPA): the form says so at the upload.
const EVIDENCE_CODES = ['175', '176', '177'];
const evOf = (u, gid) => (gid && u.evidence.get(gid)) || [];
async function uploadEvidence(u, gid, files) {
  let n = 0;
  for (const f of files) {
    if (f.size > 10 * 1024 * 1024) { toast(`${f.name} ใหญ่เกิน 10 MB ไม่ได้แนบ`); continue; }
    const ext = (f.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
    const path = `${u.id}/${gid}/${crypto.randomUUID()}.${ext}`;
    const up = await sb.storage.from('evidence').upload(path, f, { contentType: f.type || undefined });
    if (up.error) { toastErr(up.error); continue; }
    const { data, error } = await sb.from('evidence').insert({ unit_id: u.id, group_id: gid, path, file_name: f.name.slice(0, 200) }).select().single();
    if (error) { toastErr(error); continue; }
    (u.evidence.get(gid) || u.evidence.set(gid, []).get(gid)).push(data); n++;
  }
  return n;
}
async function openEvidence(path) {
  const w = window.open('', '_blank');
  const { data, error } = await sb.storage.from('evidence').createSignedUrl(path, 300);
  if (error || !data) { if (w) w.close(); toastErr(error || { message: 'เปิดไฟล์ไม่ได้' }); return; }
  if (w) w.location = data.signedUrl; else window.location.assign(data.signedUrl);
}
// The evidence panel under a ledger row: view; the unit also adds or removes files.
function evidencePanel(u, gid, cols, onChange) {
  const list = evOf(u, gid), unitSide = S.me.role === 'unit';
  const inp = unitSide ? el('input', { type: 'file', multiple: true, accept: 'image/jpeg,image/png,image/webp,image/heic,application/pdf', onchange: async e => {
    const n = await uploadEvidence(u, gid, [...e.target.files]); if (n) toast(`แนบหลักฐานแล้ว ${n} ไฟล์`); onChange();
  } }) : null;
  return el('tr', { class: 'evrow' }, el('td', { colspan: String(cols) }, el('div', { class: 'stack' },
    list.length ? el('ul', { class: 'olist small' }, ...list.map(ev => el('li', {},
      el('button', { class: 'linkbtn', type: 'button', text: ev.file_name || 'ไฟล์', onclick: () => openEvidence(ev.path) }), ` · ${thShort(new Date(ev.created_at))} `,
      unitSide ? el('button', { class: 'linkbtn', type: 'button', text: 'ลบ', onclick: async () => {
        if (!confirm(`ลบไฟล์ ${ev.file_name || ''}?`)) return;
        await sb.storage.from('evidence').remove([ev.path]);
        const { error } = await sb.from('evidence').delete().eq('id', ev.id);
        if (error) { toastErr(error); return; }
        u.evidence.set(gid, evOf(u, gid).filter(x => x.id !== ev.id)); onChange();
      } }) : null))) : el('p', { class: 'small muted', text: 'ยังไม่มีหลักฐาน' }),
    unitSide ? el('label', { class: 'field' }, 'แนบไฟล์เพิ่ม (รูปหรือ PDF)', inp) : null,
    unitSide ? el('p', { class: 'small pdpa', text: '* กรุณาอัปโหลดรูปที่ไม่เห็นหน้าเด็ก หรือระบุตัวเด็กไม่ได้ ตามหลัก PDPA รายชื่อใช้รหัสนักเรียนแทนชื่อ หรือปิดชื่อก่อนถ่าย' }) : null)));
}
const evButton = (u, gid, code, onClick) => (EVIDENCE_CODES.includes(code) && gid
  ? el('button', { class: 'linkbtn', type: 'button', text: `หลักฐาน (${evOf(u, gid).length})`, onclick: onClick }) : null);
// Per-person activities (176, 175) write a row for each child: only children with complete consent who have
// not withdrawn. A per-session 177 counts the children ticked and stores no study ID (team decision on R1-20).
const perPerson = code => !(PRICE[code] && PRICE[code].group === 'session');
function groupKids(all) {
  const rooms = $$('#gRooms input:checked').map(x => x.value);
  const inRooms = unit().kids.filter(k => rooms.includes(k.cls) && k.c.status !== 'withdrawn');
  return all || !perPerson($('#gCode').value) ? inRooms : inRooms.filter(canServe);
}
function renderGroupList() {
  const list = groupKids(), left = groupKids(true).length - list.length;
  for (const id of [...S.gsel]) if (!list.some(k => k.id === id)) S.gsel.delete(id);
  fill($('#gList'), ...list.map(k => el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: S.gsel.has(k.id), onchange: e => { if (e.target.checked) S.gsel.add(k.id); else S.gsel.delete(k.id); groupPreview(); } }), ` ${k.id}`)),
    left ? el('p', { class: 'tiny muted plist__note', text: `ไม่แสดง ${left} คนที่ยังไม่มีความยินยอมครบ (กิจกรรมนับต่อคนบันทึกได้เฉพาะคนที่ยินยอมแล้ว)` }) : null);
  $('#gAll').textContent = `ทำให้ทุกคน (${list.length} คน)`;
  groupPreview();
}
const topicHint = code => (code === '177' ? 'เช่น ขนมหวานกับฟันผุ' : 'เช่น สอนแปรงฟันแบบขยับปัด');
function groupPreview() {
  const u = unit(), code = $('#gCode').value, n = S.gsel.size, price = refValue(u, code, null);
  $('#gCount').textContent = `เลือกแล้ว ${n} คน`;
  const pv = $('#gPreview'); pv.replaceChildren();
  const line = (label, value) => el('div', { class: 'pl' }, el('span', { class: 'muted', text: label }), el('b', { text: value }));
  if (!n) { pv.append(el('span', { class: 'muted', text: 'กด "ทำให้ทุกคน" แล้วเอารหัสของคนที่ขาดออก หรือเลือกทีละคน' })); return; }
  const had = code === '176' ? [...S.gsel].filter(id => (u.txByKid[id] || []).some(t => t.code === '176' && t.date.getFullYear() === TODAY.getFullYear())).length : 0;
  if (PRICE[code] && PRICE[code].group === 'session') pv.append(line('จะบันทึก', `1 รายการ (นับต่อครั้ง) · ผู้เข้าร่วม ${n} คน`), line('อัตราค่าบริการ', `${fmt2(price)} บาท`));
  else pv.append(line('จะบันทึก', `${n} รายการ (นับต่อคน) · ผูกกับแฟ้มของแต่ละคน`), line('อัตราค่าบริการ', `${fmt2(price)} × ${n} = ${fmt2(price * n)} บาท`));
  if (had) pv.append(el('div', { class: 'note', text: `${had} คนได้ชุดอุปกรณ์แล้วปีนี้ ฝึกซ้ำให้เลือก "ฝึกแปรงฟันรายบุคคล" (175)` }));
  if (code === '176' || code === '175') pv.append(el('div', { class: 'note', text: 'ช่อง "ฝึกแปรงฟัน" ในแผนของทุกคนที่เลือกจะติ๊กให้อัตโนมัติ' }));
}
$('#gAll').addEventListener('click', () => { groupKids().forEach(k => S.gsel.add(k.id)); renderGroupList(); });
$('#gNone').addEventListener('click', () => { S.gsel.clear(); renderGroupList(); });
// The topic is a placeholder, not a value, so a session is never saved under a topic nobody typed (R1-20).
$('#gCode').addEventListener('change', () => { $('#gTopic').placeholder = topicHint($('#gCode').value); renderGroupList(); });
$('#gMin').addEventListener('input', e => e.target.classList.remove('is-missing'));
$('#fGroup').addEventListener('submit', async e => {
  e.preventDefault();
  if (!needProv()) return;
  const u = unit(), code = $('#gCode').value, d = fromInput($('#gDate').value), n = S.gsel.size;
  const dp = dateProblem($('#gDate').value, 'วันที่');
  if (!n || !d || dp) { toast(dp || 'เลือกผู้เข้าร่วมและวันที่ก่อนบันทึก'); return; }
  const minutes = Math.round(+$('#gMin').value);
  // 0 or 999 minutes are typing slips: ask again rather than store them (R1-20).
  if (!(minutes >= 5 && minutes <= 240)) { const g = $('#gMin'); g.classList.add('is-missing'); g.focus(); toast('ระยะเวลา 5–240 นาที'); return; }
  const topic = $('#gTopic').value.trim();
  const note = `${topic ? topic + ' · ' : ''}${minutes} นาที`;
  const status = u.arm === 'cap' ? 'recorded' : 'draft', gid = crypto.randomUUID();
  const ids = [...S.gsel].filter(id => u.byId[id] && (!perPerson(code) || canServe(u.byId[id])));
  if (!ids.length) { toast('ไม่มีผู้เข้าร่วมที่บันทึกได้'); return; }
  const rows = !perPerson(code)
    ? [{ unit_id: u.id, study_id: null, code, service_date: toInput(d), group_id: gid, group_note: note, n_participants: n, minutes, provider: S.prov, status }]
    : ids.map(id => { const k = u.byId[id]; const pf = planFor(k, { code, tooth: null, date: d });
        return { unit_id: u.id, study_id: id, code, service_date: toInput(d), group_id: gid, group_note: note, minutes, plan_key: pf ? pf.row.key : null, plan_month: pf ? pf.month : null, from_plan: false, provider: S.prov, status }; });
  $('#gSave').disabled = true;
  const ok = await insertServices(rows);
  $('#gSave').disabled = false;
  const files = $('#gFiles') ? [...$('#gFiles').files] : [];
  const nf = ok && files.length ? await uploadEvidence(u, gid, files) : 0;
  if (ok) { setIf('#gFiles', 'value', ''); toast((rows.length === 1 && !rows[0].study_id ? `บันทึกกิจกรรมแล้ว · 1 รายการ ผู้เข้าร่วม ${n} คน` : `บันทึกกิจกรรมแล้ว · ${rows.length} รายการ`) + (nf ? ` · แนบหลักฐาน ${nf} ไฟล์` : ' · ยังไม่ได้แนบหลักฐาน')); S.gsel.clear(); renderClaims(); }
});
function ledgerEntries(u) {
  const groups = new Map(), out = [];
  for (const tx of u.tx) {
    if (tx.gid && tx.kid) {
      if (!groups.has(tx.gid)) { const g = { group: true, gid: tx.gid, date: tx.date, code: tx.code, n: 0, ref: 0, status: tx.status, by: tx.by, note: tx.gnote, txs: [] }; groups.set(tx.gid, g); out.push(g); }
      const g = groups.get(tx.gid); g.n++; g.ref += txAmt(u, tx); g.txs.push(tx);
    } else out.push({ group: !tx.kid, tx, date: tx.date, code: tx.code, status: tx.status, ref: txAmt(u, tx), by: tx.by });
  }
  return out.sort((a, b) => b.date - a.date || (b.tx ? b.tx.id : 0) - (a.tx ? a.tx.id : 0));
}
async function setStatus(txs, status, label) {
  const ids = txs.map(t => t.id);
  const { error } = await sb.from('services').update({ status }).in('id', ids);
  if (error) { toastErr(error); return false; }
  txs.forEach(t => { t.status = status; });
  toast(label);
  return true;
}
async function deleteTx(txs, label) {
  const ret = txs.filter(t => t.status === 'returned');
  if (!confirm(`ลบ ${label} หรือไม่?${ret.length ? '\nรายการที่ทีมวิจัยส่งกลับจะถูกลบ แล้วบันทึกรายการที่ถูกต้องใหม่' : ''}`)) return;
  const ids = txs.map(t => t.id);
  // A returned claim can be removed (R1-15): the database lets a unit delete only drafts, so it goes back to draft first.
  if (ret.length) {
    const { error } = await sb.from('services').update({ status: 'draft' }).in('id', ret.map(t => t.id));
    if (error) { toastErr(error); return; }
    ret.forEach(t => { t.status = 'draft'; });
  }
  const { data, error } = await sb.from('services').delete().in('id', ids).select('id');
  if (error) { toastErr(error); renderClaims(); return; }
  const gone = new Set((data || []).map(r => r.id));
  const u = unit(); u.tx = u.tx.filter(t => !gone.has(t.id)); reindex(u);
  toast(gone.size === ids.length ? 'ลบแล้ว · ' + label : `ลบได้ ${gone.size}/${ids.length} รายการ รายการที่ส่งเบิกแล้วลบไม่ได้ กด "โหลดข้อมูลใหม่"`);
  renderClaims();
}
// Claims go in monthly: with a month chosen in the filter, only that month's drafts are sent (R1-15).
function renderLedgerActions(u) {
  const acts = $('#ledgerActions'); acts.replaceChildren();
  if (u.arm === 'cap') return;
  const all = S.lf.month === 'all';
  const drafts = u.tx.filter(t => t.status === 'draft' && (all || monKey(t.date) === S.lf.month));
  const byMonth = new Map();
  for (const t of drafts) byMonth.set(monKey(t.date), (byMonth.get(monKey(t.date)) || 0) + 1);
  const lines = [...byMonth.entries()].sort().map(([key, n]) => `- ${monKeyLabel(key)}: ${n} รายการ`).join('\n');
  acts.append(el('button', { class: 'btn btn--primary', type: 'button', disabled: drafts.length ? null : true,
    text: all ? `ส่งเบิกรายการที่ยังไม่ส่ง (${drafts.length})` : `ส่งเบิกเดือน ${monKeyLabel(S.lf.month)} (${drafts.length})`,
    onclick: async () => {
      if (confirm(`ส่งเบิก ${drafts.length} รายการให้ทีมวิจัยตรวจ?\n${lines}\nส่งแล้วแก้ไขหรือลบไม่ได้ จนกว่าทีมวิจัยจะส่งกลับ`)
        && await setStatus(drafts, 'submitted', `ส่งเบิกแล้ว ${drafts.length} รายการ · รอทีมวิจัยตรวจ`)) renderClaims();
    } }));
}
function renderClaims() {
  const u = unit();
  $('#clTitle').textContent = claimTab(u);
  $('#clSub').textContent = u.arm === 'cap'
    ? 'บันทึกทุกบริการเป็นผลงาน ใช้ติดตามแผนและวัดต้นทุน ไม่มีขั้นเบิกเงินรายรายการ เพราะหน่วยได้รับค่าเหมาจ่าย'
    : u.arm === 'ffs' ? 'บันทึกบริการแล้วส่งเบิกเดือนละครั้ง ภายในวันที่ 20 ของทุกเดือน ทีมวิจัยตรวจแล้วโอนภายในวันที่ 27 (02 ข้อ 6) ยอดเบิกทั้งหมดนับในเพดานงบรวมของหน่วย'
      : 'บันทึกบริการแล้วส่งเบิกที่ทีมวิจัยเดือนละครั้ง ภายในวันที่ 20 ของทุกเดือน ทีมวิจัยตรวจแล้วโอนภายในวันที่ 27 (03 ข้อ 5) เฉพาะรายการที่โครงการจ่าย รายการอื่นบันทึกเป็นผลงาน';
  const cnt = st => u.tx.filter(t => t.status === st);
  const sum = list => list.reduce((a, t) => a + txAmt(u, t), 0);
  setIf('#lAmtHead', 'textContent', amtLabel(u));
  if (u.arm === 'cap') {
    const thisMonth = u.tx.filter(t => t.date.getMonth() === TODAY.getMonth() && t.date.getFullYear() === TODAY.getFullYear()).length;
    $('#clStats').replaceChildren(tile('บริการที่บันทึกทั้งหมด', `${fmt(u.tx.length)} รายการ`), tile('เดือนนี้', `${thisMonth} รายการ`), tile('มูลค่าตามอัตราสะสม', `${fmt(sum(u.tx))} บาท`, 'ใช้วัดต้นทุนเทียบค่าเหมาจ่าย'));
  } else {
    $('#clStats').replaceChildren(
      tile('ยังไม่ส่ง', `${cnt('draft').length} รายการ`, `ยอดเบิก ${fmt(sum(cnt('draft')))} บาท`),
      tile('ส่งแล้ว รอตรวจ', `${cnt('submitted').length} รายการ`),
      tile('ส่งกลับแก้ไข', `${cnt('returned').length} รายการ`, cnt('returned').length ? 'ถ้ารายการผิด กด "ลบ" แล้วบันทึกใหม่ ถ้าถูกแล้วกด "ส่งใหม่"' : ''),
      tile('อนุมัติแล้ว · โอนแล้ว', `${cnt('approved').length} · ${cnt('paid').length} รายการ`));
  }
  const months = [...new Set(u.tx.map(t => monKey(t.date)))].sort().reverse();
  $('#lMonth').replaceChildren(el('option', { value: 'all', text: 'ทุกเดือน' }), ...months.map(mk => el('option', { value: mk, text: monKeyLabel(mk) })));
  if (!['all', ...months].includes(S.lf.month)) S.lf.month = 'all';
  $('#lMonth').value = S.lf.month;
  renderLedgerActions(u);
  const sts = u.arm === 'cap' ? [['all', 'ทุกสถานะ'], ['recorded', 'บันทึกแล้ว']] : [['all', 'ทุกสถานะ'], ['draft', 'ยังไม่ส่ง'], ['submitted', 'รอตรวจ'], ['returned', 'ส่งกลับแก้ไข'], ['approved', 'อนุมัติ รอโอน'], ['paid', 'โอนแล้ว']];
  $('#lStatus').replaceChildren(...sts.map(([v, lab]) => el('option', { value: v, text: lab })));
  $('#lStatus').value = S.lf.status;
  $('#lKind').value = S.lf.kind; $('#lQ').value = S.lf.q;
  renderLedger();
  renderGroupList();
  claimPreview();
  refreshPay();
}
// Why the project pays what it pays (NHSO first, outside the list …), under the amount.
const payNote = (u, tx) => (tx && u.arm !== 'cap' && payOf(tx) && payOf(tx).note ? el('div', { class: 'tiny muted', style: 'white-space:normal', text: payOf(tx).note }) : null);
function renderLedger() {
  const u = unit(), flags = txFlags(u);
  const q = S.lf.q.trim().toUpperCase();
  const rows = ledgerEntries(u).filter(x => {
    if (S.lf.month !== 'all' && monKey(x.date) !== S.lf.month) return false;
    if (S.lf.status !== 'all' && x.status !== S.lf.status) return false;
    if (S.lf.kind === 'one' && x.group) return false;
    if (S.lf.kind === 'group' && !x.group) return false;
    if (S.lf.kind === 'extra' && (x.group || planMatch(u.byId[x.tx.kid], x.tx))) return false;
    if (S.lf.kind === 'flag' && (x.group || !(flags.get(x.tx.id) || []).length)) return false;
    if (q) { if (x.group || !x.tx.kid || !x.tx.kid.toUpperCase().includes(q)) return false; }
    return true;
  });
  const tb = $('#ledgerBody'); tb.replaceChildren();
  for (const x of rows.slice(0, S.lf.limit)) {
    let who, svc, tooth = '–', plan, txs;
    if (x.gid) {
      txs = x.txs;
      who = el('span', {}, `กิจกรรมกลุ่ม · ${x.n} คน`);
      svc = el('span', {}, pname(x.code), el('div', { class: 'tiny muted', text: `นับต่อคน · ${x.note || ''}` }));
      plan = el('span', { class: 'chip chip--ok', text: 'ติ๊กในแผน' });
    } else if (!x.tx.kid) {
      txs = [x.tx];
      who = el('span', {}, `ทั้งโรงเรียน · ${x.tx.n || 0} คน`);
      svc = el('span', {}, pname(x.code), el('div', { class: 'tiny muted', text: `นับต่อครั้ง · ${x.tx.gnote || ''}` }));
      plan = el('span', { class: 'muted', text: '–' });
    } else {
      txs = [x.tx];
      const k = u.byId[x.tx.kid], pm = k ? planMatch(k, x.tx) : null, notes = flags.get(x.tx.id) || [];
      who = el('button', { class: 'linkbtn mono', type: 'button', text: x.tx.kid, onclick: () => openKid(x.tx.kid, 'tx') });
      svc = el('span', {}, pname(x.code), ...notes.map(n => el('div', { class: 'tiny', style: 'color:var(--warn)', text: n })),
        x.tx.status === 'returned' && x.tx.returnNote ? el('div', { class: 'tiny', style: 'color:var(--warn)', text: 'ทีมวิจัย: ' + x.tx.returnNote }) : null);
      tooth = x.tx.tooth ? String(x.tx.tooth) : '–';
      plan = pm ? el('span', { class: 'chip chip--ok', text: pm.anytime ? 'ตามแผน' : `ตามแผน ด.${txMonth(k, x.tx)}` }) : el('span', { class: 'chip chip--plain', text: 'นอกแผน' });
    }
    const label = x.gid ? `กิจกรรมกลุ่ม ${pname(x.code)} (${x.n} คน)` : `${x.tx.kid || 'ทั้งโรงเรียน'} · ${pname(x.code)}`;
    const gidOf = x.gid || (x.tx && x.tx.gid);
    const act = el('span', { class: 'row', style: 'gap:6px' },
      evButton(u, gidOf, x.code, () => { S.evOpen = S.evOpen === gidOf ? null : gidOf; renderLedger(); }),
      x.status === 'returned' ? el('button', { class: 'linkbtn', type: 'button', text: 'ส่งใหม่', onclick: async () => { if (await setStatus(txs, 'submitted', 'ส่งใหม่แล้ว · รอทีมวิจัยตรวจ')) renderClaims(); } }) : null,
      txs.every(canEdit) ? el('button', { class: 'linkbtn', type: 'button', text: 'ลบ', onclick: () => deleteTx(txs, label) }) : null);
    tb.append(el('tr', {}, el('td', { text: thShort(x.date) }), el('td', {}, who), el('td', { class: 'wrapcell' }, svc), el('td', { class: 'mono', text: tooth }), el('td', {}, plan),
      el('td', { class: 'num' + (x.ref ? '' : ' amt-0') }, fmt2(x.ref), payNote(u, x.tx)), el('td', {}, statusEl(txs[0])), el('td', { text: x.by || '–' }), el('td', {}, act)));
    if (gidOf && S.evOpen === gidOf) tb.append(evidencePanel(u, gidOf, 9, renderLedger));
  }
  if (!rows.length) tb.append(el('tr', {}, el('td', { colspan: '9', class: 'muted', text: u.tx.length ? 'ไม่มีรายการตรงกับตัวกรอง' : 'ยังไม่มีบริการที่บันทึก' })));
  $('#ledgerCount').textContent = `แสดง ${Math.min(rows.length, S.lf.limit)} จาก ${rows.length} รายการ (กิจกรรมกลุ่มรวมเป็นแถวเดียว)`;
  $('#ledgerMore').hidden = rows.length <= S.lf.limit;
}
[['#lMonth', 'month'], ['#lStatus', 'status'], ['#lKind', 'kind']].forEach(([s, key]) => $(s).addEventListener('change', e => { S.lf[key] = e.target.value; S.lf.limit = 40; renderLedger(); if (key === 'month') renderLedgerActions(unit()); }));
$('#lQ').addEventListener('input', e => { S.lf.q = e.target.value; S.lf.limit = 40; renderLedger(); });
$('#ledgerMore').addEventListener('click', () => { S.lf.limit += 40; renderLedger(); });

/* ================================================================ RESEARCH: all units */
// Claims review: approve or return submitted services. Amounts are what the project pays (v_services_pay).
function reviewSection(ids) {
  if (S.me.role !== 'research') return null;
  // The same notes units see (duplicates, outside the budget), computed once per unit (R1-15).
  const flags = Object.fromEntries(ids.map(id => [id, txFlags(S.units[id])]));
  const notesOf = x => flags[x.u.id].get(x.tx.id) || [];
  const all = ids.flatMap(id => S.units[id].tx.map(tx => ({ u: S.units[id], tx })));
  const sub = all.filter(x => x.tx.status === 'submitted'), appr = all.filter(x => x.tx.status === 'approved');
  const nFlag = sub.filter(x => notesOf(x).length).length;
  const act = async (list, status, label, extra) => {
    const byStatus = { status, ...(extra || {}) };
    const { error } = await sb.from('services').update(byStatus).in('id', list.map(x => x.tx.id));
    if (error) { toastErr(error); return; }
    list.forEach(x => { x.tx.status = status; if (extra && 'return_note' in extra) x.tx.returnNote = extra.return_note; });
    toast(label); renderResearch();
  };
  const tb = el('tbody'), evShown = new Set();
  for (const x of sub.slice(0, 200)) {
    const gid = x.tx.gid, evN = evOf(x.u, gid).length, needEv = EVIDENCE_CODES.includes(x.tx.code) && gid;
    tb.append(el('tr', {},
    el('td', { text: thShort(x.tx.date) }), el('td', { class: 'mono', text: x.u.letter }), el('td', { class: 'mono', text: x.tx.kid || 'กลุ่ม' }),
    el('td', { class: 'wrapcell' }, pname(x.tx.code), ...notesOf(x).map(n => el('div', { class: 'tiny', style: 'color:var(--warn)', text: n })),
      needEv && !evN ? el('div', { class: 'tiny', style: 'color:var(--warn)', text: 'ยังไม่แนบหลักฐาน (D-62)' }) : null,
      needEv ? evButton(x.u, gid, x.tx.code, () => { S.evOpen = S.evOpen === gid ? null : gid; renderResearch(); }) : null), el('td', { class: 'mono', text: x.tx.tooth ? String(x.tx.tooth) : '–' }),
    el('td', { class: 'num' }, fmt2(txAmt(x.u, x.tx)), payNote(x.u, x.tx)),
    el('td', {}, el('span', { class: 'row', style: 'gap:6px' },
      el('button', { class: 'linkbtn', type: 'button', text: 'อนุมัติ', onclick: () => act([x], 'approved', 'อนุมัติแล้ว 1 รายการ') }),
      el('button', { class: 'linkbtn', type: 'button', text: 'ส่งกลับ', onclick: () => { const r = prompt('เหตุผลที่ส่งกลับ (หน่วยบริการเห็นข้อความนี้)'); if (r) act([x], 'returned', 'ส่งกลับแล้ว 1 รายการ', { return_note: r }); } })))));
    if (needEv && S.evOpen === gid && !evShown.has(gid)) { evShown.add(gid); tb.append(evidencePanel(x.u, gid, 7, renderResearch)); }
  }
  return el('section', {},
    el('h2', { text: 'ตรวจรายการเบิก' }),
    el('div', { class: 'row' },
      el('button', { class: 'btn btn--primary', type: 'button', disabled: sub.length ? null : true, text: `อนุมัติทั้งหมดที่รอตรวจ (${sub.length})`, onclick: () => { if (confirm(`อนุมัติ ${sub.length} รายการ${nFlag ? ` (มีข้อสังเกต ${nFlag} รายการ)` : ''} ใช่หรือไม่`)) act(sub, 'approved', `อนุมัติแล้ว ${sub.length} รายการ`); } }),
      appr.length ? el('span', { class: 'small muted', text: `อนุมัติแล้ว รอโอน ${appr.length} รายการ ${fmt2(appr.reduce((a, x) => a + txAmt(x.u, x.tx), 0))} บาท · บันทึกการโอนที่ "บันทึกการโอนเงิน" ด้านล่าง` }) : null),
    nFlag ? el('p', { class: 'small', style: 'color:var(--warn)', text: `มีข้อสังเกต ${nFlag} รายการ (ดูใต้ชื่อบริการ) ตรวจก่อนอนุมัติทั้งหมด` }) : null,
    sub.length ? el('div', { class: 'tablewrap' }, el('table', { class: 'ledger' },
      el('thead', {}, el('tr', {}, ...['วันที่', 'หน่วย', 'นักเรียน', 'บริการ', 'ซี่', 'ยอดจ่าย', ''].map((h, i) => el('th', { scope: 'col', class: i === 5 ? 'num' : '', text: h })))), tb))
      : el('p', { class: 'small muted', text: 'ไม่มีรายการรอตรวจ' }),
    el('p', { class: 'small muted', text: 'ยอดจ่ายคิดตามอัตราค่าบริการ 01–03: บริการที่ สปสช. จ่ายก่อน (ตรวจ 174 ฟลูออไรด์ 170 ปีงบละครั้ง เคลือบหลุมร่องฟัน 2 ซี่แรก) โครงการจ่ายส่วนต่าง เด็กไม่มีสิทธิรัฐจ่ายเต็มอัตรา อุดฟันและ PRR จ่ายเฉพาะบนรถทันตกรรม (กลุ่มควบคุมจ่ายอุดฟันบนรถ ไม่จ่าย PRR) ฟันน้ำนมไม่นับ' }));
}
// Money per unit, cohort status and the van-filling setting, for the research team.
function moneyTable(ids) {
  const tb = el('tbody');
  for (const id of ids) {
    const u = S.units[id], b = unitBudget(u), c = unitClaims(u);
    tb.append(el('tr', {},
      el('th', { scope: 'row' }, u.name, el('div', { class: 'tiny muted mono', text: `${u.letter}${u.is_test ? ' · ทดสอบ' : ''}` })),
      el('td', { class: 'num', text: String(b.n) }),
      el('td', { class: 'num' }, u.arm === 'cap' ? `${fmt(b.cap)}` : u.arm === 'ffs' ? `${fmt(b.ceil)}` : '–', el('div', { class: 'tiny muted', text: u.arm === 'cap' ? 'เหมาจ่าย' : u.arm === 'ffs' ? 'เพดาน' : 'ไม่มีเพดาน' })),
      el('td', { class: 'num', text: u.arm === 'cap' ? '–' : fmt(c.claimed) }), el('td', { class: 'num', text: u.arm === 'cap' ? '–' : fmt(c.approved) }),
      el('td', { class: 'num', text: fmt(transferred(u)) }), el('td', { class: 'num', text: fmt(b.dataFee) }),
      el('td', {}, S.me.role === 'research'
        ? el('select', { 'aria-label': `รถทันตกรรม ${u.name} อุดฟันได้`, onchange: async e => {
            const v = e.target.value === '' ? null : e.target.value === 'y';
            const { error } = await sb.rpc('set_unit_van_fills', { p_unit: u.id, p_fills: v });
            if (error) { toastErr(error); return; }
            u.van_fills = v; toast('บันทึกแล้ว'); renderResearch();
          } }, ...[['', 'ยังไม่ตั้ง'], ['y', 'ได้'], ['n', 'ไม่ได้']].map(([v, t]) => el('option', { value: v, text: t, selected: (u.van_fills == null ? '' : u.van_fills ? 'y' : 'n') === v })))
        : (u.van_fills === true ? 'ได้' : u.van_fills === false ? 'ไม่ได้' : 'ยังไม่ตั้ง')),
      el('td', {}, u.cohort_submitted_at ? el('span', {}, thShort(new Date(u.cohort_submitted_at)), ' ',
        el('button', { class: 'linkbtn', type: 'button', text: 'เปิดใหม่', onclick: async () => {
          if (!confirm(`เปิด cohort ของ ${u.name} ใหม่? หน่วยจะลบแฟ้มนักเรียนได้อีกจนกว่าจะส่งใหม่`)) return;
          const { error } = await sb.rpc('reopen_cohort', { p_unit: u.id });
          if (error) { toastErr(error); return; }
          u.cohort_submitted_at = null; toast('เปิด cohort ใหม่แล้ว'); renderResearch();
        } })) : el('span', { class: 'muted', text: 'ยังไม่ส่ง' }))));
  }
  return el('section', {}, el('h2', { text: 'เงินแต่ละหน่วย' }),
    el('div', { class: 'tablewrap' }, el('table', { class: 'ledger' },
      el('thead', {}, el('tr', {}, ...['หน่วย', 'ตรวจครั้งแรก', 'เหมาจ่าย / เพดาน', 'เบิกแล้ว', 'อนุมัติ รอโอน', 'โอนแล้ว', 'ค่าเก็บข้อมูลรอบ 1', 'รถอุดฟันได้', 'cohort'].map((h, i) => el('th', { scope: 'col', class: i >= 1 && i <= 6 ? 'num' : '', text: h })))), tb)),
    el('p', { class: 'small muted', text: 'คำนวณจากผลตรวจครั้งแรก: เหมาจ่าย = แผนการดูแลตามอัตรา + อุดฟัน (ถ้ารถอุดฟันได้) − ส่วนที่เบิกจาก สปสช. (คนละ 700 บาท เด็กไม่มีสิทธิรัฐไม่หัก) · เพดาน = (แผน + อุดฟัน) × 1.2 − ส่วนที่เบิกจาก สปสช. · "รถอุดฟันได้" หน่วยตั้งเองตอนเริ่มใช้ ทีมวิจัยแก้ได้' }));
}
// The research team records a transfer with its slip; a claims transfer also marks that unit's approved services paid.
// The unit sees it on its home page as a new transfer (Percy 2 Nov).
function transferForm(ids) {
  if (S.me.role !== 'research') return null;
  const f = el('form', { class: 'card stack', id: 'fTransfer', novalidate: true });
  const uSel = el('select', { id: 'tUnit' }, ...ids.map(id => el('option', { value: id, text: `${S.units[id].name} (${S.units[id].letter})` })));
  const kSel = el('select', { id: 'tKind' }, ...Object.entries(KIND).map(([v, t]) => el('option', { value: v, text: t })));
  const amt = el('input', { id: 'tAmt', type: 'number', min: '0.01', step: '0.01', inputmode: 'decimal' });
  const date = el('input', { id: 'tDate', type: 'date', value: toInput(TODAY), max: toInput(TODAY) });
  const period = el('input', { id: 'tPeriod', type: 'month', placeholder: 'เช่น 2026-11' });
  const note = el('input', { id: 'tNote', type: 'text', autocomplete: 'off' });
  const slip = el('input', { id: 'tSlip', type: 'file', accept: 'image/jpeg,image/png,image/webp,application/pdf' });
  const mark = el('input', { id: 'tMark', type: 'checkbox', checked: true });
  const info = el('div', { class: 'preview', id: 'tInfo', 'aria-live': 'polite' });
  const approvedOf = u => u.tx.filter(t => t.status === 'approved');
  const suggest = () => {
    const u = S.units[uSel.value], b = unitBudget(u), ap = approvedOf(u), apSum = ap.reduce((a, t) => a + txAmt(u, t), 0);
    const lines = { claims: `อนุมัติแล้ว รอโอน ${ap.length} รายการ ${fmt2(apSum)} บาท`, advance: u.arm === 'cap' ? `งวดแรก 70% ของค่าเหมาจ่าย ${fmt2(b.cap * 0.7)} บาท` : 'ใช้กับหน่วยเหมาจ่ายรายหัว',
      data_fee: `ค่าเก็บข้อมูลรอบ 1: ${b.n} คน × 100 = ${fmt2(b.dataFee)} บาท` };
    fill(info, el('span', { class: 'small', text: lines[kSel.value] || 'ใส่จำนวนเงินตามสลิป' }));
    $('#tMarkWrap').hidden = kSel.value !== 'claims';
    $('#tMarkText').textContent = ` เปลี่ยนรายการที่อนุมัติแล้วของหน่วยนี้ ${ap.length} รายการ (${fmt2(apSum)} บาท) เป็น "โอนแล้ว"`;
  };
  [uSel, kSel].forEach(x => x.addEventListener('change', suggest));
  f.append(el('h3', { text: 'บันทึกการโอนเงิน' }),
    el('p', { class: 'small muted', text: 'บันทึกหลังโอนเงินจริง แนบสลิป (รูปหรือ PDF ไม่เกิน 5 MB) หน่วยบริการจะเห็นรายการและสลิปที่หน้าแรกพร้อมข้อความแจ้ง' }),
    el('div', { class: 'g2f' },
      el('label', { class: 'field' }, 'หน่วยบริการ', uSel), el('label', { class: 'field' }, 'รายการ', kSel),
      el('label', { class: 'field' }, 'จำนวนเงิน (บาท)', amt), el('label', { class: 'field' }, 'วันที่โอน', date),
      el('label', { class: 'field' }, 'งวด (เดือนของรายการเบิก)', period), el('label', { class: 'field' }, 'หมายเหตุ', note),
      el('label', { class: 'field' }, 'สลิปโอนเงิน', slip)),
    el('label', { class: 'chk', id: 'tMarkWrap' }, mark, el('span', { id: 'tMarkText' })),
    info, el('div', { class: 'row' }, el('button', { class: 'btn btn--primary', type: 'submit', id: 'tSave', text: 'บันทึกการโอนเงิน' })));
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const u = S.units[uSel.value], amount = +amt.value, file = slip.files && slip.files[0];
    const bad = t => fill(info, el('div', { class: 'err', text: t }));
    if (!(amount > 0)) return bad('ใส่จำนวนเงิน');
    const dp = dateProblem(date.value, 'วันที่โอน'); if (dp || !date.value) return bad(dp || 'ใส่วันที่โอน');
    if (file && file.size > 5 * 1024 * 1024) return bad('ไฟล์สลิปใหญ่เกิน 5 MB');
    const ids2 = kSel.value === 'claims' && mark.checked ? approvedOf(u).map(t => t.id) : [];
    if (!confirm(`บันทึกการโอน ${fmt2(amount)} บาท ให้ ${u.name}${ids2.length ? ` และเปลี่ยน ${ids2.length} รายการเป็นโอนแล้ว` : ''}?${file ? '' : '\nยังไม่ได้แนบสลิป'}`)) return;
    $('#tSave').disabled = true;
    try {
      let path = null;
      if (file) {
        const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
        path = `${u.id}/${toInput(fromInput(date.value))}-${crypto.randomUUID()}.${ext}`;
        const up = await sb.storage.from('slips').upload(path, file, { contentType: file.type });
        if (up.error) throw up.error;
      }
      const row = { unit_id: u.id, kind: kSel.value, amount, paid_on: date.value, period: period.value || null, note: note.value.trim() || null, slip_path: path };
      const { data, error } = await sb.rpc('record_transfer', { p_transfer: row, p_service_ids: ids2 });
      if (error) throw error;
      u.transfers.push({ id: data, ...row, seen_at: null });
      const paid = new Set(ids2); u.tx.forEach(t => { if (paid.has(t.id)) t.status = 'paid'; });
      toast(`บันทึกการโอนแล้ว ${fmt2(amount)} บาท · ${u.name} จะเห็นที่หน้าแรก`);
      renderResearch();
    } catch (err) { toastErr(err); }
    $('#tSave').disabled = false;
  });
  setTimeout(suggest, 0);
  return el('section', {}, f);
}
function renderResearch() {
  const tb = el('tbody');
  const ids = Object.keys(S.units).sort((a, b) => S.units[a].letter.localeCompare(S.units[b].letter));
  for (const id of ids) {
    const u = S.units[id];
    const n = u.kids.length, ex = u.kids.filter(examined).length, absent = u.kids.filter(k => k.status === 'absent').length;
    const consent = u.kids.filter(hasConsent).length;
    const lv = { low: 0, high: 0, vhigh: 0 };
    u.kids.filter(examined).forEach(k => { lv[lvlOf(k)]++; });
    tb.append(el('tr', {},
      el('th', { scope: 'row' }, u.name, el('div', { class: 'tiny muted mono', text: `${u.letter} · ${u.id}${u.is_test ? ' · ทดสอบ' : ''}` })),
      el('td', {}, el('span', { class: 'row', style: 'gap:8px' }, el('i', { class: 'key ' + ARM[u.arm].key }), ARM[u.arm].name)),
      el('td', { class: 'num', text: String(n) }), el('td', { class: 'num', text: String(consent) }), el('td', { class: 'num', text: String(ex) }), el('td', { class: 'num', text: String(absent) }),
      el('td', { class: 'num', text: `${lv.vhigh} · ${lv.high} · ${lv.low}` }), el('td', { class: 'num', text: String(u.kids.filter(needsReferral).length) })));
  }
  fill($('#research'),
    el('section', {},
      el('p', { class: 'eyebrow', text: 'ทีมวิจัย · คณะแพทยศาสตร์โรงพยาบาลรามาธิบดี' }),
      el('h1', { class: 'h-unit', text: 'ภาพรวมทุกหน่วย' }),
      el('p', { class: 'small muted', text: `${loadedText()} · ทีมวิจัยเห็นรหัสวิจัย ไม่เห็นชื่อหรือเลขบัตรประชาชน (D-18)` }),
      el('div', { class: 'tablewrap' }, el('table', { class: 'ledger' },
        el('thead', {}, el('tr', {}, ...['หน่วย', 'รูปแบบการจ่าย', 'ลงทะเบียน', 'ยินยอมครบ', 'ตรวจแล้ว', 'ขาดวันตรวจ', 'เสี่ยง สูงมาก · สูง · ต่ำ', 'ต้องส่งต่อ'].map((h, i) => el('th', { scope: 'col', class: i >= 2 ? 'num' : '', text: h })))), tb))),
    moneyTable(ids),
    reviewSection(ids),
    transferForm(ids),
    el('section', {},
      el('h2', { text: 'ดาวน์โหลดชุดข้อมูลวิจัย (CSV)' }),
      el('p', { class: 'small muted', text: 'ทุกหน่วยรวมกัน ใช้รหัสวิจัย ไม่มีชื่อ เลขบัตรประชาชน หรือวันเกิด (มีอายุเป็นเดือน ณ วันตรวจ)' }),
      exportButtons()));
  refreshPay();
}

/* ================================================================ boot */
$$('input[type="date"], input[type="month"]').forEach(i => ['input', 'change'].forEach(ev => i.addEventListener(ev, () => beHint(i))));
(async () => {
  if (!CFG.url || !CFG.anonKey) { $('#lgMsg').replaceChildren(el('div', { class: 'err', text: 'ยังไม่ได้ตั้งค่า config.js (URL และ anon key ของ Supabase)' })); return; }
  const { data: { session } } = await sb.auth.getSession();
  if (session) await afterLogin(); else show('login');
})();
})();
