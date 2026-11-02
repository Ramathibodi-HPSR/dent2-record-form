// Dumps one test unit's data (as that unit sees it) into preview-data.local.js for the offline look check (preview.local.html).
const fs = require('fs'); const path = require('path'); const { createClient } = require('@supabase/supabase-js');
const cfg = fs.readFileSync(path.join(__dirname, '..', 'config.js'), 'utf8');
const c = createClient(cfg.match(/url:\s*'([^']+)'/)[1], cfg.match(/anonKey:\s*'([^']+)'/)[1], { auth: { persistSession: false } });
const user = process.argv[2] || 'public-cap';
const a = JSON.parse(fs.readFileSync(path.join(__dirname, 'test-accounts.local.json'), 'utf8')).find(x => x.username === user);
(async () => {
  const { data: s, error } = await c.auth.signInWithPassword({ email: a.email, password: a.password }); if (error) throw error;
  const out = { me: { id: s.user.id } };
  for (const t of ['staff', 'units', 'schools', 'examiners', 'price_list', 'children', 'exams', 'services', 'transfers', 'v_services_pay']) { const r = await c.from(t).select('*'); if (r.error) throw r.error; out[t] = r.data; }
  fs.writeFileSync(path.join(__dirname, 'preview-data.local.js'), 'window.MOCK = ' + JSON.stringify(out) + ';\n');
  console.log(Object.entries(out).map(([k, v]) => `${k}:${Array.isArray(v) ? v.length : 1}`).join(' '));
})().catch(e => { console.error(e); process.exit(1); });
