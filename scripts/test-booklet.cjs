// Print check of the parent booklet (booklet.html) in headless Chrome, offline from the database: no login, made-up
// records only. Replaces the reviewers' run.sh (booklet reviews R1–R2) and belongs in the release routine (R2 N4).
// Run: node scripts/test-booklet.cjs [output folder]   (macOS: Google Chrome, and osascript for PDFKit)
// Each case: the record goes in through localStorage as the app hands it over; then
//  - DOM: no console errors, the web fonts really loaded, nothing overflows its A5 half in height (fit steps per
//    page) or in width (kept-together phrases, the phone and the ID stay inside the page margins; the back-cover ID
//    on one line), no money or payment-arm word, "ประเมินความเสี่ยง" kept whole (R2 N2), one eye mark per watched
//    decayed tooth (R2 N3), the unit's phone on the back cover and in the urgent box when kept for that unit, the
//    blank line when not (R2 N5, R3 P1);
//  - PDF: 2 pages of A4 landscape; the money check again on the PDF text after spaces, control characters and Thai
//    marks are taken out of both sides, because PDF text splits or blanks Thai marks ("ครั ง") (R2 N6, R3 P4).
//    Control: every Thai money word planted in each body font must be caught. The DOM check stays the primary one.
//  - one-side prints give 1 page each; "ด้านในกลับหัว" turns only the inside-only print; the phone field cleans what
//    is typed, keeps it per unit and never on a demo page (R3 P1, P3).
// PNGs of both sides (print layout) and the PDFs are written to the output folder for a visual look.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn, execFileSync } = require('child_process');

const APP = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'dent2-booklet-check'));
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SRC = fs.readFileSync(path.join(APP, 'booklet.js'), 'utf8');
const MONEY = JSON.parse(/const MONEY_WORDS = (\[[^\]]+\])/.exec(SRC)[1].replace(/'/g, '"'));
const PHONE = '0 2201 1234 ต่อ 5678';
const PHONE39 = '081-234-5678, 089-876-5432, 02-201-1234';   // near the field's 40 characters (R3 P2)
const telKey = d => 'dent2-booklet-tel:' + (String((d.unit && d.unit.name) || '').split(' · ')[0].trim() || 'unit');
fs.mkdirSync(OUT, { recursive: true });

let pass = 0, fail = 0;
const ok = (cond, label, extra) => { if (cond) { pass++; console.log('  ✓', label); } else { fail++; console.log('  ✗', label, extra ?? ''); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// PDF text loses Thai marks and gains spaces: compare without spaces, zero-width breaks and combining marks.
const norm = t => String(t).normalize('NFC').replace(/[\s\u0000-\u001f\u00a0\u200b-\u200d\u2060\ufeff\ufffd\uf700-\uf71f]/g, '').replace(/[\u0e31\u0e34-\u0e3a\u0e47-\u0e4e]/g, '').replace(/\u0e33/g, '\u0e32').toLowerCase();
const ZW = /[\u00AD\u200B-\u200D\u2060\uFEFF]/g;   // invisible marks never hide a word (R3 P8)
const moneyIn = (text, loose) => { const t = loose ? norm(text) : text.replace(ZW, '').toLowerCase(); return MONEY.filter(w => t.includes(loose ? norm(w) : w.toLowerCase())); };

// ---------------------------------------------------------------- static server for the app folder
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
function serve() {
  const srv = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'booklet.html';
    const file = path.join(APP, rel);
    if (!file.startsWith(APP + path.sep) || /\.local\./.test(rel) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}

// ---------------------------------------------------------------- a small DevTools-protocol client
function cdp(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const wait = new Map(), subs = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && wait.has(m.id)) { const w = wait.get(m.id); wait.delete(m.id); if (m.error) w.rej(new Error(m.error.message)); else w.res(m.result); }
    else if (m.method) for (const f of subs) f(m);
  };
  return {
    open: new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }),
    send: (method, params = {}) => new Promise((res, rej) => { const i = ++id; wait.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); }),
    on: f => { subs.push(f); return () => subs.splice(subs.indexOf(f), 1); },
    close: () => ws.close(),
  };
}
async function chrome() {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'dent2-bk-prof-'));
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${prof}`, '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', '--force-device-scale-factor=1', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((res, rej) => {
    let buf = '';
    proc.stderr.on('data', d => { buf += d; const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf); if (m) res(m[1]); });
    proc.once('exit', () => rej(new Error('Chrome exited: ' + buf.slice(-400))));
    setTimeout(() => rej(new Error('Chrome did not start')), 20000);
  });
  const list = await (await fetch(`http://127.0.0.1:${new URL(wsUrl).port}/json/list`)).json();
  const c = cdp(list.find(t => t.type === 'page').webSocketDebuggerUrl);
  await c.open;
  const gone = new Promise(r => proc.on('exit', r));
  return { c, stop: async () => { c.close(); proc.kill(); await gone; fs.rmSync(prof, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } };
}

