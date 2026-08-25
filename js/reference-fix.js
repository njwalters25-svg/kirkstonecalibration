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
      if (normalisePrefix(q.refPrefix) === upper && Number.isInteger(q.refNumber)) {
        used.push(q.refNumber);
      }
      const parsed = extractRefNumber(q.quoteRef || q.reference || '', upper);
      if (Number.isInteger(parsed)) used.push(parsed);
    });

    if (typeof currentJobs !== 'undefined' && Array.isArray(currentJobs)) {
      currentJobs.forEach(job => {
        const refs = [job.quoteRef, job.invoiceNumber];
        refs.forEach(ref => {
          const parsed = extractRefNumber(ref, upper);
          if (Number.isInteger(parsed)) used.push(parsed);
        });
        const snap = job.quoteSnapshot || {};
        if (normalisePrefix(snap.refPrefix) === upper && Number.isInteger(snap.refNumber)) {
          used.push(snap.refNumber);
        }
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
      displayEl.textContent = 'Enter a customer code';
      displayEl.className = 'ref-display ref-display-empty';
      numberEl.value = '';
      return;
    }

    const num = window.getNextRefNumber(upper, typeof currentQuotes !== 'undefined' ? currentQuotes : []);
    numberEl.value = num;
    displayEl.textContent = buildRefCode(upper, num, true);
    displayEl.className = 'ref-display';
  };

  function refreshReferenceIfNewQuote() {
    if (typeof loadedQuoteId !== 'undefined' && loadedQuoteId) return;
    const prefixEl = document.getElementById('refPrefix');
    if (!prefixEl) return;
    const upper = normalisePrefix(prefixEl.value);
    if (!upper) return;
    prefixEl.value = upper;
    window.updateRefDisplay(upper);
    if (typeof autoSaveForm === 'function') autoSaveForm();
  }

  document.addEventListener('DOMContentLoaded', () => {
    const prefixEl = document.getElementById('refPrefix');
    if (prefixEl) {
      const handlePrefix = () => {
        if (typeof loadedQuoteId !== 'undefined' && loadedQuoteId) return;
        const upper = normalisePrefix(prefixEl.value);
        prefixEl.value = upper;
        window.updateRefDisplay(upper);
        if (typeof autoSaveForm === 'function') autoSaveForm();
      };
      prefixEl.addEventListener('input', handlePrefix);
      prefixEl.addEventListener('change', handlePrefix);
    }

    const cloudStatus = document.getElementById('cloudStatus');
    if (cloudStatus) {
      const observer = new MutationObserver(() => {
        if (cloudStatus.classList.contains('cloud-status-ready')) {
          refreshReferenceIfNewQuote();
        }
      });
      observer.observe(cloudStatus, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    }

    setTimeout(refreshReferenceIfNewQuote, 1500);
  });

  // Load normal app-code corrections in a controlled order.
  const pricingScript = document.createElement('script');
  pricingScript.src = 'js/job-pricing-fix.js?v=20260825-3';
  pricingScript.async = false;
  pricingScript.onload = () => {
    const compatScript = document.createElement('script');
    compatScript.src = 'js/part-price-compat.js?v=20260825-2';
    compatScript.async = false;
    compatScript.onload = () => {
      const lateScript = document.createElement('script');
      lateScript.src = 'js/job-pricing-late.js?v=20260825-2';
      lateScript.async = false;
      document.head.appendChild(lateScript);
    };
    document.head.appendChild(compatScript);
  };
  document.head.appendChild(pricingScript);
})();
