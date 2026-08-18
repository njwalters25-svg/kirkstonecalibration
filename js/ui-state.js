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

  // app.js currently calls collectSettingsFromForm(), which references settings controls
  // that are no longer present in index.html. Intercept the save before that broken
  // handler runs and save only the controls that actually exist, preserving all others.
  const saveSettingsButton = document.getElementById('saveSettings');
  if (saveSettingsButton) {
    saveSettingsButton.addEventListener('click', async event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      currentSettings = collectKirkstoneSettingsSafely();
      StorageManager.saveSettings(currentSettings);
      try {
        if (typeof isLocalPreviewMode === 'undefined' || !isLocalPreviewMode) {
          await saveSettingsToFirestore(currentSettings);
        }
        refreshKirkstoneServiceDropdowns();
        if (typeof recalculate === 'function') recalculate();
        if (typeof autoSaveForm === 'function') autoSaveForm();
        showToast('Settings saved');
      } catch (error) {
        console.error('Could not save settings to Firebase', error);
        showToast('Saved on this device, but cloud save failed');
      }
    }, true);
  }

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
    const observer = new MutationObserver(restoreJobPosition);
    observer.observe(jobsContainer, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 15000);
  }
});