// ---------------------------------------------------------------- cases (made-up records, as app.js bookletData() sends them)
const clone = o => JSON.parse(JSON.stringify(o));
const addDays = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const LONG_UNIT = 'โรงพยาบาลส่งเสริมสุขภาพตำบลบ้านหนองบัวทองพัฒนา อำเภอเมืองปทุมธานี';
function stress(d, allDone) {
  const x = clone(d);
  x.unit.name = LONG_UNIT;
  x.exam.urgent = { pain: true, swell: true, big: true };
  if (allDone) {
    x.printed_on = addDays(x.exam.date, 60);   // more than 45 days after the exam: the reprint banner
    for (const t of x.exam.teeth) if (t.type === 'p') t.partial = true;
    for (const r of x.plan) r.done = r.anytime || !r.months.length ? [{ month: null, date: addDays(x.exam.date, 20) }] : r.months.map(m => ({ month: m, date: x.month_ranges[m - 1].from }));
  }
  return x;
}
function buildCases(D) {
  const sparse = clone(D.typical);
  sparse.exam.teeth = sparse.exam.teeth.slice(0, 10).concat([{ pos: 46, type: 'n', n_code: 96 }]);
  const crown = clone(D.low);   // lost teeth, a crown and an extraction (no urgent box), a decayed tooth left to watch
  const tooth = (pos, o) => Object.assign(crown.exam.teeth.find(t => t.pos === pos), o);
  tooth(22, { type: 'n', n_code: 97, A: null, B: null, need: null }); tooth(32, { type: 'n', n_code: 98, A: null, B: null, need: null });
  tooth(14, { B: 6, need: 6 }); tooth(44, { B: 6, need: 7 }); tooth(12, { B: 3, need: 0 });
  crown.plan.push({ label: 'ครอบฟัน ซี่ 54', tooth: 54, category: 'tx', months: [], anytime: true, prim: true, done: [] },
    { label: 'ถอนฟัน ซี่ 84', tooth: 84, category: 'tx', months: [], anytime: true, prim: true, done: [] });
  const armguard = clone(D.typical);   // payment arm and money words in every free-text field
  armguard.unit.name = 'หน่วยทดสอบ ข · เหมาจ่ายรายหัว (02)';
  armguard.child.school = 'โรงเรียนทดสอบ กลุ่มควบคุม';
  armguard.project = { name: 'โครงการ capitation และ shared savings' };
  armguard.plan.push({ label: 'ค่าบริการ 300 บาท', category: 'tx', months: [3], anytime: false, done: [] });
  armguard.homecare = 'แปรงฟันวันละ 2 ครั้ง · เบิกค่าแปรงสีฟัน 20 บาท · ส่วนประหยัดแบ่งปันให้หน่วย';
  const maxWatch = clone(D.max);   // both watch rows: one decayed tooth left to fluoride, one left to watch
  Object.assign(maxWatch.exam.teeth.find(t => t.pos === 13), { need: 1 });
  Object.assign(maxWatch.exam.teeth.find(t => t.pos === 33), { need: 0 });
  const armZw = clone(D.typical);   // arm words split by zero-width spaces, no " · " to cut at (R3 P8)
  armZw.unit.name = 'หน่วยทดสอบ ค เหมา\u200Bจ่าย\u200Bราย\u200Bหัว';
  armZw.child.school = 'โรงเรียนทดสอบ กลุ่ม\u200Bควบคุม';
  const nodate = { v: 1, child: { study_id: '45-003' }, unit: {}, exam: { teeth: [{ pos: 16, type: 'p', A: 0, B: 4, need: 4 }, { pos: 99 }, null], risk: { level: 'x' } },
    plan: [{ label: 'อุดฟัน ซี่ 16', category: 'tx', months: ['x', 13], done: [{ date: '2026-13-40' }] }, { label: null }, 'junk'] };
  return [
    ['typical', D.typical], ['heavy', D.heavy], ['max', D.max], ['low', D.low],
    ['stressmax', stress(D.max, true)], ['stressheavy', stress(D.heavy, false)],
    ['sparse', sparse], ['crown', crown], ['armguard', armguard, { unit: 'หน่วยทดสอบ ข' }], ['armguard-zw', armZw, { noName: /หน่วยทดสอบ|โรงเรียนทดสอบ/ }], ['nodate', nodate],
    ['typical+tel', D.typical, { phone: PHONE }], ['heavy+tel', D.heavy, { phone: PHONE }],
    ['stressmax+tel', stress(D.max, true), { phone: PHONE }], ['stressheavy+tel', stress(D.heavy, false), { phone: PHONE }],
    ['low+tel', D.low, { phone: PHONE }],
    ['heavy+tel39', D.heavy, { phone: PHONE39 }], ['max+tel39', D.max, { phone: PHONE39 }], ['stressmax+tel39', stress(D.max, true), { phone: PHONE39 }],
    ['max+watch', maxWatch], ['typical+otherunit', D.typical, { phone: PHONE, keyFrom: D.heavy }],
  ].map(([name, data, o]) => ({ name, data, ...(o || {}) }));
}
// Watched teeth (the eye mark): live, ICDAS 3 or more, need fluoride (1), none (0) or not set.
const watchedIn = data => ((data.exam && data.exam.teeth) || []).filter(t => t && ['p', 'd'].includes(t.type) && +t.B >= 3 && (t.need == null || +t.need === 0 || +t.need === 1)).length;

