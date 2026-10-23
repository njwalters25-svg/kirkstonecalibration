// ============================================================
// recover-kcgbocls101.js — One-off recovery of KCGBOCLS101Q
// Source: original customer PDF dated 13 September 2026.
// Idempotent: does nothing if the quote already exists.
// ============================================================

(function () {
  if (window.__kirkstoneGboCls101RecoveryInstalled) return;
  window.__kirkstoneGboCls101RecoveryInstalled = true;

  const RECOVERY_ID = 'recovered-kcgbocls101q-20260913';
  const REF_PREFIX = 'GBOCLS';
  const REF_NUMBER = 101;
  let running = false;
  let completed = false;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isTargetQuote(quote) {
    if (!quote) return false;
    if (String(quote.refPrefix || '').trim().toUpperCase() === REF_PREFIX && Number(quote.refNumber) === REF_NUMBER) {
      return true;
    }
    const refs = [quote.quoteRef, quote.reference]
      .filter(Boolean)
      .map(value => String(value).trim().toUpperCase());
    return refs.includes('KCGBOCLS101Q');
  }

  function recoveredSettings() {
    const snapshot = clone(typeof currentSettings !== 'undefined' && currentSettings
      ? currentSettings
      : DEFAULT_SETTINGS);
    const levels = Array.isArray(snapshot.serviceLevels) ? snapshot.serviceLevels : [];

    const twoByTwo = levels.find(level =>
      level?.id === '2_vol_2_readings_service_cal'
      || /2\s*vol.*2\s*readings.*service/i.test(level?.name || '')
    );
    const twoByFour = levels.find(level =>
      level?.id === '2_vol_4_readings_service_cal'
      || /2\s*vol.*4\s*readings.*service/i.test(level?.name || '')
    );

    if (!twoByTwo || !twoByFour) {
      throw new Error('Required Concept Life Sciences service levels are missing from Settings.');
    }

    // Preserve current timing/internal-cost assumptions, while pinning the
    // customer prices to the values printed on the original PDF.
    twoByTwo.chargeMultiChannel6 = 32;
    twoByTwo.chargeMultiChannel8 = 35;
    twoByTwo.chargeMultiChannel12 = 45;
    twoByFour.chargeSingleChannel = 12;

    return snapshot;
  }

  function buildRecoveredQuote() {
    const settingsSnapshot = recoveredSettings();
    const quote = {
      id: RECOVERY_ID,
      createdAt: '2026-09-13T12:17:00.000Z',
      customerName: 'Greiner Bio-One Ltd - Concept Life Sciences',
      customerAddress: 'Unit 2,\nPear Tree Way,\nStonehouse,\nGL10 3XG',
      proposedDate: '2026-10',
      refPrefix: REF_PREFIX,
      refNumber: REF_NUMBER,
      pipetteLines: [
        {
          serviceLevelId: '2_vol_2_readings_service_cal',
          singleChannelCount: 0,
          multiChannel6Count: 1,
          multiChannel8Count: 7,
          multiChannel12Count: 32,
          multiChannel16Count: 0,
        },
        {
          serviceLevelId: '2_vol_4_readings_service_cal',
          singleChannelCount: 96,
          multiChannel6Count: 0,
          multiChannel8Count: 0,
          multiChannel12Count: 0,
          multiChannel16Count: 0,
        },
      ],
      destinationPostcode: 'GL10 3XG',
      travelDistanceMiles: 0,
      travelTimeMinutes: 0,
      travelDayBefore: false,
      isLondon: false,
      overnightStay: false,
      hotelCost: 0,
      nights: 1,
      hotelPostcode: '',
      hotelToWorkDistanceMiles: 0,
      hotelToWorkMinutes: 0,
      returnHome: false,
      returnHomeTrips: 1,
      calibrationTimeMinutes: 0,
      plannedDaysOverride: 4,
      dayRateOverride: false,
      newJob: false,
      secondPerson: false,
      discountType: 'none',
      customDiscountPercent: 0,
      vatExempt: false,
      notes: '',
      assignedPerson: 'owner',
      secondPersonKind: 'phil',
      teamCostingVersion: 1,
      travelOriginPostcode: 'DE75 7UJ',
      settingsSnapshot,
      recoverySource: 'Original customer PDF dated 13 September 2026',
      recoveredAt: new Date().toISOString(),
    };

    const result = calculateQuote(quote, settingsSnapshot);
    if (result.totalPipettes !== 136) {
      throw new Error(`Recovery safety check failed: expected 136 pipettes, calculated ${result.totalPipettes}.`);
    }
    if (Math.abs(result.totalQuotePrice - 2869) > 0.01) {
      throw new Error(`Recovery safety check failed: expected £2869.00 ex VAT, calculated £${result.totalQuotePrice.toFixed(2)}.`);
    }

    quote.totalPipettes = result.totalPipettes;
    quote.totalQuotePrice = result.totalQuotePrice;
    quote.totalInternalCost = result.totalInternalCost;
    quote.profitAmount = result.profitAmount;
    quote.profitMarginPercent = result.profitMarginPercent;
    quote.profitPerDay = result.profitPerDay;
    return quote;
  }

  async function recover() {
    if (running || completed) return;
    if (typeof currentQuotes === 'undefined' || !Array.isArray(currentQuotes)) return;
    if (typeof currentSettings === 'undefined' || !currentSettings) return;

    if (currentQuotes.some(isTargetQuote)) {
      completed = true;
      return;
    }

    running = true;
    try {
      let freshQuotes = currentQuotes;
      if ((typeof isLocalPreviewMode === 'undefined' || !isLocalPreviewMode)
        && typeof loadQuotesFromFirestore === 'function') {
        freshQuotes = await loadQuotesFromFirestore();
      }
      if (Array.isArray(freshQuotes) && freshQuotes.some(isTargetQuote)) {
        completed = true;
        if (typeof refreshQuoteHistory === 'function') await refreshQuoteHistory();
        return;
      }

      const quote = buildRecoveredQuote();
      if (typeof StorageManager !== 'undefined' && typeof StorageManager.updateQuote === 'function') {
        StorageManager.updateQuote(quote);
      }
      if (typeof isLocalPreviewMode === 'undefined' || !isLocalPreviewMode) {
        if (typeof saveQuoteToFirestore !== 'function') throw new Error('Quote save function is unavailable.');
        await saveQuoteToFirestore(quote);
      }
      if (typeof upsertCustomer === 'function') {
        await upsertCustomer(quote.customerName, quote.customerAddress);
      }
      if (typeof refreshQuoteHistory === 'function') await refreshQuoteHistory();

      completed = true;
      if (typeof showToast === 'function') {
        showToast('Recovered KCGBOCLS101Q from the original PDF');
      }
      console.info('Recovered KCGBOCLS101Q from the original customer PDF.', quote);
    } catch (error) {
      console.error('KCGBOCLS101Q recovery failed', error);
      if (typeof showToast === 'function') {
        showToast(`KCGBOCLS101Q recovery failed: ${error.message}`);
      }
    } finally {
      running = false;
    }
  }

  function tryWhenReady() {
    const status = document.getElementById('cloudStatus');
    if (!status || status.classList.contains('cloud-status-ready')) recover();
  }

  if (document.readyState === 'complete') tryWhenReady();
  else window.addEventListener('load', tryWhenReady, { once: true });

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
    if (completed || attempts >= 30) clearInterval(timer);
  }, 1000);
})();
