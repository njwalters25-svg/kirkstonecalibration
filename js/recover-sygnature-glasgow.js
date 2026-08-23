// One-off data recovery for the accidentally deleted Sygnature Glasgow job sheet.
// Safe to leave in place: it only runs when the original quote exists and the recovered job is absent.

(function () {
  const TARGET_PREFIX = 'SYGDC';
  const TARGET_NUMBER = 100;
  const TARGET_INVOICE = 'KCSYGDC100';

  function findServiceLevelId(settings, name) {
    const levels = settings?.serviceLevels || [];
    const exact = levels.find(level => String(level.name || '').trim().toLowerCase() === name.toLowerCase());
    if (exact) return exact.id;
    const partial = levels.find(level => String(level.name || '').toLowerCase().includes(name.toLowerCase()));
    return partial?.id || levels[0]?.id || '';
  }

  function findCatalogPart(catalog, name) {
    const target = name.trim().toLowerCase();
    return (catalog || []).find(part => {
      const partName = typeof getCatalogPartName === 'function'
        ? getCatalogPartName(part)
        : (part.name || part.description || '');
      return String(partName).trim().toLowerCase() === target;
    });
  }

  async function recoverSygnatureGlasgowJob() {
    if (typeof currentQuotes === 'undefined' || typeof currentJobs === 'undefined') return false;
    if (!Array.isArray(currentQuotes) || !Array.isArray(currentJobs)) return false;

    const alreadyRecovered = currentJobs.some(job =>
      job.invoiceNumber === TARGET_INVOICE ||
      job.quoteRef === 'KCSYGDC100Q' ||
      (job.quoteSnapshot?.refPrefix === TARGET_PREFIX && Number(job.quoteSnapshot?.refNumber) === TARGET_NUMBER)
    );
    if (alreadyRecovered) return true;

    const quote = currentQuotes.find(q =>
      String(q.refPrefix || '').toUpperCase() === TARGET_PREFIX && Number(q.refNumber) === TARGET_NUMBER
    );
    if (!quote) return false;

    const quoteSettings = typeof getSettingsForQuote === 'function'
      ? getSettingsForQuote(quote)
      : (quote.settingsSnapshot || currentSettings || DEFAULT_SETTINGS);
    const quoteResult = calculateQuote(quote, quoteSettings);
    const ref = buildRefCode(quote.refPrefix, quote.refNumber, true);
    const catalog = currentSettings?.partsCatalog || quoteSettings?.partsCatalog || DEFAULT_SETTINGS.partsCatalog || [];
    const stickerCostPerPipette = quoteSettings.stickerCostPerPipette ?? DEFAULT_SETTINGS.stickerCostPerPipette ?? 0.10;

    const level4Readings = findServiceLevelId(quoteSettings, '2 Vol 4 Readings');
    const level2Readings = findServiceLevelId(quoteSettings, '2 Vol 2 Readings');

    const recoveredParts = [
      ['Gilson Pipetteman Classic P1000 Seal P1000', 4, 6.24],
      ['Gilson Pipetteman Classic P1000 O-Ring P1000', 4, 2.84],
      ['Gilson Pipetteman Classic P200 Seal P200', 2, 6.24],
      ['Gilson Pipetteman Classic P200 O-Ring P200', 2, 2.84],
      ['Sartorius battery', 1, 40.78],
    ].map(([name, quantity, customerPrice]) => {
      const matched = findCatalogPart(catalog, name);
      return {
        id: crypto.randomUUID(),
        catalogPartId: matched?.id || '',
        name,
        quantity,
        // Existing completed-quote code reads costPerUnit as the customer-facing price.
        costPerUnit: customerPrice,
        // Preserve the catalogue's other stored value where available; otherwise leave unknown at 0.
        pricePerUnit: matched ? (parseFloat(matched.pricePerUnit) || 0) : 0,
      };
    });

    const job = {
      id: crypto.randomUUID(),
      quoteId: quote.id,
      quoteRef: ref,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'open',
      customerName: quote.customerName || 'Sygnature Glasgow',
      customerAddress: quote.customerAddress || 'Telford Pavilion,\nTodd Campus,\nWest of Scotland Science Park,\nGlasgow,\nLanarkshire,\nG20 0XA',
      proposedDate: quote.proposedDate || '',
      settingsSnapshot: createQuoteSettingsSnapshot(quoteSettings),
      quoteSnapshot: { ...quote, settingsSnapshot: createQuoteSettingsSnapshot(quoteSettings) },
      partsCatalogSnapshot: cloneSettings(catalog),
      defaultServiceLevelId: level4Readings || level2Readings,
      quotedServiceLevelSummary: typeof getJobServiceLevelSummary === 'function'
        ? getJobServiceLevelSummary(quote, quoteSettings)
        : '',
      quotedAssumptions: {
        totalTripMiles: quoteResult.totalTripMiles || 0,
        mileageRatePence: normalizeMileageRatePence(quoteSettings.mileageRatePence || DEFAULT_SETTINGS.mileageRatePence),
        hotelCost: quoteResult.costAccommodation || 0,
        foodCost: quoteResult.costSubsistence || 0,
        secondPersonCost: quoteResult.costSecondPerson || 0,
        stickerCostPerPipette,
        stickerCost: 217 * stickerCostPerPipette,
      },
      stickerCostPerPipette,
      plannedLines: quote.pipetteLines || [],
      actualEntries: [
        {
          id: crypto.randomUUID(),
          date: '',
          serviceLevelId: level4Readings,
          singleChannelCount: 148,
          multiChannel6Count: 0,
          multiChannel8Count: 0,
          multiChannel12Count: 0,
          multiChannel16Count: 0,
        },
        {
          id: crypto.randomUUID(),
          date: '',
          serviceLevelId: level2Readings,
          singleChannelCount: 0,
          multiChannel6Count: 0,
          multiChannel8Count: 61,
          multiChannel12Count: 8,
          multiChannel16Count: 0,
        },
      ],
      parts: recoveredParts,
      poNumber: '',
      invoiceNumber: TARGET_INVOICE,
      workCarriedOut: '',
      costs: {
        hotel: quoteResult.costAccommodation || 0,
        food: quoteResult.costSubsistence || 0,
        fuel: 0,
        parts: 0,
        shipping: 0,
        secondPerson: quoteResult.costSecondPerson || 0,
        other: 0,
        mileageMiles: quoteResult.totalTripMiles || 0,
      },
      mileageRatePence: normalizeMileageRatePence(quoteSettings.mileageRatePence || DEFAULT_SETTINGS.mileageRatePence),
      notes: 'Recovered from the Customer Completed Quote PDF after accidental deletion. Completed quantities and customer-facing parts/prices were restored from the PDF. Please check work dates, PO number and internal costs before marking complete.',
      recoveredFromPdf: true,
    };

    StorageManager.saveJob(job);
    if (typeof isLocalPreviewMode === 'undefined' || !isLocalPreviewMode) {
      await saveJobToFirestore(job);
    }
    if (typeof refreshJobSheets === 'function') await refreshJobSheets();
    if (typeof showToast === 'function') showToast('Sygnature Glasgow job sheet recovered');
    return true;
  }

  document.addEventListener('DOMContentLoaded', () => {
    let attempts = 0;
    const timer = setInterval(async () => {
      attempts += 1;
      try {
        const done = await recoverSygnatureGlasgowJob();
        if (done || attempts >= 60) clearInterval(timer);
      } catch (error) {
        console.error('Sygnature Glasgow recovery failed', error);
        if (attempts >= 60) clearInterval(timer);
      }
    }, 1000);
  });
})();