// ---------------------------------------------------------------- in-page checks
const READ = `(() => {
  const q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
  const loaded = fam => [...document.fonts].some(f => f.family.replace(/"/g, '') === fam && f.status === 'loaded');
  // Width: each page's content box holds its kept-together phrases, the phone and the ID (R3 P2, P6).
  const wide = [];
  for (const p of qa('#stage .page')) {
    const r = p.getBoundingClientRect(), cs = getComputedStyle(p), right = r.right - parseFloat(cs.paddingRight) + 0.5;
    if (p.scrollWidth > p.clientWidth + 1) wide.push('page ' + p.dataset.page + ' scrolls sideways');
    for (const e of p.querySelectorAll('.nw, .backfoot .tel, .backfoot .id')) { const b = e.getBoundingClientRect(); if (b.width && b.right > right) wide.push(e.textContent.trim() + ' +' + (b.right - right).toFixed(1) + 'px'); }
  }
  const id = q('.backfoot .id');
  if (id && id.textContent) { const rg = document.createRange(); rg.selectNodeContents(id);
    if (new Set([...rg.getClientRects()].map(b => Math.round(b.bottom))).size > 1) wide.push('back-cover ID on two lines'); }
  const pages = qa('#stage .page').map(p => ({ page: p.dataset.page, steps: [...p.classList].filter(c => /^(d1|d2|c1|c2|f9)$/.test(c)).join(' ') || '-', over: p.classList.contains('is-over') }));
  const urgent = q('.urgent');
  return {
    pages,
    text: document.title + ' ' + document.body.textContent,
    wide,
    keep: (() => { const ls = qa('#stage .it .lab').filter(l => /ประเมินความเสี่ยง/.test(l.textContent));
      return { n: ls.length, ok: ls.every(l => [...l.querySelectorAll('.nw')].some(n => n.textContent === 'ประเมินความเสี่ยง' && n.getClientRects().length === 1)) }; })(),
    eyes: qa('.chart svg [data-mark="watch"]').length,
    watchRows: qa('.todo .srow').filter(r => /ฟันผุที่ดูแลด้วยฟลูออไรด์|ฟันผุที่เฝ้าดูอาการ/.test(r.textContent)).length,
    tel: q('.backfoot .tel') ? q('.backfoot .tel').textContent.replace(/\\u00a0/g, ' ') : null,
    telBlank: !!q('.backfoot .ln .blank'),
    urgent: urgent ? urgent.textContent : null,
    unitBack: q('.backfoot .unit') ? q('.backfoot .unit').textContent : null,
    field: q('#unitTel') ? q('#unitTel').value : null,
    fonts: loaded('Noto Sans Thai Looped') && loaded('Prompt'),
    nodata: !!q('.nodata'),
  };
})()`;
const READY = `new Promise(r => { const t0 = Date.now(); (function poll() { const b = document.getElementById('printBtn');
  if ((b && !b.disabled) || document.querySelector('.nodata') || Date.now() - t0 > 12000) r(Date.now() - t0); else setTimeout(poll, 100); })(); })`;

