// Authorise before loading any owner modules or browser financial cache.
const ownerScripts = ["js/data.js?v=20260803-1","js/routing.js?v=20260803-1","js/quote.js?v=20260803-1","js/ui.js?v=20261008-1","js/app.js?v=20261008-1","js/reference-fix.js?v=20261008-1","js/ui-state.js?v=20260820-1","js/customer-completed-quote.js?v=20260821-1","js/invoice-spreadsheet.js?v=20260902-1","js/invoice-spreadsheet-order-lock.js?v=20260902-2","js/invoice-spreadsheet-freeze.js?v=20260902-1","js/job-recovery.js?v=20260827-1","js/historical-jobs.js?v=20260827-1","js/invoice-spreadsheet-import-2026-27.js?v=20260902-1","js/annual-summary.js?v=20260902-1"];
async function loadAccessScript(src) {
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src; script.onload = resolve;
    script.onerror = () => reject(new Error('Could not load the app. Please refresh.'));
    document.body.appendChild(script);
  });
}
function clearOwnerBrowserCache() {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('kirkstone_')) localStorage.removeItem(key);
  }
}
document.addEventListener('DOMContentLoaded', async function startAccess() {
  const gate = document.getElementById('accessGate');
  const message = document.getElementById('accessMessage');
  document.getElementById('accessSignIn').onclick = async () => {
    try { await signInWithGoogle(); } catch (error) { message.textContent = error.message; }
  };
  const logout = document.createElement('button');
  logout.className = 'btn-small'; logout.textContent = 'Sign out';
  logout.onclick = async () => { await signOut(); clearOwnerBrowserCache(); location.reload(); };
  gate.appendChild(logout);
  let started = false;
  onAuthStateChanged(async user => {
    if (started) { location.reload(); return; }
    try {
      if (!user || user.isAnonymous) { message.textContent = 'Use your allowed Google account.'; return; }
      const role = await resolveUserAccess(user);
      if (!role) { message.textContent = 'This account does not have access.'; return; }
      started = true;
      if (role === 'staff') {
        clearOwnerBrowserCache();
        // Remove owner markup entirely; never initialise owner caches or scripts.
        document.getElementById('appHeader').remove();
        document.getElementById('appMain').remove();
        await loadAccessScript('js/staff-job-sheets.js?v=20261008-1');
        await startStaffJobSheets();
      } else {
        for (const src of ownerScripts) await loadAccessScript(src);
        await window.loadOwnerExtensions();
        document.getElementById('appHeader').hidden = false;
        document.getElementById('appMain').hidden = false;
        // Existing modules register their boot hooks on DOMContentLoaded.
        document.dispatchEvent(new Event('DOMContentLoaded'));
        document.querySelector('.header-right').appendChild(logout);
      }
      gate.remove();
      if (role === 'staff') document.getElementById('staffHeader').appendChild(logout);
    } catch (error) {
      message.textContent = error.message;
      started = false;
    }
  });
}, { once: true });

