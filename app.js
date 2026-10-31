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
const TH_M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const thDate = d => `${d.getDate()} ${TH_M[d.getMonth()]} ${d.getFullYear() + 543}`;
const thShort = d => `${d.getDate()} ${TH_M[d.getMonth()]} ${String(d.getFullYear() + 543).slice(2)}`;
const thMon = d => `${TH_M[d.getMonth()]} ${String(d.getFullYear() + 543).slice(2)}`;
const addMonths = (d, m) => { const x = new Date(d); x.setMonth(x.getMonth() + m); return x; };
const toInput = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromInput = s => { const [y, m, dd] = String(s || '').split('-').map(Number); return y && m && dd ? new Date(y, m - 1, dd) : null; };
const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
let TODAY = startOfDay(new Date());
const monthOf = (base, d) => Math.min(12, Math.max(1, Math.round((d - base) / 864e5 / 30.44)));
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
const emptyPigi = () => Object.fromEntries(PIGI_TEETH.map(t => [t, { pi: 0, gi: 0 }]));

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
  rows.push({ key: 'brush', code: '176', codes: ['176', '175'], label: 'ฝึกแปรงฟัน + อุปกรณ์', sub: 'ทำเป็นกิจกรรมกลุ่มได้ (หน้ากิจกรรมกลุ่มใน v1.1)', anytime: true });
  const teethRows = [];
  for (const pos of [...FPM, ...POS.filter(p => !FPM.includes(p))]) {
    const t = k.teeth[pos];
    const n = needOf(pos, k);
    if (n == null) continue;
    const no = toothNo(pos, t), prim = t.t === 'd', fpm = FPM.includes(pos) && t.t === 'p';
    const base = { tooth: no, anytime: true, prim };
    const primNote = prim ? ' · ฟันน้ำนม นอกงบโครงการ (D-54)' : '';
    if (n === 2 && fpm) {
      const occ = t.occ ?? t.B;
      teethRows.push({ ...base, key: `seal-${no}`, code: '171', codes: occ >= 3 ? ['171', '172'] : ['171'], label: 'เคลือบหลุมร่องฟัน', sub: (t.A === 1 || t.A === 7 ? 'เคลือบซ้ำ · ' : '') + (occ >= 1 ? `ICDAS ${occ} ด้านบดเคี้ยว` : 'ฟันกรามแท้ขึ้นแล้ว') + (t.partial ? ' · ขึ้นไม่เต็มซี่' : '') + (occ >= 3 ? ' · หรือ PRR' : '') });
    } else if (n === 4) {
      const code = fpm && t.B <= 4 ? '172' : '55';
      teethRows.push({ ...base, key: `tx-${no}`, code, codes: ['172', '55', '56', '57', 'SDF'], label: code === '172' ? 'PRR' : 'บูรณะฟัน', sub: `ICDAS ${t.B}` + (code === '55' ? ' · หรือ SDF 38%' : '') + primNote });
    } else if (n === 3) {
      teethRows.push({ ...base, key: `tx-${no}`, code: 'SDF', codes: ['SDF', '55', '56', '57'], label: 'ทา SDF 38%', sub: `ICDAS ${t.B} · ยังไม่มีราคา` + primNote });
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

/* ================================================================ money: reference values only in v1.0 */
// Unit price as in v0.7 (no LC for ศบส. and control, 100% LC for private trial arms). Primary teeth are
// outside the unit budget (D-54). Arm rules, caps and ceilings follow the fee schedules in v1.2.
function refValue(u, code, tooth) {
  const p = PRICE[code];
  if (!p || p.outside || p.unpriced || isPrimNo(tooth)) return 0;
  return u.arm === 'control' || u.ptype === 'public' ? p.lc : p.full;
}

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
  if (c === 'recall') return `ตรวจติดตาม ด.${m}`;
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
      if (txs.some(t => monthOf(k.base, t.date) === m)) done++;
      else { (m < cm ? miss : due).push({ c: catOf(row), t: chipText(row, m) }); cats.add(catOf(row)); }
    }
  }
  return { absent: false, miss, due, cats, done, total, refWait, next: next ? `${next.t} เดือนที่ ${next.m} (${thMon(addMonths(k.base, next.m))})` : '' };
}
const stFlags = st => ({ absent: st.absent, miss: st.miss.length > 0, due: st.due.length > 0, ref: st.refWait, ok: !st.absent && !st.miss.length && !st.due.length && !st.refWait });

/* ================================================================ data: load and map */
const S = {
  me: null, units: {}, acct: null, tab: 'home', kid: null, ftab: 'exam', sel: 16, prov: '', editId: null, newId: null, gsel: new Set(),
  kf: { q: '', cls: 'all', risk: 'all', st: 'all', miss: 'all', group: 'cls' },
  lf: { month: 'all', status: 'all', kind: 'all', q: '', limit: 40 },
};
const unit = () => S.units[S.acct];
const curKid = () => (unit() ? unit().byId[S.kid] : null);
const hasConsent = k => !!(k.c.consent_on && k.c.assent);

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
function txFrom(s) {
  return { id: s.id, kid: s.study_id, code: s.code, tooth: s.tooth, date: fromInput(s.service_date), status: s.status, fromPlan: s.from_plan,
    planKey: s.plan_key, by: s.provider || '', outcome: s.outcome, gid: s.group_id, gnote: s.group_note, n: s.n_participants, note: s.note, returnNote: s.return_note };
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
  k.urgent = { pain: false, swell: false, big: false, ...(ex ? ex.urgent : {}) };
  k.needOv = ex ? clone(ex.need_override) : {};
  k.ovReason = ex ? clone(ex.override_reason) : {};
  k.flOv = ex ? ex.fl_override : null;
  k.examiner = ex ? ex.examiner_code || '' : '';
  k.place = ex && ex.place ? ex.place : 'van';
}
// No names in the system (D-64): the unit matches study IDs to its own name list.
function setChild(k, c) {
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
const kidLabel = k => [k.cls, sexTh(k)].filter(Boolean).join(' · ');
function reindex(u) {
  u.txByKid = {};
  for (const tx of u.tx) if (tx.kid) (u.txByKid[tx.kid] ||= []).push(tx);
}
function sortKids(u) { u.kids.sort((a, b) => a.id.localeCompare(b.id)); }

async function loadAll() {
  const [units, schools, examiners, prices, children, exams, services] = await Promise.all([
    fetchAll('units', ['letter']), fetchAll('schools', ['id']), fetchAll('examiners', ['code']), fetchAll('price_list', ['code', 'valid_from']),
    fetchAll('children', ['study_id']), fetchAll('exams', ['id']), fetchAll('services', ['service_date', 'id']),
  ]);
  PRICE = {};
  const today = toInput(TODAY);
  for (const p of prices) {
    if (p.valid_from > today || (p.valid_to && p.valid_to <= today)) continue;
    PRICE[p.code] = { name: p.name, short: p.short, unit: p.unit, lc: +p.price_lc, full: +p.price_full, tooth: p.tooth_rule, group: p.group_kind, unpriced: p.unpriced, outside: p.outside };
  }
  S.units = {};
  for (const r of units) S.units[r.id] = { ...r, schools: [], examiners: [], kids: [], byId: {}, tx: [], txByKid: {}, exams: [] };
  for (const s of schools) S.units[s.unit_id]?.schools.push(s);
  for (const x of examiners) if (x.active) S.units[x.unit_id]?.examiners.push(x.code);
  const examBy = {};
  for (const e of exams) { if (e.round === 'baseline') examBy[e.study_id] = e; S.units[e.unit_id]?.exams.push(e); }
  for (const c of children) { const u = S.units[c.unit_id]; if (!u) continue; const k = kidFrom(c, examBy[c.study_id]); u.kids.push(k); u.byId[k.id] = k; }
  for (const s of services) S.units[s.unit_id]?.tx.push(txFrom(s));
  Object.values(S.units).forEach(reindex);
}

/* ================================================================ errors and toasts */
let toastT = null;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 4200); }
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
    chip.replaceChildren(el('i', { class: 'key ' + ARM[u.arm].key }), el('b', { text: u.name }), u.is_test ? el('span', { class: 'testflag', text: 'ทดสอบ' }) : null);
    const ps = $('#provSel');
    ps.replaceChildren(el('option', { value: '', text: '– เลือก –' }), ...u.examiners.map(c => el('option', { value: c, text: c })));
    S.prov = lsGet('dent2-prov-' + u.id) || '';
    if (!u.examiners.includes(S.prov)) S.prov = '';
    ps.value = S.prov;
    $('#provBox').hidden = false;
    S.kid = u.kids[0] ? u.kids[0].id : null;
  } else {
    chip.replaceChildren(el('i', { class: 'key key--ref' }), el('b', { text: S.me.display_name }), S.me.role === 'pi' ? 'PI' : 'ทีมวิจัย');
    $('#provBox').hidden = true;
  }
  $('#acctBox').hidden = false;
  show(S.me.role === 'unit' ? 'home' : 'research');
}
$('#provSel').addEventListener('change', e => { S.prov = e.target.value; lsSet('dent2-prov-' + S.acct, S.prov); });

