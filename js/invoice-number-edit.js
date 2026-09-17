// ============================================================
// invoice-number-edit.js — Reference/invoice uniqueness guard + legacy correction
// ============================================================

(function () {
  if (window.__kirkstoneReferenceIntegrityInstalled) return;
  window.__kirkstoneReferenceIntegrityInstalled = true;

  const TARGET_PREFIX = 'SYGDC';
  const LEGACY_DUPLICATE_NUMBER = 104;
  const LEGACY_CORRECTED_NUMBER = 105;

  function normalisePrefix(value) {
    return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  }

  function normaliseReference(value) {
    return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  }

  function extractNumberForPrefix(value, prefix) {
    const ref = normaliseReference(value);
    const upperPrefix = normalisePrefix(prefix);
    if (!ref || !upperPrefix) return null;
    const escapedPrefix = upperPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = ref.match(new RegExp(`^KC${escapedPrefix}(\\d+)(?:Q|A)?$`));
    return match ? parseInt(match[1], 10) : null;
  }

  function quoteInvoiceNumber(quote) {
    if (!quote?.refPrefix || !Number.isInteger(Number(quote.refNumber))) return '';
    return `KC${normalisePrefix(quote.refPrefix)}${parseInt(quote.refNumber, 10)}`;
  }

  function jobReferences(job) {
    if (!job) return [];
    const refs = [
      job.quoteRef,
      job.invoiceNumber,
      job.reference,
      job.invoiceSpreadsheetSnapshot?.invoiceNumber,
      job.quoteSnapshot?.quoteRef,
      job.quoteSnapshot?.reference,
    ];
    if (job.quoteSnapshot?.refPrefix && job.quoteSnapshot?.refNumber) {
      refs.push(`KC${normalisePrefix(job.quoteSnapshot.refPrefix)}${parseInt(job.quoteSnapshot.refNumber, 10)}Q`);
    }
    return refs.filter(Boolean);
  }

  function usedNumbersForPrefix(prefix, quotes, jobs, excludeQuoteId = null, excludeJobId = null) {
    const upperPrefix = normalisePrefix(prefix);
    const used = new Set();

    (Array.isArray(quotes) ? quotes : []).forEach(quote => {
      if (!quote || quote.id === excludeQuoteId) return;
      if (normalisePrefix(quote.refPrefix) === upperPrefix) {
        const n = parseInt(quote.refNumber, 10);
        if (Number.isFinite(n)) used.add(n);
      }
      [quote.quoteRef, quote.reference].filter(Boolean).forEach(ref => {
        const n = extractNumberForPrefix(ref, upperPrefix);
        if (Number.isFinite(n)) used.add(n);
      });
    });

    (Array.isArray(jobs) ? jobs : []).forEach(job => {
      if (!job || job.id === excludeJobId) return;
      jobReferences(job).forEach(ref => {
        const n = extractNumberForPrefix(ref, upperPrefix);
        if (Number.isFinite(n)) used.add(n);
      });
    });

    return used;
  }

  function nextAvailableNumber(prefix, quotes, jobs) {
    const used = usedNumbersForPrefix(prefix, quotes, jobs);
    if (!used.size) return 100;
    return Math.max(...used) + 1;
  }

  function invoiceNumberInUse(invoiceNumber, excludeJobId = null, excludeQuoteId = null) {
    const candidate = normaliseReference(invoiceNumber).replace(/[QA]$/i, '');
    if (!candidate) return null;

    const jobs = typeof currentJobs !== 'undefined' && Array.isArray(currentJobs) ? currentJobs : [];
    for (const job of jobs) {
      if (!job || job.id === excludeJobId) continue;
      const refs = jobReferences(job).map(ref => normaliseReference(ref).replace(/[QA]$/i, ''));
      if (refs.includes(candidate)) return { type: 'job', item: job };
    }

    const quotes = typeof currentQuotes !== 'undefined' && Array.isArray(currentQuotes) ? currentQuotes : [];
    for (const quote of quotes) {
      if (!quote || quote.id === excludeQuoteId) continue;
      if (normaliseReference(quoteInvoiceNumber(quote)) === candidate) return { type: 'quote', item: quote };
    }
    return null;
  }

  async function getFreshReferenceData() {
    let quotes = typeof currentQuotes !== 'undefined' && Array.isArray(currentQuotes) ? currentQuotes : [];
    let jobs = typeof currentJobs !== 'undefined' && Array.isArray(currentJobs) ? currentJobs : [];
    if (typeof isLocalPreviewMode !== 'undefined' && isLocalPreviewMode) return { quotes, jobs };

    try {
      const [freshQuotes, freshJobs] = await Promise.all([
        typeof loadQuotesFromFirestore === 'function' ? loadQuotesFromFirestore() : Promise.resolve(quotes),
        typeof loadJobsFromFirestore === 'function' ? loadJobsFromFirestore() : Promise.resolve(jobs),
      ]);
      if (Array.isArray(freshQuotes)) quotes = freshQuotes;
      if (Array.isArray(freshJobs)) jobs = freshJobs;
    } catch (error) {
      console.warn('Could not refresh reference data before allocating number; using loaded data.', error);
    }
    return { quotes, jobs };
  }

  async function reserveNextQuoteNumber(prefix) {
    const upperPrefix = normalisePrefix(prefix);
    const { quotes, jobs } = await getFreshReferenceData();
    const serverNext = nextAvailableNumber(upperPrefix, quotes, jobs);

    if ((typeof isLocalPreviewMode !== 'undefined' && isLocalPreviewMode)
      || typeof db === 'undefined' || !db || typeof db.runTransaction !== 'function') {
      return serverNext;
    }

    const safePrefix = upperPrefix.replace(/[^A-Z0-9_-]/g, '_');
    const counterRef = db.collection('config').doc(`reference_counter_${safePrefix}`);
    return db.runTransaction(async transaction => {
      const snapshot = await transaction.get(counterRef);
      const lastNumber = snapshot.exists ? (parseInt(snapshot.data()?.lastNumber, 10) || 99) : 99;
      const next = Math.max(serverNext - 1, lastNumber, 99) + 1;
      transaction.set(counterRef, {
        prefix: upperPrefix,
        lastNumber: next,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      return next;
    });
  }

  function installRobustNextReference() {
    window.getNextRefNumber = function getNextRefNumberIntegrity(prefix, quotes) {
      const allQuotes = Array.isArray(quotes)
        ? quotes
        : (typeof currentQuotes !== 'undefined' && Array.isArray(currentQuotes) ? currentQuotes : []);
      const jobs = typeof currentJobs !== 'undefined' && Array.isArray(currentJobs) ? currentJobs : [];
      return nextAvailableNumber(prefix, allQuotes, jobs);
    };

    if (typeof loadedQuoteId !== 'undefined' && !loadedQuoteId) {
      const prefixEl = document.getElementById('refPrefix');
      if (prefixEl?.value && typeof window.updateRefDisplay === 'function') {
        window.updateRefDisplay(prefixEl.value);
      }
    }
  }

  function installSaveQuoteReservation() {
    const button = document.getElementById('saveQuote');
    if (!button || button.dataset.referenceIntegrityInstalled === 'true') return;
    button.dataset.referenceIntegrityInstalled = 'true';

    let replaying = false;
    let reserving = false;

    button.addEventListener('click', async event => {
      if (replaying) return;
      const prefixEl = document.getElementById('refPrefix');
      const numberEl = document.getElementById('refNumber');
      const displayEl = document.getElementById('refDisplay');
      const prefix = normalisePrefix(prefixEl?.value);
      if (!prefix || !numberEl) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      if (reserving) return;
      reserving = true;
      button.disabled = true;
      const previousNumber = parseInt(numberEl.value, 10) || 0;

      try {
        const reserved = await reserveNextQuoteNumber(prefix);
        numberEl.value = reserved;
        if (prefixEl) prefixEl.value = prefix;
        if (displayEl) {
          displayEl.textContent = typeof buildRefCode === 'function'
            ? buildRefCode(prefix, reserved, true)
            : `KC${prefix}${reserved}Q`;
          displayEl.className = 'ref-display';
        }
        if (previousNumber && previousNumber !== reserved && typeof showToast === 'function') {
          showToast(`Reference changed to KC${prefix}${reserved}Q to prevent a duplicate`);
        }
      } catch (error) {
        console.error('Could not reserve a unique quote reference', error);
        const quotes = typeof currentQuotes !== 'undefined' && Array.isArray(currentQuotes) ? currentQuotes : [];
        const jobs = typeof currentJobs !== 'undefined' && Array.isArray(currentJobs) ? currentJobs : [];
        const fallback = nextAvailableNumber(prefix, quotes, jobs);
        numberEl.value = fallback;
        if (displayEl) displayEl.textContent = `KC${prefix}${fallback}Q`;
      } finally {
        button.disabled = false;
        reserving = false;
      }

      replaying = true;
      try {
        button.click();
      } finally {
        replaying = false;
      }
    }, true);
  }

  function installInvoiceGuards() {
    if (typeof window.addJobToInvoiceSpreadsheet === 'function' && !window.addJobToInvoiceSpreadsheet.__referenceIntegrityWrapped) {
      const originalAdd = window.addJobToInvoiceSpreadsheet;
      const wrappedAdd = async function (jobId) {
        const job = typeof currentJobs !== 'undefined' && Array.isArray(currentJobs)
          ? currentJobs.find(item => item.id === jobId)
          : null;
        const candidate = job && typeof createInvoiceNumberFromJob === 'function'
          ? createInvoiceNumberFromJob(job)
          : '';
        const conflict = candidate ? invoiceNumberInUse(candidate, jobId, job?.quoteId || null) : null;
        if (conflict) {
          if (typeof showToast === 'function') showToast(`Invoice number ${candidate} is already in use — not added`);
          return;
        }
        return originalAdd.apply(this, arguments);
      };
      wrappedAdd.__referenceIntegrityWrapped = true;
      window.addJobToInvoiceSpreadsheet = wrappedAdd;
    }

    if (typeof window.updateJobField === 'function' && !window.updateJobField.__referenceIntegrityWrapped) {
      const originalUpdateJobField = window.updateJobField;
      const wrappedUpdate = function (jobId, field, value) {
        if (field === 'invoiceNumber') {
          const cleaned = normaliseReference(value);
          const job = typeof currentJobs !== 'undefined' && Array.isArray(currentJobs)
            ? currentJobs.find(item => item.id === jobId)
            : null;
          const conflict = cleaned ? invoiceNumberInUse(cleaned, jobId, job?.quoteId || null) : null;
          if (conflict) {
            if (typeof showToast === 'function') showToast(`Invoice number ${cleaned} is already in use`);
            if (typeof renderJobSheets === 'function' && typeof currentJobs !== 'undefined') renderJobSheets(currentJobs);
            return;
          }
          value = cleaned;
        }
        return originalUpdateJobField.call(this, jobId, field, value);
      };
      wrappedUpdate.__referenceIntegrityWrapped = true;
      window.updateJobField = wrappedUpdate;
    }

    if (typeof window.getInvoiceSpreadsheetValues === 'function' && !window.getInvoiceSpreadsheetValues.__referenceIntegrityWrapped) {
      const originalValues = window.getInvoiceSpreadsheetValues;
      const wrappedValues = function (job) {
        const values = originalValues.apply(this, arguments) || {};
        // Lock financial figures, but keep the invoice number live/editable.
        if (job?.invoiceNumber) values.invoiceNumber = job.invoiceNumber;
        return values;
      };
      wrappedValues.__referenceIntegrityWrapped = true;
      window.getInvoiceSpreadsheetValues = wrappedValues;
    }

    if (typeof window.renderInvoiceSpreadsheet === 'function' && !window.renderInvoiceSpreadsheet.__referenceIntegrityWrapped) {
      const originalRender = window.renderInvoiceSpreadsheet;
      const wrappedRender = function () {
        const result = originalRender.apply(this, arguments);
        try {
          const jobs = typeof getInvoiceSpreadsheetJobs === 'function' ? getInvoiceSpreadsheetJobs() : [];
          const seen = new Map();
          const duplicates = new Set();
          jobs.forEach(job => {
            const values = typeof getInvoiceSpreadsheetValues === 'function' ? getInvoiceSpreadsheetValues(job) : {};
            const number = normaliseReference(values.invoiceNumber);
            if (!number) return;
            if (seen.has(number)) duplicates.add(number);
            else seen.set(number, job.id);
          });
          const container = document.getElementById('invoiceSpreadsheet');
          if (container && duplicates.size) {
            const warning = document.createElement('div');
            warning.className = 'invoice-reference-warning';
            warning.style.cssText = 'margin:0 0 .8rem;padding:.7rem .85rem;border:1px solid #c53030;background:#fff5f5;color:#9b2c2c;border-radius:6px;font-weight:700';
            warning.textContent = `Duplicate invoice number${duplicates.size > 1 ? 's' : ''} detected: ${Array.from(duplicates).join(', ')}`;
            container.prepend(warning);
          }
        } catch (error) {
          console.warn('Could not check invoice spreadsheet for duplicate numbers', error);
        }
        return result;
      };
      wrappedRender.__referenceIntegrityWrapped = true;
      window.renderInvoiceSpreadsheet = wrappedRender;
    }
  }

  function jobSearchText(job) {
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

  function jobHasReferenceNumber(job, prefix, number) {
    return jobReferences(job).some(ref => extractNumberForPrefix(ref, prefix) === number);
  }

  async function correctLegacySygdc104Duplicate() {
    if (window.__kirkstoneSygdc104CorrectionRunning) return;
    window.__kirkstoneSygdc104CorrectionRunning = true;
    try {
      const jobs = typeof currentJobs !== 'undefined' && Array.isArray(currentJobs) ? currentJobs : [];
      const duplicates = jobs.filter(job => jobHasReferenceNumber(job, TARGET_PREFIX, LEGACY_DUPLICATE_NUMBER));
      if (duplicates.length < 2) return;

      let target = duplicates.find(job => /bioscience/.test(jobSearchText(job)) && !/\bivp\b/.test(jobSearchText(job)));
      if (!target) {
        const ivp = duplicates.find(job => /\bivp\b/.test(jobSearchText(job)));
        if (ivp && duplicates.length === 2) target = duplicates.find(job => job.id !== ivp.id) || null;
      }
      if (!target) {
        console.warn('KCSYGDC104 duplicate found, but the Bioscience Nottingham job could not be identified safely.');
        return;
      }

      const linkedQuote = typeof currentQuotes !== 'undefined' && Array.isArray(currentQuotes)
        ? (currentQuotes.find(quote => quote.id === target.quoteId) || null)
        : null;
      const used105 = usedNumbersForPrefix(
        TARGET_PREFIX,
        typeof currentQuotes !== 'undefined' ? currentQuotes : [],
        jobs,
        linkedQuote?.id || null,
        target.id
      ).has(LEGACY_CORRECTED_NUMBER);

      if (used105) {
        console.error('Cannot correct KCSYGDC104 to KCSYGDC105 because 105 is already in use.');
        if (typeof showToast === 'function') showToast('KCSYGDC105 is already in use — duplicate not auto-corrected');
        return;
      }

      target.quoteRef = `KC${TARGET_PREFIX}${LEGACY_CORRECTED_NUMBER}Q`;
      target.invoiceNumber = `KC${TARGET_PREFIX}${LEGACY_CORRECTED_NUMBER}`;
      target.updatedAt = new Date().toISOString();
      if (target.quoteSnapshot) {
        target.quoteSnapshot.refPrefix = TARGET_PREFIX;
        target.quoteSnapshot.refNumber = LEGACY_CORRECTED_NUMBER;
        if (target.quoteSnapshot.quoteRef) target.quoteSnapshot.quoteRef = target.quoteRef;
        if (target.quoteSnapshot.reference) target.quoteSnapshot.reference = target.quoteRef;
      }
      if (target.invoiceSpreadsheetSnapshot) {
        target.invoiceSpreadsheetSnapshot.invoiceNumber = target.invoiceNumber;
      }

      if (typeof StorageManager !== 'undefined' && StorageManager.saveJob) StorageManager.saveJob(target);
      if (typeof isLocalPreviewMode === 'undefined' || !isLocalPreviewMode) {
        if (typeof saveJobToFirestore === 'function') await saveJobToFirestore(target);
      }

      if (linkedQuote) {
        linkedQuote.refPrefix = TARGET_PREFIX;
        linkedQuote.refNumber = LEGACY_CORRECTED_NUMBER;
        if (linkedQuote.quoteRef) linkedQuote.quoteRef = target.quoteRef;
        if (linkedQuote.reference) linkedQuote.reference = target.quoteRef;
        linkedQuote.updatedAt = new Date().toISOString();
        if (typeof StorageManager !== 'undefined' && StorageManager.updateQuote) StorageManager.updateQuote(linkedQuote);
        if ((typeof isLocalPreviewMode === 'undefined' || !isLocalPreviewMode)
          && typeof updateQuoteInFirestore === 'function') {
          await updateQuoteInFirestore(linkedQuote);
        }
      }

      if (typeof renderJobSheets === 'function') renderJobSheets(currentJobs);
      if (typeof renderQuoteHistory === 'function') renderQuoteHistory(currentQuotes, currentSettings);
      if (typeof renderInvoiceSpreadsheet === 'function') renderInvoiceSpreadsheet();
      if (typeof renderAnnualSummary === 'function') renderAnnualSummary();
      if (typeof showToast === 'function') showToast('Bioscience Nottingham corrected to KCSYGDC105');
    } catch (error) {
      console.error('Could not correct the KCSYGDC104 duplicate automatically', error);
      if (typeof showToast === 'function') showToast('Could not auto-correct the KCSYGDC104 duplicate');
    } finally {
      window.__kirkstoneSygdc104CorrectionRunning = false;
    }
  }

  function installAfterPageLoad() {
    installRobustNextReference();
    installSaveQuoteReservation();
    installInvoiceGuards();

    const cloudStatus = document.getElementById('cloudStatus');
    const runCorrectionWhenReady = () => {
      if (!cloudStatus || cloudStatus.classList.contains('cloud-status-ready')) {
        correctLegacySygdc104Duplicate();
      }
    };
    runCorrectionWhenReady();
    if (cloudStatus) {
      const observer = new MutationObserver(() => {
        if (cloudStatus.classList.contains('cloud-status-ready')) runCorrectionWhenReady();
      });
      observer.observe(cloudStatus, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
    }
  }

  if (document.readyState === 'complete') installAfterPageLoad();
  else window.addEventListener('load', installAfterPageLoad, { once: true });
})();
