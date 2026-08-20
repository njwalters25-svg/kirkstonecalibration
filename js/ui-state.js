// ============================================================
// ui-state.js — Preserve the user's current screen across refreshes
// ============================================================

const KIRKSTONE_UI_STATE_KEY = 'kirkstoneQuoteAppUiState';

function loadKirkstoneUiState() {
  try {
    return JSON.parse(localStorage.getItem(KIRKSTONE_UI_STATE_KEY) || '{}');
  } catch (error) {
    return {};
  }
}

function saveKirkstoneUiState(activeTab, lastViewedJobId) {
  try {
    localStorage.setItem(KIRKSTONE_UI_STATE_KEY, JSON.stringify({
      activeTab: activeTab || document.querySelector('.tab-btn.active')?.dataset.tab || 'quotePanel',
      expandedJobIds: typeof expandedJobIds !== 'undefined' ? [...expandedJobIds] : [],
      lastViewedJobId: lastViewedJobId || null,
    }));
  } catch (error) {
    // UI state is a convenience only; never block the app if storage is unavailable.
  }
}

function restoreKirkstoneTab(tabId) {
  const button = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  const panel = document.getElementById(tabId);
  if (!button || !panel) return;

  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(tab => tab.classList.remove('active'));
  button.classList.add('active');
  panel.classList.add('active');
}

const savedKirkstoneUiState = loadKirkstoneUiState();
if (typeof expandedJobIds !== 'undefined' && Array.isArray(savedKirkstoneUiState.expandedJobIds)) {
  savedKirkstoneUiState.expandedJobIds.forEach(id => expandedJobIds.add(id));
}

// Wrap programmatic navigation so it is remembered as well as normal tab clicks.
if (typeof openJobSheet === 'function') {
  const originalOpenJobSheet = openJobSheet;
  openJobSheet = function (id) {
    originalOpenJobSheet(id);
    saveKirkstoneUiState('jobsPanel', id);
  };
}

if (typeof toggleJobDetail === 'function') {
  const originalToggleJobDetail = toggleJobDetail;
  toggleJobDetail = function (id) {
    originalToggleJobDetail(id);
    const isOpen = typeof expandedJobIds !== 'undefined' && expandedJobIds.has(id);
    saveKirkstoneUiState('jobsPanel', isOpen ? id : null);
  };
}

if (typeof createJobSheetFromQuote === 'function') {
  const originalCreateJobSheetFromQuote = createJobSheetFromQuote;
  createJobSheetFromQuote = async function (id) {
    await originalCreateJobSheetFromQuote(id);
    const openIds = typeof expandedJobIds !== 'undefined' ? [...expandedJobIds] : [];
    saveKirkstoneUiState('jobsPanel', openIds.length ? openIds[openIds.length - 1] : null);
  };
}

if (typeof loadQuote === 'function') {
  const originalLoadQuote = loadQuote;
  loadQuote = function (id) {
    originalLoadQuote(id);
    saveKirkstoneUiState('quotePanel', null);
  };
}

