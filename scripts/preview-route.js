// Offline preview only: open a screen from the URL hash so headless screenshots can reach every screen.
(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 50 && !document.querySelector('#t-home, #t-research'); i++) await wait(100);
  // #file:<id>:exam:fu:<element id> opens the child's first follow-up exam and scrolls to that element (guide pictures).
  const [screen, id, sub, fu, at] = decodeURIComponent(location.hash.slice(1)).split(':');
  if (!screen) return;
  if (screen === 'file' && id) {
    const sel = document.querySelector('#kidSel');
    document.querySelector('#t-file').click();
    if (sub) document.querySelector('#ft-' + sub).click();
    sel.value = id; sel.dispatchEvent(new Event('change'));
    if (sub) document.querySelector('#ft-' + sub).click();
    if (fu) { const c = [...document.querySelectorAll('#examStart button')].find(b => /^ตรวจซ้ำ|^ตรวจรอบ/.test(b.textContent)); if (c) c.click(); }
    if (at) { await wait(300); const e = document.getElementById(at); if (e) e.scrollIntoView({ block: 'start' }); }
  } else if (screen === 'enrol') document.querySelector('[data-go="enrol"]').click();
  else { const t = document.querySelector('#t-' + screen); if (t) t.click(); }
  document.documentElement.dataset.ready = '1';
})();
