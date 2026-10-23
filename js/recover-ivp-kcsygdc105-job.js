// ============================================================
// recover-ivp-kcsygdc105-job.js — Restore the missing 7-pipette IVP job sheet
// Keeps the completed Bioscience invoice/job untouched.
// ============================================================

(function () {
  if (window.__kirkstoneIvp105JobRecoveryInstalled) return;
  window.__kirkstoneIvp105JobRecoveryInstalled = true;

  const RECOVERY_JOB_ID = 'recovered-ivp-kcsygdc105q-20260907';
  let running = false;
  let completed = false;

  function totalQuotePipettes(quote) {
    return (quote?.pipetteLines || []).reduce((sum, line) => sum
      + (Number(line.singleChannelCount) || 0)
      + (Number(line.multiChannel6Count) || 0)
      + (Number(line.multiChannel8Count) || 0)
      + (Number(line.multiChannel12Count) || 0)
      + (Number(line.multiChannel16Count) || 0), 0);
  }

  function isTargetIvpQuote(quote) {
    const customer = String(quote?.customerName || '').trim().toLowerCase();
    const ref = quote?.refPrefix && quote?.refNumber
      ? `KC${String(quote.refPrefix).trim().toUpperCase()}${Number(quote.refNumber)}Q`
      : '';
    return customer === 'sygnature nottingham - ivp'
      && ref === 'KCSYGDC105Q'
      && totalQuotePipettes(quote) === 7
      && String(quote?.createdAt || '').startsWith('2026-09-07');
  }

  function isIvpJob(job) {
    const text = [
      job?.customerName,
      job?.quoteSnapshot?.customerName,
      job?.notes,
    ].filter(Boolean).join(' ').toLowerCase();
    return /\bivp\b/.test(text) && !/bioscience/.test(text);
  }

  function quoteRef(quote) {
    return quote?.refPrefix && quote?.refNumber
      ? `KC${String(quote.refPrefix).trim().toUpperCase()}${Number(quote.refNumber)}Q`
      : '';
  }

  function buildJob(quote) {
    const quoteSettings = getSettingsForQuote(quote);
    const quoteResult = calculateQuote(quote, quoteSettings);
    const ref = quoteRef(quote);
    const stickerCostPerPipette = quoteSettings.stickerCostPerPipette
      ?? DEFAULT_SETTINGS.stickerCostPerPipette
      ?? 0.10;
    const defaultServiceLevelId = getDefaultJobServiceLevelId(quote, quoteSettings);

    return {
      id: RECOVERY_JOB_ID,
      quoteId: quote.id,
      quoteRef: ref,
      createdAt: quote.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'open',
      customerName: quote.customerName || '',
      customerAddress: quote.customerAddress || '',
      proposedDate: quote.proposedDate || '',
      assignedPerson: quote.assignedPerson === 'shelley' ? 'shelley' : 'owner',
      secondPerson: !!quote.secondPerson,
      shelleyAvailableDays: quote.shelleyAvailableDays ?? null,
      shelleyJoiningDates: window.KirkstonePlanning?.joiningDates
        ? KirkstonePlanning.joiningDates(quote)
        : [],
      secondPersonKind: quote.secondPersonKind || 'phil',
      travelOriginPostcode: quote.travelOriginPostcode
        || (quote.assignedPerson === 'shelley'
          ? (currentSettings.shelleyHomePostcode || 'NE32 5QA')
          : currentSettings.homePostcode),
      destinationPostcode: quote.destinationPostcode || '',
      settingsSnapshot: createQuoteSettingsSnapshot(quoteSettings),
      quoteSnapshot: {
        ...JSON.parse(JSON.stringify(quote)),
        settingsSnapshot: createQuoteSettingsSnapshot(quoteSettings),
      },
      partsCatalogSnapshot: cloneSettings(currentSettings?.partsCatalog || DEFAULT_SETTINGS.partsCatalog),
      defaultServiceLevelId,
      quotedServiceLevelSummary: getJobServiceLevelSummary(quote, quoteSettings),
      quotedAssumptions: {
        totalTripMiles: quoteResult.totalTripMiles || 0,
        mileageRatePence: normalizeMileageRatePence(quoteSettings.mileageRatePence || DEFAULT_SETTINGS.mileageRatePence),
        hotelCost: (quoteResult.costAccommodation || 0) + (quoteResult.costShelleyHotel || 0),
        foodCost: (quoteResult.costSubsistence || 0) + (quoteResult.costShelleyFood || 0),
        secondPersonCost: quoteResult.costSecondPerson || 0,
        stickerCostPerPipette,
        stickerCost: (quoteResult.totalPipettes || 0) * stickerCostPerPipette,
      },
      stickerCostPerPipette,
      plannedLines: JSON.parse(JSON.stringify(quote.pipetteLines || [])),
      actualEntries: [],
      parts: [],
      poNumber: '',
      invoiceNumber: '',
      workCarriedOut: '',
      costs: {
        hotel: (quoteResult.costAccommodation || 0) + (quoteResult.costShelleyHotel || 0),
        food: (quoteResult.costSubsistence || 0) + (quoteResult.costShelleyFood || 0),
        fuel: quoteResult.costShelleyFuel || 0,
        parts: 0,
        shipping: 0,
        secondPerson: quoteResult.costSecondPerson || 0,
        other: 0,
        mileageMiles: quoteResult.shelleyMileageInFuel ? 0 : (quoteResult.totalTripMiles || 0),
      },
      mileageRatePence: normalizeMileageRatePence(quoteSettings.mileageRatePence || DEFAULT_SETTINGS.mileageRatePence),
      notes: '',
      recoverySource: 'Recovered missing IVP job sheet link on 23 October 2026',
    };
  }

  async function recover() {
    if (running || completed) return;
    if (typeof currentQuotes === 'undefined' || !Array.isArray(currentQuotes) || !currentQuotes.length) return;
    if (typeof currentJobs === 'undefined' || !Array.isArray(currentJobs)) return;
    if (typeof currentSettings === 'undefined' || !currentSettings) return;
    if (typeof getSettingsForQuote !== 'function'
      || typeof calculateQuote !== 'function'
      || typeof createQuoteSettingsSnapshot !== 'function'
      || typeof getDefaultJobServiceLevelId !== 'function'
      || typeof getJobServiceLevelSummary !== 'function'
      || typeof cloneSettings !== 'function') return;

    const quote = currentQuotes.find(isTargetIvpQuote);
    if (!quote) return;

    const existing = currentJobs.find(job => job?.quoteId === quote.id && isIvpJob(job));
    if (existing) {
      completed = true;
      return;
    }

    // Wait until the Bioscience repair has released this quote ID. Never overwrite
    // or delete a non-IVP job just to make the relationship fit.
    const wrongLink = currentJobs.find(job => job?.quoteId === quote.id && !isIvpJob(job));
    if (wrongLink) return;

    // Deterministic recovery ID prevents duplicate restoration if the script reruns.
    if (currentJobs.some(job => job?.id === RECOVERY_JOB_ID)) {
      completed = true;
      return;
    }

    running = true;
    try {
      const job = buildJob(quote);

      if (typeof StorageManager !== 'undefined' && StorageManager.saveJob) {
        StorageManager.saveJob(job);
      }
      if ((typeof isLocalPreviewMode === 'undefined' || !isLocalPreviewMode)
        && typeof saveJobToFirestore === 'function') {
        await saveJobToFirestore(job);
      }

      if (typeof refreshJobSheets === 'function') await refreshJobSheets();
      if (typeof refreshQuoteHistory === 'function') await refreshQuoteHistory();

      completed = true;
      if (typeof showToast === 'function') {
        showToast('Restored the missing KCSYGDC105Q IVP job sheet');
      }
    } catch (error) {
      console.error('Could not restore KCSYGDC105Q IVP job sheet', error);
      if (typeof showToast === 'function') showToast('Could not restore the IVP job sheet automatically');
    } finally {
      running = false;
    }
  }

  if (document.readyState === 'complete') recover();
  else window.addEventListener('load', recover, { once: true });

  const cloudStatus = document.getElementById('cloudStatus');
  if (cloudStatus) {
    const observer = new MutationObserver(() => {
      if (cloudStatus.classList.contains('cloud-status-ready')) recover();
    });
    observer.observe(cloudStatus, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
  }

  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    recover();
    if (completed || attempts >= 45) clearInterval(timer);
  }, 1000);
})();