async function logout(reason) {
  await sb.auth.signOut();
  Object.assign(S, { me: null, units: {}, acct: null, kid: null, editId: null });
  $('#tabs').hidden = true; $('#acctBox').hidden = true; hideSaveBar();
  show('login');
  if (reason) $('#lgMsg').replaceChildren(el('div', { class: 'hint', text: reason }));
}
$('#logoutBtn').addEventListener('click', () => { if (dirtyGuard()) logout(); });

// Shared clinic devices: sign out after 30 minutes without use.
let lastAct = Date.now();
['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => { lastAct = Date.now(); }, { passive: true }));
setInterval(() => { if (S.me && Date.now() - lastAct > 30 * 60e3) logout('ออกจากระบบอัตโนมัติ เพราะไม่มีการใช้งาน 30 นาที ผลตรวจที่ยังไม่กดบันทึกจะไม่ถูกเก็บ'); }, 60e3);

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
  if (id === 'home') renderHome();
  else if (id === 'kids') renderKids();
  else if (id === 'enrol') renderEnrol();
  else if (id === 'file') renderFile();
  else if (id === 'claims') { setupClaimsForm(); renderClaims(); }
  else if (id === 'research') renderResearch();
  window.scrollTo({ top: 0 });
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
    el('section', {},
      el('div', { class: 'row between' },
        el('div', { class: 'stack' }, el('p', { class: 'eyebrow', text: `${schoolNames} · ลงทะเบียน ${n} คน` }), el('h1', { class: 'h-unit', text: u.name })),
        el('span', { class: 'chip chip--plain' }, el('i', { class: 'key ' + ARM[u.arm].key }), ARM[u.arm].name)),
      el('p', { class: 'small muted', text: `ข้อมูล ณ ${thDate(TODAY)}${u.is_test ? ' · หน่วยทดสอบ ใช้ข้อมูลสมมติเท่านั้น' : ''}` }),
      el('div', { class: 'tiles' },
        tile('ลงทะเบียน', `${n} คน`, noConsent ? `ยังไม่มีความยินยอมครบ ${noConsent} คน` : 'มีความยินยอมครบทุกคน'),
        tile('ตรวจครั้งแรกแล้ว', `${ex}/${n}`, absent ? `ขาดเรียนวันตรวจ ${absent} คน` : ''),
        tile('ความเสี่ยง', `${lv.vhigh} · ${lv.high} · ${lv.low}`, 'สูงมาก · สูง · ต่ำ'),
        tile('ต้องส่งต่อหรือรักษาโพรงประสาท', `${ref} คน`),
        tile('ขาดบริการตามแผน', `${miss} คน`, `ถึงกำหนดเดือนนี้ ${due} คน`)),
      el('div', { class: 'row' },
        el('button', { class: 'btn btn--primary', type: 'button', 'data-go': 'enrol', text: '+ ลงทะเบียนนักเรียน' }),
        el('button', { class: 'btn', type: 'button', 'data-go': 'kids', text: 'รายชื่อนักเรียน' }))),
    el('section', {},
      el('h3', { text: 'ดาวน์โหลดข้อมูลของหน่วย' }),
      el('p', { class: 'small muted', text: 'ไฟล์ CSV ใช้รหัสวิจัยแทนชื่อ ไม่มีเลขบัตรประชาชน เปิดใน Excel ได้' }),
      exportButtons()),
    el('section', {},
      el('h3', { text: 'อยู่ใน v1.0 และรุ่นถัดไป' }),
      el('ul', { class: 'olist' },
        el('li', { text: 'v1.0 (ตอนนี้): ลงทะเบียน ผลตรวจครั้งแรกตามแบบฟอร์ม final แผนการดูแลรายเดือน ติ๊กแผนเพื่อบันทึกบริการ ดาวน์โหลด CSV' }),
        el('li', { text: 'v1.1: บันทึกบริการนอกแผน กิจกรรมกลุ่ม การส่งต่อ และรอบส่งเบิก' }),
        el('li', { text: 'v1.2: หน้าเงินของหน่วยตามอัตราค่าบริการของแต่ละรูปแบบ' }),
        el('li', { text: 'v1.3: ตรวจรอบ 6 และ 12 เดือน และตัวชี้วัด quality gate' }))));
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
  return el('span', { class: 'chip chip--crit', text: k.status === 'absent' ? 'ขาดเรียนวันตรวจ' : 'ยังไม่ได้ตรวจ' });
}
function kidCard(u, k, st) {
  const prog = st.total ? st.done / st.total * 100 : 0;
  const m = el('span', { class: 'meter', 'aria-hidden': 'true' }, el('span'));
  m.firstChild.style.width = prog + '%';
  const chips = el('span', { class: 'kc-chips' },
    !hasConsent(k) ? el('span', { class: 'chip chip--stop', text: 'ยังไม่มีความยินยอม' }) : null,
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
  $('#kidsSub').textContent = `${u.schools.map(s => s.name).join(', ')} · ${u.kids.length} คน · ข้อมูล ณ ${thDate(TODAY)}`;
  $('#qchips').replaceChildren(...[['all', 'ทั้งหมด', u.kids.length], ['miss', 'ขาดบริการ', counts.miss], ['due', 'ถึงกำหนดเดือนนี้', counts.due], ['ref', 'ส่งต่อรอผล', counts.ref], ['absent', 'ยังไม่ได้ตรวจ', counts.absent], ['ok', 'ครบตามแผน', counts.ok]].map(([v, lab, n]) =>
    el('button', { type: 'button', 'aria-pressed': String(S.kf.st === v), onclick: () => { S.kf.st = v; renderKids(); } }, lab, el('b', { text: String(n) }))));
  const classes = unitClasses(u);
  $('#kfCls').replaceChildren(el('option', { value: 'all', text: 'ทุกห้อง' }), ...classes.map(c => el('option', { value: c, text: c })));
  $('#kfQ').value = S.kf.q; $('#kfCls').value = S.kf.cls; $('#kfRisk').value = S.kf.risk; $('#kfSt').value = S.kf.st; $('#kfMiss').value = S.kf.miss; $('#kfGroup').value = S.kf.group;
  const q = S.kf.q.trim();
  const rows = all.filter(({ k, st }) => {
    const f = stFlags(st);
    if (q && !k.id.includes(q) && !k.name.includes(q)) return false;
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
function renderEnrol() {
  const u = unit();
  const k = S.editId ? u.byId[S.editId] : null;
  $('#enTitle').textContent = k ? `แก้ไขข้อมูลลงทะเบียน · ${k.id}` : 'ลงทะเบียนนักเรียน';
  $('#enSave').textContent = k ? 'บันทึกการแก้ไข' : 'บันทึกการลงทะเบียน';
  $('#enMsg').replaceChildren();
  $('#enSchool').replaceChildren(...u.schools.map(s => el('option', { value: s.id, text: s.name })));
  const c = k ? k.c : {};
  $('#enSchool').value = c.school_id || (u.schools[0] && u.schools[0].id) || '';
  $('#enSchool').disabled = !!k;
  fillClasses(u, $('#enSchool').value, c.class);
  $('#enSex').value = c.sex || '';
  $('#enBym').value = c.birth_ym || '';
  $('#enUc').checked = !!c.uc_verified; $('#enUcDate').value = c.uc_checked_on || ''; $('#enUcMethod').value = c.uc_method || '';
  $('#enConsent').value = c.consent_on || ''; $('#enAssent').checked = !!c.assent;
  $('#enCond').value = c.conditions || ''; $('#enAgSilver').checked = !!c.allergy_silver; $('#enAgColo').checked = !!c.allergy_colophony;
  $('#enBym').max = toInput(TODAY).slice(0, 7);
  for (const id of ['#enUcDate', '#enConsent']) $(id).max = toInput(TODAY);
}
$('#enSchool').addEventListener('change', e => fillClasses(unit(), e.target.value));
$('#enForm').addEventListener('submit', async e => {
  e.preventDefault();
  const u = unit(), k = S.editId ? u.byId[S.editId] : null;
  const msg = $('#enMsg'); msg.replaceChildren();
  const bad = t => msg.replaceChildren(el('div', { class: 'err', text: t }));
  if (!$('#enClass').value) return bad('เลือกห้องเรียน');
  if (!$('#enSex').value) return bad('เลือกเพศ');
  const bym = $('#enBym').value;
  if (bym && bym > toInput(TODAY).slice(0, 7)) return bad('เดือนปีเกิดอยู่ในอนาคต');
  for (const [id, lab] of [['#enUcDate', 'วันที่ตรวจสิทธิ'], ['#enConsent', 'วันที่ลงนามยินยอม']]) {
    const d = fromInput($(id).value); if (d && d > TODAY) return bad(`${lab}อยู่ในอนาคต`);
  }
  const child = {
    school_id: $('#enSchool').value, class: $('#enClass').value, sex: $('#enSex').value, birth_ym: bym || null,
    consent_on: $('#enConsent').value || null, assent: $('#enAssent').checked, uc_verified: $('#enUc').checked,
    uc_checked_on: $('#enUcDate').value || null, uc_method: $('#enUcMethod').value || null, conditions: $('#enCond').value.trim() || null,
    allergy_silver: $('#enAgSilver').checked, allergy_colophony: $('#enAgColo').checked,
  };
  $('#enSave').disabled = true;
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
    }
    S.editId = null; S.kid = id; S.ftab = 'exam';
    show('file');
  } catch (err) { bad('บันทึกไม่สำเร็จ · ' + errText(err)); }
  $('#enSave').disabled = false;
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
  if (!u.kids.length) {
    $('#fileHead').replaceChildren(el('p', { class: 'hint', text: 'ยังไม่มีนักเรียน ลงทะเบียนก่อนที่หน้า "นักเรียน"' }));
    for (const ft of ['exam', 'plan', 'tx']) $('#fp-' + ft).hidden = true;
    return;
  }
  if (!S.kid || !u.byId[S.kid]) S.kid = u.kids[0].id;
  const ks = $('#kidSel');
  ks.replaceChildren(...u.kids.map(k => el('option', { value: k.id, text: `${k.id} · ${kidLabel(k)}${examined(k) ? '' : ' · ยังไม่ได้ตรวจ'}` })));
  ks.value = S.kid;
  renderFileHead();
  for (const ft of ['exam', 'plan', 'tx']) { $('#fp-' + ft).hidden = S.ftab !== ft; $('#ft-' + ft).setAttribute('aria-selected', String(S.ftab === ft)); }
  if (S.ftab === 'exam') renderExam(); else if (S.ftab === 'plan') renderPlanGrid(); else renderKidTx();
  syncSaveBar();
}
$('#kidSel').addEventListener('change', e => { const id = e.target.value; e.target.value = S.kid; openKid(id); });
function renderFileHead() {
  const u = unit(), k = curKid(), st = kidState(u, k);
  const kv = (label, value) => el('div', { class: 'kv' }, el('span', { text: label }), el('b', {}, value));
  const school = u.schools.find(s => s.id === k.c.school_id);
  const fresh = S.newId === k.id;
  S.newId = null;
  $('#fileHead').replaceChildren(
    fresh ? el('div', { class: 'ok' }, el('b', { text: `ลงทะเบียนแล้ว รหัสนักเรียน ${k.id}` }), ' · เขียนรหัสนี้ไว้ข้างชื่อเด็กในรายชื่อของหน่วย ระบบไม่เก็บชื่อเด็ก') : null,
    el('div', { class: 'childbar' },
      kv('รหัสนักเรียน', el('span', { class: 'mono big-id', text: k.id })), kv('ชั้น', `${k.cls} · ${school ? school.name : ''}`), kv('เพศ', sexTh(k) || '–'),
      kv(examined(k) ? 'อายุ ณ วันตรวจ' : 'อายุวันนี้', ageText(k, k.base || TODAY)),
      kv('ความเสี่ยง', examined(k) ? el('span', { class: 'chip ' + LEVEL[lvlOf(k)].chip, text: `${LEVEL[lvlOf(k)].th} (${riskScore(k)})` }) : statusChip(k)),
      kv('ทำตามแผนถึงเดือนนี้', st.absent ? '–' : `${st.done}/${st.total} รายการ`)),
    !hasConsent(k) ? el('div', { class: 'alert', text: '⛔ ยังไม่มีความยินยอมของผู้ปกครองและเด็กครบ จึงบันทึกผลตรวจไม่ได้ กด "แก้ไขข้อมูลลงทะเบียน" เพื่อใส่วันที่ลงนามและติ๊กความยินยอมของเด็ก' }) : null,
    el('details', {}, el('summary', { text: 'ข้อมูลลงทะเบียน' }),
      el('div', { class: 'childbar', style: 'margin-top:10px' },
        kv('เดือนปีเกิด', k.birth ? thMon(k.birth) : '–'),
        kv('สิทธิ UC', k.c.uc_verified ? `ยืนยันแล้ว${k.c.uc_method ? ' (' + k.c.uc_method + ')' : ''}${k.c.uc_checked_on ? ' ' + thShort(fromInput(k.c.uc_checked_on)) : ''}` : 'ยังไม่ยืนยัน'),
        kv('ความยินยอม', `${k.c.consent_on ? 'ผู้ปกครองลงนาม ' + thShort(fromInput(k.c.consent_on)) : 'ผู้ปกครองยังไม่ลงนาม'} · ${k.c.assent ? 'เด็กยินยอม' : 'เด็กยังไม่ยินยอม'}`),
        kv('โรคประจำตัว · การแพ้', `${k.c.conditions || 'ไม่มี'} · ${[k.c.allergy_silver ? 'แพ้เงิน (ห้าม SDF)' : '', k.c.allergy_colophony ? 'แพ้โคโลโฟนี' : ''].filter(Boolean).join(', ') || 'ไม่มี'}`)),
      el('div', { class: 'row', style: 'margin-top:10px' }, el('button', { class: 'btn', type: 'button', text: 'แก้ไขข้อมูลลงทะเบียน', onclick: () => { if (dirtyGuard()) { S.editId = k.id; show('enrol'); } } }))));
  if (!hasConsent(k)) $('#fileHead details').open = true;
}

/* ---- exam */
function startExam(k) {
  const u = unit();
  k.editing = true; k.dirty = true;
  k.teeth = typicalMouth(); k.risk = {}; k.pigi = emptyPigi(); k.urgent = { pain: false, swell: false, big: false }; k.needOv = {}; k.ovReason = {}; k.flOv = null;
  k.examDate = new Date(TODAY); k.examiner = S.prov || u.examiners[0] || ''; k.place = 'van';
  S.sel = 16;
  renderFile();
}
async function markAbsent(k) {
  const u = unit();
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
      el('p', { class: 'small muted', text: 'ผลตรวจครั้งแรกบันทึกในระบบโดยตรง (D-17) แผนการดูแลสร้างหลังกดบันทึกผลตรวจ' }),
      el('div', { class: 'row' },
        el('button', { class: 'btn btn--primary', type: 'button', text: k.status === 'absent' ? 'บันทึกผลตรวจเก็บตก' : 'เริ่มบันทึกผลตรวจครั้งแรก', onclick: () => startExam(k) }),
        k.status === 'new' ? el('button', { class: 'btn', type: 'button', text: 'นักเรียนขาดเรียนวันตรวจ', onclick: () => markAbsent(k) }) : null))));
    return;
  }
  if (k.editing) box.append(el('p', { class: 'note', text: 'ผลตรวจใหม่ ตั้งต้นจาก "ช่องปากเด็ก 7 ปีปกติ" แก้เฉพาะซี่ที่ต่าง ตอบแบบประเมินความเสี่ยงให้ครบ 8 ข้อ แล้วกด "บันทึกผลตรวจ" ที่แถบด้านล่าง' }));
  const answered = riskAnswered(k), score = riskScore(k), lvl = riskLevel(score);
  $('#vDate').value = k.examDate ? toInput(k.examDate) : ''; $('#vDate').max = toInput(TODAY);
  $('#vExam').replaceChildren(el('option', { value: '', text: '– เลือก –' }), ...u.examiners.map(c => el('option', { value: c, text: c })));
  $('#vExam').value = k.examiner || '';
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
    for (const [v, lab, sc] of [['y', 'ใช่', q.y], ['n', 'ไม่ใช่', q.n]]) seg.append(el('button', { type: 'button', 'aria-pressed': String(k.risk[q.id] === v), text: `${lab} = ${sc}`, onclick: () => { k.risk[q.id] = v; afterExamChange(); } }));
    body.append(el('tr', {}, el('td', { text: q.q }), el('td', { class: 'num' }, seg)));
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
  const head = el('div', { class: 'stack' },
    el('h4', { text: `ตำแหน่ง ${pos}${FPM.includes(pos) ? ' · ฟันกรามแท้ซี่ที่หนึ่ง' : ''}` }),
    el('span', { class: 'small muted', text: 'ซี่ที่พบ (เท่ากับการวงกลมเลขซี่ในแบบกระดาษ)' }), typeSeg);
  if (t.t === 'n') {
    head.append(el('span', { class: 'small muted', text: 'เหตุผล' }), codeButtons([99, 97, 98, 96], t.A, v => set({ A: v }), CODE_N), el('p', { class: 'codedesc', text: CODE_N[t.A] }));
    box.append(el('div', { class: 'editor' }, head));
    return;
  }
  head.append(el('span', { class: 'small muted', text: 'ผุหรือไม่' }),
    el('span', {}, t.B >= 3 ? el('span', { class: 'chip chip--crit', text: `ผุ (ICDAS ${t.B})` }) : el('span', { class: 'chip chip--ok', text: `ไม่ผุ (ICDAS ${t.B})` })),
    el('p', { class: 'codedesc', text: t.t === 'd' ? 'ฟันน้ำนม: ใช้คำนวณ dmft และตัวชี้วัดฟันน้ำนมสูญเสียก่อนกำหนด (G4) การรักษาฟันน้ำนมไม่นับในงบโครงการ (D-54)' : 'ฟันแท้: ใช้คำนวณ DMFT และฟันผุใหม่ในฟันกรามแท้ (G3)' }));
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
$('#presetBtn').addEventListener('click', () => { const k = curKid(); k.teeth = typicalMouth(); k.needOv = {}; k.ovReason = {}; afterExamChange(); });
$$('#urgent input').forEach(b => b.addEventListener('change', () => { curKid().urgent[b.dataset.u] = b.checked; afterExamChange(); }));
function renderPigi(k) {
  const tb = $('#pigiBody'); tb.replaceChildren();
  for (const [idx, lab] of [['pi', 'PI คราบจุลินทรีย์'], ['gi', 'GI เหงือกอักเสบ']]) {
    const tr = el('tr', {}, el('th', { scope: 'row', text: lab }));
    for (const t of PIGI_TEETH) tr.append(el('td', { class: 'num' }, el('select', { 'aria-label': `${idx.toUpperCase()} ${t}`, onchange: e => { k.pigi[t][idx] = +e.target.value; k.dirty = true; renderPigi(k); syncSaveBar(); } }, ...[0, 1, 2, 3].map(v => el('option', { value: String(v), text: String(v), selected: k.pigi[t][idx] === v })))));
    const mean = PIGI_TEETH.reduce((s, t) => s + k.pigi[t][idx], 0) / PIGI_TEETH.length;
    tr.append(el('td', { class: 'num', text: mean.toFixed(2) }));
    tb.append(tr);
  }
}
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
  const mean = idx => (PIGI_TEETH.reduce((s, t) => s + k.pigi[t][idx], 0) / PIGI_TEETH.length).toFixed(2);
  const d0 = k.examDate || TODAY;
  $('#summary').replaceChildren(
    kv('ระดับความเสี่ยง', answered === 8 ? `${LEVEL[lvl].th} (${score})` : `ยังตอบไม่ครบ (${answered}/8)`), kv('dmft (ฟันน้ำนม)', String(ix.dmft)), kv('DMFT (ฟันแท้)', String(ix.DMFT)),
    kv('ฟันแท้ที่ขึ้นแล้ว', `${perm.length} ซี่ (ฟันกรามแท้ ${fpmUp}${part ? ` · ไม่เต็มซี่ ${part}` : ''} · ฟันหน้า ${perm.length - fpmUp})`),
    kv('ฟันผุ (ICDAS ≥3)', `ฟันแท้ ${ix.D} · ฟันน้ำนม ${ix.d} ซี่`), kv('ฟันกรามแท้ที่ต้องเคลือบ', `${fpmSeal} ซี่`),
    kv('PI · GI เฉลี่ย', `${mean('pi')} · ${mean('gi')}`), kv('นัดตรวจซ้ำ', answered === 8 ? thDate(addMonths(d0, LEVEL[lvl].recall)) : '–'),
    kv('ต้องส่งต่อหรือไม่', urg || refTeeth.length ? `ใช่ · ${refTeeth.join(', ') || 'อาการเร่งด่วน'}` : 'ไม่'));
}

