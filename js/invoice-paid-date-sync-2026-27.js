// ============================================================
// invoice-paid-date-sync-2026-27.js
// One-time sync of Date Paid values from the user's updated 2026-27 Excel sheet.
// Each matched job is marked after syncing so future manual edits are left alone.
// ============================================================

(function () {
  const PAID_DATES = {
    'KCRO017': '2026-05-11',
    'KCTRFI032': '2026-04-28',
    'KCRB022': '2026-05-07',
    'KCTRFI031': '2026-06-02',
    'KCGBO005': '2026-05-01',
    'KCRB023': '2026-06-01',
    'KCGBO006': '2026-05-11',
    'KCSYGDC060': '2026-05-15',
    'KCSYGDC061': '2026-05-15',
    'KCOT001': '2026-05-28',
    'KCSYGDC062': '2026-06-16',
    'KCEB025': '2026-06-30',
    'KCSYGDC063': '2026-07-01',
    'KCAL002': '2026-06-15',
    'KCR024': '2026-06-08',
    'KCSYGDC064': '2026-07-01',
    'KCSCANCELL021': '2026-06-10',
    'KCSYGDC065': '2026-08-03',
    'KCSYGDC066': '2026-08-03',
    'KCSYGDC067': '2026-07-15',
    'KCSYGDC068': '2026-07-15',
    'KCSYGDC069': '2026-07-15',
    'KCCB006': '2026-07-03',
    'KCCB007': '2026-07-06',
    'KCCB008': '2026-07-06',
    'KCEB026': '2026-07-09',
    'KCEB027': '2026-08-20',
    'KCAL003': '2026-07-31',
    'KCRB024': '2026-07-21',
    'KCGBO008': '2026-07-23',
    'KCEB028': '2026-07-30',
    'KCSYGDC070': '2026-08-17',
    'KCSYGDC071': '2026-08-03',
    'KCEB029': '2026-08-20',
    'KCRB025': '2026-08-07',
    'KCSCANCELL022': '2026-08-12'
  };

  const SYNC_MARKER = 'invoicePaidDateSyncedFrom2026_27Spreadsheet';

  function invoiceNumber(job) {
    return String(job?.invoiceNumber || job?.invoiceSpreadsheetSnapshot?.invoiceNumber || '').trim().toUpperCase();
  }

  async function syncPaidDates() {
    if (!Array.isArray(window.currentJobs)) return false;
    if (typeof StorageManager === 'undefined' || typeof StorageManager.saveJob !== 'function') return false;
    if (typeof saveJobToFirestore !== 'function') return false;

    const changed = [];
    for (const job of currentJobs) {
      const number = invoiceNumber(job);
      const paidDate = PAID_DATES[number];
      if (!paidDate || job[SYNC_MARKER]) continue;

      job.invoiceDatePaid = paidDate;
      job[SYNC_MARKER] = true;
      job.updatedAt = new Date().toISOString();
      StorageManager.saveJob(job);
      changed.push(job);
    }

    for (const job of changed) {
      if (typeof isLocalPreviewMode === 'undefined' || !isLocalPreviewMode) {
        await saveJobToFirestore(job);
      }
    }

    if (changed.length) {
      if (typeof refreshJobSheets === 'function') await refreshJobSheets();
      if (typeof renderInvoiceSpreadsheet === 'function') renderInvoiceSpreadsheet();
      if (typeof renderAnnualSummary === 'function') renderAnnualSummary();
      if (typeof showToast === 'function') showToast(`${changed.length} invoice paid date${changed.length === 1 ? '' : 's'} synced from spreadsheet`);
    }
    return true;
  }

  function trySync() {
    const cloudStatus = document.getElementById('cloudStatus');
    if (cloudStatus && !cloudStatus.classList.contains('cloud-status-ready')) return false;
    syncPaidDates().catch(error => {
      console.error('Could not sync invoice paid dates', error);
      if (typeof showToast === 'function') showToast('Could not sync invoice paid dates');
    });
    return true;
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (trySync()) return;
    const cloudStatus = document.getElementById('cloudStatus');
    if (!cloudStatus) return;
    const observer = new MutationObserver(() => {
      if (cloudStatus.classList.contains('cloud-status-ready')) {
        observer.disconnect();
        trySync();
      }
    });
    observer.observe(cloudStatus, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
  });
})();
