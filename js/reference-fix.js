// ============================================================
// reference-fix.js — Robust quote reference generation
// ============================================================

(function () {
  function normalisePrefix(value) {
    return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  }
  function extractRefNumber(ref, prefix) {
    if (!ref) return null;
    const upperRef = String(ref).trim().toUpperCase();
    const upperPrefix = normalisePrefix(prefix);
    if (!upperPrefix) return null;
    const escapedPrefix = upperPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = upperRef.match(new RegExp(`^KC${escapedPrefix}(\\d+)(?:Q|A)?$`));
    return match ? parseInt(match[1], 10) : null;
  }
  window.getNextRefNumber = function getNextRefNumberFixed(prefix, quotes) {
    const upper = normalisePrefix(prefix);
    if (!upper) return 100;
    const used = [];
    (Array.isArray(quotes) ? quotes : []).forEach(q => {
      if (normalisePrefix(q.refPrefix) === upper && Number.isInteger(q.refNumber)) used.push(q.refNumber);
      const parsed = extractRefNumber(q.quoteRef || q.reference || '', upper);
      if (Number.isInteger(parsed)) used.push(parsed);
    });
    if (typeof currentJobs !== 'undefined' && Array.isArray(currentJobs)) {
      currentJobs.forEach(job => {
        [job.quoteRef, job.invoiceNumber].forEach(ref => {
          const parsed = extractRefNumber(ref, upper);
          if (Number.isInteger(parsed)) used.push(parsed);
        });
        const snap = job.quoteSnapshot || {};
        if (normalisePrefix(snap.refPrefix) === upper && Number.isInteger(snap.refNumber)) used.push(snap.refNumber);
      });
    }
    return used.length ? Math.max(...used) + 1 : 100;
  };
  window.updateRefDisplay = function updateRefDisplayFixed(prefix) {
    const displayEl = document.getElementById('refDisplay');
    const numberEl = document.getElementById('refNumber');
    if (!displayEl || !numberEl) return;
    const upper = normalisePrefix(prefix);
    if (!upper) {
      displayEl.textContent = 'Enter a customer code'; displayEl.className = 'ref-display ref-display-empty'; numberEl.value = ''; return;
    }
    const num = window.getNextRefNumber(upper, typeof currentQuotes !== 'undefined' ? currentQuotes : []);
    numberEl.value = num; displayEl.textContent = buildRefCode(upper, num, true); displayEl.className = 'ref-display';
  };
  function refreshReferenceIfNewQuote() {
    if (typeof loadedQuoteId !== 'undefined' && loadedQuoteId) return;
    const prefixEl = document.getElementById('refPrefix');
    if (!prefixEl) return;
    const upper = normalisePrefix(prefixEl.value);
    if (!upper) return;
    prefixEl.value = upper; window.updateRefDisplay(upper);
    if (typeof autoSaveForm === 'function') autoSaveForm();
  }
  document.addEventListener('DOMContentLoaded', () => {
    const prefixEl = document.getElementById('refPrefix');
    if (prefixEl) {
      const handlePrefix = () => {
        if (typeof loadedQuoteId !== 'undefined' && loadedQuoteId) return;
        const upper = normalisePrefix(prefixEl.value); prefixEl.value = upper; window.updateRefDisplay(upper);
        if (typeof autoSaveForm === 'function') autoSaveForm();
      };
      prefixEl.addEventListener('input', handlePrefix); prefixEl.addEventListener('change', handlePrefix);
    }
    const cloudStatus = document.getElementById('cloudStatus');
    if (cloudStatus) {
      const observer = new MutationObserver(() => { if (cloudStatus.classList.contains('cloud-status-ready')) refreshReferenceIfNewQuote(); });
      observer.observe(cloudStatus, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    }
    setTimeout(refreshReferenceIfNewQuote, 1500);
  });

  // Authenticated startup waits for dependent extension chains before boot hooks.
  window.loadOwnerExtensions = async function () {
    const chains = [["js/job-pricing-fix.js?v=20261008-1","js/part-price-compat.js?v=20260828-4","js/job-pricing-late.js?v=20261008-1","js/job-repair.js?v=20260828-1","js/job-custom-parts.js?v=20260828-3","js/job-close.js?v=20260902-2"],["js/repair-quote.js?v=20260828-2","js/repair-customer-quote.js?v=20260907-1"],["js/live-quote-pricing.js?v=20260828-1"],["js/daily-pipette-plan.js?v=20260903-1"],["js/day-rate-override.js?v=20260907-1","js/planned-days-override.js?v=20260907-1"],["js/invoice-number-edit.js?v=20260917-1","js/duplicate-job-guard.js?v=20260917-1","js/bioscience-reference-repair.js?v=20260917-2"],["js/invoice-spreadsheet-sticky.js?v=20260902-2"],["js/invoice-paid-date-sync-2026-27.js?v=20260902-2"],["js/invoice-wage-allocation.js?v=20260902-1"]];
    await Promise.all(chains.map(async chain => {
      for (const src of chain) await loadAccessScript(src);
    }));
    if (!window.renderAnnualSummaryCharts && !document.querySelector('script[data-annual-charts]')) {
      await loadAccessScript('js/annual-summary-charts.js?v=20260902-4');
    }
  };
})();