(async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const { c, stop } = await chrome();
  let errors = [];
  c.on(m => {
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description).join(' '));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(m.params.entry.text + ' ' + (m.params.entry.url || ''));
  });
  await c.send('Page.enable'); await c.send('Runtime.enable'); await c.send('Log.enable');
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
  const evaluate = async expr => { const r = await c.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description)); return r.result.value; };
  const go = async url => {
    let off;
    const loaded = new Promise(r => { off = c.on(m => { if (m.method === 'Page.loadEventFired') r(); }); });
    await c.send('Page.navigate', { url }); await loaded; off();
    return evaluate(READY);
  };
  const pdf = async file => { const r = await c.send('Page.printToPDF', { preferCSSPageSize: true, printBackground: true }); fs.writeFileSync(file, Buffer.from(r.data, 'base64')); return file; };
  const shoot = async (sel, file) => {
    const box = await evaluate(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }; })()`);
    const r = await c.send('Page.captureScreenshot', { format: 'png', clip: { ...box, scale: 2 }, captureBeyondViewport: true });
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
  };
  // Load a record the way the app does (localStorage), with or without the unit's phone kept in this browser.
  const load = async (data, phone, keyFrom) => {
    await go(base + 'booklet.html?v=check');
    await evaluate(`(() => { sessionStorage.clear(); localStorage.clear(); localStorage.setItem('dent2-booklet', ${JSON.stringify(JSON.stringify(data))});
      ${phone ? `localStorage.setItem(${JSON.stringify(telKey(keyFrom || data))}, ${JSON.stringify(phone)});` : ''} })()`);
    errors = [];
    return go(base + 'booklet.html?v=check');
  };

  await go(base + 'booklet.html?demo=max');
  const demos = await evaluate('JSON.stringify(window.Dent2Booklet.demos)');
  const cases = buildCases(JSON.parse(demos));
  const pdfs = [], rows = [];
  for (const k of cases) {
    console.log(`\n${k.name}`);
    const ms = await load(k.data, k.phone, k.keyFrom);
    await sleep(300);   // a late font can still refit
    const r = await evaluate(READ);
    ok(!errors.length, 'no console errors', errors.join(' | '));
    ok(r.fonts, 'web fonts loaded (otherwise line breaks differ from print)', `after ${ms} ms`);
    ok(r.pages.length === 4 && !r.pages.some(p => p.over), 'all 4 pages fit their A5 half', JSON.stringify(r.pages));
    ok(!moneyIn(r.text).length, 'no money or payment-arm word in the page (DOM)', moneyIn(r.text).join(', '));
    ok(!r.wide.length, 'nothing runs past the page margins sideways; the back-cover ID on one line', r.wide.join(' | '));
    const firstExam = (k.data.plan || []).some(p => p && p.category === 'recall' && (p.months || []).includes(1));
    ok(r.keep.ok && r.keep.n === (firstExam ? 1 : 0), '"ประเมินความเสี่ยง" stays on one line in the month-1 row (N2)', JSON.stringify(r.keep));
    const w = watchedIn(k.data);
    ok(r.eyes === w && (w > 0) === (r.watchRows > 0), `eye marks in the chart = watched decayed teeth (${w}) and their list rows (N3)`, `eyes ${r.eyes}, rows ${r.watchRows}`);
    if (k.keyFrom) ok(r.tel === null && r.telBlank && r.field === '', "another unit's kept number is not used (R3 P1)", JSON.stringify([r.field, r.tel]));
    else if (k.phone) {
      ok(r.field === k.phone && r.tel === k.phone && !r.telBlank, 'the kept phone fills the field and the back-cover line (N5)', JSON.stringify([r.field, r.tel]));
      if (r.urgent) ok(r.urgent.includes(k.phone) && !r.urgent.includes('เบอร์ที่ปกหลัง'), 'the urgent box gives the number itself (N5)', r.urgent);
    } else {
      ok(r.tel === null && r.telBlank, 'no phone kept: the back-cover line stays blank to write by hand');
      if (r.urgent) ok(r.urgent.includes('(เบอร์ที่ปกหลัง)'), 'the urgent box points to the back cover');
    }
    if (k.unit) ok(r.unitBack === k.unit, `the unit name is cut before " · " (${k.unit})`, r.unitBack);
    if (k.noName) ok(!k.noName.test(r.text), 'a name hiding an arm word behind zero-width spaces is left out (R3 P8)', (r.text.match(k.noName) || [])[0]);
    if (k.name === 'crown') ok(r.urgent === null, 'crown and extraction alone open no urgent box (R1 M1)');
    const file = path.join(OUT, `${k.name}.pdf`);
    pdfs.push({ k, file: await pdf(file) });
    rows.push({ name: k.name, steps: r.pages.map(p => `p${p.page}:${p.steps}`).join('  ') });
    if (!k.phone || /^(stressmax\+tel|heavy\+tel39|stressmax\+tel39)$/.test(k.name)) {
      await c.send('Emulation.setEmulatedMedia', { media: 'print' });
      await shoot('.sheet--out', path.join(OUT, `${k.name}-out.png`));
      await shoot('.sheet--in', path.join(OUT, `${k.name}-in.png`));
      await c.send('Emulation.setEmulatedMedia', { media: '' });
    }
  }

  // One-side prints, the inside-only flip, and typing the phone in the field.
  console.log('\none-side prints, flip, phone field (typical)');
  await load(cases[0].data);
  await evaluate(`document.body.classList.add('print-out')`);
  pdfs.push({ k: { name: 'print-out', pages: 1 }, file: await pdf(path.join(OUT, 'print-out.pdf')) });
  await evaluate(`document.body.classList.remove('print-out'); document.body.classList.add('print-in')`);
  pdfs.push({ k: { name: 'print-in', pages: 1 }, file: await pdf(path.join(OUT, 'print-in.pdf')) });
  await c.send('Emulation.setEmulatedMedia', { media: 'print' });
  const turn = await evaluate(`(() => { const s = () => getComputedStyle(document.querySelector('.sheet--in')).transform; const b = document.body.classList;
    b.remove('print-in'); b.add('flip-in'); const both = s(); b.add('print-in'); const inside = s(); b.remove('print-in', 'flip-in'); return { both, inside }; })()`);
  await c.send('Emulation.setEmulatedMedia', { media: '' });
  ok(turn.both === 'none', '"ด้านในกลับหัว" leaves a two-sided print upright (R2 N1)', turn.both);
  ok(/^matrix\(-1, .*-1, 0, 0\)$/.test(turn.inside), '"ด้านในกลับหัว" turns the inside-only print 180°', turn.inside);
  const KEY = telKey(cases[0].data);
  const TYPE = `(input => { const f = document.getElementById('unitTel'); f.value = input; f.dispatchEvent(new Event('change'));
    const e = document.querySelector('.backfoot .tel'), keys = Object.keys(localStorage).filter(k => k.startsWith('dent2-booklet-tel'));
    return { field: f.value, tel: e ? e.textContent.replace(/\u00a0/g, ' ') : null, keys, kept: keys.map(k => localStorage.getItem(k)),
      note: document.getElementById('unitTelNote').textContent, blank: !!document.querySelector('.backfoot .ln .blank') }; })`;
  const type = input => evaluate(`${TYPE}(${JSON.stringify(input)})`);
  const typed = await type(' 02-201-1234 <b>');
  ok(typed.field === '02-201-1234' && typed.tel === '02-201-1234' && typed.keys.join() === KEY && typed.kept.join() === '02-201-1234', 'a typed phone is cleaned, printed and kept under the unit', JSON.stringify(typed));
  // R3 P3: Thai digits, "ติดต่อ", extensions and a second number.
  for (const [input, want] of [['๐ ๒๒๐๑ ๑๒๓๔', '0 2201 1234'], ['ติดต่อ 02-201-1234', '02-201-1234'], ['02-201-1234 x 5678', '02-201-1234 ต่อ 5678'],
    ['02-201-1234 ext. 5678', '02-201-1234 ต่อ 5678'], ['081-234-5678 หรือ 02-201-1234', '081-234-5678, 02-201-1234'], ['02-201-1234 (คุณแดง)', '02-201-1234']]) {
    const t = await type(input);
    ok(t.tel === want && t.kept.join() === want, `typed "${input}" prints "${want}"`, JSON.stringify([t.tel, t.kept]));
  }
  const thaiKeys = await type('ไๆๅ/ภ');   // "02-201" typed with the keyboard left in Thai
  ok(thaiKeys.tel === null && thaiKeys.blank && !thaiKeys.keys.length && /ไม่พบตัวเลข/.test(thaiKeys.note), 'no digits: blank line, nothing kept, and the field says why', JSON.stringify(thaiKeys));
  const cleared = await type('');
  ok(cleared.tel === null && cleared.blank && !cleared.keys.length, 'clearing the field brings the blank line back and forgets the number', JSON.stringify(cleared));
  await shoot('.ctl', path.join(OUT, 'controls.png'));
  // Demo pages show a typed number but keep nothing (R3 P1).
  await go(base + 'booklet.html?demo=heavy');
  const demoT = await type(PHONE);
  ok(demoT.tel === PHONE && !demoT.keys.length && /ไม่บันทึก/.test(demoT.note), 'a demo page shows the number but keeps nothing', JSON.stringify(demoT));
  // No record: the phone field is hidden with the no-data screen.
  await evaluate(`sessionStorage.clear(); localStorage.clear()`);
  await go(base + 'booklet.html?v=check');
  ok(await evaluate(`!!document.querySelector('.nodata') && document.getElementById('telSet').hidden`), 'no record: the no-data screen, the phone field hidden');
  // Control for the PDF check (R2 N6, R3 P4): every Thai money word planted in each body font must be caught.
  const THAI = MONEY.filter(w => /[ก-๛]/.test(w));
  await load(cases[0].data);
  await evaluate(`document.querySelector('.back h2').textContent = ${JSON.stringify(THAI.join(' '))}`);
  const plantedHead = await pdf(path.join(OUT, 'control-prompt.pdf'));
  await load(cases[0].data);
  await evaluate(`document.querySelector('.back .tips li').textContent = ${JSON.stringify(THAI.join(' '))}`);
  const plantedBody = await pdf(path.join(OUT, 'control-looped.pdf'));
  // Phone screen: pages 1–4 stacked.
  await c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await load(cases[0].data, PHONE);
  await sleep(300);
  const narrow = await evaluate(`({ narrow: document.querySelector('.sheets').classList.contains('is-narrow'), wide: document.documentElement.scrollWidth <= innerWidth + 1 })`);
  ok(narrow.narrow && narrow.wide, 'phone width: pages stacked, no sideways scroll', JSON.stringify(narrow));
  const shot = await c.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, 'phone.png'), Buffer.from(shot.data, 'base64'));
  await stop(); srv.close();

  // PDF pages, size and text (PDFKit through osascript).
  console.log('\nPDF files');
  const jxa = path.join(OUT, '.pdftext.js');
  fs.writeFileSync(jxa, `ObjC.import('PDFKit');
