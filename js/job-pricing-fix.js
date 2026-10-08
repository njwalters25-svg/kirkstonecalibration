// ============================================================
// job-pricing-fix.js — Job unit-price overrides + correct part cost/price semantics
// ============================================================

(function () {
  const PRICE_FIELDS = [
    ['single', 'Single', 'chargeSingleChannel', 'singleChannelCount'],
    ['multi6', '6-channel', 'chargeMultiChannel6', 'multiChannel6Count'],
    ['multi8', '8-channel', 'chargeMultiChannel8', 'multiChannel8Count'],
    ['multi12', '12-channel', 'chargeMultiChannel12', 'multiChannel12Count'],
    ['multi16', '16-channel', 'chargeMultiChannel16', 'multiChannel16Count'],
  ];

  window.getJobUnitPrice = function (job, serviceLevelId, priceKey, settings) {
    const override = job?.unitPriceOverrides?.[serviceLevelId]?.[priceKey];
    if (override !== undefined && override !== null && override !== '') return parseFloat(override) || 0;
    const sl = getServiceLevel(serviceLevelId, settings || job?.settingsSnapshot || DEFAULT_SETTINGS);
    const field = PRICE_FIELDS.find(([key]) => key === priceKey)?.[2];
    return field ? (parseFloat(sl?.[field]) || 0) : 0;
  };

  window.updateJobUnitPrice = function (jobId, serviceLevelId, priceKey, value) {
    const job = typeof getJobById === 'function' ? getJobById(jobId) : null;
    if (!job) return;
    job.unitPriceOverrides = job.unitPriceOverrides || {};
    job.unitPriceOverrides[serviceLevelId] = job.unitPriceOverrides[serviceLevelId] || {};
    job.unitPriceOverrides[serviceLevelId][priceKey] = parseFloat(value) || 0;
    renderJobSheets(currentJobs);
  };

  // Recalculate job revenue/profit using editable job unit prices and conventional part fields.
  if (typeof calculateJobSheet === 'function') {
    const originalCalculateJobSheet = calculateJobSheet;
    window.calculateJobSheet = function (job) {
      const base = originalCalculateJobSheet(job);
      const roundMoney = value => Math.round(((parseFloat(value) || 0) + Number.EPSILON) * 100) / 100;
      const settings = typeof getSettingsForQuote === 'function'
        ? getSettingsForQuote(job.quoteSnapshot || {}, job.settingsSnapshot || DEFAULT_SETTINGS)
        : (job.settingsSnapshot || DEFAULT_SETTINGS);

      let pipetteRevenue = 0;
      (job.actualEntries || []).forEach(entry => {
        PRICE_FIELDS.forEach(([key, , , countField]) => {
          const qty = parseFloat(entry[countField]) || 0;
          pipetteRevenue += qty * getJobUnitPrice(job, entry.serviceLevelId, key, settings);
        });
      });

      // Conventional semantics: costPerUnit = Kirkstone cost; pricePerUnit = customer price.
      const partsCost = (job.parts || []).reduce((sum, part) =>
        sum + ((parseFloat(part.quantity) || 0) * (parseFloat(part.costPerUnit) || 0)), 0);
      const partsRevenue = (job.parts || []).reduce((sum, part) =>
        sum + ((parseFloat(part.quantity) || 0) * (parseFloat(part.pricePerUnit) || 0)), 0);

      const actualRevenue = pipetteRevenue + partsRevenue;
      const costs = job.costs || {};
      const otherCosts =
        (parseFloat(costs.hotel) || 0) +
        (parseFloat(costs.food) || 0) +
        (parseFloat(costs.fuel) || 0) +
        (parseFloat(base.stickerCost) || 0) +
        (parseFloat(costs.shipping) || 0) +
        (parseFloat(costs.secondPerson) || 0) +
        (parseFloat(costs.other) || 0);
      const totalCosts = (parseFloat(base.mileageCost) || 0) + otherCosts + partsCost;
      const profit = actualRevenue - totalCosts;
      const vatAmount = job.quoteSnapshot?.vatExempt ? 0 : actualRevenue * 0.20;
      const taxAt40 = Math.max(profit, 0) * 0.40;
      const actualDays = base.actualDays || 0;

      return {
        ...base,
        pipetteRevenue: roundMoney(pipetteRevenue),
        partsCost: roundMoney(partsCost),
        partsRevenue: roundMoney(partsRevenue),
        actualRevenue: roundMoney(actualRevenue),
        vatAmount: roundMoney(vatAmount),
        revenueIncVat: roundMoney(actualRevenue + vatAmount),
        totalCosts: roundMoney(totalCosts),
        profit: roundMoney(profit),
        profitMarginPercent: roundMoney(actualRevenue > 0 ? (profit / actualRevenue) * 100 : 0),
        taxAt40: roundMoney(taxAt40),
        profitAfterTax: roundMoney(profit - taxAt40),
        profitPerDay: roundMoney(actualDays > 0 ? profit / actualDays : profit),
      };
    };
  }

  // Correct the job-sheet part columns: Cost = costPerUnit, Price = pricePerUnit.
  window.renderJobPartRow = function (job, part) {
    const catalog = getJobPartsCatalog(job);
    const options = catalog.map(catalogPart =>
      `<option value="${escapeHtml(catalogPart.id)}" ${catalogPart.id === part.catalogPartId ? 'selected' : ''}>${escapeHtml(getCatalogPartName(catalogPart))}</option>`
    ).join('');
    const quantity = part.quantity || 1;
    const costTotal = (parseFloat(quantity) || 0) * (parseFloat(part.costPerUnit) || 0);
    const priceTotal = (parseFloat(quantity) || 0) * (parseFloat(part.pricePerUnit) || 0);
    return `
      <div class="job-part-row" data-part-id="${escapeHtml(part.id)}">
        <select onchange="updateJobPart('${escapeJsString(job.id)}','${escapeJsString(part.id)}','catalogPartId',this.value)">${options}</select>
        <input type="number" min="0" step="1" value="${quantity}" placeholder="Qty" onchange="updateJobPart('${escapeJsString(job.id)}','${escapeJsString(part.id)}','quantity',this.value)">
        <input type="number" min="0" step="0.01" value="${part.costPerUnit || 0}" placeholder="Cost" onchange="updateJobPart('${escapeJsString(job.id)}','${escapeJsString(part.id)}','costPerUnit',this.value)">
        <input type="number" min="0" step="0.01" value="${part.pricePerUnit || 0}" placeholder="Price" onchange="updateJobPart('${escapeJsString(job.id)}','${escapeJsString(part.id)}','pricePerUnit',this.value)">
        <span>${formatCurrency(costTotal)}</span>
        <span>${formatCurrency(priceTotal)}</span>
        <button class="btn-small btn-delete" onclick="deleteJobPart('${escapeJsString(job.id)}','${escapeJsString(part.id)}')">Remove</button>
      </div>`;
  };

  // Correct Settings catalogue labels and storage semantics too.
  window.renderPartsCatalogEditor = function (settings) {
    const container = document.getElementById('partsCatalogEditor');
    if (!container) return;
    const parts = getEffectivePartsCatalog(settings);
    if (settings && (!Array.isArray(settings.partsCatalog) || settings.partsCatalog.length === 0)) {
      settings.partsCatalog = JSON.parse(JSON.stringify(parts));
    }
    if (parts.length === 0) {
      container.innerHTML = '<p class="empty-state compact">No parts yet. Add one below.</p>';
      return;
    }
    container.innerHTML = parts.map((part, i) => `
      <div class="part-card" data-index="${i}">
        <div class="form-group"><label>Pipette / model</label><input type="text" class="part-pipette" value="${escapeHtml(part.pipette || '')}"></div>
        <div class="form-group"><label>Part</label><input type="text" class="part-description" value="${escapeHtml(part.description || '')}"></div>
        <div class="form-group"><label>Dropdown name</label><input type="text" class="part-name" value="${escapeHtml(getCatalogPartName(part))}"></div>
        <div class="form-group"><label>Cost</label><input type="number" class="part-cost" step="0.01" min="0" value="${part.costPerUnit || 0}"></div>
        <div class="form-group"><label>Customer price</label><input type="number" class="part-price" step="0.01" min="0" value="${part.pricePerUnit || 0}"></div>
        <button type="button" class="btn-small btn-delete part-remove" data-index="${i}">Remove</button>
      </div>`).join('');
  };

  window.collectPartsCatalogFromEditor = function () {
    const cards = document.querySelectorAll('#partsCatalogEditor .part-card');
    return Array.from(cards).map((card, i) => {
      const pipette = card.querySelector('.part-pipette').value.trim();
      const description = card.querySelector('.part-description').value.trim();
      const name = card.querySelector('.part-name').value.trim() || [pipette, description].filter(Boolean).join(' ').trim() || `Part ${i + 1}`;
      return {
        id: name.toLowerCase().replace(/[^a-z0-9]+/g, '_') || `part_${i + 1}`,
        pipette,
        description,
        name,
        costPerUnit: parseFloat(card.querySelector('.part-cost').value) || 0,
        pricePerUnit: parseFloat(card.querySelector('.part-price').value) || 0,
      };
    });
  };

  // Customer Completed Quote must use amended job prices and customer part prices.
  if (typeof getCompletedQuotePipetteRows === 'function') {
    window.getCompletedQuotePipetteRows = function (job) {
      const settings = typeof getSettingsForQuote === 'function'
        ? getSettingsForQuote(job.quoteSnapshot || {}, job.settingsSnapshot || DEFAULT_SETTINGS)
        : (job.settingsSnapshot || DEFAULT_SETTINGS);
      const grouped = new Map();
      (job.actualEntries || []).forEach(entry => {
        const serviceLevel = getServiceLevel(entry.serviceLevelId, settings);
        PRICE_FIELDS.forEach(([key, typeLabel, , countField]) => {
          const quantity = parseInt(entry[countField]) || 0;
          if (!quantity) return;
          const unitPrice = getJobUnitPrice(job, entry.serviceLevelId, key, settings);
          const serviceName = serviceLevel?.name || 'Service';
          const mapKey = `${entry.serviceLevelId || serviceName}|${typeLabel}|${unitPrice}`;
          const current = grouped.get(mapKey) || { typeLabel, serviceName, quantity: 0, unitPrice };
          current.quantity += quantity;
          grouped.set(mapKey, current);
        });
      });
      return Array.from(grouped.values()).map(row => ({ ...row, total: row.quantity * row.unitPrice }));
    };
  }

  if (typeof getCompletedQuotePartRows === 'function') {
    window.getCompletedQuotePartRows = function (job) {
      const catalog = typeof getJobPartsCatalog === 'function' ? getJobPartsCatalog(job) : [];
      return (job.parts || []).map(part => {
        const catalogPart = catalog.find(item => item.id === part.catalogPartId);
        const name = catalogPart ? getCatalogPartName(catalogPart) : (part.name || part.description || part.catalogPartId || 'Part');
        const quantity = parseFloat(part.quantity) || 0;
        const unitPrice = parseFloat(part.pricePerUnit) || 0;
        return { name, quantity, unitPrice, total: quantity * unitPrice };
      }).filter(row => row.quantity > 0);
    };
  }

  function serviceIdsForJob(job) {
    const ids = [];
    (job.actualEntries || []).forEach(entry => {
      if (entry.serviceLevelId && !ids.includes(entry.serviceLevelId)) ids.push(entry.serviceLevelId);
    });
    if (!ids.length) {
      (job.plannedLines || []).forEach(line => {
        if (line.serviceLevelId && !ids.includes(line.serviceLevelId)) ids.push(line.serviceLevelId);
      });
    }
    return ids;
  }

  function installJobPriceEditors() {
    document.querySelectorAll('#jobSheets .job-card').forEach(card => {
      const jobId = card.dataset.id;
      const job = typeof getJobById === 'function' ? getJobById(jobId) : null;
      const editor = card.querySelector('.job-editor');
      if (!job || !editor || editor.querySelector('.job-unit-price-editor')) return;
      const settings = typeof getSettingsForQuote === 'function'
        ? getSettingsForQuote(job.quoteSnapshot || {}, job.settingsSnapshot || DEFAULT_SETTINGS)
        : (job.settingsSnapshot || DEFAULT_SETTINGS);
      const serviceIds = serviceIdsForJob(job);
      if (!serviceIds.length) return;

      const wrap = document.createElement('div');
      wrap.className = 'job-unit-price-editor';
      wrap.innerHTML = `
        <h3>Price per pipette</h3>
        <div class="field-hint" style="margin-bottom:0.5rem;">These are the customer unit prices for this job only. Change them here if the original quote price was wrong, then save the job sheet.</div>
        ${serviceIds.map(serviceId => {
          const sl = getServiceLevel(serviceId, settings);
          return `
            <div style="border:1px solid #e2e8f0;border-radius:8px;padding:0.75rem;margin-bottom:0.6rem;">
              <strong style="display:block;margin-bottom:0.5rem;">${escapeHtml(sl?.name || serviceId)}</strong>
              <div class="form-row-5">
                ${PRICE_FIELDS.map(([key, label]) => `
                  <div class="form-group">
                    <label>${escapeHtml(label)}</label>
                    <div class="currency-input"><span class="currency-prefix">£</span><input type="number" min="0" step="0.01" value="${getJobUnitPrice(job, serviceId, key, settings)}" onchange="updateJobUnitPrice('${escapeJsString(job.id)}','${escapeJsString(serviceId)}','${escapeJsString(key)}',this.value)"></div>
                  </div>`).join('')}
              </div>
            </div>`;
        }).join('')}`;

      const costsHeading = Array.from(editor.querySelectorAll('h3')).find(h => h.textContent.trim() === 'Costs');
      if (costsHeading) editor.insertBefore(wrap, costsHeading);
      else editor.appendChild(wrap);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    installJobPriceEditors();
    const jobsContainer = document.getElementById('jobSheets');
    if (!jobsContainer) return;
    const observer = new MutationObserver(() => installJobPriceEditors());
    observer.observe(jobsContainer, { childList: true, subtree: true });
  });
})();
