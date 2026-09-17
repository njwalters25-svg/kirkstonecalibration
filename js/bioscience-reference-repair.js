// ============================================================
// bioscience-reference-repair.js — Reconcile the known SYGDC 104/105 split safely
// ============================================================

(function () {
  if (window.__kirkstoneBioscienceReferenceRepairInstalled) return;
  window.__kirkstoneBioscienceReferenceRepairInstalled = true;

  const OLD_INVOICE = 'KCSYGDC104';
  const NEW_INVOICE = 'KCSYGDC105';
  const NEW_QUOTE_REF = 'KCSYGDC105Q';
  let running = false;
  let completed = false;

  function normalise(value) {
    return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
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

  function quoteText(quote) {
    return [quote?.customerName, quote?.customerAddress, quote?.notes]
      .filter(Boolean).join(' ').toLowerCase();
  }

  function isBioscienceJob(job) {
    const text = jobText(job);
    return /bioscience/.test(text) && !/\bivp\b/.test(text);
  }

  function isIvpJob(job) {
    return /\bivp\b/.test(jobText(job));
  }

  function jobRefs(job) {
    const refs = [
      job?.invoiceNumber,
      job?.quoteRef,
      job?.reference,
      job?.invoiceSpreadsheetSnapshot?.invoiceNumber,
      job?.quoteSnapshot?.quoteRef,
      job?.quoteSnapshot?.reference,
    ];
    if (job?.quoteSnapshot?.refPrefix && job?.quoteSnapshot?.refNumber) {
      refs.push(`KC${job.quoteSnapshot.refPrefix}${job.quoteSnapshot.refNumber}Q`);
    }
    return refs.filter(Boolean).map(normalise);
  }

  function jobHasNumber(job, invoiceNumber) {
    const base = normalise(invoiceNumber);
    const quote = `${base}Q`;
    return jobRefs(job).some(ref => ref === base || ref === quote);
  }

  function quoteNumber(quote) {
    if (!quote?.refPrefix || !Number.isFinite(parseInt(quote.refNumber, 10))) return '';
    return normalise(`KC${quote.refPrefix}${parseInt(quote.refNumber, 10)}`);
  }

  function jobScore(job) {
    let score = 0;
    if (job?.invoiceSpreadsheetAdded) score += 10000;
    if (job?.invoiceSpreadsheetLocked) score += 5000;
    if (job?.invoiceDateIssued) score += 2500;
    if (job?.invoiceDatePaid) score += 1000;
    if (job?.invoiceSpreadsheetSettled) score += 500;
    score += (Array.isArray(job?.actualEntries) ? job.actualEntries.length : 0) * 50;
    score += (Array.isArray(job?.parts) ? job.parts.length : 0) * 10;
    if (job?.poNumber) score += 100;
    if (job?.workCarriedOut) score += 50;
    return score;
  }

  function chooseCanonicalJob(jobs) {
    return [...jobs].sort((a, b) => {
      const scoreDiff = jobScore(b) - jobScore(a);
      if (scoreDiff) return scoreDiff;
      return new Date(b?.updatedAt || b?.createdAt || 0).getTime()
        - new Date(a?.updatedAt || a?.createdAt || 0).getTime();
    })[0] || null;
  }

  async function archiveDuplicateJob(job, keep) {
    if (!job?.id) return;
    const reason = `Duplicate Bioscience Nottingham SYGDC 104/105 record; kept ${keep?.id || 'canonical job'}`;
    const archived = {
      ...JSON.parse(JSON.stringify(job)),
      deletedAt: new Date().toISOString(),
      deletedReason: reason,
      originalJobId: job.id,
    };

    if (typeof isLocalPreviewMode !== 'undefined' && isLocalPreviewMode) {
      const key = 'kirkstone_deleted_jobs';
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      const filtered = existing.filter(item => item.id !== archived.id && item.originalJobId !== archived.id);
      filtered.unshift(archived);
      localStorage.setItem(key, JSON.stringify(filtered));
      if (typeof StorageManager !== 'undefined' && StorageManager.deleteJob) StorageManager.deleteJob(job.id);
      return;
    }

    if (typeof db === 'undefined' || !db || typeof deleteJobFromFirestore !== 'function') {
      throw new Error('Firebase is not available for duplicate-job archiving.');
    }
    await db.collection('jobTrash').doc(job.id).set(archived);
    await deleteJobFromFirestore(job.id);
    if (typeof StorageManager !== 'undefined' && StorageManager.deleteJob) StorageManager.deleteJob(job.id);
  }

  function findSafe105Quote(bioscienceJobs, quotes, canonicalJob) {
    const candidateIds = new Set(bioscienceJobs.map(job => job?.quoteId).filter(Boolean));

    // Best case: the job already points at the quote that was partially moved to 105.
    const directlyLinked = quotes.find(quote => quote?.id === canonicalJob?.quoteId && quoteNumber(quote) === NEW_INVOICE);
    if (directlyLinked) return directlyLinked;

    // Next prefer a 105 quote linked to any Bioscience duplicate record.
    const linked = quotes.find(quote => candidateIds.has(quote?.id) && quoteNumber(quote) === NEW_INVOICE);
    if (linked) return linked;

    const matches105 = quotes.filter(quote => quoteNumber(quote) === NEW_INVOICE);
    const bioscienceMatches = matches105.filter(quote => /bioscience/.test(quoteText(quote)));
    if (bioscienceMatches.length === 1) return bioscienceMatches[0];

    // A single saved quote at 105 is not an invoice-number conflict. In this
    // legacy case it is very likely the quote record that was already corrected
    // while the spreadsheet/job record remained on 104, so link the job to it.
    if (matches105.length === 1) return matches105[0];
    return null;
  }

  function findReal105JobConflict(bioscienceJobs) {
    const bioscienceIds = new Set(bioscienceJobs.map(job => job?.id).filter(Boolean));
    const others = (typeof currentJobs !== 'undefined' && Array.isArray(currentJobs) ? currentJobs : [])
      .filter(job => job && !bioscienceIds.has(job.id) && jobHasNumber(job, NEW_INVOICE));
    return others.find(job => !isBioscienceJob(job)) || null;
  }

  async function persistQuoteAs105(quote) {
    if (!quote) return;
    quote.refPrefix = 'SYGDC';
    quote.refNumber = 105;
    quote.updatedAt = new Date().toISOString();
    if (quote.quoteRef) quote.quoteRef = NEW_QUOTE_REF;
    if (quote.reference) quote.reference = NEW_QUOTE_REF;
    if (typeof StorageManager !== 'undefined' && StorageManager.updateQuote) StorageManager.updateQuote(quote);
    if ((typeof isLocalPreviewMode === 'undefined' || !isLocalPreviewMode)
      && typeof updateQuoteInFirestore === 'function') {
      await updateQuoteInFirestore(quote);
    }
  }

  async function persistCanonicalJob(job) {
    job.quoteRef = NEW_QUOTE_REF;
    job.invoiceNumber = NEW_INVOICE;
    job.updatedAt = new Date().toISOString();

    if (job.quoteSnapshot) {
      job.quoteSnapshot.refPrefix = 'SYGDC';
      job.quoteSnapshot.refNumber = 105;
      job.quoteSnapshot.quoteRef = NEW_QUOTE_REF;
      if (job.quoteSnapshot.reference) job.quoteSnapshot.reference = NEW_QUOTE_REF;
    }
    if (job.invoiceSpreadsheetSnapshot) {
      job.invoiceSpreadsheetSnapshot.invoiceNumber = NEW_INVOICE;
    }

    if (typeof StorageManager !== 'undefined' && StorageManager.saveJob) StorageManager.saveJob(job);
    if ((typeof isLocalPreviewMode === 'undefined' || !isLocalPreviewMode)
      && typeof saveJobToFirestore === 'function') {
      await saveJobToFirestore(job);
    }
  }

  async function reconcile() {
    if (running || completed) return;
    if (typeof currentJobs === 'undefined' || !Array.isArray(currentJobs) || !currentJobs.length) return;
    if (typeof currentQuotes === 'undefined' || !Array.isArray(currentQuotes)) return;

    const bioscienceJobs = currentJobs.filter(job =>
      isBioscienceJob(job) && (jobHasNumber(job, OLD_INVOICE) || jobHasNumber(job, NEW_INVOICE))
    );
    if (!bioscienceJobs.length) return;

    const ivp104 = currentJobs.find(job => isIvpJob(job) && jobHasNumber(job, OLD_INVOICE));
    if (!ivp104) return;

    const canonicalJob = chooseCanonicalJob(bioscienceJobs);
    if (!canonicalJob) return;

    // Only another JOB using 105 is a genuine invoice conflict. A saved quote at
    // 105 is expected to share its base number with the eventual invoice and must
    // not block the repair.
    const jobConflict = findReal105JobConflict(bioscienceJobs);
    if (jobConflict) {
      const text = jobText(jobConflict);
      const site = /\bivp\b/.test(text) ? 'Nottingham IVP' : (jobConflict.customerName || 'another job');
      const message = `${NEW_INVOICE} is already attached to ${site}; Bioscience was not changed automatically`;
      console.warn(message, jobConflict);
      if (typeof showToast === 'function') showToast(message);
      completed = true;
      return;
    }

    running = true;
    try {
      let quote105 = findSafe105Quote(bioscienceJobs, currentQuotes, canonicalJob);
      const linkedQuote = currentQuotes.find(quote => quote?.id === canonicalJob.quoteId) || null;

      if (!quote105 && linkedQuote) {
        // No saved 105 quote exists, so move the Bioscience quote that this job
        // already belongs to. This keeps quote and invoice numbers aligned.
        await persistQuoteAs105(linkedQuote);
        quote105 = linkedQuote;
      } else if (quote105) {
        await persistQuoteAs105(quote105);
        canonicalJob.quoteId = quote105.id;
      }

      await persistCanonicalJob(canonicalJob);

      const duplicates = bioscienceJobs.filter(job => job.id !== canonicalJob.id);
      for (const duplicate of duplicates) {
        await archiveDuplicateJob(duplicate, canonicalJob);
      }

      if (typeof refreshQuoteHistory === 'function') await refreshQuoteHistory();
      if (typeof refreshJobSheets === 'function') await refreshJobSheets();
      if (typeof renderInvoiceSpreadsheet === 'function') renderInvoiceSpreadsheet();
      if (typeof renderAnnualSummary === 'function') renderAnnualSummary();
      if (typeof showToast === 'function') {
        showToast(`Bioscience Nottingham corrected to ${NEW_INVOICE}${duplicates.length ? `; ${duplicates.length} duplicate job moved to Recently Deleted` : ''}`);
      }
      completed = true;
    } catch (error) {
      console.error('Could not reconcile Bioscience Nottingham to KCSYGDC105', error);
      if (typeof showToast === 'function') showToast('Could not reconcile Bioscience Nottingham reference automatically');
    } finally {
      running = false;
    }
  }

  function install() {
    reconcile();
  }

  if (document.readyState === 'complete') install();
  else window.addEventListener('load', install, { once: true });

  const cloudStatus = document.getElementById('cloudStatus');
  if (cloudStatus) {
    const observer = new MutationObserver(() => {
      if (cloudStatus.classList.contains('cloud-status-ready')) reconcile();
    });
    observer.observe(cloudStatus, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
  }

  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    reconcile();
    if (completed || attempts >= 30) clearInterval(timer);
  }, 1000);
})();