/* ---- save bar and saving */
function syncSaveBar() {
  const k = S.tab === 'file' ? curKid() : null;
  $('#saveBar').hidden = !(k && k.dirty);
}
function hideSaveBar() { $('#saveBar').hidden = true; }
$('#discardBtn').addEventListener('click', () => { const k = curKid(); if (!k) return; discardExam(k); toast('ยกเลิกการแก้ไขแล้ว'); renderFile(); });
$('#saveExamBtn').addEventListener('click', saveExam);
async function saveExam() {
  const u = unit(), k = curKid();
  if (!k || !k.dirty) return;
  const answered = riskAnswered(k);
  if (answered < 8) { toast(`แบบประเมินความเสี่ยงตอบแล้ว ${answered}/8 ข้อ ตอบให้ครบก่อนบันทึก`); return; }
  if (!k.examDate || k.examDate > TODAY) { toast('ใส่วันที่ตรวจ (ไม่เกินวันนี้)'); return; }
  if (!k.examiner) { toast('เลือกรหัสผู้ตรวจ'); return; }
  if (!hasConsent(k)) { toast('ยังไม่มีความยินยอมครบ บันทึกผลตรวจไม่ได้'); return; }
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
    risk: k.risk, teeth, pigi: k.pigi, urgent: k.urgent, need_override: k.needOv, override_reason: ovReason, fl_override: k.flOv };
  $('#saveExamBtn').disabled = true;
  const res = k.exam ? await sb.from('exams').update(row).eq('id', k.exam.id).select().single() : await sb.from('exams').insert(row).select().single();
  $('#saveExamBtn').disabled = false;
  if (res.error) { toastErr(res.error); return; }
  const first = !k.exam || !k.exam.attended;
  applyExam(k, res.data);
  hideSaveBar();
  toast(first ? `บันทึกผลตรวจแล้ว · ${k.id} · ดูแผนการดูแลได้เลย` : `บันทึกการแก้ไขผลตรวจแล้ว · ${k.id}`);
  if (first) S.ftab = 'plan';
  renderFile();
}

