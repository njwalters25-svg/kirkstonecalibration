// ============================================================
// job-custom-parts.js — Custom free-type part option on job sheets
// ============================================================

(function () {
  const CUSTOM_PART_ID = '__custom_part__';

  window.selectJobPartOption = function (jobId, partId, value) {
    const job = typeof getJobById === 'function' ? getJobById(jobId) : null;
    if (!job) return;
    const part = (job.parts || []).find(item => item.id === partId);
    if (!part) return;

    if (value === CUSTOM_PART_ID) {
      part.catalogPartId = CUSTOM_PART_ID;
      part.name = '';
      part.quantity = part.quantity || 1;
      part.costPerUnit = 0;
      part.pricePerUnit = 0;
      renderJobSheets(currentJobs);
      return;
    }

    if (typeof updateJobPart === 'function') {
      updateJobPart(jobId, partId, 'catalogPartId', value);
    }
  };

  window.renderJobPartRow = function (job, part) {
    const catalog = typeof getJobPartsCatalog === 'function' ? getJobPartsCatalog(job) : [];
    const isCustom = part.catalogPartId === CUSTOM_PART_ID;
    const options = catalog.map(catalogPart =>
      `<option value="${escapeHtml(catalogPart.id)}" ${catalogPart.id === part.catalogPartId ? 'selected' : ''}>${escapeHtml(getCatalogPartName(catalogPart))}</option>`
    ).join('');
    const quantity = parseFloat(part.quantity) || 1;
    const values = typeof getNormalisedPartValues === 'function'
      ? getNormalisedPartValues(part)
      : {
          costPerUnit: parseFloat(part.costPerUnit) || 0,
          pricePerUnit: parseFloat(part.pricePerUnit) || 0,
        };
    const costPerUnit = parseFloat(values.costPerUnit) || 0;
    const pricePerUnit = parseFloat(values.pricePerUnit) || 0;
    const costTotal = quantity * costPerUnit;
    const priceTotal = quantity * pricePerUnit;

    return `
      <div class="job-part-row ${isCustom ? 'job-custom-part-row' : ''}" data-part-id="${escapeHtml(part.id)}">
        <div class="job-part-selector-cell">
          <select onchange="selectJobPartOption('${escapeJsString(job.id)}','${escapeJsString(part.id)}',this.value)">
            ${options}
            <option value="${CUSTOM_PART_ID}" ${isCustom ? 'selected' : ''}>Other / custom part…</option>
          </select>
          ${isCustom ? `<input class="job-custom-part-name" type="text" value="${escapeHtml(part.name || '')}" placeholder="Type part / item" onchange="updateJobPart('${escapeJsString(job.id)}','${escapeJsString(part.id)}','name',this.value)">` : ''}
        </div>
        <input type="number" min="0" step="1" value="${quantity}" placeholder="Qty" onchange="updateJobPart('${escapeJsString(job.id)}','${escapeJsString(part.id)}','quantity',this.value)">
        <input type="number" min="0" step="0.01" value="${costPerUnit}" placeholder="Cost" title="Your cost per unit" onchange="updateJobPart('${escapeJsString(job.id)}','${escapeJsString(part.id)}','costPerUnit',this.value)">
        <input type="number" min="0" step="0.01" value="${pricePerUnit}" placeholder="Customer price" title="Customer price per unit" onchange="updateJobPart('${escapeJsString(job.id)}','${escapeJsString(part.id)}','pricePerUnit',this.value)">
        <span>${formatCurrency(costTotal)}</span>
        <span>${formatCurrency(priceTotal)}</span>
        <button class="btn-small btn-delete" onclick="deleteJobPart('${escapeJsString(job.id)}','${escapeJsString(part.id)}')">Remove</button>
      </div>`;
  };

  function installStyles() {
    if (document.getElementById('jobCustomPartStyles')) return;
    const style = document.createElement('style');
    style.id = 'jobCustomPartStyles';
    style.textContent = `
      .job-part-selector-cell{display:flex;flex-direction:column;gap:.35rem;min-width:180px}.job-custom-part-name{width:100%;min-width:0}.job-custom-part-row{align-items:end}
    `;
    document.head.appendChild(style);
  }

  installStyles();
  if (typeof currentJobs !== 'undefined' && typeof renderJobSheets === 'function') {
    renderJobSheets(currentJobs);
  }
})();
