// ============================================================
// bioscience-reference-repair.js — Keep Bioscience invoice 105 linked to its own quote
// ============================================================

(function () {
  if (window.__kirkstoneBioscienceReferenceRepairInstalled) return;
  window.__kirkstoneBioscienceReferenceRepairInstalled = true;

  const TARGET_INVOICE = 'KCSYGDC105';
  let running = false;
  let completed = false;

  const normalise = value => String(value || '').trim().toUpperCase().replace(/\s+/g, '');

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

  function isBioscienceQuote(quote) {
    const text = quoteText(quote);
    return /bioscience/.test(text) && !/\bivp\b/.test(text);
  }

  function invoiceForJob(job) {
    return normalise(job?.invoiceNumber || job?.invoiceSpreadsheetSnapshot?.invoiceNumber || '');
  }

  function quoteRef(quote) {
    if (!quote?.refPrefix || !Number.isFinite(parseInt(quote.refNumber, 10))) return '';
    return `KC${String(quote.refPrefix).trim().toUpperCase()}${parseInt(quote.refNumber, 10)}Q`;
  }

  function totalPlanned(job) {
    return (job?.plannedLines || []).reduce((sum, line) => sum
      + (Number(line.singleChannelCount) || 0)
      + (Number(line.multiChannel6Count) || 0)
      + (Number(line.multiChannel8Count) || 0)
      + (Number(line.multiChannel12Count) || 0)
      + (Number(line.multiChannel16Count) || 0), 0);
  }

  function jobScore(job) {
    let score = 0;
    if (invoiceForJob(job) === TARGET_INVOICE) score += 20000;
    if (job?.invoiceSpreadsheetAdded) score += 10000;
    if (job?.invoiceSpreadsheetLocked) score += 5000;
    if (job?.invoiceDateIssued) score += 2500;
    if (job?.invoiceDatePaid) score += 1000;
    score += (Array.isArray(job?.actualEntries) ? job.actualEntries.length : 0) * 50;
    score += totalPlanned(job);
    return score;
  }

  function chooseCanonicalJob(jobs) {
    return [...jobs].sort((a, b) => {
      const score = jobScore(b) - jobScore(a);
      if (score) return score;
      return new Date(b?.updatedAt || b?.createdAt || 0).getTime()
        - new Date(a?.updatedAt || a?.createdAt || 0).getTime();
    })[0] || null;
  }

  function chooseBioscienceQuote(quotes, canonicalJob) {
    const direct = quotes.find(q => q?.id === canonicalJob?.quoteId && isBioscienceQuote(q));
    if (direct) return direct;

    const matches = quotes.filter(isBioscienceQuote);
    const ref104 = matches.find(q => normalise(quoteRef(q)) === 'KCSYGDC104Q');
    if (ref104) return ref104;
    if (matches.length === 1) return matches[0];

    return [...matches].sort((a, b) =>
      new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime()
    )[0] || null;
  }

  function findInvoice105Conflict(bioscienceIds) {
    return (typeof currentJobs !== 'undefined' && Array.isArray(currentJobs) ? currentJobs : [])
      .find(job => job && !bioscienceIds.has(job.id) && invoiceForJob(job) === TARGET_INVOICE);
  }

  async function archiveDuplicateJob(job, keep) {
    if (!job?.id) return;
    const archived = {
      ...JSON.parse(JSON.stringify(job)),
      deletedAt: new Date().toISOString(),
      deletedReason: `Duplicate Bioscience Nottingham record; kept ${keep?.id || 'canonical job'}`,
      originalJobId: job.id,
    };

    if (typeof isLocalPreviewMode !== 'undefined' && isLocalPreviewMode) {
      const key = 'kirkstone_deleted_jobs';
      const existing = JSON.parse(localStorage.getItem(key) || '[]')
        .filter(item => item.id !== archived.id && item.originalJobId !== archived.id);
      existing.unshift(archived);
      localStorage.setItem(key, JSON.stringify(existing));
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

  async function persistCanonicalJob(job, quote) {
    const ref = quoteRef(quote);
    job.quoteId = quote.id;
    if (ref) job.quoteRef = ref;
    job.invoiceNumber = TARGET_INVOICE;
    job.updatedAt = new Date().toISOString();

    if (job.quoteSnapshot) {
      job.quoteSnapshot.id = quote.id;
      job.quoteSnapshot.refPrefix = quote.refPrefix;
      job.quoteSnapshot.refNumber = quote.refNumber;
      if (ref) {
        job.quoteSnapshot.quoteRef = ref;
        if (job.quoteSnapshot.reference) job.quoteSnapshot.reference = ref;
      }
      if (quote.customerName) job.quoteSnapshot.customerName = quote.customerName;
      if (quote.customerAddress) job.quoteSnapshot.customerAddress = quote.customerAddress;
    }

    if (job.invoiceSpreadsheetSnapshot) {
      job.invoiceSpreadsheetSnapshot.invoiceNumber = TARGET_INVOICE;
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
    if (typeof currentQuotes === 'undefined' || !Array.isArray(currentQuotes) || !currentQuotes.length) return;

    const bioscienceJobs = currentJobs.filter(isBioscienceJob);
    if (!bioscienceJobs.length) return;

    const canonicalJob = chooseCanonicalJob(bioscienceJobs);
    const bioscienceQuote = chooseBioscienceQuote(currentQuotes, canonicalJob);
    if (!canonicalJob || !bioscienceQuote) return;

    const ids = new Set(bioscienceJobs.map(job => job.id).filter(Boolean));
    const conflict = findInvoice105Conflict(ids);
    if (conflict) {
      console.warn('KCSYGDC105 is already used by another invoice; Bioscience link was not changed.', conflict);
      completed = true;
      return;
    }

    const expectedRef = quoteRef(bioscienceQuote);
    const alreadyCorrect = canonicalJob.quoteId === bioscienceQuote.id
      && normalise(canonicalJob.invoiceNumber) === TARGET_INVOICE
      && (!expectedRef || normalise(canonicalJob.quoteRef) === normalise(expectedRef));

    if (alreadyCorrect && bioscienceJobs.length === 1) {
      completed = true;
      return;
    }

    running = true;
    try {
      await persistCanonicalJob(canonicalJob, bioscienceQuote);

      const duplicates = bioscienceJobs.filter(job => job.id !== canonicalJob.id);
      for (const duplicate of duplicates) await archiveDuplicateJob(duplicate, canonicalJob);

      if (typeof refreshQuoteHistory === 'function') await refreshQuoteHistory();
      if (typeof refreshJobSheets === 'function') await refreshJobSheets();
      if (typeof renderInvoiceSpreadsheet === 'function') renderInvoiceSpreadsheet();
      if (typeof renderAnnualSummary === 'function') renderAnnualSummary();

      if (typeof showToast === 'function') {
        showToast('Bioscience Nottingham invoice 105 relinked to its own saved quote');
      }
      completed = true;
    } catch (error) {
      console.error('Could not repair Bioscience Nottingham quote link', error);
      if (typeof showToast === 'function') showToast('Could not repair Bioscience Nottingham quote link');
    } finally {
      running = false;
    }
  }

  if (document.readyState === 'complete') reconcile();
  else window.addEventListener('load', reconcile, { once: true });

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
