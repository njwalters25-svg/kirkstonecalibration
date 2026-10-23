// ============================================================
// renumber-ivp-kcsygdc107.js — Move the 7-pipette Nottingham IVP quote to 107Q
// Leaves the existing KCSYGDC107 invoice number unchanged.
// ============================================================

(function () {
  if (window.__kirkstoneIvp107RenumberInstalled) return;
  window.__kirkstoneIvp107RenumberInstalled = true;

  const OLD_REF = 'KCSYGDC105Q';
  const NEW_REF = 'KCSYGDC107Q';
  const NEW_INVOICE = 'KCSYGDC107';
  let running = false;
  let completed = false;

  const normalise = value => String(value || '').trim().toUpperCase().replace(/\s+/g, '');

  function quoteRef(quote) {
    if (!quote?.refPrefix || !Number.isFinite(parseInt(quote.refNumber, 10))) return '';
    return `KC${String(quote.refPrefix).trim().toUpperCase()}${parseInt(quote.refNumber, 10)}Q`;
  }

  function totalPipettes(quote) {
    return (quote?.pipetteLines || []).reduce((sum, line) => sum
      + (Number(line.singleChannelCount) || 0)
      + (Number(line.multiChannel6Count) || 0)
      + (Number(line.multiChannel8Count) || 0)
      + (Number(line.multiChannel12Count) || 0)
      + (Number(line.multiChannel16Count) || 0), 0);
  }

  function isTargetQuote(quote) {
    const customer = String(quote?.customerName || '').trim().toLowerCase();
    const ref = quoteRef(quote);
    return customer === 'sygnature nottingham - ivp'
      && totalPipettes(quote) === 7
      && String(quote?.createdAt || '').startsWith('2026-09-07')
      && (ref === OLD_REF || ref === NEW_REF);
  }

  function isIvpJob(job) {
    const text = [
      job?.customerName,
      job?.quoteSnapshot?.customerName,
      job?.notes,
      job?.workCarriedOut,
    ].filter(Boolean).join(' ').toLowerCase();
    return /\bivp\b/.test(text) && !/bioscience/.test(text);
  }

  function jobRefs(job) {
    const refs = [
      job?.quoteRef,
      job?.reference,
      job?.quoteSnapshot?.quoteRef,
      job?.quoteSnapshot?.reference,
    ].filter(Boolean).map(normalise);

    if (job?.quoteSnapshot?.refPrefix && job?.quoteSnapshot?.refNumber) {
      refs.push(normalise(`KC${job.quoteSnapshot.refPrefix}${job.quoteSnapshot.refNumber}Q`));
    }
    return refs;
  }

  async function saveQuote(quote) {
    if (typeof StorageManager !== 'undefined' && StorageManager.updateQuote) {
      StorageManager.updateQuote(quote);
    }
    if ((typeof isLocalPreviewMode === 'undefined' || !isLocalPreviewMode)
      && typeof updateQuoteInFirestore === 'function') {
      await updateQuoteInFirestore(quote);
    }
  }

  async function saveJob(job) {
    if (typeof StorageManager !== 'undefined' && StorageManager.saveJob) {
      StorageManager.saveJob(job);
    }
    if ((typeof isLocalPreviewMode === 'undefined' || !isLocalPreviewMode)
      && typeof saveJobToFirestore === 'function') {
      await saveJobToFirestore(job);
    }
  }

  function updateJobReference(job, quote) {
    job.quoteId = quote.id;
    job.quoteRef = NEW_REF;
    if (job.reference && normalise(job.reference) === OLD_REF) job.reference = NEW_REF;
    job.updatedAt = new Date().toISOString();

    if (job.quoteSnapshot) {
      job.quoteSnapshot.id = quote.id;
      job.quoteSnapshot.refPrefix = 'SYGDC';
      job.quoteSnapshot.refNumber = 107;
      job.quoteSnapshot.quoteRef = NEW_REF;
      if (job.quoteSnapshot.reference) job.quoteSnapshot.reference = NEW_REF;
      if (quote.customerName) job.quoteSnapshot.customerName = quote.customerName;
      if (quote.customerAddress) job.quoteSnapshot.customerAddress = quote.customerAddress;
    }

    if (job.invoiceSpreadsheetSnapshot?.quoteRef) {
      job.invoiceSpreadsheetSnapshot.quoteRef = NEW_REF;
    }
  }

  async function renumber() {
    if (running || completed) return;
    if (typeof currentQuotes === 'undefined' || !Array.isArray(currentQuotes) || !currentQuotes.length) return;
    if (typeof currentJobs === 'undefined' || !Array.isArray(currentJobs)) return;

    const target = currentQuotes.find(isTargetQuote);
    if (!target) return;

    const quoteConflict = currentQuotes.find(q =>
      q?.id !== target.id && normalise(quoteRef(q)) === NEW_REF
    );
    if (quoteConflict) {
      console.warn('KCSYGDC107Q is already used by another saved quote; IVP was not renumbered.', quoteConflict);
      if (typeof showToast === 'function') showToast('KCSYGDC107Q is already in use by another quote');
      completed = true;
      return;
    }

    const invoiceConflict = currentJobs.find(job =>
      normalise(job?.invoiceNumber || job?.invoiceSpreadsheetSnapshot?.invoiceNumber) === NEW_INVOICE
      && !isIvpJob(job)
    );
    if (invoiceConflict) {
      console.warn('KCSYGDC107 invoice is already used by a non-IVP job; quote was not renumbered.', invoiceConflict);
      if (typeof showToast === 'function') showToast('KCSYGDC107 is already used by another job');
      completed = true;
      return;
    }

    let linkedJobs = currentJobs.filter(job => job?.quoteId === target.id && isIvpJob(job));

    if (!linkedJobs.length) {
      const candidates = currentJobs.filter(job =>
        isIvpJob(job)
        && normalise(job?.invoiceNumber || job?.invoiceSpreadsheetSnapshot?.invoiceNumber) === NEW_INVOICE
        && (jobRefs(job).includes(normalise(OLD_REF)) || jobRefs(job).includes(normalise(NEW_REF)) || !jobRefs(job).length)
      );
      if (candidates.length === 1) linkedJobs = candidates;
    }

    running = true;
    try {
      target.refPrefix = 'SYGDC';
      target.refNumber = 107;
      target.updatedAt = new Date().toISOString();
      if (target.quoteRef) target.quoteRef = NEW_REF;
      if (target.reference) target.reference = NEW_REF;
      await saveQuote(target);

      for (const job of linkedJobs) {
        updateJobReference(job, target);
        await saveJob(job);
      }

      if (typeof refreshQuoteHistory === 'function') await refreshQuoteHistory();
      if (typeof refreshJobSheets === 'function') await refreshJobSheets();
      if (typeof renderInvoiceSpreadsheet === 'function') renderInvoiceSpreadsheet();

      completed = true;
      if (typeof showToast === 'function') {
        showToast('Sygnature Nottingham IVP changed to KCSYGDC107Q');
      }
    } catch (error) {
      console.error('Could not renumber Nottingham IVP to KCSYGDC107Q', error);
      if (typeof showToast === 'function') showToast('Could not change IVP quote to KCSYGDC107Q');
    } finally {
      running = false;
    }
  }

  if (document.readyState === 'complete') renumber();
  else window.addEventListener('load', renumber, { once: true });

  const cloudStatus = document.getElementById('cloudStatus');
  if (cloudStatus) {
    const observer = new MutationObserver(() => {
      if (cloudStatus.classList.contains('cloud-status-ready')) renumber();
    });
    observer.observe(cloudStatus, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
  }

  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    renumber();
    if (completed || attempts >= 45) clearInterval(timer);
  }, 1000);
})();