/* ---- care plan month grid */
function rowName(row) { return `${row.label}${row.tooth ? ' ซี่ ' + row.tooth : ''}`; }
let busy = false;
async function toggleCell(k, row, m, tx) {
  const u = unit();
  if (busy) return;
  if (k.dirty) { toast('มีผลตรวจที่ยังไม่บันทึก บันทึกผลตรวจก่อนแล้วค่อยติ๊กแผน'); return; }
  busy = true;
  try {
    if (tx) {
      if (!['draft', 'recorded'].includes(tx.status)) { toast(`รายการนี้${STATUS[tx.status].th}แล้ว ยกเลิกในแผนไม่ได้`); return; }
      const { error } = await sb.from('services').delete().eq('id', tx.id);
      if (error) { toastErr(error); return; }
      u.tx = u.tx.filter(x => x !== tx); reindex(u);
      toast(`ยกเลิกแล้ว · ${rowName(row)}`);
    } else {
      const cm = monthOf(k.base, TODAY);
      const date = m === 'any' || m === cm ? new Date(TODAY) : new Date(Math.min(addMonths(k.base, m), TODAY));
      const code = row.code === 'STUDY' ? '174' : row.code;
      const ins = { unit_id: u.id, study_id: k.id, code, tooth: row.tooth ?? null, service_date: toInput(date), plan_key: row.key, plan_month: m === 'any' ? null : m,
        from_plan: true, provider: S.prov || null, status: u.arm === 'cap' ? 'recorded' : 'draft' };
      const { data, error } = await sb.from('services').insert(ins).select().single();
      if (error) { toastErr(error); return; }
      u.tx.push(txFrom(data)); reindex(u);
      const v = refValue(u, code, row.tooth);
      toast(`บันทึกแล้ว · ${rowName(row)} · ${thShort(date)}${v ? ` · มูลค่าอ้างอิง ${fmt2(v)} บาท` : ''}${S.prov ? '' : ' · ยังไม่ได้เลือกผู้บันทึกที่แถบด้านบน'}`);
    }
  } finally { busy = false; }
  renderFileHead(); renderPlanGrid();
}
function monthCell(k, row, m, cm, txs) {
  if (row.anytime) { const t = txs.find(x => monthOf(k.base, x.date) === m); return t ? el('span', { class: 'mdone', title: `ทำแล้ว ${thDate(t.date)}`, text: '✓' }) : ''; }
  const planned = row.months.includes(m);
  const inM = txs.filter(x => monthOf(k.base, x.date) === m);
  if (row.study) return planned ? el('span', { class: 'cellbtn is-study', title: `ตรวจรอบโครงการ ครั้งที่ ${m === 6 ? 2 : 3} (v1.3)`, 'aria-label': 'ตรวจรอบโครงการ' }) : el('span', { class: 'dash', 'aria-hidden': 'true', text: '–' });
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
  const wrap = $('#planGrid'); wrap.replaceChildren();
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
  for (let m = 1; m <= 12; m++) h2.append(el('th', { scope: 'col', class: m === cm ? 'cur' : '' }, el('span', { class: 'mno', text: String(m) }), el('span', { class: 'mcal', text: thMon(addMonths(k.base, m)) })));
  h2.append(el('th', { scope: 'col', class: 'anycol', text: 'ไม่ระบุเดือน' }));
  table.append(el('thead', {}, h1, h2));
  const tb = el('tbody');
  let lastGrp = null;
  for (const row of rows) {
    const grp = row.prim ? 'prim' : row.tooth || row.key === 'tx-urg' ? 'perm' : 'mouth';
    if (grp !== lastGrp) {
      const title = { mouth: 'ทั้งปาก / รายคน', perm: 'รายซี่ · ฟันแท้', prim: 'รายซี่ · ฟันน้ำนม (ไม่นับในงบโครงการ D-54)' }[grp];
      tb.append(el('tr', { class: 'sec' }, el('th', { colspan: '14', scope: 'colgroup', text: title })));
      lastGrp = grp;
    }
    const txs = row.study ? [] : rowTx(u, k, row);
    const tr = el('tr', {}, el('th', { scope: 'row', class: 'rowh' }, rowName(row), row.prim ? el('span', { class: 'chip chip--prim tiny', style: 'margin-left:6px', text: 'ฟันน้ำนม' }) : null, el('div', { class: 'tiny muted', text: row.sub })));
    for (let m = 1; m <= 12; m++) tr.append(el('td', { class: m === cm ? 'cur' : '' }, monthCell(k, row, m, cm, txs)));
    tr.append(el('td', { class: 'anycol' }, anyCell(k, row, txs)));
    tb.append(tr);
  }
  table.append(tb);
  wrap.append(table);
  $('#planHint').textContent = (u.arm === 'cap' ? 'ติ๊กช่องในแผนเมื่อให้บริการ ระบบบันทึกเป็นผลงาน' : 'ติ๊กช่องในแผนเมื่อให้บริการ ระบบสร้างรายการบริการ (ร่าง) ให้')
    + ' แตะซ้ำเพื่อยกเลิก วันที่บริการ = วันนี้ (หรือเดือนนั้นถ้าย้อนหลัง) ผู้บันทึกมาจากช่อง "ผู้บันทึก" ด้านบน บริการนอกแผนและกิจกรรมกลุ่มอยู่ใน v1.1';
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
    else for (const m of row.months) if (m <= cm) { dueN++; if (txs.some(t => monthOf(k.base, t.date) === m)) done++; }
  }
  const t = (label, value, note) => el('div', { class: 'stack' }, el('span', { class: 'small muted', text: label }), el('span', { class: 'big', text: value }), note ? el('span', { class: 'tiny muted', text: note }) : null);
  $('#planTotals').replaceChildren(
    t('มูลค่าแผนทั้งปี (ราคาอ้างอิง)', `${fmt(main)} บาท`, `ฟันแท้และบริการรายคน · ไม่รวมตรวจรอบโครงการ${unpriced ? ` · ยังไม่มีราคา ${unpriced} รายการ` : ''} · อัตราจ่ายจริงตาม fee schedule ใน v1.2`),
    t('รายการฟันน้ำนม', `${primN} รายการ`, 'บันทึกได้ ไม่นับในงบโครงการ (D-54)'),
    t('ทำแล้วตามกำหนด', `${done}/${dueN}`, `รายการที่ถึงกำหนดถึงเดือนที่ ${cm}`));
}
$('#printBtn').addEventListener('click', () => window.print());

