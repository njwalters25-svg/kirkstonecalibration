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
  const panel = document.getElementById(`job-summary-${jobId}`);
  const button = document.querySelector(`button[data-job-summary-id="${jobId}"]`);
  const job = typeof currentJobs !== 'undefined' ? currentJobs.find(item => item.id === jobId) : null;
  if (!panel || !job) return;

  const opening = panel.style.display === 'none' || !panel.style.display;
  if (opening) {
    panel.innerHTML = renderKirkstoneJobSummary(job);
    panel.style.display = 'block';
    if (button) button.textContent = 'Close Job Sheet Summary';
  } else {
    panel.style.display = 'none';
    if (button) button.textContent = 'Job Sheet Summary';
  }
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
