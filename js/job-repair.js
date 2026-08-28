// ============================================================
// job-repair.js — Free-text repair work + customer price on job sheets
// ============================================================

(function () {
  function getRepairItems(job) {
    return Array.isArray(job?.repairItems) ? job.repairItems : [];
  }

  window.addJobRepairItem = function (jobId) {
    const job = typeof getJobById === 'function' ? getJobById(jobId) : null;
    if (!job) return;
    job.repairItems = getRepairItems(job);
    job.repairItems.push({ id: crypto.randomUUID(), description: '', price: 0 });
    renderJobSheets(currentJobs);
  };

  window.updateJobRepairItem = function (jobId, itemId, field, value) {
    const job = typeof getJobById === 'function' ? getJobById(jobId) : null;
    if (!job) return;
    job.repairItems = getRepairItems(job);
    const item = job.repairItems.find(row => row.id === itemId);
    if (!item) return;
    item[field] = field === 'price' ? (parseFloat(value) || 0) : String(value || '');
    if (field === 'price') renderJobSheets(currentJobs);
  };

  window.deleteJobRepairItem = function (jobId, itemId) {
    const job = typeof getJobById === 'function' ? getJobById(jobId) : null;
    if (!job) return;
    job.repairItems = getRepairItems(job).filter(row => row.id !== itemId);
    renderJobSheets(currentJobs);
  };

  // Add repair revenue into the normal job totals so invoice spreadsheet,
  // profit, VAT and completed-job figures all receive the same total.
  if (typeof calculateJobSheet === 'function') {
    const previousCalculateJobSheet = calculateJobSheet;
    window.calculateJobSheet = function (job) {
      const base = previousCalculateJobSheet(job);
      const roundMoney = value => Math.round(((parseFloat(value) || 0) + Number.EPSILON) * 100) / 100;
      const repairRevenue = getRepairItems(job).reduce((sum, item) => sum + (parseFloat(item.price) || 0), 0);
      if (!repairRevenue) return { ...base, repairRevenue: 0 };

      const actualRevenue = (parseFloat(base.actualRevenue) || 0) + repairRevenue;
      const totalCosts = parseFloat(base.totalCosts) || 0;
      const profit = actualRevenue - totalCosts;
      const vatAmount = job.quoteSnapshot?.vatExempt ? 0 : actualRevenue * 0.20;
      const taxAt40 = Math.max(profit, 0) * 0.40;
      const actualDays = parseFloat(base.actualDays) || 0;

      return {
        ...base,
        repairRevenue: roundMoney(repairRevenue),
        actualRevenue: roundMoney(actualRevenue),
        vatAmount: roundMoney(vatAmount),
        revenueIncVat: roundMoney(actualRevenue + vatAmount),
        profit: roundMoney(profit),
        profitMarginPercent: roundMoney(actualRevenue > 0 ? (profit / actualRevenue) * 100 : 0),
        taxAt40: roundMoney(taxAt40),
        profitAfterTax: roundMoney(profit - taxAt40),
        profitPerDay: roundMoney(actualDays > 0 ? profit / actualDays : profit),
      };
    };
  }

  function renderRepairEditor(job) {
    const items = getRepairItems(job);
    return `
      <div class="job-repair-editor">
        <h3>Repairs / additional work</h3>
        <div class="field-hint" style="margin-bottom:.55rem;">Add the work actually carried out and the customer price. Press Save Job Sheet when finished.</div>
        <div class="job-repair-list">
          ${items.map(item => `
            <div class="job-repair-row" data-repair-id="${escapeHtml(item.id)}">
              <div class="form-group job-repair-description">
                <label>Work carried out</label>
                <input type="text" value="${escapeHtml(item.description || '')}" placeholder="e.g. Replaced piston seal and serviced pipette" onchange="updateJobRepairItem('${escapeJsString(job.id)}','${escapeJsString(item.id)}','description',this.value)">
              </div>
              <div class="form-group job-repair-price">
                <label>Price</label>
                <div class="job-repair-currency"><span aria-hidden="true">£</span><input type="number" min="0" step="0.01" value="${parseFloat(item.price) || 0}" onchange="updateJobRepairItem('${escapeJsString(job.id)}','${escapeJsString(item.id)}','price',this.value)"></div>
              </div>
              <button type="button" class="btn-small btn-delete" onclick="deleteJobRepairItem('${escapeJsString(job.id)}','${escapeJsString(item.id)}')">Remove</button>
            </div>`).join('')}
        </div>
        <button type="button" class="btn-small" onclick="addJobRepairItem('${escapeJsString(job.id)}')">+ Add repair / work</button>
      </div>`;
  }

  function installRepairEditors() {
    document.querySelectorAll('#jobSheets .job-card').forEach(card => {
      const job = typeof getJobById === 'function' ? getJobById(card.dataset.id) : null;
      const editor = card.querySelector('.job-editor');
      if (!job || !editor || editor.querySelector('.job-repair-editor')) return;
      const holder = document.createElement('div');
      holder.innerHTML = renderRepairEditor(job);
      const repairEditor = holder.firstElementChild;
      const costsHeading = Array.from(editor.querySelectorAll('h3')).find(h => h.textContent.trim() === 'Costs');
      if (costsHeading) editor.insertBefore(repairEditor, costsHeading);
      else editor.appendChild(repairEditor);
    });
  }

  function installStyles() {
    if (document.getElementById('jobRepairStyles')) return;
    const style = document.createElement('style');
    style.id = 'jobRepairStyles';
    style.textContent = `
      .job-repair-editor{margin:1rem 0}.job-repair-row{display:grid;grid-template-columns:minmax(0,1fr) 170px auto;gap:.75rem;align-items:end;padding:.75rem;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:.6rem}
      .job-repair-currency{display:flex;align-items:center;width:100%;border:1px solid #cbd5e1;border-radius:6px;background:#fff;overflow:hidden}.job-repair-currency>span{flex:0 0 auto;padding:0 .15rem 0 .7rem;line-height:1}.job-repair-currency>input{flex:1 1 auto;min-width:0;border:0!important;box-shadow:none!important;padding-left:.35rem!important;background:transparent!important}.job-repair-currency>input:focus{outline:none}
      @media(max-width:650px){.job-repair-row{grid-template-columns:1fr}.job-repair-row .btn-delete{justify-self:start}}
    `;
    document.head.appendChild(style);
  }

  installStyles();
  installRepairEditors();
  const jobsContainer = document.getElementById('jobSheets');
  if (jobsContainer) {
    const observer = new MutationObserver(() => installRepairEditors());
    observer.observe(jobsContainer, { childList: true, subtree: true });
  }
})();