/* ---- child's services */
function planMatch(k, tx) {
  if (!k || !examined(k)) return null;
  const m = monthOf(k.base, tx.date);
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
  $('#kidAddBtn').hidden = !examined(k);
  const tb = $('#kidTxBody'); tb.replaceChildren();
  const list = [...(u.txByKid[k.id] || [])].sort((a, b) => b.date - a.date || b.id - a.id);
  if (!list.length) { tb.append(el('tr', {}, el('td', { colspan: '8', class: 'muted', text: 'ยังไม่มีบริการที่บันทึก' }))); return; }
  for (const tx of list) {
    const pm = planMatch(k, tx), v = refValue(u, tx.code, tx.tooth);
    tb.append(el('tr', {},
      el('td', { text: thShort(tx.date) }), el('td', { class: 'num', text: examined(k) ? String(monthOf(k.base, tx.date)) : '–' }),
      el('td', { class: 'wrapcell' }, pname(tx.code), isPrimNo(tx.tooth) ? el('div', { class: 'tiny muted', text: 'ฟันน้ำนม นอกงบโครงการ (D-54)' }) : null),
      el('td', { class: 'mono', text: tx.tooth ? String(tx.tooth) : '–' }),
      el('td', {}, pm ? el('span', { class: 'chip chip--ok', text: 'ตามแผน' }) : el('span', { class: 'chip chip--plain', text: 'นอกแผน' })),
      el('td', { class: 'num' + (v ? '' : ' amt-0'), text: fmt2(v) }),
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
    if (isPrimNo(tx.tooth)) notes.push('ฟันน้ำนม ไม่นับในงบโครงการ (D-54)');
    if (PRICE[tx.code] && PRICE[tx.code].outside && !isPrimNo(tx.tooth)) notes.push('นอกงบโครงการ เบิกตามระบบปกติ');
    if (PRICE[tx.code] && PRICE[tx.code].unpriced) notes.push('ยังไม่มีราคา (นับจำนวนไว้)');
    if (tx.kid && tx.code === '170') {
      if (u.arm === 'control' ? bump(`170|${tx.kid}|${tx.date.getFullYear()}`) > 1 : bump(`170|${tx.kid}|${tx.date.getFullYear()}-${tx.date.getMonth()}`) > 1)
        notes.push(u.arm === 'control' ? 'ฟลูออไรด์เกินปีละ 1 ครั้ง (เงื่อนไข สปสช. รอยืนยัน)' : 'ฟลูออไรด์เกินเดือนละ 1 ครั้ง');
    }
    if (tx.kid && tx.code === '171' && bump(`171|${tx.kid}|${tx.tooth}`) > 1) notes.push('ซี่นี้เคลือบแล้ว เคลือบซ้ำเมื่อผลตรวจพบว่าหลุดหรือเหลือบางส่วน');
    if (tx.kid && tx.code === '176' && bump(`176|${tx.kid}|${tx.date.getFullYear()}`) > 1) notes.push('ชุดอุปกรณ์ปีละ 1 ครั้ง ฝึกซ้ำใช้รหัส 175');
    out.set(tx.id, notes);
  }
  return out;
}
const statusEl = tx => {
  const s = STATUS[tx.status] || { th: tx.status, c: 'var(--text-muted)' };
  return tx.status === 'returned' ? el('span', { class: 'chip chip--warn', text: s.th }) : el('span', { class: 'st' }, el('i', { style: `background:${s.c}` }), s.th);
};
const CODE_GROUPS = [['ตรวจ', ['174', '173']], ['ส่งเสริมและป้องกัน', ['170', '171', '172', '175', '176']], ['รักษา', ['55', '56', '57', 'SDF', '68', '178', '1']], ['ส่งต่อ', ['REF']]];
const canEdit = tx => ['draft', 'recorded', 'returned'].includes(tx.status);
const claimTab = u => (u.arm === 'cap' ? 'บันทึกบริการ' : 'บันทึกและเบิก');
function setupClaimsForm() {
  const u = unit();
  const kids = u.kids.filter(examined);
  $('#cKid').replaceChildren(...kids.map(k => el('option', { value: k.id, text: `${k.id} · ${kidLabel(k)}` })));
  if (S.kid && kids.some(k => k.id === S.kid)) $('#cKid').value = S.kid;
  $('#cCode').replaceChildren(...CODE_GROUPS.map(([lab, codes]) => el('optgroup', { label: lab }, ...codes.filter(c => PRICE[c]).map(c => el('option', { value: c, text: `${c === 'SDF' || c === 'REF' ? '' : c + ' · '}${pname(c)}` })))));
  if (!$('#cCode').value) $('#cCode').value = '170';
  for (const id of ['#cDate', '#gDate']) { $(id).value = toInput(TODAY); $(id).max = toInput(TODAY); }
  $('#gRooms').replaceChildren(el('legend', { class: 'small muted', text: 'ห้อง' }), ...unitClasses(u).map(c => el('label', { class: 'chk' }, el('input', { type: 'checkbox', value: c, checked: true, onchange: renderGroupList }), ' ' + c)));
  S.gsel = new Set();
}
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
  if (!k) { pv.append(el('span', { class: 'muted', text: 'ยังไม่มีนักเรียนที่บันทึกผลตรวจแล้ว บันทึกบริการรายคนได้หลังตรวจครั้งแรก' })); $('#cSave').disabled = true; return; }
  const opts = toothOptions(k, code);
  const tSel = $('#cTooth');
  $('#cToothWrap').hidden = !opts;
  if (opts) { const prev = tSel.value; tSel.replaceChildren(...opts.map(([v, lab]) => el('option', { value: v, text: lab }))); if (opts.some(o => o[0] === prev)) tSel.value = prev; }
  const tooth = opts && tSel.value ? +tSel.value : null;
  const d = fromInput($('#cDate').value);
  const line = (label, value) => el('div', { class: 'pl' }, el('span', { class: 'muted', text: label }), el('b', { text: value }));
  if (!d || d > TODAY || d < k.base) { pv.append(el('div', { class: 'hint', text: `วันที่ต้องอยู่ระหว่างวันตรวจครั้งแรก (${thShort(k.base)}) ถึงวันนี้ (${thShort(TODAY)})` })); $('#cSave').disabled = true; return; }
  if (opts && !opts.length) { pv.append(el('div', { class: 'hint', text: PRICE[code].tooth === 'fpm' ? 'นักเรียนคนนี้ยังไม่มีฟันกรามแท้ซี่ที่หนึ่งที่ขึ้นแล้ว เคลือบหลุมร่องฟันเฉพาะฟันกรามแท้ซี่ที่หนึ่ง (D-09)' : 'ไม่มีซี่ที่เข้าเงื่อนไขของบริการนี้ในผลตรวจ' })); $('#cSave').disabled = true; return; }
  if (code === 'SDF' && k.c.allergy_silver) { pv.append(el('div', { class: 'alert', text: '⛔ นักเรียนคนนี้แพ้เงิน ห้ามใช้ SDF' })); $('#cSave').disabled = true; return; }
  $('#cSave').disabled = false;
  const pm = planMatch(k, { code, tooth, date: d });
  const v = refValue(u, code, tooth);
  pv.append(line('นักเรียน', `${k.id} · ${kidLabel(k)} · เดือนที่ ${monthOf(k.base, d)} หลังตรวจครั้งแรก`),
    line('แผน', pm ? `ตรงกับแผน: ${rowName(pm)} · ติ๊กในแผนให้` : 'นอกแผน · บันทึกได้ ติดป้าย "นอกแผน"'),
    line('มูลค่าอ้างอิง', v ? `${fmt2(v)} บาท` : '0 บาท'));
  if (isPrimNo(tooth)) pv.append(el('div', { class: 'note', text: 'ฟันน้ำนม: บันทึกเป็นผลงาน ไม่นับในงบโครงการ (D-54)' }));
  if (code === '170' && k.c.allergy_colophony) pv.append(el('div', { class: 'hint', text: 'นักเรียนคนนี้แพ้โคโลโฟนี ระวังฟลูออไรด์วาร์นิช' }));
}
['#cKid', '#cCode', '#cTooth', '#cDate'].forEach(s => $(s).addEventListener('change', claimPreview));
async function insertServices(rows) {
  const { data, error } = await sb.from('services').insert(rows).select();
  if (error) { toastErr(error); return null; }
  const u = unit();
  data.forEach(r => u.tx.push(txFrom(r))); reindex(u);
  return data;
}
$('#fOne').addEventListener('submit', async e => {
  e.preventDefault();
  if ($('#cSave').disabled) return;
  const u = unit(), k = u.byId[$('#cKid').value], code = $('#cCode').value, d = fromInput($('#cDate').value);
  if (!k || !d) return;
  const tooth = !$('#cToothWrap').hidden && $('#cTooth').value ? +$('#cTooth').value : null;
  const pm = planMatch(k, { code, tooth, date: d });
  $('#cSave').disabled = true;
  const ok = await insertServices([{ unit_id: u.id, study_id: k.id, code, tooth, service_date: toInput(d), plan_key: pm ? pm.key : null,
    plan_month: pm && !pm.anytime ? monthOf(k.base, d) : null, from_plan: false, provider: S.prov || null, status: u.arm === 'cap' ? 'recorded' : 'draft' }]);
  $('#cSave').disabled = false;
  if (ok) { toast(`บันทึกแล้ว · ${k.id} · ${pname(code)}${tooth ? ' ซี่ ' + tooth : ''} · ${pm ? 'ติ๊กในแผนให้แล้ว' : 'นอกแผน'}`); renderClaims(); }
});
function groupKids() {
  const rooms = $$('#gRooms input:checked').map(x => x.value);
  return unit().kids.filter(k => rooms.includes(k.cls) && k.c.status !== 'withdrawn');
}
function renderGroupList() {
  const list = groupKids();
  for (const id of [...S.gsel]) if (!list.some(k => k.id === id)) S.gsel.delete(id);
  $('#gList').replaceChildren(...list.map(k => el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: S.gsel.has(k.id), onchange: e => { if (e.target.checked) S.gsel.add(k.id); else S.gsel.delete(k.id); groupPreview(); } }), ` ${k.id}`)));
  $('#gAll').textContent = `ทำให้ทุกคน (${list.length} คน)`;
  groupPreview();
}
function groupPreview() {
  const u = unit(), code = $('#gCode').value, n = S.gsel.size, price = refValue(u, code, null);
  $('#gCount').textContent = `เลือกแล้ว ${n} คน`;
  const pv = $('#gPreview'); pv.replaceChildren();
  const line = (label, value) => el('div', { class: 'pl' }, el('span', { class: 'muted', text: label }), el('b', { text: value }));
  if (!n) { pv.append(el('span', { class: 'muted', text: 'กด "ทำให้ทุกคน" แล้วเอารหัสของคนที่ขาดออก หรือเลือกทีละคน' })); return; }
  const had = code === '176' ? [...S.gsel].filter(id => (u.txByKid[id] || []).some(t => t.code === '176' && t.date.getFullYear() === TODAY.getFullYear())).length : 0;
  if (PRICE[code] && PRICE[code].group === 'session') pv.append(line('จะบันทึก', `1 รายการ (นับต่อครั้ง) · ผู้เข้าร่วม ${n} คน`), line('มูลค่าอ้างอิง', `${fmt2(price)} บาท`));
  else pv.append(line('จะบันทึก', `${n} รายการ (นับต่อคน) · ผูกกับแฟ้มของแต่ละคน`), line('มูลค่าอ้างอิง', `${fmt2(price)} × ${n} = ${fmt2(price * n)} บาท`));
  if (had) pv.append(el('div', { class: 'note', text: `${had} คนได้ชุดอุปกรณ์แล้วปีนี้ ฝึกซ้ำให้เลือก "ฝึกแปรงฟันรายบุคคล" (175)` }));
  if (code === '176' || code === '175') pv.append(el('div', { class: 'note', text: 'ช่อง "ฝึกแปรงฟัน" ในแผนของทุกคนที่เลือกจะติ๊กให้อัตโนมัติ' }));
}
$('#gAll').addEventListener('click', () => { groupKids().forEach(k => S.gsel.add(k.id)); renderGroupList(); });
$('#gNone').addEventListener('click', () => { S.gsel.clear(); renderGroupList(); });
$('#gCode').addEventListener('change', () => { const c = $('#gCode').value; $('#gTopic').value = c === '177' ? 'ขนมหวานกับฟันผุ' : 'สอนแปรงฟันแบบขยับปัด'; groupPreview(); });
$('#fGroup').addEventListener('submit', async e => {
  e.preventDefault();
  const u = unit(), code = $('#gCode').value, d = fromInput($('#gDate').value), n = S.gsel.size;
  if (!n || !d || d > TODAY) { toast('เลือกผู้เข้าร่วมและวันที่ก่อนบันทึก'); return; }
  const note = `${$('#gTopic').value.trim()} · ${$('#gMin').value} นาที`;
  const status = u.arm === 'cap' ? 'recorded' : 'draft', gid = crypto.randomUUID(), minutes = +$('#gMin').value || null;
  const rows = PRICE[code].group === 'session'
    ? [{ unit_id: u.id, study_id: null, code, service_date: toInput(d), group_id: gid, group_note: note, n_participants: n, minutes, provider: S.prov || null, status }]
    : [...S.gsel].map(id => { const k = u.byId[id]; const pm = examined(k) ? planMatch(k, { code, tooth: null, date: d }) : null;
        return { unit_id: u.id, study_id: id, code, service_date: toInput(d), group_id: gid, group_note: note, minutes, plan_key: pm ? pm.key : null, from_plan: false, provider: S.prov || null, status }; });
  $('#gSave').disabled = true;
  const ok = await insertServices(rows);
  $('#gSave').disabled = false;
  if (ok) { toast(rows.length === 1 && !rows[0].study_id ? `บันทึกกิจกรรมแล้ว · 1 รายการ ผู้เข้าร่วม ${n} คน` : `บันทึกกิจกรรมแล้ว · ${rows.length} รายการ`); S.gsel.clear(); renderClaims(); }
});
function ledgerEntries(u) {
  const groups = new Map(), out = [];
  for (const tx of u.tx) {
    if (tx.gid && tx.kid) {
      if (!groups.has(tx.gid)) { const g = { group: true, gid: tx.gid, date: tx.date, code: tx.code, n: 0, ref: 0, status: tx.status, by: tx.by, note: tx.gnote, txs: [] }; groups.set(tx.gid, g); out.push(g); }
      const g = groups.get(tx.gid); g.n++; g.ref += refValue(u, tx.code, tx.tooth); g.txs.push(tx);
    } else out.push({ group: !tx.kid, tx, date: tx.date, code: tx.code, status: tx.status, ref: refValue(u, tx.code, tx.tooth), by: tx.by });
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
  if (!confirm(`ลบ ${label} หรือไม่?`)) return;
  const ids = txs.map(t => t.id);
  const { error } = await sb.from('services').delete().in('id', ids);
  if (error) { toastErr(error); return; }
  const u = unit(); u.tx = u.tx.filter(t => !ids.includes(t.id)); reindex(u);
  toast('ลบแล้ว · ' + label);
  renderClaims();
}
function renderClaims() {
  const u = unit();
  $('#clTitle').textContent = claimTab(u);
  $('#clSub').textContent = u.arm === 'cap'
    ? 'บันทึกทุกบริการเป็นผลงาน ใช้ติดตามแผนและวัดต้นทุน ไม่มีขั้นเบิกเงินรายรายการ เพราะหน่วยได้รับค่าเหมาจ่าย'
    : u.arm === 'ffs' ? 'บันทึกบริการแล้วส่งเบิกเดือนละครั้ง ยอดเบิกทั้งหมดนับในเพดานงบรวมของหน่วย'
      : 'บันทึกบริการแล้วส่งเบิกที่ทีมวิจัยเดือนละครั้ง เฉพาะรายการที่โครงการจ่าย รายการอื่นบันทึกเป็นผลงาน';
  const cnt = st => u.tx.filter(t => t.status === st);
  const sum = list => list.reduce((a, t) => a + refValue(u, t.code, t.tooth), 0);
  if (u.arm === 'cap') {
    const thisMonth = u.tx.filter(t => t.date.getMonth() === TODAY.getMonth() && t.date.getFullYear() === TODAY.getFullYear()).length;
    $('#clStats').replaceChildren(tile('บริการที่บันทึกทั้งหมด', `${fmt(u.tx.length)} รายการ`), tile('เดือนนี้', `${thisMonth} รายการ`), tile('มูลค่าอ้างอิงสะสม', `${fmt(sum(u.tx))} บาท`, 'ใช้วัดต้นทุนเทียบค่าเหมาจ่าย'));
  } else {
    $('#clStats').replaceChildren(
      tile('ยังไม่ส่ง', `${cnt('draft').length} รายการ`, `มูลค่าอ้างอิง ${fmt(sum(cnt('draft')))} บาท`),
      tile('ส่งแล้ว รอตรวจ', `${cnt('submitted').length} รายการ`),
      tile('ส่งกลับแก้ไข', `${cnt('returned').length} รายการ`, cnt('returned').length ? 'แก้แล้วกด "ส่งใหม่" ที่แถวนั้น' : ''),
      tile('อนุมัติแล้ว · โอนแล้ว', `${cnt('approved').length} · ${cnt('paid').length} รายการ`));
  }
  const acts = $('#ledgerActions'); acts.replaceChildren();
  if (u.arm !== 'cap') {
    const drafts = cnt('draft');
    acts.append(el('button', { class: 'btn btn--primary', type: 'button', disabled: drafts.length ? null : true, text: `ส่งเบิกรายการที่ยังไม่ส่ง (${drafts.length})`,
      onclick: async () => { if (confirm(`ส่งเบิก ${drafts.length} รายการให้ทีมวิจัยตรวจ? ส่งแล้วแก้ไขหรือลบไม่ได้ จนกว่าทีมวิจัยจะส่งกลับ`) && await setStatus(drafts, 'submitted', `ส่งเบิกแล้ว ${drafts.length} รายการ · รอทีมวิจัยตรวจ`)) renderClaims(); } }));
  }
  const months = [...new Set(u.tx.map(t => `${t.date.getFullYear()}-${t.date.getMonth()}`))].sort().reverse();
  $('#lMonth').replaceChildren(el('option', { value: 'all', text: 'ทุกเดือน' }), ...months.map(mk => { const [y, m] = mk.split('-').map(Number); return el('option', { value: mk, text: thMon(new Date(y, m, 1)) }); }));
  if (!['all', ...months].includes(S.lf.month)) S.lf.month = 'all';
  $('#lMonth').value = S.lf.month;
  const sts = u.arm === 'cap' ? [['all', 'ทุกสถานะ'], ['recorded', 'บันทึกแล้ว']] : [['all', 'ทุกสถานะ'], ['draft', 'ยังไม่ส่ง'], ['submitted', 'รอตรวจ'], ['returned', 'ส่งกลับแก้ไข'], ['approved', 'อนุมัติ รอโอน'], ['paid', 'โอนแล้ว']];
  $('#lStatus').replaceChildren(...sts.map(([v, lab]) => el('option', { value: v, text: lab })));
  $('#lStatus').value = S.lf.status;
  $('#lKind').value = S.lf.kind; $('#lQ').value = S.lf.q;
  renderLedger();
  renderGroupList();
  claimPreview();
}
function renderLedger() {
  const u = unit(), flags = txFlags(u);
  const q = S.lf.q.trim();
  const rows = ledgerEntries(u).filter(x => {
    if (S.lf.month !== 'all' && `${x.date.getFullYear()}-${x.date.getMonth()}` !== S.lf.month) return false;
    if (S.lf.status !== 'all' && x.status !== S.lf.status) return false;
    if (S.lf.kind === 'one' && x.group) return false;
    if (S.lf.kind === 'group' && !x.group) return false;
    if (S.lf.kind === 'extra' && (x.group || planMatch(u.byId[x.tx.kid], x.tx))) return false;
    if (S.lf.kind === 'flag' && (x.group || !(flags.get(x.tx.id) || []).length)) return false;
    if (q) { if (x.group || !x.tx.kid || !x.tx.kid.includes(q)) return false; }
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
      plan = pm ? el('span', { class: 'chip chip--ok', text: pm.anytime ? 'ตามแผน' : `ตามแผน ด.${monthOf(k.base, x.tx.date)}` }) : el('span', { class: 'chip chip--plain', text: 'นอกแผน' });
    }
    const label = x.gid ? `กิจกรรมกลุ่ม ${pname(x.code)} (${x.n} คน)` : `${x.tx.kid || 'ทั้งโรงเรียน'} · ${pname(x.code)}`;
    const act = el('span', { class: 'row', style: 'gap:6px' },
      x.status === 'returned' ? el('button', { class: 'linkbtn', type: 'button', text: 'ส่งใหม่', onclick: async () => { if (await setStatus(txs, 'submitted', 'ส่งใหม่แล้ว · รอทีมวิจัยตรวจ')) renderClaims(); } }) : null,
      txs.every(canEdit) && x.status !== 'returned' ? el('button', { class: 'linkbtn', type: 'button', text: 'ลบ', onclick: () => deleteTx(txs, label) }) : null);
    tb.append(el('tr', {}, el('td', { text: thShort(x.date) }), el('td', {}, who), el('td', { class: 'wrapcell' }, svc), el('td', { class: 'mono', text: tooth }), el('td', {}, plan),
      el('td', { class: 'num' + (x.ref ? '' : ' amt-0'), text: fmt2(x.ref) }), el('td', {}, statusEl(txs[0])), el('td', { text: x.by || '–' }), el('td', {}, act)));
  }
  if (!rows.length) tb.append(el('tr', {}, el('td', { colspan: '9', class: 'muted', text: u.tx.length ? 'ไม่มีรายการตรงกับตัวกรอง' : 'ยังไม่มีบริการที่บันทึก' })));
  $('#ledgerCount').textContent = `แสดง ${Math.min(rows.length, S.lf.limit)} จาก ${rows.length} รายการ (กิจกรรมกลุ่มรวมเป็นแถวเดียว)`;
  $('#ledgerMore').hidden = rows.length <= S.lf.limit;
}
[['#lMonth', 'month'], ['#lStatus', 'status'], ['#lKind', 'kind']].forEach(([s, key]) => $(s).addEventListener('change', e => { S.lf[key] = e.target.value; S.lf.limit = 40; renderLedger(); }));
$('#lQ').addEventListener('input', e => { S.lf.q = e.target.value; S.lf.limit = 40; renderLedger(); });
$('#ledgerMore').addEventListener('click', () => { S.lf.limit += 40; renderLedger(); });

/* ================================================================ RESEARCH: all units */
// Claims review: approve or return submitted services, record transfers. Payable amounts by fee schedule come in v1.2.
function reviewSection(ids) {
  if (S.me.role !== 'research') return null;
  const all = ids.flatMap(id => S.units[id].tx.map(tx => ({ u: S.units[id], tx })));
  const sub = all.filter(x => x.tx.status === 'submitted'), appr = all.filter(x => x.tx.status === 'approved');
  const act = async (list, status, label, extra) => {
    const byStatus = { status, ...(extra || {}) };
    const { error } = await sb.from('services').update(byStatus).in('id', list.map(x => x.tx.id));
    if (error) { toastErr(error); return; }
    list.forEach(x => { x.tx.status = status; if (extra && 'return_note' in extra) x.tx.returnNote = extra.return_note; });
    toast(label); renderResearch();
  };
  const tb = el('tbody');
  for (const x of sub.slice(0, 200)) tb.append(el('tr', {},
    el('td', { text: thShort(x.tx.date) }), el('td', { class: 'mono', text: x.u.letter }), el('td', { class: 'mono', text: x.tx.kid || 'กลุ่ม' }),
    el('td', { class: 'wrapcell', text: pname(x.tx.code) }), el('td', { class: 'mono', text: x.tx.tooth ? String(x.tx.tooth) : '–' }),
    el('td', { class: 'num', text: fmt2(refValue(x.u, x.tx.code, x.tx.tooth)) }),
    el('td', {}, el('span', { class: 'row', style: 'gap:6px' },
      el('button', { class: 'linkbtn', type: 'button', text: 'อนุมัติ', onclick: () => act([x], 'approved', 'อนุมัติแล้ว 1 รายการ') }),
      el('button', { class: 'linkbtn', type: 'button', text: 'ส่งกลับ', onclick: () => { const r = prompt('เหตุผลที่ส่งกลับ (หน่วยบริการเห็นข้อความนี้)'); if (r) act([x], 'returned', 'ส่งกลับแล้ว 1 รายการ', { return_note: r }); } })))));
  return el('section', {},
    el('h2', { text: 'ตรวจรายการเบิก' }),
    el('div', { class: 'row' },
      el('button', { class: 'btn btn--primary', type: 'button', disabled: sub.length ? null : true, text: `อนุมัติทั้งหมดที่รอตรวจ (${sub.length})`, onclick: () => { if (confirm(`อนุมัติ ${sub.length} รายการ?`)) act(sub, 'approved', `อนุมัติแล้ว ${sub.length} รายการ`); } }),
      el('button', { class: 'btn', type: 'button', disabled: appr.length ? null : true, text: `บันทึกว่าโอนแล้ว (${appr.length})`, onclick: () => { if (confirm(`บันทึกว่าโอนเงินแล้ว ${appr.length} รายการ?`)) act(appr, 'paid', `บันทึกการโอนแล้ว ${appr.length} รายการ`); } })),
    sub.length ? el('div', { class: 'tablewrap' }, el('table', { class: 'ledger' },
      el('thead', {}, el('tr', {}, ...['วันที่', 'หน่วย', 'นักเรียน', 'บริการ', 'ซี่', 'มูลค่าอ้างอิง', ''].map((h, i) => el('th', { scope: 'col', class: i === 5 ? 'num' : '', text: h })))), tb))
      : el('p', { class: 'small muted', text: 'ไม่มีรายการรอตรวจ' }),
    el('p', { class: 'small muted', text: 'ยอดที่จ่ายจริงคิดตามอัตราค่าบริการของแต่ละรูปแบบการจ่าย (fee schedule) ในรุ่น v1.2 ตอนนี้แสดงมูลค่าอ้างอิง' }));
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
  $('#research').replaceChildren(
    el('section', {},
      el('p', { class: 'eyebrow', text: 'ทีมวิจัย · คณะแพทยศาสตร์โรงพยาบาลรามาธิบดี' }),
      el('h1', { class: 'h-unit', text: 'ภาพรวมทุกหน่วย' }),
      el('p', { class: 'small muted', text: `ข้อมูล ณ ${thDate(TODAY)} · ทีมวิจัยเห็นรหัสวิจัย ไม่เห็นชื่อหรือเลขบัตรประชาชน (D-18)` }),
      el('div', { class: 'tablewrap' }, el('table', { class: 'ledger' },
        el('thead', {}, el('tr', {}, ...['หน่วย', 'รูปแบบการจ่าย', 'ลงทะเบียน', 'ยินยอมครบ', 'ตรวจแล้ว', 'ขาดวันตรวจ', 'เสี่ยง สูงมาก · สูง · ต่ำ', 'ต้องส่งต่อ'].map((h, i) => el('th', { scope: 'col', class: i >= 2 ? 'num' : '', text: h })))), tb))),
    reviewSection(ids),
    el('section', {},
      el('h2', { text: 'ดาวน์โหลดชุดข้อมูลวิจัย (CSV)' }),
      el('p', { class: 'small muted', text: 'ทุกหน่วยรวมกัน ใช้รหัสวิจัย ไม่มีชื่อ เลขบัตรประชาชน หรือวันเกิด (มีอายุเป็นเดือน ณ วันตรวจ)' }),
      exportButtons()));
}

/* ================================================================ boot */
(async () => {
  if (!CFG.url || !CFG.anonKey) { $('#lgMsg').replaceChildren(el('div', { class: 'err', text: 'ยังไม่ได้ตั้งค่า config.js (URL และ anon key ของ Supabase)' })); return; }
  const { data: { session } } = await sb.auth.getSession();
  if (session) await afterLogin(); else show('login');
})();
})();
