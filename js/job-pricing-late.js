// ============================================================
// job-pricing-late.js — Finalise job price UI after all app scripts are loaded
// ============================================================

(function () {
  const PRICE_FIELDS = [
    ['single', 'Single', 'singleChannelCount'],
    ['multi6', '6-channel', 'multiChannel6Count'],
    ['multi8', '8-channel', 'multiChannel8Count'],
    ['multi12', '12-channel', 'multiChannel12Count'],
    ['multi16', '16-channel', 'multiChannel16Count'],
  ];

  if (typeof getCompletedQuotePipetteRows === 'function' && typeof getJobUnitPrice === 'function') {
    window.getCompletedQuotePipetteRows = function (job) {
      const settings = typeof getSettingsForQuote === 'function'
        ? getSettingsForQuote(job.quoteSnapshot || {}, job.settingsSnapshot || DEFAULT_SETTINGS)
        : (job.settingsSnapshot || DEFAULT_SETTINGS);
      const grouped = new Map();
      (job.actualEntries || []).forEach(entry => {
        const serviceLevel = getServiceLevel(entry.serviceLevelId, settings);
        PRICE_FIELDS.forEach(([key, typeLabel, countField]) => {
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
        const values = typeof getNormalisedPartValues === 'function'
          ? getNormalisedPartValues(part)
          : { pricePerUnit: parseFloat(part.pricePerUnit) || 0 };
        const unitPrice = parseFloat(values.pricePerUnit) || 0;
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

  function installEditors() {
    if (typeof getJobUnitPrice !== 'function') return;
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
        <div class="field-hint" style="margin-bottom:0.5rem;">Customer price per pipette for this job. Amend any incorrect price here, then press Save Job Sheet.</div>
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

  if (typeof currentJobs !== 'undefined' && typeof renderJobSheets === 'function') renderJobSheets(currentJobs);
  if (typeof currentSettings !== 'undefined' && currentSettings && typeof populateSettingsForm === 'function') populateSettingsForm(currentSettings);
  installEditors();

  const jobsContainer = document.getElementById('jobSheets');
  if (jobsContainer) {
    const observer = new MutationObserver(() => installEditors());
    observer.observe(jobsContainer, { childList: true, subtree: true });
  }
})();