function run(argv) { const out = {}; for (const f of argv) { const d = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(f)); const pages = [];
  for (let i = 0; i < d.pageCount; i++) { const p = d.pageAtIndex(i); const b = p.boundsForBox($.kPDFDisplayBoxMediaBox); pages.push({ w: b.size.width, h: b.size.height, text: ObjC.unwrap(p.string) || '' }); }
  out[f] = pages; } return JSON.stringify(out); }`);
  const info = JSON.parse(execFileSync('osascript', ['-l', 'JavaScript', jxa, ...pdfs.map(p => p.file), plantedHead, plantedBody], { maxBuffer: 64 << 20 }).toString());
  const a4 = pg => Math.abs(pg.w - 841.9) < 2 && Math.abs(pg.h - 595.3) < 2;
  for (const { k, file } of pdfs) {
    const pages = info[file], text = pages.map(p => p.text).join('\n');
    ok(pages.length === (k.pages || 2) && pages.every(a4), `${k.name}: ${k.pages || 2} page(s) of A4 landscape`, pages.map(p => `${p.w}×${p.h}`).join(', '));
    if (!k.pages) {
      ok(norm(text).includes(norm('สมุดดูแลสุขภาพช่องปาก')), `${k.name}: PDF text is readable`);
      ok(!moneyIn(text, true).length, `${k.name}: no money word in the PDF text (marks and spaces taken out)`, moneyIn(text, true).join(', '));
    }
  }
  for (const [file, font] of [[plantedHead, 'Prompt'], [plantedBody, 'Noto Sans Thai Looped']]) {
    const caught = moneyIn(info[file].map(p => p.text).join('\n'), true), missed = THAI.filter(w => !caught.includes(w));
    ok(!missed.length, `control: all ${THAI.length} Thai money words planted in ${font} are caught in the PDF text`, 'missed ' + missed.join(', '));
  }
  fs.rmSync(jxa);

  console.log('\nfit steps');
  for (const r of rows) console.log(`  ${r.name.padEnd(16)} ${r.steps}`);
  console.log(`\n${pass} passed, ${fail} failed · files in ${OUT}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
