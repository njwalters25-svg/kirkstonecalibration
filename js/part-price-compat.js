// ============================================================
// part-price-compat.js — Normalize legacy reversed part values
// ============================================================

(function () {
  const CUSTOM_COST_ID = '__custom_part__';
  const CUSTOM_PRICED_ID = '__custom_priced_part__';

  function normalisePartValues(part) {
    const rawCost = parseFloat(part?.costPerUnit) || 0;
    const rawPrice = parseFloat(part?.pricePerUnit) || 0;

    // Deliberate custom entries must preserve the values entered by the user.
    // Cost-only custom entries always carry zero customer price.
    if (part?.catalogPartId === CUSTOM_COST_ID) {
      return { costPerUnit: rawCost, pricePerUnit: 0 };
    }
    if (part?.catalogPartId === CUSTOM_PRICED_ID) {
      return { costPerUnit: rawCost, pricePerUnit: rawPrice };
    }

    // Older saved catalog/job records used these fields backwards.
    if (rawCost > rawPrice && rawPrice >= 0) {
      return { costPerUnit: rawPrice, pricePerUnit: rawCost };
    }
    return { costPerUnit: rawCost, pricePerUnit: rawPrice };
  }

  window.getNormalisedPartValues = normalisePartValues;

  if (typeof getEffectivePartsCatalog === 'function') {
    const originalGetEffectivePartsCatalog = getEffectivePartsCatalog;
    window.getEffectivePartsCatalog = function (settings) {
      return originalGetEffectivePartsCatalog(settings).map(part => ({ ...part, ...normalisePartValues(part) }));
    };
  }

  if (typeof getJobPartsCatalog === 'function') {
    const originalGetJobPartsCatalog = getJobPartsCatalog;
    window.getJobPartsCatalog = function (job) {
      return originalGetJobPartsCatalog(job).map(part => ({ ...part, ...normalisePartValues(part) }));
    };
  }

  if (typeof calculateJobSheet === 'function') {
    const previousCalculateJobSheet = calculateJobSheet;
    window.calculateJobSheet = function (job) {
      const base = previousCalculateJobSheet(job);
      const roundMoney = value => Math.round(((parseFloat(value) || 0) + Number.EPSILON) * 100) / 100;
      const partsCost = (job.parts || []).reduce((sum, part) => {
        const v = normalisePartValues(part);
        return sum + ((parseFloat(part.quantity) || 0) * v.costPerUnit);
      }, 0);
      const partsRevenue = (job.parts || []).reduce((sum, part) => {
        const v = normalisePartValues(part);
        return sum + ((parseFloat(part.quantity) || 0) * v.pricePerUnit);
      }, 0);
      const actualRevenue = (parseFloat(base.pipetteRevenue) || 0) + partsRevenue;
      const nonPartCosts = (parseFloat(base.totalCosts) || 0) - (parseFloat(base.partsCost) || 0);
      const totalCosts = nonPartCosts + partsCost;
      const profit = actualRevenue - totalCosts;
      const taxAt40 = Math.max(profit, 0) * 0.40;
      const vatAmount = job.quoteSnapshot?.vatExempt ? 0 : actualRevenue * 0.20;
      return {
        ...base,
        partsCost: roundMoney(partsCost),
        partsRevenue: roundMoney(partsRevenue),
        actualRevenue: roundMoney(actualRevenue),
        totalCosts: roundMoney(totalCosts),
        profit: roundMoney(profit),
        vatAmount: roundMoney(vatAmount),
        revenueIncVat: roundMoney(actualRevenue + vatAmount),
        profitMarginPercent: roundMoney(actualRevenue > 0 ? (profit / actualRevenue) * 100 : 0),
        taxAt40: roundMoney(taxAt40),
        profitAfterTax: roundMoney(profit - taxAt40),
        profitPerDay: roundMoney((base.actualDays || 0) > 0 ? profit / base.actualDays : profit),
      };
    };
  }

  window.renderJobPartRow = function (job, part) {
    const catalog = getJobPartsCatalog(job);
    const options = catalog.map(catalogPart =>
      `<option value="${escapeHtml(catalogPart.id)}" ${catalogPart.id === part.catalogPartId ? 'selected' : ''}>${escapeHtml(getCatalogPartName(catalogPart))}</option>`
    ).join('');
    const quantity = part.quantity || 1;
    const values = normalisePartValues(part);
    const costTotal = (parseFloat(quantity) || 0) * values.costPerUnit;
    const priceTotal = (parseFloat(quantity) || 0) * values.pricePerUnit;
    return `
      <div class="job-part-row" data-part-id="${escapeHtml(part.id)}">
        <select onchange="updateJobPart('${escapeJsString(job.id)}','${escapeJsString(part.id)}','catalogPartId',this.value)">${options}</select>
        <input type="number" min="0" step="1" value="${quantity}" placeholder="Qty" onchange="updateJobPart('${escapeJsString(job.id)}','${escapeJsString(part.id)}','quantity',this.value)">
        <input type="number" min="0" step="0.01" value="${values.costPerUnit}" placeholder="Cost" onchange="updateJobPart('${escapeJsString(job.id)}','${escapeJsString(part.id)}','costPerUnit',this.value)">
        <input type="number" min="0" step="0.01" value="${values.pricePerUnit}" placeholder="Price" onchange="updateJobPart('${escapeJsString(job.id)}','${escapeJsString(part.id)}','pricePerUnit',this.value)">
        <span>${formatCurrency(costTotal)}</span>
        <span>${formatCurrency(priceTotal)}</span>
        <button class="btn-small btn-delete" onclick="deleteJobPart('${escapeJsString(job.id)}','${escapeJsString(part.id)}')">Remove</button>
      </div>`;
  };

  if (typeof getCompletedQuotePartRows === 'function') {
    window.getCompletedQuotePartRows = function (job) {
      const catalog = typeof getJobPartsCatalog === 'function' ? getJobPartsCatalog(job) : [];
      return (job.parts || []).filter(part => part.catalogPartId !== CUSTOM_COST_ID).map(part => {
        const catalogPart = catalog.find(item => item.id === part.catalogPartId);
        const name = catalogPart ? getCatalogPartName(catalogPart) : (part.name || part.description || part.catalogPartId || 'Part');
        const quantity = parseFloat(part.quantity) || 0;
        const values = normalisePartValues(part);
        return { name, quantity, unitPrice: values.pricePerUnit, total: quantity * values.pricePerUnit };
      }).filter(row => row.quantity > 0 && row.total > 0);
    };
  }
})();
