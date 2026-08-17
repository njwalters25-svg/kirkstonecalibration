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

document.addEventListener('DOMContentLoaded', () => {
  // Restore the top-level tab after app.js has applied its default New Quote state.
  restoreKirkstoneTab(savedKirkstoneUiState.activeTab || 'quotePanel');

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      saveKirkstoneUiState(btn.dataset.tab, btn.dataset.tab === 'jobsPanel' ? savedKirkstoneUiState.lastViewedJobId : null);
    });
  });

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