function collectKirkstoneSettingsSafely() {
  const base = JSON.parse(JSON.stringify((typeof currentSettings !== 'undefined' && currentSettings) || DEFAULT_SETTINGS));
  const value = (id, fallback = '') => {
    const el = document.getElementById(id);
    return el ? el.value : fallback;
  };
  const number = (id, fallback = 0) => {
    const el = document.getElementById(id);
    if (!el) return fallback;
    const parsed = parseFloat(el.value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  base.serviceLevels = typeof collectServiceLevelsFromEditor === 'function'
    ? collectServiceLevelsFromEditor()
    : base.serviceLevels;
  base.partsCatalog = typeof collectPartsCatalogFromEditor === 'function'
    ? collectPartsCatalogFromEditor()
    : base.partsCatalog;

  base.costSingleChannel = number('s_costSingleChannel', base.costSingleChannel);
  base.costMultiChannel6 = number('s_costMultiChannel6', base.costMultiChannel6);
  base.costMultiChannel8 = number('s_costMultiChannel8', base.costMultiChannel8);
  base.costMultiChannel12 = number('s_costMultiChannel12', base.costMultiChannel12);
  base.costMultiChannel16 = number('s_costMultiChannel16', base.costMultiChannel16);
  base.stickerCostPerPipette = number('s_stickerCostPerPipette', base.stickerCostPerPipette);
  base.labourRatePerHour = number('s_labourHourlyRate', base.labourRatePerHour);
  base.workingHoursPerDay = number('s_workingDayHours', base.workingHoursPerDay);
  base.homePostcode = value('s_homePostcode', base.homePostcode || 'DE75 7UJ').trim() || 'DE75 7UJ';
  base.discountRegularPercent = number('s_discountRegular', base.discountRegularPercent);
  base.discountContractPercent = number('s_discountContract', base.discountContractPercent);
  base.companyName = value('s_companyName', base.companyName || 'Kirkstone Calibration').trim() || 'Kirkstone Calibration';
  base.companyAddress = value('s_companyAddress', base.companyAddress || '');
  base.companyPhone = value('s_companyPhone', base.companyPhone || '').trim();
  base.companyEmail = value('s_companyEmail', base.companyEmail || '').trim();
  base.companyWebsite = value('s_companyWebsite', base.companyWebsite || '').trim();
  base.vatNumber = value('s_vatNumber', base.vatNumber || '').trim();
  base.quoteValidDays = parseInt(value('s_quoteValidDays', base.quoteValidDays || 30)) || 30;
  return base;
}

// app.js calls collectSettingsFromForm() when Save Settings is pressed. The
// original collector still expects legacy inputs that are no longer on the
// Settings page, so replace it with the safe collector above after app.js loads.
if (typeof collectSettingsFromForm === 'function') {
  collectSettingsFromForm = collectKirkstoneSettingsSafely;
}

async function recoverKirkstoneServiceLevels() {
  if (typeof currentSettings === 'undefined' || !currentSettings) return false;
  const current = Array.isArray(currentSettings.serviceLevels) ? currentSettings.serviceLevels : [];
  if (current.length > 2 || typeof currentQuotes === 'undefined' || !Array.isArray(currentQuotes)) return false;

  let best = current;
  currentQuotes.forEach(quote => {
    const levels = quote?.settingsSnapshot?.serviceLevels;
    if (Array.isArray(levels) && levels.length > best.length) best = levels;
  });

  if (best.length <= current.length) return false;
  currentSettings = { ...currentSettings, serviceLevels: JSON.parse(JSON.stringify(best)) };
  StorageManager.saveSettings(currentSettings);
  try {
    if (typeof isLocalPreviewMode === 'undefined' || !isLocalPreviewMode) {
      await saveSettingsToFirestore(currentSettings);
    }
  } catch (error) {
    console.error('Recovered service levels locally but cloud save failed', error);
  }
  populateSettingsForm(currentSettings);
  wireServiceLevelRemoveButtons();
  if (typeof wirePartsCatalogRemoveButtons === 'function') wirePartsCatalogRemoveButtons();
  return true;
}

function refreshKirkstoneServiceDropdowns() {
  if (typeof currentSettings === 'undefined' || !currentSettings || typeof collectPipetteLinesFromForm !== 'function') return;
  const lines = collectPipetteLinesFromForm();
  const settings = (typeof loadedQuoteId !== 'undefined' && loadedQuoteId && typeof getCalculationSettings === 'function')
    ? getCalculationSettings()
    : currentSettings;
  renderPipetteLines(lines, settings);
  wirePipetteLineEvents();
}

function renderKirkstoneJobSummary(job) {
  const calc = calculateJobSheet(job);
  const costs = job.costs || {};
  const vat = calc.actualRevenue * 0.20;
  const totalWithVat = calc.actualRevenue + vat;
  const pension = Math.max(calc.profit, 0) * 0.07;
  const costRows = [
    ['Hotel', parseFloat(costs.hotel) || 0],
    ['Food', parseFloat(costs.food) || 0],
    ['Other travel cost', parseFloat(costs.fuel) || 0],
    ['Extra parts cost', calc.partsCost || 0],
    ['Shipping', parseFloat(costs.shipping) || 0],
    ['Second person', parseFloat(costs.secondPerson) || 0],
    ['Other', parseFloat(costs.other) || 0],
    [`Mileage allowance @ ${calc.mileageRatePence}p`, calc.mileageCost || 0],
    ['Sticker total', calc.stickerCost || 0],
  ];

  return `
    <div class="kirkstone-job-summary-inner">
      <h3>Job Sheet Summary</h3>
      <div class="kirkstone-summary-metrics">
        <div><span>Total</span><strong>${formatCurrency(calc.actualRevenue)}</strong></div>
        <div><span>VAT (20%)</span><strong>${formatCurrency(vat)}</strong></div>
        <div><span>Total + VAT</span><strong>${formatCurrency(totalWithVat)}</strong></div>
        <div><span>Number of days</span><strong>${calc.actualDays}</strong></div>
      </div>

      <div class="kirkstone-summary-costs">
        <h4>Costs</h4>
        ${costRows.map(([label, amount]) => `
          <div class="kirkstone-summary-row"><span>${escapeHtml(label)}</span><strong>${formatCurrency(amount)}</strong></div>
        `).join('')}
        <div class="kirkstone-summary-row kirkstone-summary-total"><span>Total cost</span><strong>${formatCurrency(calc.totalCosts)}</strong></div>
      </div>

      <div class="kirkstone-summary-metrics kirkstone-summary-profit-metrics">
        <div><span>Profit</span><strong>${formatCurrency(calc.profit)}</strong></div>
        <div><span>Tax (40% of profit)</span><strong>${formatCurrency(calc.taxAt40)}</strong></div>
        <div><span>Post-tax profit</span><strong>${formatCurrency(calc.profitAfterTax)}</strong></div>
        <div><span>Profit per day</span><strong>${formatCurrency(calc.profitPerDay)}</strong></div>
        <div><span>Pension (7% of profit)</span><strong>${formatCurrency(pension)}</strong></div>
      </div>
    </div>`;
}

function toggleKirkstoneJobSummary(jobId) {
  const job = typeof currentJobs !== 'undefined' ? currentJobs.find(item => item.id === jobId) : null;
  if (!job) return;

  const calc = calculateJobSheet(job);
  const costs = job.costs || {};
  const vat = calc.actualRevenue * 0.20;
  const totalWithVat = calc.actualRevenue + vat;
  const pension = Math.max(calc.profit, 0) * 0.07;
  const ref = job.quoteRef || buildRefCode(job.quoteSnapshot?.refPrefix, job.quoteSnapshot?.refNumber, true) || '';
  const titleCustomer = job.customerName || 'Job';
  const costRows = [
    ['Hotel', parseFloat(costs.hotel) || 0],
    ['Food', parseFloat(costs.food) || 0],
    ['Other travel cost', parseFloat(costs.fuel) || 0],
    ['Extra parts cost', calc.partsCost || 0],
    ['Shipping', parseFloat(costs.shipping) || 0],
    ['Second person', parseFloat(costs.secondPerson) || 0],
    ['Other', parseFloat(costs.other) || 0],
    [`Mileage allowance @ ${calc.mileageRatePence}p`, calc.mileageCost || 0],
    ['Sticker total', calc.stickerCost || 0],
  ];

  const summaryWindow = window.open('', '_blank');
  if (!summaryWindow) {
    if (typeof showToast === 'function') showToast('Please allow pop-ups to open the Job Sheet Summary');
    return;
  }

  const summaryHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Job Sheet Summary - ${escapeHtml(titleCustomer)}${ref ? ` - ${escapeHtml(ref)}` : ''}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f3f6fa; color: #1f2937; font-family: Arial, Helvetica, sans-serif; }
    .page { width: min(900px, calc(100% - 32px)); margin: 28px auto; background: #fff; padding: 34px 40px; border-radius: 12px; box-shadow: 0 8px 28px rgba(15, 23, 42, 0.10); }
    .header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; padding-bottom: 18px; border-bottom: 2px solid #dbe3ee; }
    .header h1 { margin: 0 0 4px; font-size: 26px; }
    .header .subtitle { color: #64748b; font-size: 14px; }
    .job-meta { text-align: right; font-size: 13px; line-height: 1.6; color: #475569; }
    .job-meta strong { color: #1f2937; }
    h2 { font-size: 17px; margin: 26px 0 10px; }
    .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
    .metric { border: 1px solid #dbe3ee; border-radius: 8px; padding: 13px; }
    .metric span { display: block; color: #64748b; font-size: 12px; font-weight: 700; margin-bottom: 5px; }
    .metric strong { font-size: 18px; }
    .costs { border: 1px solid #dbe3ee; border-radius: 8px; padding: 8px 16px; }
    .row { display: flex; justify-content: space-between; gap: 20px; padding: 9px 0; border-bottom: 1px solid #edf2f7; }
    .row:last-child { border-bottom: 0; }
    .row.total { margin-top: 4px; padding-top: 12px; border-top: 2px solid #cbd5e1; font-size: 16px; }
    .profit-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .profit-grid .metric { min-height: 76px; }
    .actions { display: flex; gap: 10px; margin-top: 28px; padding-top: 18px; border-top: 1px solid #e2e8f0; }
    button { border: 0; border-radius: 7px; padding: 10px 16px; cursor: pointer; font-size: 14px; font-weight: 700; }
    .print { background: #1f4f7a; color: white; }
    .close { background: #e8edf3; color: #25364a; }
    @media (max-width: 700px) { .metrics, .profit-grid { grid-template-columns: 1fr 1fr; } .header { flex-direction: column; } .job-meta { text-align: left; } }
    @media print {
      @page { size: A4; margin: 14mm; }
      body { background: #fff; }
      .page { width: 100%; margin: 0; padding: 0; box-shadow: none; border-radius: 0; }
      .actions { display: none; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div>
        <h1>Kirkstone Calibration</h1>
        <div class="subtitle">Job Sheet Summary</div>
      </div>
      <div class="job-meta">
        <div><strong>${escapeHtml(titleCustomer)}</strong></div>
        ${ref ? `<div>Reference: ${escapeHtml(ref)}</div>` : ''}
        ${job.poNumber ? `<div>PO: ${escapeHtml(job.poNumber)}</div>` : ''}
        ${job.invoiceNumber ? `<div>Invoice: ${escapeHtml(job.invoiceNumber)}</div>` : ''}
      </div>
    </div>

    <h2>Revenue</h2>
    <div class="metrics">
      <div class="metric"><span>Total</span><strong>${formatCurrency(calc.actualRevenue)}</strong></div>
      <div class="metric"><span>VAT (20%)</span><strong>${formatCurrency(vat)}</strong></div>
      <div class="metric"><span>Total + VAT</span><strong>${formatCurrency(totalWithVat)}</strong></div>
      <div class="metric"><span>Number of days</span><strong>${calc.actualDays}</strong></div>
    </div>

    <h2>Costs</h2>
    <div class="costs">
      ${costRows.map(([label, amount]) => `<div class="row"><span>${escapeHtml(label)}</span><strong>${formatCurrency(amount)}</strong></div>`).join('')}
      <div class="row total"><span><strong>Total cost</strong></span><strong>${formatCurrency(calc.totalCosts)}</strong></div>
    </div>

    <h2>Profit & deductions</h2>
    <div class="profit-grid">
      <div class="metric"><span>Profit</span><strong>${formatCurrency(calc.profit)}</strong></div>
      <div class="metric"><span>Tax (40% of profit)</span><strong>${formatCurrency(calc.taxAt40)}</strong></div>
      <div class="metric"><span>Post-tax profit</span><strong>${formatCurrency(calc.profitAfterTax)}</strong></div>
      <div class="metric"><span>Profit per day</span><strong>${formatCurrency(calc.profitPerDay)}</strong></div>
      <div class="metric"><span>Pension (7% of profit)</span><strong>${formatCurrency(pension)}</strong></div>
      <div class="metric"><span>Days worked</span><strong>${calc.actualDays}</strong></div>
    </div>

    <div class="actions">
      <button class="print" onclick="window.print()">Print / Save as PDF</button>
      <button class="close" onclick="window.close()">Close</button>
    </div>
  </div>
</body>
</html>`;

  summaryWindow.document.open();
  summaryWindow.document.write(summaryHtml);
  summaryWindow.document.close();
  summaryWindow.focus();
}

function installKirkstoneJobSummaryButtons() {
  document.querySelectorAll('#jobSheets .job-card').forEach(card => {
    const jobId = card.dataset.id;
    const actions = card.querySelector('.history-actions');
    if (!jobId || !actions) return;

    if (!card.querySelector('.kirkstone-job-summary-panel')) {
      const panel = document.createElement('div');
      panel.id = `job-summary-${jobId}`;
      panel.className = 'kirkstone-job-summary-panel';
      panel.style.display = 'none';
      card.insertBefore(panel, actions);
    }

    if (!actions.querySelector('[data-job-summary-id]')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn-small btn-quote';
      button.textContent = 'Job Sheet Summary';
      button.dataset.jobSummaryId = jobId;
      button.addEventListener('click', () => toggleKirkstoneJobSummary(jobId));
      actions.insertBefore(button, actions.firstChild);
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // Restore the top-level tab after app.js has applied its default New Quote state.
  restoreKirkstoneTab(savedKirkstoneUiState.activeTab || 'quotePanel');

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      saveKirkstoneUiState(btn.dataset.tab, btn.dataset.tab === 'jobsPanel' ? savedKirkstoneUiState.lastViewedJobId : null);
      if (btn.dataset.tab === 'settingsPanel' && typeof currentSettings !== 'undefined' && currentSettings) {
        populateSettingsForm(currentSettings);
        wireServiceLevelRemoveButtons();
        if (typeof wirePartsCatalogRemoveButtons === 'function') wirePartsCatalogRemoveButtons();
      }
      if (btn.dataset.tab === 'quotePanel') refreshKirkstoneServiceDropdowns();
    });
  });

  // Firebase loads after the quote form is first rendered. Watch for it to finish,
  // then refresh the dropdowns and, if necessary, recover the full service-level list
  // from the richest saved quote snapshot.
  const cloudStatus = document.getElementById('cloudStatus');
  let repairedAfterCloudLoad = false;
  const afterCloudLoad = async () => {
    if (repairedAfterCloudLoad || !cloudStatus || !cloudStatus.classList.contains('cloud-status-ready')) return;
    repairedAfterCloudLoad = true;
    await recoverKirkstoneServiceLevels();
    refreshKirkstoneServiceDropdowns();
  };
  if (cloudStatus) {
    const cloudObserver = new MutationObserver(afterCloudLoad);
    cloudObserver.observe(cloudStatus, { childList: true, attributes: true, subtree: true });
    afterCloudLoad();
    setTimeout(() => cloudObserver.disconnect(), 20000);
  }

  // Keep the Cost and Price inputs aligned with the other fields while retaining labels above them.
  const alignmentStyle = document.createElement('style');
  alignmentStyle.textContent = `
    .job-part-money-field {
      position: relative;
      display: block;
    }
    .job-part-money-field > span {
      position: absolute;
      left: 0;
      bottom: calc(100% + 0.2rem);
      width: 100%;
      color: #475569;
      font-size: 0.72rem;
      font-weight: 600;
      line-height: 1;
      text-align: left;
    }
    .kirkstone-job-summary-panel {
      margin: 1rem 0;
      padding: 1rem;
      border: 1px solid #dbe3ee;
      border-radius: 10px;
      background: #f8fafc;
    }
    .kirkstone-job-summary-inner h3,
    .kirkstone-job-summary-inner h4 {
      margin-top: 0;
    }
    .kirkstone-summary-metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 0.75rem;
      margin-bottom: 1rem;
    }
    .kirkstone-summary-metrics > div {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      padding: 0.75rem;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: #fff;
    }
    .kirkstone-summary-metrics span {
      color: #64748b;
      font-size: 0.8rem;
      font-weight: 600;
    }
    .kirkstone-summary-metrics strong {
      font-size: 1.05rem;
    }
    .kirkstone-summary-costs {
      margin: 1rem 0;
      padding: 0.75rem;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: #fff;
    }
    .kirkstone-summary-row {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.35rem 0;
      border-bottom: 1px solid #edf2f7;
    }
    .kirkstone-summary-row:last-child {
      border-bottom: 0;
    }
    .kirkstone-summary-total {
      margin-top: 0.35rem;
      padding-top: 0.65rem;
      border-top: 2px solid #cbd5e1;
      border-bottom: 0;
      font-size: 1.05rem;
    }
    .kirkstone-summary-profit-metrics {
      margin-top: 1rem;
      margin-bottom: 0;
    }
  `;
  document.head.appendChild(alignmentStyle);

  // If a particular job sheet was open, return to it once the Firebase job list has rendered.
  let restoredJobPosition = false;
  const restoreJobPosition = () => {
    if (restoredJobPosition || savedKirkstoneUiState.activeTab !== 'jobsPanel' || !savedKirkstoneUiState.lastViewedJobId) return;
    const card = document.getElementById(`job-card-${savedKirkstoneUiState.lastViewedJobId}`);
    if (!card) return;
    restoredJobPosition = true;
    card.scrollIntoView({ behavior: 'auto', block: 'start' });
  };

  restoreJobPosition();
  const jobsContainer = document.getElementById('jobSheets');
  if (jobsContainer) {
    const observer = new MutationObserver(() => {
      restoreJobPosition();
      installKirkstoneJobSummaryButtons();
    });
    observer.observe(jobsContainer, { childList: true, subtree: true });
    installKirkstoneJobSummaryButtons();
    setTimeout(() => observer.disconnect(), 30000);
  }
});
