// ============================================================
// duplicate-job-guard.js — Prevent duplicate job sheets and safely clean legacy duplicate rows
// ============================================================

(function () {
  if (window.__kirkstoneDuplicateJobGuardInstalled) return;
  window.__kirkstoneDuplicateJobGuardInstalled = true;

  const LEGACY_INVOICE = 'KCSYGDC104';
  let cleanupRunning = false;

  function normalise(value) {
    return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  }

  function invoiceNumberForJob(job) {
    if (!job) return '';
    return normalise(
      job.invoiceNumber
      || job.invoiceSpreadsheetSnapshot?.invoiceNumber
      || String(job.quoteRef || '').replace(/Q$/i, '')
      || (job.quoteSnapshot?.refPrefix && job.quoteSnapshot?.refNumber
        ? `KC${job.quoteSnapshot.refPrefix}${job.quoteSnapshot.refNumber}`
        : '')
    );
  }

  function jobText(job) {
    return [
      job?.customerName,
      job?.customerAddress,
      job?.notes,
      job?.workCarriedOut,
      job?.quoteSnapshot?.customerName,
      job?.quoteSnapshot?.customerAddress,
      job?.quoteSnapshot?.notes,
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function jobScore(job) {
    let score = 0;
    if (job?.invoiceDateIssued) score += 1000;
    if (job?.invoiceSpreadsheetLocked) score += 500;
    if (job?.invoiceSpreadsheetSettled) score += 250;
    score += (Array.isArray(job?.actualEntries) ? job.actualEntries.length : 0) * 25;
    score += (Array.isArray(job?.parts) ? job.parts.length : 0) * 5;
    if (job?.poNumber) score += 20;
    if (job?.workCarriedOut) score += 10;
    return score;
  }

  function newestFirst(a, b) {
    return new Date(b?.updatedAt || b?.createdAt || 0).getTime()
      - new Date(a?.updatedAt || a?.createdAt || 0).getTime();
  }

  function chooseBestJob(jobs) {
    return [...jobs].sort((a, b) => {
      const scoreDiff = jobScore(b) - jobScore(a);
      return scoreDiff || newestFirst(a, b);
    })[0];
  }

  async function archiveDuplicateJob(job, keep) {
    if (!job?.id) return;
    const reason = `Duplicate ${LEGACY_INVOICE} job record; kept ${keep?.id || 'canonical job'}`;

    if (typeof isLocalPreviewMode !== 'undefined' && isLocalPreviewMode) {
      const key = 'kirkstone_deleted_jobs';
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      existing.unshift({
        ...JSON.parse(JSON.stringify(job)),
        deletedAt: new Date().toISOString(),
        deletedReason: reason,
        originalJobId: job.id,
      });
      localStorage.setItem(key, JSON.stringify(existing));
      if (typeof StorageManager !== 'undefined' && StorageManager.deleteJob) StorageManager.deleteJob(job.id);
      return;
    }

    if (typeof db === 'undefined' || !db || typeof deleteJobFromFirestore !== 'function') return;
    const archived = {
      ...JSON.parse(JSON.stringify(job)),
      deletedAt: new Date().toISOString(),
      deletedReason: reason,
      originalJobId: job.id,
    };
    await db.collection('jobTrash').doc(job.id).set(archived);
    await deleteJobFromFirestore(job.id);
    if (typeof StorageManager !== 'undefined' && StorageManager.deleteJob) StorageManager.deleteJob(job.id);
  }

  function sameUnderlyingIvPJob(jobs) {
    if (!Array.isArray(jobs) || jobs.length < 2) return false;

    const quoteIds = [...new Set(jobs.map(job => job.quoteId).filter(Boolean))];
    if (quoteIds.length === 1) return true;

    // The known legacy duplicate left after the Bioscience record was moved to 105
    // should now consist only of Nottingham IVP copies. Never auto-clean if a
    // Bioscience record is still present.
    const texts = jobs.map(jobText);
    const allIvp = texts.every(text => /\bivp\b/.test(text));
    const anyBioscience = texts.some(text => /bioscience/.test(text));
    return allIvp && !anyBioscience;
  }

  async function cleanupLegacy104SpreadsheetDuplicate() {
    if (cleanupRunning || typeof currentJobs === 'undefined' || !Array.isArray(currentJobs)) return;
    const matches = currentJobs.filter(job =>
      job?.invoiceSpreadsheetAdded === true && invoiceNumberForJob(job) === LEGACY_INVOICE
    );
    if (matches.length <= 1 || !sameUnderlyingIvPJob(matches)) return;

    cleanupRunning = true;
    try {
      const keep = chooseBestJob(matches);
      const duplicates = matches.filter(job => job.id !== keep.id);
      for (const job of duplicates) await archiveDuplicateJob(job, keep);

      if (typeof refreshJobSheets === 'function') await refreshJobSheets();
      if (typeof renderInvoiceSpreadsheet === 'function') renderInvoiceSpreadsheet();
      if (typeof renderAnnualSummary === 'function') renderAnnualSummary();
      if (typeof showToast === 'function') {
        showToast(`Removed ${duplicates.length} duplicate ${LEGACY_INVOICE} job record${duplicates.length === 1 ? '' : 's'} to Recently Deleted`);
      }
    } catch (error) {
      console.error('Legacy KCSYGDC104 duplicate cleanup failed', error);
    } finally {
      cleanupRunning = false;
    }
  }

  function installCreateJobGuard() {
    if (typeof window.createJobSheetFromQuote !== 'function' || window.createJobSheetFromQuote.__duplicateJobGuardWrapped) return;
    const originalCreate = window.createJobSheetFromQuote;
    const wrappedCreate = async function (quoteId) {
      const existing = typeof currentJobs !== 'undefined' && Array.isArray(currentJobs)
        ? currentJobs.find(job => job?.quoteId === quoteId)
        : null;
      if (existing) {
        if (typeof showToast === 'function') showToast('A job sheet already exists for this quote — opening the existing job');
        if (typeof openJobSheet === 'function') openJobSheet(existing.id);
        return;
      }
      return originalCreate.apply(this, arguments);
    };
    wrappedCreate.__duplicateJobGuardWrapped = true;
    window.createJobSheetFromQuote = wrappedCreate;
  }

  function addDuplicateDetailsToWarning() {
    const warning = document.querySelector('#invoiceSpreadsheet .invoice-reference-warning');
    if (!warning || !/KCSYGDC104/i.test(warning.textContent || '')) return;
    const matches = typeof currentJobs !== 'undefined' && Array.isArray(currentJobs)
      ? currentJobs.filter(job => job?.invoiceSpreadsheetAdded === true && invoiceNumberForJob(job) === LEGACY_INVOICE)
      : [];
    if (matches.length <= 1 || warning.querySelector('.invoice-duplicate-detail')) return;

    const detail = document.createElement('div');
    detail.className = 'invoice-duplicate-detail';
    detail.style.cssText = 'font-weight:400;margin-top:.35rem;font-size:.82rem';
    detail.textContent = 'Records: ' + matches.map(job => {
      const text = jobText(job);
      const site = /bioscience/.test(text) ? 'Bioscience Nottingham' : (/\bivp\b/.test(text) ? 'Nottingham IVP' : 'site not identified');
      return `${job.customerName || 'Unnamed job'} — ${site}`;
    }).join(' | ');
    warning.appendChild(detail);
  }

  function installWarningDetailWrapper() {
    if (typeof window.renderInvoiceSpreadsheet !== 'function' || window.renderInvoiceSpreadsheet.__duplicateJobDetailWrapped) return;
    const originalRender = window.renderInvoiceSpreadsheet;
    const wrappedRender = function () {
      const result = originalRender.apply(this, arguments);
      addDuplicateDetailsToWarning();
      return result;
    };
    wrappedRender.__duplicateJobDetailWrapped = true;
    window.renderInvoiceSpreadsheet = wrappedRender;
  }

  function install() {
    installCreateJobGuard();
    installWarningDetailWrapper();
    cleanupLegacy104SpreadsheetDuplicate();
  }

  if (document.readyState === 'complete') install();
  else window.addEventListener('load', install, { once: true });

  const cloudStatus = document.getElementById('cloudStatus');
  if (cloudStatus) {
    const observer = new MutationObserver(() => {
      if (cloudStatus.classList.contains('cloud-status-ready')) install();
    });
    observer.observe(cloudStatus, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
  }

  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    install();
    if (attempts >= 30) clearInterval(timer);
  }, 1000);
})();
