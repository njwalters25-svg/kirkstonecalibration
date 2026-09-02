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

  const pricingScript = document.createElement('script');
  pricingScript.src = 'js/job-pricing-fix.js?v=20260825-3'; pricingScript.async = false;
  pricingScript.onload = () => {
    const compatScript = document.createElement('script');
    compatScript.src = 'js/part-price-compat.js?v=20260828-4'; compatScript.async = false;
    compatScript.onload = () => {
      const lateScript = document.createElement('script');
      lateScript.src = 'js/job-pricing-late.js?v=20260825-3'; lateScript.async = false;
      lateScript.onload = () => {
        const jobRepairScript = document.createElement('script');
        jobRepairScript.src = 'js/job-repair.js?v=20260828-1'; jobRepairScript.async = false;
        jobRepairScript.onload = () => {
          const customPartsScript = document.createElement('script');
          customPartsScript.src = 'js/job-custom-parts.js?v=20260828-3'; customPartsScript.async = false;
          customPartsScript.onload = () => {
            const closeJobScript = document.createElement('script');
            closeJobScript.src = 'js/job-close.js?v=20260828-1'; closeJobScript.async = false;
            document.head.appendChild(closeJobScript);
          };
          document.head.appendChild(customPartsScript);
        };
        document.head.appendChild(jobRepairScript);
      };
      document.head.appendChild(lateScript);
    };
    document.head.appendChild(compatScript);
  };
  document.head.appendChild(pricingScript);

  const repairScript = document.createElement('script');
  repairScript.src = 'js/repair-quote.js?v=20260828-2'; repairScript.async = false; document.head.appendChild(repairScript);

  // Saved/live quote pricing can be edited until a job sheet is raised.
  const liveQuotePricingScript = document.createElement('script');
  liveQuotePricingScript.src = 'js/live-quote-pricing.js?v=20260828-1';
  liveQuotePricingScript.async = false;
  document.head.appendChild(liveQuotePricingScript);

  // Invoice numbers can be corrected directly on the Invoice Spreadsheet.
  const invoiceNumberEditScript = document.createElement('script');
  invoiceNumberEditScript.src = 'js/invoice-number-edit.js?v=20260902-1';
  invoiceNumberEditScript.async = false;
  document.head.appendChild(invoiceNumberEditScript);
})();
