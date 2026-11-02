/* Dent-II parent booklet v1.1.1 (2 Nov 2026).
   One A4 landscape sheet, printed on both sides (flip on short edge) and folded into a 4-page A5 booklet:
   side 1 (outside) = page 4 back cover | page 1 front cover; side 2 (inside) = page 2 results | page 3 plan.
   Data: the record form writes localStorage 'dent2-booklet'; this page moves it to sessionStorage (a reload in this
   tab still works) and removes it from localStorage. Built-in samples: ?demo, ?demo=heavy, ?demo=max, ?demo=low.
   No names are stored anywhere (D-64): the cover has a line to write the child's name by hand.
   No prices, payment arm or claim status appear: this is the parents' document (guarded in normalize()). */
(function () {
  'use strict';

  /* ================================================================ reference (mirrors app.js) */
  const TH_M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const UPPER = [16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26];
  const LOWER = [46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36];
  const POS = [...UPPER, ...LOWER];
  const PRIM = { 15: 55, 14: 54, 13: 53, 12: 52, 11: 51, 21: 61, 22: 62, 23: 63, 24: 64, 25: 65, 45: 85, 44: 84, 43: 83, 42: 82, 41: 81, 31: 71, 32: 72, 33: 73, 34: 74, 35: 75 };
  const NEED = { 0: 'ไม่ต้องรักษา', 1: 'ฟลูออไรด์โดยทันตบุคลากร', 2: 'เคลือบหลุมร่องฟัน', 3: 'SDF 38%', 4: 'บูรณะฟัน', 5: 'รักษาโพรงประสาทฟัน', 6: 'ครอบฟัน', 7: 'ถอนฟัน', 8: 'ส่งต่อ' };
  const LEVELS = {
    low: { th: 'เสี่ยงต่ำ', short: 'ต่ำ', why: 'โอกาสเกิดฟันผุใหม่น้อย ดูแลต่อเนื่องตามคำแนะนำปกหลัง' },
    high: { th: 'เสี่ยงสูง', short: 'สูง', why: 'มีโอกาสเกิดฟันผุใหม่ ควรดูแลใกล้ชิดและรับบริการตามนัด' },
    vhigh: { th: 'เสี่ยงสูงมาก', short: 'สูงมาก', why: 'มีโอกาสเกิดฟันผุใหม่สูงมาก ต้องดูแลใกล้ชิดและรับบริการตามนัดทุกครั้ง' },
  };
  // Treatment need in words parents use; the group picks the mark (◆ seal, ▲ treat, ■! soon or referral).
  // Only pulp treatment (5) and referral (8) are "soon"; extraction (7) and crown (6) are ordinary treatment.
  const NEED_ORDER = [2, 4, 3, 6, 7, 5, 8];
  const NEED_PLAIN = {
    2: ['seal', 'เคลือบหลุมร่องฟัน'],
    4: ['tx', 'อุดฟัน'],
    3: ['tx', 'ทายาหยุดฟันผุ (SDF)'],
    6: ['tx', 'ครอบฟัน'],
    7: ['tx', 'ถอนฟัน'],
    5: ['urg', 'รักษาโพรงประสาทฟัน'],
    8: ['urg', 'ส่งต่อพบทันตแพทย์'],
  };
  const SOON = [5, 8];
  // Clinical wording to be confirmed by the dental team (review R1 M4 and polish).
  const GLOSS = {
    2: 'กันฟันผุที่ร่องฟันกราม',
    3: 'ยาจะทำให้รอยผุเป็นสีดำ เป็นเรื่องปกติ ช่วยหยุดฟันผุ',
  };
  // Plan labels from the app, said in plain words. The app's own label stays the source; only wording changes.
  const PLAIN = [
    [/^บูรณะฟัน/, 'อุดฟัน'],
    [/^PRR(?=\s|$)/, 'อุดฟันแบบป้องกัน (PRR)'],
    [/^ทา SDF 38%/, 'ทายาหยุดฟันผุ (SDF)'],
    [/^ส่งต่อ อาการเร่งด่วน/, 'ส่งต่อพบทันตแพทย์ (อาการเร่งด่วน)'],
    [/^ส่งต่อ รักษาโพรงประสาทฟัน/, 'ส่งต่อรักษาโพรงประสาทฟัน'],
    [/^ส่งต่อ(?=\s*ซี่|\s*$)/, 'ส่งต่อพบทันตแพทย์'],
    [/^ฝึกแปรงฟัน \+ อุปกรณ์/, 'ฝึกแปรงฟันและรับอุปกรณ์แปรงฟัน'],
    [/^ตรวจรอบโครงการ(?:\s*\(เก็บข้อมูล\))?$/, 'ตรวจฟันติดตาม'],
    [/ \+ /g, ' และ '],
  ];
  const EXAM_LABEL = 'ตรวจช่องปากและประเมินความเสี่ยง';
  const DEFAULT_PROJECT = 'โครงการพัฒนารูปแบบบริการป้องกันฟันผุในเด็กนักเรียน';
  const DEFAULT_HOMECARE = 'แปรงฟันด้วยยาสีฟันผสมฟลูออไรด์ 1,000 ppm ขึ้นไป วันละ 2 ครั้ง · ผู้ปกครองแปรงซ้ำก่อนนอน · ลดขนมและเครื่องดื่มหวานนอกมื้อ';
  const VISIT_TIP = 'ให้นักเรียนรับบริการตามนัดที่โรงเรียน (ดูหน้า 3)';
  const STORE_KEY = 'dent2-booklet';
  const FLIP_KEY = 'dent2-booklet-flip';   // per-printer convenience only, no child data
  // Payment-arm and money words never reach parents (review R1 B1). The app also cuts unit names at " · ".
  const MONEY_WORDS = ['เหมาจ่าย', 'รายหัว', 'งบรวม', 'ส่วนประหยัด', 'แบ่งปัน', 'กลุ่มควบคุม', 'จ่ายตามรายการ', 'capitation', 'shared', 'fee-for-service', 'fee for service', 'บาท'];

  /* ================================================================ small helpers */
  const str = v => (v === null || v === undefined || typeof v === 'object' ? '' : String(v).trim());
  const arr = v => (Array.isArray(v) ? v : []);
  const toNum = v => (v === null || v === undefined || v === '' || typeof v === 'boolean' || !isFinite(+v) ? null : +v);
  const hasMoney = s => { const l = s.toLowerCase(); return MONEY_WORDS.some(w => l.includes(w.toLowerCase())); };
  // A printed name: the part before " · ", and nothing at all if it still names a payment arm or money.
  const cleanName = v => { const s = str(v).split(' · ')[0].trim(); return hasMoney(s) ? '' : s; };
  const cleanText = v => { const s = str(v); return hasMoney(s) ? '' : s; };
  function parseISO(s) {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(str(s));
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return isNaN(d.getTime()) || d.getMonth() !== +m[2] - 1 ? null : d;
  }
  const NB = ' ';
  const yy = d => String(d.getFullYear() + 543).slice(2);
  const beDate = d => (d ? `${d.getDate()} ${TH_M[d.getMonth()]} ${d.getFullYear() + 543}` : '');
  const beShort = d => (d ? `${d.getDate()} ${TH_M[d.getMonth()]} ${yy(d)}` : '');
  const beMon = d => (d ? `${TH_M[d.getMonth()]} ${yy(d)}` : '');
  const beMonFull = d => (d ? `${TH_M[d.getMonth()]} ${d.getFullYear() + 543}` : '');
  const dayMon = d => `${d.getDate()} ${TH_M[d.getMonth()]}`;
  const toISO = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const nbsp = t => t.replace(/ /g, NB);
  // Same day m months later, clamped to the month's last day (as app.js).
  const addMonths = (d, m) => { const x = new Date(d.getFullYear(), d.getMonth() + m, 1); x.setDate(Math.min(d.getDate(), new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate())); return x; };
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  // Plan month of a date and the days of each plan month (as app.js monthOf / monthRange): month 1 starts on the exam day.
  const monthOf = (base, d) => Math.min(12, Math.max(1, Math.round((d - base) / 864e5 / 30.44)));
  const monthRange = (base, m) => ({ from: addDays(base, m === 1 ? 0 : Math.ceil((m - .5) * 30.44)), to: m === 12 ? null : addDays(base, Math.ceil((m + .5) * 30.44) - 1) });
  const byNum = (a, b) => a - b;

  function add(e, kids) {
    for (const c of kids.flat(Infinity)) {
      if (c === null || c === undefined || c === false || c === '') continue;
      e.append(c instanceof Node ? c : String(c));
    }
    return e;
  }
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else e.setAttribute(k, v === true ? '' : String(v));
    }
    return add(e, kids);
  }
  const SVGNS = 'http://www.w3.org/2000/svg';
  function s(tag, attrs, ...kids) {
    const e = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v !== null && v !== undefined && v !== false) e.setAttribute(k, String(v));
    return add(e, kids);
  }
  const f2 = n => (Math.round(n * 100) / 100).toString();
  const blank = (w, cls) => h('span', { class: 'blank' + (cls ? ' ' + cls : ''), style: w ? `width:${w}` : null, 'aria-hidden': 'true' });
  const nw = text => h('span', { class: 'nw', text });   // keep a short phrase on one line ("หน้า 3", "โดยเร็ว")

  /* ================================================================ data model */
  const live = t => t.type === 'p' || t.type === 'd';
  const decayed = t => live(t) && t.B >= 3;
  const early = t => live(t) && t.B >= 1 && t.B <= 2;
  const restored = t => live(t) && [3, 4, 5, 6, 8].includes(t.A);
  const sealedFull = t => live(t) && t.A === 2;
  const sealedPart = t => live(t) && t.A === 1;
  const sealed = t => sealedFull(t) || sealedPart(t);
  const lost = t => t.type === 'n' && (t.nCode === 97 || t.nCode === 98);
  const unknown = t => t.type === '?' || (t.type === 'n' && t.nCode === 96);
  const absentT = t => t.type === 'n' && !lost(t) && !unknown(t);

  function normTeeth(list) {
    const byPos = {};
    for (const t of arr(list)) { const p = toNum(t && t.pos); if (p != null) byPos[p] = t; }
    return POS.map(pos => {
      const jaw = UPPER.includes(pos) ? 'upper' : 'lower';
      const t = byPos[pos];
      if (!t || typeof t !== 'object') return { pos, no: pos, jaw, type: '?', A: null, B: null, need: null, nCode: null, partial: false };
      const type = ['p', 'd', 'n'].includes(t.type) ? t.type : '?';
      let no = toNum(t.no);
      if (no == null || type === 'n') no = type === 'd' ? (PRIM[pos] || pos) : pos;
      const A = toNum(t.A), B = toNum(t.B);
      let nCode = toNum(t.n_code);
      if (type === 'n' && nCode == null && A >= 96) nCode = A;   // app.js keeps the reason for "no tooth" in A
      const isLive = type === 'p' || type === 'd';
      return {
        pos, no, jaw, type,
        A: isLive ? (A == null ? 0 : A) : null,
        B: isLive ? (B == null ? 0 : B) : null,
        need: isLive ? toNum(t.need) : null,
        nCode: type === 'n' ? (nCode == null ? 99 : nCode) : null,
        partial: !!t.partial,
      };
    });
  }

  function plainLabel(label) {
    let out = label;
    for (const [re, to] of PLAIN) out = out.replace(re, to);
    return out;
  }
  // The tooth's own need decides the mark (so page 2 and page 3 agree); the plan category is the fallback.
  function markFor(cat, toothNo, teeth) {
    const t = toothNo != null ? teeth.find(x => x.no === toothNo && live(x)) : null;
    if (t && NEED_PLAIN[t.need]) return NEED_PLAIN[t.need][0];
    if (cat === 'seal') return 'seal';
    if (cat === 'ref') return 'urg';
    if (cat === 'tx') return 'tx';
    return null;
  }
  function normPlan(list, teeth, monthIn) {
    const rows = [];
    for (const r of arr(list)) {
      if (!r || typeof r !== 'object') continue;
      const raw = cleanText(r.label);
      if (!raw) continue;
      const cat = str(r.category) || 'tx';
      const months = [...new Set(arr(r.months).map(toNum).filter(m => m != null && m >= 1 && m <= 12))].sort(byNum);
      const anytime = !!r.anytime || !months.length;
      const done = arr(r.done).map(x => {
        const date = parseISO(x && x.date);
        let month = toNum(x && x.month);
        if (month == null && date && !anytime) month = monthIn(date);
        return { month: month != null && month >= 1 && month <= 12 ? month : null, date };
      }).filter(x => x.date || x.month != null);
      const m = /ซี่\s*(\d{2})/.exec(raw);
      const toothNo = toNum(r.tooth) != null ? toNum(r.tooth) : m ? +m[1] : null;
      const prim = !!r.prim || (toothNo != null && toothNo >= 51 && toothNo <= 85);
      rows.push({ raw, label: plainLabel(raw), cat, months, anytime, done, toothNo, prim, mark: markFor(cat, toothNo, teeth) });
    }
    return rows;
  }
  function monthItemLabel(r, m) {
    if (r.cat === 'recall') return m === 1 && r.raw === EXAM_LABEL ? 'ตรวจฟันครั้งแรกและประเมินความเสี่ยง' : m === 1 ? r.label : 'ตรวจฟันติดตาม';
    if (r.cat === 'study') return `ตรวจฟันติดตาม (รอบ ${m} เดือน)`;
    return r.label;
  }
  // Monthly services go into months 1-12. Services with no set month: whole-mouth ones one per line; tooth ones
  // grouped by service and dentition (one line, a tick box per tooth) so a child with many teeth still fits.
  function timeline(plan) {
    const months = Array.from({ length: 12 }, (_, i) => ({ m: i + 1, items: [] }));
    const mouth = [], groups = [], gIndex = {};
    for (const r of plan) {
      if (r.anytime) {
        if (r.toothNo != null) {
          const base = r.label.replace(/\s*ซี่\s*\d{2}(?:\s*,\s*\d{2})*/g, '').trim() || r.label;
          const key = `${base}|${r.prim ? 'd' : 'p'}`;
          let g = gIndex[key];
          if (!g) { g = gIndex[key] = { label: base, prim: r.prim, mark: r.mark, teeth: [] }; groups.push(g); }
          g.teeth.push({ no: r.toothNo, done: r.done });
        } else mouth.push({ r, label: r.label, done: r.done });
        continue;
      }
      const set = new Set(r.months);
      for (const x of r.done) if (x.month != null) set.add(x.month);
      for (const m of [...set].sort(byNum)) months[m - 1].items.push({ r, label: monthItemLabel(r, m), done: r.done.filter(x => x.month === m) });
    }
    for (const g of groups) g.teeth.sort((a, b) => a.no - b.no);
    groups.sort((a, b) => (a.prim ? 1 : 0) - (b.prim ? 1 : 0));
    return { months, mouth, groups };
  }
  // The day span of each plan month: month_ranges from the app (the plan grid's own spans), else the same rule here.
  function monthSpans(given, base) {
    const g = arr(given);
    return Array.from({ length: 12 }, (_, i) => {
      const x = g[i] && typeof g[i] === 'object' ? g[i] : {};
      const from = parseISO(x.from), to = parseISO(x.to);
      if (from) return { from, to: i === 11 ? null : to };
      return base ? monthRange(base, i + 1) : { from: null, to: null };
    });
  }
  // "5 พ.ย.–19 ธ.ค. 69" (one year) or "20 ธ.ค. 69–19 ม.ค. 70"; month 12 "ตั้งแต่ 21 ต.ค. 70". Spaces stay with their date.
  function spanText(from, to) {
    if (!from) return '';
    if (!to) return `ตั้งแต่ ${nbsp(beShort(from))}`;
    const a = from.getFullYear() === to.getFullYear() ? nbsp(dayMon(from)) : nbsp(beShort(from));
    return `${a}–${nbsp(beShort(to))}`;
  }
  // "ทำแล้ว …" for one or more recorded dates (group activities can be recorded many times).
  function doneText(list) {
    if (!list || !list.length) return '';
    const dates = [...new Set(list.filter(x => x.date).map(x => toISO(x.date)))].sort().map(parseISO);
    if (!dates.length) return 'ทำแล้ว';
    if (dates.length === 1) return `ทำแล้ว ${beShort(dates[0])}`;
    if (dates.length === 2) return `ทำแล้ว ${beShort(dates[0])} และ ${beShort(dates[1])}`;
    return `ทำแล้ว ${dates.length} ครั้ง ล่าสุด ${beShort(dates[dates.length - 1])}`;
  }
  // Home care: one tip per line; "มาตามนัดทุก N เดือน" becomes the school-visit line (services happen at school
  // and the interval can differ from the fluoride plan).
  function splitTips(text) {
    const out = [];
    for (let t of text.split(/\s*(?:·|•|\n|;)\s*/).map(x => x.trim()).filter(Boolean)) {
      if (/มาตามนัด/.test(t)) t = VISIT_TIP;
      if (!hasMoney(t) && !out.includes(t)) out.push(t);
    }
    return out;
  }
  // Thai school year starts in mid-May: an exam from May to December belongs to that Buddhist year, January to April to the year before.
  const schoolYear = d => (d ? d.getFullYear() + 543 - (d.getMonth() < 4 ? 1 : 0) : null);
  const nextGrade = cls => { const m = /^ป\.?\s*(\d)/.exec(cls); return m ? `ป.${+m[1] + 1}` : ''; };

  function normalize(raw, opts) {
    const d = raw && typeof raw === 'object' ? raw : {};
    const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
    const child = obj(d.child), unit = obj(d.unit), ex = obj(d.exam), risk = obj(ex.risk), urgent = obj(ex.urgent), project = obj(d.project);
    const examDate = parseISO(ex.date);
    const spans = monthSpans(d.month_ranges, examDate);
    const labels = arr(d.month_labels).map(str);
    // Text for the "ช่วงวันที่" column: real day spans when known, else the app's month labels.
    const monthText = spans.map((sp, i) => spanText(sp.from, sp.to) || labels[i] || '');
    const monthIn = date => {
      const i = spans.findIndex((sp, k) => sp.from && date >= sp.from && (!sp.to || date <= sp.to || k === 11));
      if (i >= 0) return i + 1;
      return examDate ? monthOf(examDate, date) : null;
    };
    const teeth = normTeeth(ex.teeth);
    const level = LEVELS[risk.level] ? risk.level : null;
    const plan = normPlan(d.plan, teeth, monthIn);
    const twelve = parseISO(d.return_by) || (examDate ? addMonths(examDate, 12) : null);
    const printedOn = parseISO(d.printed_on);
    return {
      demo: !!(opts && opts.demo),
      id: str(child.study_id),
      school: cleanText(child.school),
      cls: cleanText(child.class),
      age: cleanText(child.age_text),
      unit: cleanName(unit.name),
      projectName: cleanText(project.name) || DEFAULT_PROJECT,
      projectOwner: cleanText(project.owner),
      examDate,
      findDate: parseISO(ex.findings_date),   // the latest follow-up exam, when there is one (v1.3.1)
      schoolYear: schoolYear(examDate),
      place: cleanText(ex.place),
      examiner: str(ex.examiner_code),
      level,
      levelLabel: level ? (cleanText(risk.label) || LEVELS[level].th) : '',
      // Urgent box: urgent signs and teeth needing pulp treatment or referral only (not exam.needs_referral).
      urgent: { pain: !!urgent.pain, swell: !!urgent.swell, big: !!urgent.big },
      soonTeeth: teeth.filter(t => live(t) && SOON.includes(t.need)),
      teeth,
      plan,
      tl: timeline(plan),
      monthText,
      spans,
      homecare: splitTips(str(d.homecare) || DEFAULT_HOMECARE),
      twelveMonth: twelve,   // the month-12 visit, about when the booklet goes back to school
      printedOn,
      reprint: !!(printedOn && examDate && (printedOn - examDate) / 864e5 > 45),
    };
  }

  /* ================================================================ drawing: tooth chart (units = mm) */
  let uid = 0;
  const COLW = 10.2, GAP = 2.6, CW = COLW * 12 + GAP, CH = 49;
  const OCC_U = 18.2, OCC_L = 30.2, MARK_U = 21.0, MARK_L = 27.4, MID = 24.2;
  const colX = i => i * COLW + (i >= 6 ? GAP : 0) + COLW / 2;

  function dims(t) {
    const digit = t.pos % 10;
    const prim = t.type === 'd';
    const w = prim ? ({ 1: 5.6, 2: 5.0, 3: 5.6, 4: 6.6, 5: 7.6 }[digit] || 6) : ({ 1: 6.6, 2: 6.0, 3: 6.6, 4: 7.2, 5: 7.2, 6: 8.6 }[digit] || 7);
    return { w, ch: prim ? 5.4 : 6.6, rh: prim ? 4.6 : 6.0, roots: digit === 6 || (prim && (digit === 4 || digit === 5)) ? 2 : 1 };
  }
  // One tooth: roots point away from the bite (up for the upper jaw), crown faces the bite line.
  function toothGlyph(g, cx, occ, dir, t, hatch) {
    const { w, ch, rh, roots } = dims(t);
    const P = (u, v) => `${f2(cx + u)},${f2(occ + dir * v)}`;
    const ghost = !live(t);
    const dash = absentT(t) ? '0.9 0.7' : null;
    const stroke = ghost ? '#8a8a8a' : '#111';
    const rootSet = roots === 2 ? [[-0.44, -0.05, -0.26], [0.05, 0.44, 0.26]] : [[-0.30, 0.30, 0]];
    for (const [a, b, c] of rootSet) {
      const tip = 0.07 * w;
      g.append(s('path', {
        d: `M${P(a * w, ch - 0.4)} L${P(c * w - tip, ch + rh)} Q${P(c * w, ch + rh + 0.9)} ${P(c * w + tip, ch + rh)} L${P(b * w, ch - 0.4)} Z`,
        fill: '#fff', stroke: ghost ? '#a5a5a5' : '#6a6a6a', 'stroke-width': 0.3, 'stroke-dasharray': dash, 'stroke-linejoin': 'round',
      }));
    }
    const r = Math.min(1.7, w * 0.26), rb = 0.7, hw = w / 2;
    const crown = `M${P(-hw + r, 0)} L${P(hw - r, 0)} Q${P(hw, 0)} ${P(hw, r)} L${P(hw, ch - rb)} Q${P(hw, ch)} ${P(hw - rb, ch)} L${P(-hw + rb, ch)} Q${P(-hw, ch)} ${P(-hw, ch - rb)} L${P(-hw, r)} Q${P(-hw, 0)} ${P(-hw + r, 0)} Z`;
    const fill = restored(t) ? '#9c9c9c' : sealed(t) ? `url(#${hatch})` : '#fff';
    g.append(s('path', { d: crown, fill, stroke, 'stroke-width': t.type === 'd' ? 0.4 : 0.5, 'stroke-dasharray': dash, 'stroke-linejoin': 'round' }));
    const cy = occ + dir * ch / 2;
    if (lost(t)) {
      const k = Math.min(hw, ch / 2) * 0.78;
      g.append(s('path', { d: `M${f2(cx - k)},${f2(cy - k)} L${f2(cx + k)},${f2(cy + k)} M${f2(cx + k)},${f2(cy - k)} L${f2(cx - k)},${f2(cy + k)}`, stroke: '#111', 'stroke-width': 0.55, 'stroke-linecap': 'round' }));
    } else if (unknown(t)) {
      g.append(s('text', { x: f2(cx), y: f2(cy + 1.25), 'text-anchor': 'middle', 'font-size': 3.6, 'font-weight': 600, fill: '#555', class: 'gl' }, '?'));
    } else if (decayed(t)) {
      g.append(s('circle', { cx: f2(cx), cy: f2(cy), r: f2(Math.min(1.65, w * 0.22)), fill: '#000', stroke: '#fff', 'stroke-width': 0.35 }));
    } else if (early(t)) {
      g.append(s('circle', { cx: f2(cx), cy: f2(cy), r: 1.3, fill: '#fff', stroke: '#000', 'stroke-width': 0.45 }));
    }
  }
  function needMark(g, cx, cy, kind, k = 1) {
    const a = 1.75 * k;
    if (kind === 'seal') g.append(s('path', { d: `M${f2(cx)},${f2(cy - a)} L${f2(cx + a)},${f2(cy)} L${f2(cx)},${f2(cy + a)} L${f2(cx - a)},${f2(cy)} Z`, fill: '#000' }));
    else if (kind === 'tx') g.append(s('path', { d: `M${f2(cx)},${f2(cy - a)} L${f2(cx + a * 1.05)},${f2(cy + a * 0.8)} L${f2(cx - a * 1.05)},${f2(cy + a * 0.8)} Z`, fill: '#000', 'stroke-linejoin': 'round' }));
    else if (kind === 'urg') {
      const q = 1.6 * k;
      g.append(s('rect', { x: f2(cx - q), y: f2(cy - q), width: f2(2 * q), height: f2(2 * q), rx: 0.35 * k, fill: '#000' }));
      g.append(s('rect', { x: f2(cx - 0.3 * k), y: f2(cy - 1.15 * k), width: f2(0.6 * k), height: f2(1.45 * k), rx: 0.2 * k, fill: '#fff' }));
      g.append(s('circle', { cx: f2(cx), cy: f2(cy + 0.85 * k), r: f2(0.36 * k), fill: '#fff' }));
    } else if (kind === 'watch') g.append(s('circle', { cx: f2(cx), cy: f2(cy), r: f2(1.3 * k), fill: '#fff', stroke: '#000', 'stroke-width': 0.45 }));
  }
  function hatchDefs(id) {
    return s('svg', { width: 0, height: 0, style: 'position:absolute;width:0;height:0;overflow:hidden', 'aria-hidden': 'true', focusable: 'false' },
      s('defs', {}, s('pattern', { id, patternUnits: 'userSpaceOnUse', width: 1.2, height: 1.2, patternTransform: 'rotate(45)' },
        s('rect', { width: 1.2, height: 1.2, fill: '#fff' }),
        s('line', { x1: 0.3, y1: 0, x2: 0.3, y2: 1.2, stroke: '#111', 'stroke-width': 0.5 }))));
  }
  function chartSvg(M, hatch) {
    const nDec = M.teeth.filter(decayed).length;
    const svg = s('svg', { viewBox: `0 0 ${f2(CW)} ${CH}`, width: `${f2(CW)}mm`, height: `${CH}mm`, role: 'img', 'aria-label': `ผังฟันบนและล่าง 24 ตำแหน่ง ฟันผุ ${nDec} ซี่` });
    svg.append(s('line', { x1: 0, y1: MID, x2: f2(CW), y2: MID, stroke: '#c4c4c4', 'stroke-width': 0.25 }));
    const mx = 6 * COLW + GAP / 2;
    svg.append(s('line', { x1: f2(mx), y1: 0.5, x2: f2(mx), y2: CH - 0.5, stroke: '#9a9a9a', 'stroke-width': 0.25, 'stroke-dasharray': '0.8 0.8' }));
    M.teeth.forEach((t, idx) => {
      const upper = idx < 12, i = upper ? idx : idx - 12, cx = colX(i);
      const g = s('g', {});
      toothGlyph(g, cx, upper ? OCC_U : OCC_L, upper ? -1 : 1, t, hatch);
      if (live(t) && NEED_PLAIN[t.need]) needMark(g, cx, upper ? MARK_U : MARK_L, NEED_PLAIN[t.need][0]);
      g.append(s('text', { x: f2(cx), y: upper ? 3.9 : 47.6, 'text-anchor': 'middle', 'font-size': 3.5, 'font-weight': t.type === 'p' ? 700 : 400, fill: live(t) ? '#111' : '#8a8a8a', class: 'gl' }, String(t.no)));
      svg.append(g);
    });
    return svg;
  }
  // Small icons for keys and lists (same marks as the chart).
  function crownIcon(kind, hatch) {
    const svg = s('svg', { viewBox: '0 0 5 4.4', width: '5mm', height: '4.4mm', 'aria-hidden': 'true' });
    const dash = kind === 'none' ? '0.8 0.6' : null;
    const fill = kind === 'restored' ? '#9c9c9c' : kind === 'sealed' ? `url(#${hatch})` : '#fff';
    const stroke = kind === 'none' || kind === 'lost' || kind === 'unk' ? '#8a8a8a' : '#111';
    svg.append(s('rect', { x: 0.45, y: 0.45, width: 4.1, height: 3.5, rx: 1, fill, stroke, 'stroke-width': 0.45, 'stroke-dasharray': dash }));
    if (kind === 'decayed') svg.append(s('circle', { cx: 2.5, cy: 2.2, r: 1.15, fill: '#000' }));
    if (kind === 'early') svg.append(s('circle', { cx: 2.5, cy: 2.2, r: 1.0, fill: '#fff', stroke: '#000', 'stroke-width': 0.4 }));
    if (kind === 'lost') svg.append(s('path', { d: 'M1.2,0.9 L3.8,3.5 M3.8,0.9 L1.2,3.5', stroke: '#111', 'stroke-width': 0.5, 'stroke-linecap': 'round' }));
    if (kind === 'unk') svg.append(s('text', { x: 2.5, y: 3.4, 'text-anchor': 'middle', 'font-size': 3, 'font-weight': 600, fill: '#555', class: 'gl' }, '?'));
    return svg;
  }
  function markIcon(kind, size = 4) {
    const svg = s('svg', { viewBox: '0 0 4 4', width: `${size}mm`, height: `${size}mm`, 'aria-hidden': 'true' });
    needMark(svg, 2, kind === 'tx' ? 2.15 : 2, kind, 1.05);
    return svg;
  }
  function sizeIcon() {
    const svg = s('svg', { viewBox: '0 0 9 5.4', width: '9mm', height: '5.4mm', 'aria-hidden': 'true' });
    svg.append(s('rect', { x: 0.4, y: 0.4, width: 4.6, height: 4.6, rx: 1.1, fill: '#fff', stroke: '#111', 'stroke-width': 0.45 }));
    svg.append(s('rect', { x: 5.6, y: 1.6, width: 3.1, height: 3.4, rx: 0.8, fill: '#fff', stroke: '#111', 'stroke-width': 0.4 }));
    return svg;
  }
  function tickSvg(size = 4) {
    const svg = s('svg', { viewBox: '0 0 4 4', width: `${size}mm`, height: `${size}mm`, 'aria-hidden': 'true' });
    svg.append(s('path', { d: 'M0.7,2.1 L1.7,3.1 L3.4,0.9', fill: 'none', stroke: '#000', 'stroke-width': 0.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    return svg;
  }
  function alertIcon(size = 9) {
    const svg = s('svg', { viewBox: '0 0 10 9', width: `${size}mm`, height: `${size * 0.9}mm`, 'aria-hidden': 'true' });
    svg.append(s('path', { d: 'M5,0.6 L9.5,8.4 L0.5,8.4 Z', fill: '#000', 'stroke-linejoin': 'round', stroke: '#000', 'stroke-width': 0.6 }));
    svg.append(s('rect', { x: 4.45, y: 3, width: 1.1, height: 3, rx: 0.4, fill: '#fff' }));
    svg.append(s('circle', { cx: 5, cy: 7.2, r: 0.62, fill: '#fff' }));
    return svg;
  }
  function bookIcon(size = 9) {
    const svg = s('svg', { viewBox: '0 0 10 10', width: `${size}mm`, height: `${size}mm`, 'aria-hidden': 'true' });
    svg.append(s('circle', { cx: 5, cy: 5, r: 4.5, fill: '#000' }));
    svg.append(s('rect', { x: 4.4, y: 2.1, width: 1.2, height: 3.9, rx: 0.45, fill: '#fff' }));
    svg.append(s('circle', { cx: 5, cy: 7.6, r: 0.7, fill: '#fff' }));
    return svg;
  }
  function coverTooth() {
    const svg = s('svg', { viewBox: '0 0 14 16', width: '14mm', height: '16mm', 'aria-hidden': 'true' });
    const g = s('g', {});
    toothGlyph(g, 7, 1.2, 1, { pos: 16, type: 'p', A: 0, B: 0 }, '');
    for (const p of g.querySelectorAll('path')) { p.setAttribute('stroke', '#0d5860'); p.setAttribute('stroke-width', '0.55'); }
    g.setAttribute('transform', 'translate(-3.1 0) scale(1.45 1.0)');
    svg.append(g);
    return svg;
  }

  /* ================================================================ pages */
  function rhead(M) {
    return h('div', { class: 'rhead' }, h('span', { text: 'สมุดดูแลสุขภาพช่องปาก' }), h('span', {}, 'รหัสนักเรียน ', M.id ? h('b', { text: M.id }) : blank('18mm')));
  }
  // Teeth by type. Live teeth: "ฟันแท้ …" / "ฟันน้ำนม …" with a note per tooth. Teeth that are not there: "ตำแหน่ง …"
  // (a position number; which tooth was there is not known).
  const toothNote = t => {
    const notes = [];
    if (t.partial && t.type === 'p') notes.push('ขึ้นไม่เต็มซี่');
    if (t.need === 2 && (t.A === 1 || t.A === 7)) notes.push('เคลือบซ้ำ');
    else if (t.A === 7) notes.push('วัสดุเดิมหลุด');
    return String(t.no) + (notes.length ? ` (${notes.join(' ')})` : '');
  };
  function toothList(list) {
    const byNo = (a, b) => a.no - b.no;
    if (!list.some(live)) return h('span', { class: 'teeth' }, h('span', {}, h('i', { text: 'ตำแหน่ง ' }), list.map(t => t.no).sort(byNum).join(', ')));
    const perm = list.filter(t => t.type === 'p').sort(byNo), prim = list.filter(t => t.type === 'd').sort(byNo);
    return h('span', { class: 'teeth' },
      perm.length ? h('span', {}, h('i', { text: 'ฟันแท้ ' }), perm.map(toothNote).join(', ')) : null,
      prim.length ? h('span', {}, h('i', { text: 'ฟันน้ำนม ' }), prim.map(toothNote).join(', ')) : null);
  }

  // Page 1: front cover
  function pageCover(M) {
    const facts = h('dl', { class: 'facts' });
    const fact = (k, v, w) => { facts.append(h('dt', {}, k), h('dd', {}, v || blank(w || '55mm'))); };
    fact('โรงเรียน', M.school);
    fact(['ชั้น / ห้อง', M.schoolYear ? h('small', { text: ` (ปีการศึกษา ${M.schoolYear})` }) : null], M.cls, '30mm');
    fact('หน่วยบริการ', M.unit);
    fact('ตรวจครั้งแรก', M.examDate ? beDate(M.examDate) : '', '40mm');
    const next = nextGrade(M.cls);
    return h('div', { class: 'page cover', 'data-page': '1' },
      h('div', { class: 'eyebrow' }, 'สำหรับนักเรียนและผู้ปกครอง', M.demo ? h('span', { class: 'sample', text: 'ตัวอย่าง ข้อมูลสมมติ' }) : null),
      h('div', { class: 'title-row' }, coverTooth(), h('h1', { text: 'สมุดดูแลสุขภาพช่องปาก' })),
      h('div', { class: 'proj', text: M.projectName }),
      M.projectOwner ? h('div', { class: 'period', text: M.projectOwner }) : null,
      M.examDate ? h('div', { class: 'period', text: `ดูแลต่อเนื่อง 12 เดือน เริ่ม ${beDate(M.examDate)}` }) : null,
      h('div', { class: 'idbox' },
        h('div', { class: 'k' }, 'รหัสนักเรียนในโครงการ', h('small', { text: 'ใช้รหัสนี้ทุกครั้งที่ติดต่อทีมทันตกรรม' })),
        h('div', { class: 'v' }, M.id || blank('40mm'))),
      h('div', { class: 'nameline' }, h('span', { text: 'ชื่อ-นามสกุลนักเรียน' }), blank(), h('small', { text: '(เขียนด้วยมือ)' })),
      facts,
      h('div', { class: 'todo-box' },
        h('div', { class: 'big', text: 'ผู้ปกครองโปรด' }),
        h('ol', {},
          h('li', {}, 'อ่านผลตรวจฟัน', nw('หน้า 2'), ' และแผนการดูแล', nw('หน้า 3')),
          h('li', { text: 'ลงชื่อรับทราบที่ปกหลัง' }),
          h('li', { text: 'เก็บสมุดไว้ที่บ้าน ให้นักเรียนนำมาโรงเรียนทุกวันที่ทีมทันตกรรมนัด เพื่อบันทึกบริการ' }),
          h('li', { text: 'ครูประจำชั้นจะแจ้งวันนัดล่วงหน้า' }))),
      h('div', { class: 'notice' }, bookIcon(9),
        h('div', {},
          h('div', { class: 'big', text: 'กรุณาเก็บสมุดเล่มนี้ไว้ให้ดี ห้ามทำหาย' }),
          h('ul', {},
            h('li', { text: `ปิดเทอมและขึ้นชั้น${next ? ' ' + next + ' ' : 'ใหม่'}แล้ว ยังใช้สมุดเล่มเดิม เก็บไว้ อย่าทิ้ง` }),
            h('li', {}, 'ส่งคืนครูประจำชั้น (ชั้นที่เรียนอยู่ในตอนนั้น) หรือครูอนามัยโรงเรียน หลังรับบริการตรวจฟันรอบ 12 เดือน',
              M.twelveMonth ? [' ', h('b', { class: 'nw', text: `(ประมาณ ${beMonFull(M.twelveMonth)})` })] : null)))));
  }

  // Page 2: exam results
  function pageResults(M, hatch) {
    const meta = h('div', { class: 'meta' },
      h('span', {}, 'ตรวจวันที่ ', (M.findDate || M.examDate) ? h('b', { text: beDate(M.findDate || M.examDate) }) : blank('25mm')),
      M.place ? h('span', {}, 'ที่ ', M.place) : null,
      M.age ? h('span', {}, 'อายุ ', M.age) : null,
      M.examiner ? h('span', {}, 'ผู้ตรวจ รหัส ', M.examiner) : null);
    const scale = h('span', { class: 'scale', role: 'img', 'aria-label': M.level ? `ระดับความเสี่ยง ${M.levelLabel}` : 'ยังไม่มีผลประเมินความเสี่ยง' },
      ['low', 'high', 'vhigh'].map(k => h('span', { class: M.level === k ? 'on' : null, text: LEVELS[k].short })));
    const risk = h('div', { class: 'risk' },
      h('span', { class: 'lab', text: 'ความเสี่ยงฟันผุ' }), scale,
      M.level ? h('b', { text: M.levelLabel }) : h('span', { class: 'muted', text: 'ยังไม่มีผลประเมิน' }),
      M.level ? h('span', { class: 'why', text: LEVELS[M.level].why }) : null);

    const known = M.teeth.some(t => t.type !== '?');
    const chart = h('div', { class: 'chart' },
      h('div', { class: 'jaw' }, h('span', { text: '◀ ด้านขวาของนักเรียน' }), h('b', { text: 'ฟันบน' }), h('span', { text: 'ด้านซ้ายของนักเรียน ▶' })),
      chartSvg(M, hatch),
      h('div', { class: 'jaw', style: 'justify-content:center' }, h('b', { text: 'ฟันล่าง' })));
    const keys = h('div', { class: 'keys' },
      h('span', {}, crownIcon('ok', hatch), 'ฟันปกติ'),
      h('span', {}, crownIcon('none', hatch), 'เส้นประ = ฟันยังไม่ขึ้น'),
      h('span', { class: 'k2' }, sizeIcon(), 'ซี่ใหญ่ = ฟันแท้ ซี่เล็ก = ฟันน้ำนม'),
      h('span', { class: 'k2', text: 'ตัวเลขคือตำแหน่งฟันในผัง' }));

    // One row per finding: mark, title with the count, then the teeth on the same line when they fit.
    const srow = (icon, title, list, opts) => {
      const o = opts || {};
      return h('div', { class: 'srow' + (list.length ? '' : ' zero') + (icon ? '' : ' noicon') + (o.cls ? ' ' + o.cls : '') }, icon,
        h('div', { class: 'b' },
          h('span', { class: 't' }, list.length ? [title, ' ', h('em', { text: `${list.length} ซี่` })] : o.zero || `${title}: ไม่มี`),
          list.length ? [' ', toothList(list)] : null,
          o.gloss ? h('span', { class: 'gloss' + (o.glossCls ? ' ' + o.glossCls : ''), text: o.gloss }) : null));
    };
    const found = h('div', { class: 'found' }, h('h3', { text: 'ผลการตรวจ' }));
    if (known) {
      const dec = M.teeth.filter(decayed);
      const healthy = !dec.length && !M.teeth.some(early);
      found.append(srow(crownIcon(dec.length ? 'decayed' : 'ok', hatch), 'ฟันผุ', dec, { zero: healthy ? 'ไม่พบฟันผุ ฟันแข็งแรงดี' : 'ไม่พบฟันผุ' }));
      const groups = [
        ['early', 'รอยเริ่มผุ ยังไม่เป็นรู', early], ['restored', 'อุดหรือครอบแล้ว', restored],
        ['sealed', 'เคลือบหลุมร่องฟันแล้ว', sealedFull], ['sealed', 'เคลือบไว้บางส่วน', sealedPart],
        ['lost', 'ไม่มีฟัน (ถอนหรือหลุดไป)', lost], ['unk', 'ตรวจไม่ได้', unknown],
      ];
      for (const [k, title, fn] of groups) { const list = M.teeth.filter(fn); if (list.length) found.append(srow(crownIcon(k, hatch), title, list)); }
    } else found.append(srow(null, '', [], { zero: 'ไม่มีข้อมูลรายซี่' }));

    const todo = h('div', { class: 'todo' }, h('h3', { text: 'สิ่งที่ต้องทำ' }));
    let nTodo = 0;
    for (const n of NEED_ORDER) {
      const list = M.teeth.filter(t => live(t) && t.need === n);
      if (!list.length) continue;
      nTodo++;
      todo.append(srow(markIcon(NEED_PLAIN[n][0]), NEED_PLAIN[n][1], list, GLOSS[n] ? { gloss: GLOSS[n], glossCls: n === 3 ? 'keep' : '' } : null));
    }
    // Decayed teeth with no treatment planned are said out loud, so parents do not think they were missed (R1 M3).
    const watchFl = M.teeth.filter(t => decayed(t) && t.need === 1);
    const watch = M.teeth.filter(t => decayed(t) && (t.need === 0 || t.need == null));
    if (watchFl.length) { nTodo++; todo.append(srow(markIcon('watch'), 'ฟันผุที่ดูแลด้วยฟลูออไรด์และตรวจติดตาม', watchFl)); }
    if (watch.length) { nTodo++; todo.append(srow(markIcon('watch'), 'ฟันผุที่เฝ้าดูอาการ ตรวจติดตามตามนัด', watch)); }
    if (!nTodo) todo.append(srow(null, '', [], { zero: known ? 'ไม่มีฟันที่ต้องอุดหรือรักษา' : 'ไม่มีข้อมูลรายซี่' }));
    const whole = [];
    const cats = new Set(M.plan.map(r => r.cat));
    if (cats.has('fl')) whole.push('เคลือบฟลูออไรด์');
    if (cats.has('brush')) whole.push('ฝึกแปรงฟัน');
    if (M.plan.some(r => r.cat === 'recall' && r.months.some(m => m > 1)) || cats.has('study')) whole.push('ตรวจฟันติดตาม');
    if (whole.length) todo.append(h('div', { class: 'srow note noicon' }, h('div', { class: 'b' }, h('b', { text: 'ทั้งปาก: ' }), joinTh(whole), ' ดูกำหนดนัด', nw('หน้า 3'))));

    return h('div', { class: 'page results', 'data-page': '2' },
      rhead(M),
      h('h2', { text: M.findDate ? 'ผลการตรวจฟันครั้งล่าสุด' : 'ผลการตรวจฟันครั้งแรก' }), meta, risk, chart, keys,
      h('div', { class: 'sum' }, found, todo),
      urgentPanel(M),
      h('div', { class: 'pfoot' }, h('span', { class: 'pno', text: '2' }), M.unit ? h('span', { text: `ตรวจโดย ${M.unit}` }) : null));
  }
  const joinTh = xs => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(' ')} และ${xs[xs.length - 1]}`);
  // Shown only for urgent signs or a tooth needing pulp treatment or referral, and always with its reason.
  function urgentPanel(M) {
    const u = M.urgent, why = [];
    if (u.pain) why.push('มีอาการปวดหรือเสียวฟัน');
    if (u.swell) why.push('เหงือกบวมหรือมีหนอง');
    if (u.big) why.push('ฟันแท้ผุขนาดใหญ่');
    const soon = M.soonTeeth.map(t => t.no).sort(byNum);
    if (soon.length) why.push('มีฟันที่ต้องรักษาโดยเร็วหรือส่งต่อ');
    if (!why.length) return null;
    return h('div', { class: 'urgent' }, alertIcon(7),
      h('div', {},
        h('div', { class: 'big' }, 'นักเรียนควรได้รับการรักษา', nw('โดยเร็ว')),
        h('div', { class: 'why' }, `เพราะ${joinTh(why)}`, soon.length ? h('span', { class: 'soonlist', text: ` (ซี่ ${soon.join(', ')})` }) : null),
        h('div', {}, h('span', { class: 'adv1', text: 'ทีมทันตกรรมจะแนะนำการรักษาต่อ ' }), 'หากปวดหรือบวมมากขึ้น ให้พาไปพบทันตแพทย์ทันที หรือโทรหาหน่วยบริการ ', nw('(เบอร์ที่ปกหลัง)'))));
  }

  // Page 3: the 12-month care plan; one box per due service (or per tooth) for the dental team to tick and date.
  function itemEl(it) {
    const done = doneText(it.done);
    return h('div', { class: 'it' + (done ? ' done' : '') },
      h('span', { class: 'box', role: 'img', 'aria-label': done ? 'ทำแล้ว' : 'ยังไม่ได้รับบริการ' }, done ? tickSvg(4) : null),
      h('span', { class: 'lab' }, it.r.mark ? markIcon(it.r.mark, 3.4) : null, it.label),
      h('span', { class: 'dt' }, done || [h('span', { class: 'w', text: 'วันที่ ' }), blank()]));
  }
  function chipEl(t) {
    const dates = t.done.filter(x => x.date).map(x => x.date).sort((a, b) => a - b);
    const done = t.done.length > 0;
    return h('span', { class: 'chip' + (done ? ' done' : ''), role: 'group', 'aria-label': `ซี่ ${t.no} ${done ? 'ทำแล้ว' : 'ยังไม่ได้รับบริการ'}` },
      h('span', { class: 'box' }, done ? tickSvg(3.4) : null),
      h('b', { text: String(t.no) }),
      done ? h('span', { class: 'cd', text: dates.length ? beShort(dates[0]) : 'ทำแล้ว' }) : blank(null, 'cb'));
  }
  // o.merge: 0 every month on its own row, 1 runs of empty months on one row, 2 empty months left out.
  // o.flow: the services of one month sit side by side instead of one per line.
  function pagePlan(M, o) {
    o = o || {};
    const tbody = h('tbody');
    const ms = M.tl.months;
    for (let i = 0; i < 12; i++) {
      const mo = ms[i];
      if (!mo.items.length) {
        if (o.merge === 2) continue;
        let j = i;
        if (o.merge === 1) while (j + 1 < 12 && !ms[j + 1].items.length) j++;
        const span = j > i ? (spanText(M.spans[i].from, M.spans[j].to) || `${M.monthText[i]}–${M.monthText[j]}`) : M.monthText[i];
        tbody.append(h('tr', { class: 'empty' },
          h('th', { class: 'mn', scope: 'row', text: j > i ? `${i + 1}–${j + 1}` : String(i + 1) }),
          h('td', { class: 'ml', text: span }),
          h('td', { text: 'ไม่มีนัด' })));
        i = j;
        continue;
      }
      tbody.append(h('tr', {},
        h('th', { class: 'mn', scope: 'row', text: String(i + 1) }),
        h('td', { class: 'ml', text: M.monthText[i] }),
        h('td', {}, h('div', { class: 'items' }, mo.items.map(itemEl)))));
    }
    const { mouth, groups } = M.tl;
    const rows = [];
    for (const it of mouth) rows.push(itemEl(it));
    for (const g of groups) {
      rows.push(h('div', { class: 'grp' },
        h('div', { class: 'gname' }, g.mark ? markIcon(g.mark, 3.4) : null, g.label, g.prim ? [' ', h('em', { class: 'nw', text: '(ฟันน้ำนม)' })] : null),
        h('div', { class: 'chips' }, g.teeth.map(chipEl))));
    }
    const anyBlock = rows.length ? h('div', { class: 'any' },
      h('h3', { text: 'บริการที่ไม่กำหนดเดือน (ทีมทันตกรรมนัดวันให้)' }),
      h('div', { class: 'anylist' }, rows)) : null;
    const hasPlan = M.plan.length > 0;
    return h('div', { class: 'page plan', 'data-page': '3' },
      rhead(M),
      h('h2', { text: 'แผนการดูแล 12 เดือน' }),
      h('div', { class: 'plan-intro' },
        M.examDate ? h('div', {}, `เดือนที่ 1 เริ่มวันตรวจครั้งแรก ${beDate(M.examDate)}`, o.merge === 2 ? ' เดือนที่ไม่มีในตารางไม่มีนัด' : '') : null,
        h('div', { text: 'ทีมทันตกรรมจะติ๊ก ✓ และลงวันที่ทุกครั้งที่ให้บริการ' }),
        M.reprint ? h('div', { class: 'reprint', text: `ฉบับพิมพ์ซ้ำ ${beDate(M.printedOn)}: บริการก่อนหน้านี้บางรายการอาจไม่แสดง ดูได้ในระบบของหน่วยบริการ` }) : null),
      hasPlan && M.tl.months.some(x => x.items.length) ? h('table', { class: 'tl' + (o.flow ? ' flow' : '') },
        h('thead', {}, h('tr', {}, h('th', { class: 'mn', scope: 'col', text: 'เดือนที่' }), h('th', { class: 'ml', scope: 'col', text: 'ช่วงวันที่' }), h('th', { scope: 'col', text: 'บริการตามแผน' }))),
        tbody) : null,
      hasPlan ? null : h('div', { class: 'noplan', text: 'ยังไม่มีแผนการดูแล ทีมทันตกรรมจะแจ้งภายหลัง' }),
      anyBlock,
      hasPlan ? h('div', { class: 'plan-key' },
        h('span', {}, h('span', { class: 'box' }), 'ยังไม่ได้รับบริการ'),
        h('span', {}, h('span', { class: 'box' }, tickSvg(3.4)), 'ได้รับบริการแล้ว'),
        groups.length ? h('span', { text: 'บริการรายซี่: ติ๊กที่เลขซี่ เขียนวันที่บนเส้น' }) : null,
        h('span', {}, markIcon('seal', 3.2), markIcon('tx', 3.2), markIcon('urg', 3.2), `ความหมายดูหน้า${NB}2`)) : null,
      h('div', { class: 'pfoot' }, h('span', { text: 'ช่วงวันที่เป็นช่วงโดยประมาณ ครูประจำชั้นจะแจ้งวันนัดจริง' }), h('span', { class: 'pno', text: '3' })));
  }

  // Page 4: back cover
  function pageBack(M) {
    const sign = (role, says, extra) => h('div', { class: 'sign' }, h('h4', { text: role }), h('p', { class: 'says', text: says }),
      h('div', { class: 'ln' }, 'ลงชื่อ', blank()),
      h('div', { class: 'ln' }, '(', blank(), ')'),
      extra ? h('div', { class: 'ln' }, extra, blank()) : null,
      h('div', { class: 'ln' }, 'วันที่', blank()));
    return h('div', { class: 'page back', 'data-page': '4' },
      h('h2', { text: 'คำแนะนำการดูแลฟันที่บ้าน' }),
      h('ul', { class: 'tips' }, M.homecare.map(t => h('li', { text: t }))),
      h('div', { class: 'ack' },
        h('h3', { text: 'ลงชื่อ' }),
        h('div', { class: 'signs' },
          sign('ผู้ปกครอง', 'รับทราบผลตรวจและแผนการดูแลแล้ว', 'เกี่ยวข้องเป็น'),
          sign('ครูประจำชั้น', 'ส่งสมุดถึงผู้ปกครองแล้ว'))),
      h('div', { class: 'notes' },
        h('h3', { text: 'บันทึกเพิ่มเติม (ทีมทันตกรรม ครู หรือผู้ปกครอง)' }),
        h('div', { class: 'rules', 'aria-hidden': 'true' }, Array.from({ length: 12 }, () => h('div', { class: 'rule' })))),
      h('div', { class: 'return' }, bookIcon(8),
        h('div', {},
          h('div', { class: 'big' }, 'ส่งสมุดคืนหลังรับบริการตรวจฟันรอบ 12 เดือน', M.twelveMonth ? [' ', h('span', { class: 'nw', text: `(ประมาณ ${beMonFull(M.twelveMonth)})` })] : null),
          h('div', { text: 'คืนครูประจำชั้น (ชั้นที่เรียนอยู่ในตอนนั้น) หรือครูอนามัยโรงเรียน ห้ามทำหาย ทีมทันตกรรมใช้สมุดนี้บันทึกบริการตลอดโครงการ' }),
          h('div', { class: 'ln' }, 'รับสมุดคืนวันที่', blank('24mm'), 'ลงชื่อครู', blank()))),
      h('div', { class: 'backfoot' },
        h('div', {},
          h('div', { class: 'unit' }, M.unit || h('span', {}, 'หน่วยบริการ ', blank('45mm'))),
          h('div', { class: 'ln' }, 'ติดต่อหน่วยบริการ โทร', blank('38mm')),
          h('div', { text: `หากพบสมุดเล่มนี้ กรุณาส่งคืน${M.school || 'โรงเรียนของนักเรียน'}` }),
          M.printedOn ? h('div', { class: 'muted', text: `พิมพ์เมื่อ ${beDate(M.printedOn)}` }) : null),
        h('div', { class: 'id' }, M.id ? ['รหัส ', M.id] : null)));
  }

  /* ================================================================ render + fit */
  function sheet(left, right, side, aria) {
    return h('section', { class: `sheet sheet--${side}`, 'aria-label': aria },
      h('div', { class: 'half half--l', 'data-p': left.dataset.page }, left),
      h('div', { class: 'half half--r', 'data-p': right.dataset.page }, right),
      h('span', { class: 'foldline', 'aria-hidden': 'true' }),
      h('span', { class: 'foldmark foldmark--t', 'aria-hidden': 'true' }),
      h('span', { class: 'foldmark foldmark--b', 'aria-hidden': 'true' }));
  }
  function render(data, container, opts) {
    const root = container || document.getElementById('stage') || document.body;
    const M = normalize(data, opts);
    const hatch = `bk-hatch-${++uid}`;
    const p1 = pageCover(M), p2 = pageResults(M, hatch), p3 = pagePlan(M), p4 = pageBack(M);
    const sheets = h('div', { class: 'sheets' },
      hatchDefs(hatch),
      h('p', { class: 'sheet-cap' }, h('b', { text: 'ด้านนอก (พิมพ์ก่อน)' }), ' ซ้าย = หน้า 4 ปกหลัง ขวา = หน้า 1 ปกหน้า'),
      sheet(p4, p1, 'out', 'ด้านนอก หน้า 4 และหน้า 1'),
      h('p', { class: 'sheet-cap' }, h('b', { text: 'ด้านใน' }), ' ซ้าย = หน้า 2 ผลการตรวจ ขวา = หน้า 3 แผนการดูแล'),
      sheet(p2, p3, 'in', 'ด้านใน หน้า 2 และหน้า 3'),
      h('p', { class: 'narrow-cap', text: 'ตัวอย่างเรียงตามหน้าสมุด 1 ถึง 4 เมื่อพิมพ์จะออกมาเป็น A4 แนวนอน 2 หน้า' }));
    root.replaceChildren(sheets);
    const state = { M, root, sheets };
    const over = fit(state);
    return { model: M, overflow: over, refit: () => fit(state) };
  }
  const overflows = p => p.scrollHeight > p.clientHeight + 1;
  // Each page tries these steps in order and keeps the first that fits its A5 half: tighter spacing first, then
  // leaving out what is said elsewhere (c1, c2), then (plan page) fewer rows for months with no service, then 9pt.
  // 9pt is the floor.
  const STEPS = [[], ['d1'], ['d1', 'd2'], ['d1', 'd2', 'c1'], ['d1', 'd2', 'c1', 'c2'], ['d1', 'd2', 'c1', 'c2', 'f9']];
  const PLAN_STEPS = [
    { cls: [] }, { cls: ['d1'] }, { merge: 1, cls: ['d1'] }, { merge: 1, cls: ['d1', 'd2'] },
    { merge: 1, flow: true, cls: ['d1', 'd2'] }, { merge: 2, flow: true, cls: ['d1', 'd2'] },
    { merge: 2, flow: true, cls: ['d1', 'd2', 'f9'] },
  ];
  function fit(state) {
    const { sheets, M } = state;
    if (!sheets || !sheets.isConnected) return [];
    const z = sheets.style.zoom;
    const narrow = sheets.classList.contains('is-narrow');
    sheets.style.zoom = '1';
    sheets.classList.remove('is-narrow');
    const over = [];
    for (let p of [...sheets.querySelectorAll('.page')]) {
      if (p.dataset.page === '3') {
        for (const st of PLAN_STEPS) {
          const np = pagePlan(M, st);
          if (st.cls.length) np.classList.add(...st.cls);
          p.replaceWith(np); p = np;
          if (!overflows(p)) break;
        }
      } else {
        for (const cls of STEPS) {
          p.classList.remove('d1', 'd2', 'c1', 'c2', 'f9', 'is-over');
          if (cls.length) p.classList.add(...cls);
          if (!overflows(p)) break;
        }
      }
      if (overflows(p)) { p.classList.add('is-over'); over.push(p.dataset.page); }
    }
    if (narrow) sheets.classList.add('is-narrow');
    sheets.style.zoom = z;
    const warn = document.getElementById('warn');
    if (warn && state.root === document.getElementById('stage')) {
      warn.textContent = over.length ? `เนื้อหาหน้า ${over.join(', ')} ยาวเกินครึ่งแผ่น ข้อความท้ายหน้าอาจหายเมื่อพิมพ์ กรุณาแจ้งทีมวิจัย` : '';
    }
    return over;
  }

  /* ================================================================ samples (?demo, ?demo=heavy, ?demo=max, ?demo=low) */
  // T(pos, type, A, B, need, extra): type 'p' permanent, 'd' primary, 'n' no tooth (A = reason code 99/97/98/96).
  function T(pos, type, A, B, need, extra) {
    const t = { pos, no: type === 'd' ? PRIM[pos] : pos, jaw: UPPER.includes(pos) ? 'upper' : 'lower', type, n_code: null, A: 0, B: 0, active: null, need, need_label: need != null ? NEED[need] : null, partial: false };
    if (type === 'n') Object.assign(t, { n_code: A, A: null, B: null, need: null, need_label: null });
    else Object.assign(t, { A, B, active: B >= 1 ? true : null });
    return Object.assign(t, extra || {});
  }
  const row = (label, category, months, extra) => {
    const m = /ซี่\s*(\d{2})/.exec(label);
    return Object.assign({ label, tooth: m ? +m[1] : null, category, months: months || [], anytime: !(months && months.length), prim: false, done: [] }, extra || {});
  };
  // Same shape as app.js bookletData(), including month_labels (exam + m months) and month_ranges (monthRange).
  function sample(o) {
    const b = parseISO(o.date);
    return {
      v: 1, printed_on: o.date,
      child: o.child, unit: o.unit,
      exam: { date: o.date, place: 'รถทันตกรรมที่โรงเรียน', examiner_code: o.examiner, risk: o.risk, urgent: o.urgent, needs_referral: o.referral, teeth: o.teeth },
      plan: o.plan,
      month_labels: Array.from({ length: 12 }, (_, i) => beMon(addMonths(b, i + 1))),
      month_ranges: Array.from({ length: 12 }, (_, i) => { const r = monthRange(b, i + 1); return { from: toISO(r.from), to: r.to ? toISO(r.to) : null }; }),
      homecare: o.homecare, return_by: toISO(addMonths(b, 12)),
    };
  }
  const HC_HIGH = n => `แปรงฟันด้วยยาสีฟันผสมฟลูออไรด์ 1,450 ppm วันละ 2 ครั้ง · ผู้ปกครองแปรงซ้ำก่อนนอน · ขนมและเครื่องดื่มหวานนอกมื้อไม่เกินวันละ 2 ครั้ง · มาตามนัดทุก ${n} เดือน`;
  const DEMOS = {
    // High risk, 7 years: four decayed primary teeth (one left to fluoride), two first permanent molars to seal,
    // one permanent tooth to fill.
    typical: sample({
      date: '2026-11-05', examiner: '654-1',
      child: { study_id: '54-001', school: 'โรงเรียนนาหลวง', class: 'ป.1/1', sex: 'หญิง', age_text: '7 ปี 4 เดือน' },
      unit: { name: 'คลินิกทันตกรรม 654' },
      risk: { level: 'high', label: 'เสี่ยงสูง', score: 4, recall_months: 6 },
      urgent: { pain: false, swell: false, big: false }, referral: false,
      teeth: [
        T(16, 'p', 0, 0, 2), T(15, 'd', 0, 5, 4), T(14, 'd', 3, 0, 1), T(13, 'd', 0, 0, 1), T(12, 'd', 0, 0, 1), T(11, 'p', 0, 0, 1),
        T(21, 'p', 0, 0, 1), T(22, 'd', 0, 0, 1), T(23, 'd', 0, 0, 1), T(24, 'd', 0, 5, 4), T(25, 'd', 0, 3, 1), T(26, 'p', 0, 2, 2),
        T(46, 'p', 0, 5, 4), T(45, 'd', 0, 4, 4), T(44, 'd', 0, 0, 1), T(43, 'd', 0, 0, 1), T(42, 'p', 0, 0, 1), T(41, 'p', 0, 0, 1),
        T(31, 'p', 0, 0, 1), T(32, 'd', 0, 0, 1), T(33, 'd', 0, 0, 1), T(34, 'd', 0, 2, 1), T(35, 'd', 0, 0, 1), T(36, 'p', 2, 0, 1),
      ],
      plan: [
        row(EXAM_LABEL, 'recall', [1], { done: [{ month: 1, date: '2026-11-05' }] }),
        row('ตรวจรอบโครงการ (เก็บข้อมูล)', 'study', [6, 12]),
        row('เคลือบฟลูออไรด์', 'fl', [6, 12]),
        row('ฝึกแปรงฟัน + อุปกรณ์', 'brush'),
        row('เคลือบหลุมร่องฟัน ซี่ 16', 'seal', null, { done: [{ month: null, date: '2026-11-05' }] }),
        row('เคลือบหลุมร่องฟัน ซี่ 26', 'seal'),
        row('อุดฟัน ซี่ 46', 'tx'),
        row('อุดฟัน ซี่ 55', 'tx', null, { prim: true }),
        row('อุดฟัน ซี่ 64', 'tx', null, { prim: true }),
        row('อุดฟัน ซี่ 85', 'tx', null, { prim: true }),
      ],
      homecare: HC_HIGH(6),
    }),
    // Very high risk with urgent signs, a referral and many teeth to treat.
    heavy: sample({
      date: '2026-11-18', examiner: '321-2',
      child: { study_id: '21-037', school: 'โรงเรียนวัดธาตุทอง (เรือนเขียวสะอาด)', class: 'ป.1/3', sex: 'ชาย', age_text: '7 ปี 0 เดือน' },
      unit: { name: 'คลินิกทันตกรรม 321' },
      risk: { level: 'vhigh', label: 'เสี่ยงสูงมาก', score: 8, recall_months: 3 },
      urgent: { pain: true, swell: false, big: true }, referral: true,
      teeth: [
        T(16, 'p', 0, 6, 8), T(15, 'd', 0, 6, 5), T(14, 'd', 0, 5, 4), T(13, 'd', 0, 3, 1), T(12, 'd', 0, 0, 1), T(11, 'p', 0, 2, 1),
        T(21, 'p', 0, 0, 1), T(22, 'n', 97), T(23, 'd', 0, 4, 4), T(24, 'd', 7, 3, 4), T(25, 'd', 0, 6, 5), T(26, 'p', 0, 1, 2, { partial: true }),
        T(46, 'p', 0, 4, 4), T(45, 'd', 0, 5, 4), T(44, 'd', 0, 6, 7), T(43, 'd', 0, 0, 1), T(42, 'n', 99), T(41, 'p', 0, 0, 1),
        T(31, 'p', 0, 0, 1), T(32, 'd', 0, 3, 3), T(33, 'd', 0, 0, 1), T(34, 'd', 5, 0, 1), T(35, 'd', 0, 5, 4), T(36, 'p', 1, 0, 2),
      ],
      plan: [
        row(EXAM_LABEL, 'recall', [1, 3, 9], { done: [{ month: 1, date: '2026-11-18' }] }),
        row('ตรวจรอบโครงการ (เก็บข้อมูล)', 'study', [6, 12]),
        row('เคลือบฟลูออไรด์', 'fl', [3, 6, 9, 12]),
        row('ฝึกแปรงฟัน + อุปกรณ์', 'brush', null, { done: [{ month: null, date: '2026-11-18' }] }),
        row('เคลือบหลุมร่องฟัน ซี่ 26', 'seal'),
        row('เคลือบหลุมร่องฟัน ซี่ 36', 'seal'),
        row('PRR ซี่ 46', 'tx'),
        row('ส่งต่อ ซี่ 16', 'ref', null, { done: [{ month: null, date: '2026-11-18' }] }),
        row('อุดฟัน ซี่ 54', 'tx', null, { prim: true }),
        row('รักษาโพรงประสาทฟัน ซี่ 55', 'tx', null, { prim: true }),
        row('อุดฟัน ซี่ 63', 'tx', null, { prim: true }),
        row('อุดฟัน ซี่ 64', 'tx', null, { prim: true }),
        row('รักษาโพรงประสาทฟัน ซี่ 65', 'tx', null, { prim: true }),
        row('ทา SDF 38% ซี่ 72', 'tx', null, { prim: true }),
        row('ถอนฟัน ซี่ 84', 'tx', null, { prim: true }),
        row('อุดฟัน ซี่ 85', 'tx', null, { prim: true }),
        row('อุดฟัน ซี่ 75', 'tx', null, { prim: true }),
      ],
      homecare: HC_HIGH(3),
    }),
    // Stress test: every tooth needs a service (26 plan rows). The fit steps must keep each page inside its half.
    max: sample({
      date: '2026-11-09', examiner: '243-3',
      child: { study_id: '43-099', school: 'โรงเรียนวัดธาตุทอง (เรือนเขียวสะอาด)', class: 'ป.1/10', sex: 'ชาย', age_text: '7 ปี 11 เดือน' },
      unit: { name: 'คลินิกทันตกรรม 243' },
      risk: { level: 'vhigh', label: 'เสี่ยงสูงมาก', score: 10, recall_months: 3 },
      urgent: { pain: true, swell: true, big: true }, referral: true,
      teeth: [
        T(16, 'p', 0, 4, 4), T(15, 'd', 0, 5, 4), T(14, 'd', 0, 6, 5), T(13, 'd', 0, 3, 3), T(12, 'd', 0, 4, 4), T(11, 'p', 0, 5, 4),
        T(21, 'p', 0, 5, 4), T(22, 'd', 0, 6, 7), T(23, 'd', 0, 5, 4), T(24, 'd', 0, 6, 5), T(25, 'd', 0, 5, 6), T(26, 'p', 1, 0, 2),
        T(46, 'p', 0, 6, 8), T(45, 'd', 0, 6, 7), T(44, 'd', 0, 5, 4), T(43, 'd', 0, 3, 3), T(42, 'd', 0, 4, 4), T(41, 'p', 0, 0, 1),
        T(31, 'p', 0, 0, 1), T(32, 'd', 0, 5, 4), T(33, 'd', 0, 3, 3), T(34, 'd', 0, 6, 5), T(35, 'd', 0, 5, 6), T(36, 'p', 0, 0, 2),
      ],
      plan: [
        row(EXAM_LABEL, 'recall', [1, 3, 9], { done: [{ month: 1, date: '2026-11-09' }] }),
        row('ตรวจรอบโครงการ (เก็บข้อมูล)', 'study', [6, 12]),
        row('เคลือบฟลูออไรด์', 'fl', [3, 6, 9, 12]),
        row('ฝึกแปรงฟัน + อุปกรณ์', 'brush'),
        row('เคลือบหลุมร่องฟัน ซี่ 26', 'seal'), row('เคลือบหลุมร่องฟัน ซี่ 36', 'seal'),
        row('PRR ซี่ 16', 'tx'), row('อุดฟัน ซี่ 11', 'tx'), row('อุดฟัน ซี่ 21', 'tx'),
        row('ส่งต่อ ซี่ 46', 'ref', null, { done: [{ month: null, date: '2026-11-09' }] }),
        ...[55, 52, 63, 84, 82, 72].map(n => row(`อุดฟัน ซี่ ${n}`, 'tx', null, { prim: true })),
        ...[54, 64, 74].map(n => row(`รักษาโพรงประสาทฟัน ซี่ ${n}`, 'tx', null, { prim: true })),
        ...[53, 83, 73].map(n => row(`ทา SDF 38% ซี่ ${n}`, 'tx', null, { prim: true })),
        ...[62, 85].map(n => row(`ถอนฟัน ซี่ ${n}`, 'tx', null, { prim: true })),
        ...[65, 75].map(n => row(`ครอบฟัน ซี่ ${n}`, 'tx', null, { prim: true })),
      ],
      homecare: HC_HIGH(3),
    }),
    // Low risk, no decay: only sealants and the routine rounds.
    low: sample({
      date: '2026-11-09', examiner: '243-1',
      child: { study_id: '43-012', school: 'โรงเรียนมีนบุรี', class: 'ป.1/2', sex: 'หญิง', age_text: '6 ปี 11 เดือน' },
      unit: { name: 'คลินิกทันตกรรม 243' },
      risk: { level: 'low', label: 'เสี่ยงต่ำ', score: 1, recall_months: 6 },
      urgent: { pain: false, swell: false, big: false }, referral: false,
      teeth: [
        T(16, 'p', 0, 0, 2, { partial: true }), T(15, 'd', 0, 0, 0), T(14, 'd', 0, 0, 0), T(13, 'd', 0, 0, 0), T(12, 'd', 0, 0, 0), T(11, 'p', 0, 0, 0),
        T(21, 'p', 0, 0, 0), T(22, 'd', 0, 0, 0), T(23, 'd', 0, 0, 0), T(24, 'd', 0, 0, 0), T(25, 'd', 0, 0, 0), T(26, 'n', 99),
        T(46, 'p', 0, 0, 2), T(45, 'd', 0, 0, 0), T(44, 'd', 0, 0, 0), T(43, 'd', 0, 0, 0), T(42, 'd', 0, 0, 0), T(41, 'p', 0, 0, 0),
        T(31, 'p', 0, 0, 0), T(32, 'd', 0, 0, 0), T(33, 'd', 0, 0, 0), T(34, 'd', 0, 0, 0), T(35, 'd', 0, 0, 0), T(36, 'p', 0, 0, 2),
      ],
      plan: [
        row(EXAM_LABEL, 'recall', [1], { done: [{ month: 1, date: '2026-11-09' }] }),
        row('ตรวจรอบโครงการ (เก็บข้อมูล)', 'study', [6, 12]),
        row('ฝึกแปรงฟัน + อุปกรณ์', 'brush'),
        row('เคลือบหลุมร่องฟัน ซี่ 16', 'seal'),
        row('เคลือบหลุมร่องฟัน ซี่ 36', 'seal'),
        row('เคลือบหลุมร่องฟัน ซี่ 46', 'seal'),
      ],
      homecare: 'แปรงฟันด้วยยาสีฟันผสมฟลูออไรด์ 1,000 ppm ขึ้นไป วันละ 2 ครั้ง · ผู้ปกครองแปรงซ้ำก่อนนอน · ลดขนมและเครื่องดื่มหวานนอกมื้อ',
    }),
  };

  /* ================================================================ page boot */
  const ss = { get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* in memory only */ } } };
  const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* convenience only */ } }, del(k) { try { localStorage.removeItem(k); } catch (e) { /* nothing to clear */ } } };
  // The record form hands the record over in localStorage. Keep it only in this tab (sessionStorage, so a reload
  // still works) and clear localStorage, so health data does not stay on a shared computer (R1 minor 8).
  function takeRecord() {
    const fresh = ls.get(STORE_KEY);
    if (fresh) { ss.set(STORE_KEY, fresh); ls.del(STORE_KEY); }
    const raw = fresh || ss.get(STORE_KEY);
    if (!raw) return null;
    try { const d = JSON.parse(raw); return d && typeof d === 'object' && !Array.isArray(d) ? d : null; } catch (e) { return null; }
  }
  const NARROW = '(max-width: 700px)';
  function zoomToFit() {
    const st = document.getElementById('stage');
    const sheets = st && st.querySelector('.sheets');
    if (!sheets) return;
    const narrow = window.matchMedia && window.matchMedia(NARROW).matches;
    sheets.classList.toggle('is-narrow', !!narrow);
    const avail = Math.max(240, (st.clientWidth || document.documentElement.clientWidth) - 32);
    const px = (narrow ? 148.5 : 297) * 96 / 25.4;
    sheets.style.zoom = String(Math.min(1, avail / px));
  }
  function noData(stage) {
    stage.replaceChildren(h('div', { class: 'nodata', role: 'alert' },
      h('div', { text: 'ไม่พบข้อมูล กรุณากดพิมพ์จากแฟ้มนักเรียนอีกครั้ง' }),
      h('a', { href: 'index.html', text: 'กลับไปแฟ้มนักเรียน' })));
  }
  function boot() {
    const stage = document.getElementById('stage');
    if (!stage) return;
    const q = new URLSearchParams(location.search);
    const demo = q.has('demo');
    const data = demo ? (DEMOS[q.get('demo')] || DEMOS.typical) : takeRecord();
    const btns = ['printBtn', 'printOut', 'printIn'].map(id => document.getElementById(id)).filter(Boolean);
    if (!data) { noData(stage); return; }
    const tag = document.getElementById('demoTag');
    if (tag) tag.hidden = !demo;
    const res = render(data, stage, { demo });
    const M = res.model;
    const who = document.getElementById('who');
    if (who) who.textContent = [M.id ? `รหัส ${M.id}` : '', M.examDate ? `ตรวจ ${beShort(M.examDate)}` : ''].filter(Boolean).join(' ');
    if (M.id) document.title = `สมุดดูแลสุขภาพช่องปาก ${M.id}`;
    zoomToFit();
    const refit = () => { res.refit(); zoomToFit(); };
    // Web fonts change line breaks: fit again whenever a font finishes loading; printing waits for the fonts
    // (or 3 seconds, so a blocked font server never locks the page).
    let ready = false;
    const enable = () => { if (ready) return; ready = true; refit(); for (const b of btns) b.disabled = false; };
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(enable).catch(enable);
      if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', refit);
    } else enable();
    setTimeout(enable, 3000);
    window.addEventListener('load', refit);
    window.addEventListener('resize', zoomToFit);
    window.addEventListener('beforeprint', () => { res.refit(); });
    // One side only (printers without duplex): hide the other sheet for this print.
    const printSide = side => () => {
      document.body.classList.remove('print-out', 'print-in');
      if (side) document.body.classList.add(`print-${side}`);
      window.print();
    };
    window.addEventListener('afterprint', () => document.body.classList.remove('print-out', 'print-in'));
    const on = (id, f) => { const e = document.getElementById(id); if (e) e.addEventListener('click', f); };
    on('printBtn', printSide(null));
    on('printOut', printSide('out'));
    on('printIn', printSide('in'));
    // The inside comes out upside down on some printers: turn it 180° (kept for this browser).
    const flip = document.getElementById('flipIn');
    if (flip) {
      flip.checked = ls.get(FLIP_KEY) === '1';
      document.body.classList.toggle('flip-in', flip.checked);
      flip.addEventListener('change', () => { document.body.classList.toggle('flip-in', flip.checked); ls.set(FLIP_KEY, flip.checked ? '1' : '0'); });
    }
  }

  window.Dent2Booklet = { render: (data, container) => render(data, container), demos: DEMOS, version: '1.1.1' };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
