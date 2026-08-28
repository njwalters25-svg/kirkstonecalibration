// ============================================================
// live-quote-pricing.js — Edit a saved quote's pricing snapshot
// until a job sheet is created from it.
// ============================================================

(function () {
  function hasJobSheetForLoadedQuote() {
    if (typeof loadedQuoteId === 'undefined' || !loadedQuoteId) return false;
    return Array.isArray(currentJobs) && currentJobs.some(job => job.quoteId === loadedQuoteId);
  }

  function updateSettingsButtonState() {
    const saveBtn = document.getElementById('saveSettings');
    if (!saveBtn) return;

    if (typeof loadedQuoteId !== 'undefined' && loadedQuoteId) {
      const locked = hasJobSheetForLoadedQuote();
      saveBtn.textContent = locked ? 'Quote Prices Locked' : 'Save Prices to Live Quote';
      saveBtn.title = locked
        ? 'A job sheet has already been raised from this quote, so its pricing is locked.'
        : 'Save these prices to the currently loaded quote only. Global defaults are unchanged.';
      saveBtn.disabled = locked;
    } else {
      saveBtn.textContent = 'Save Settings';
      saveBtn.title = '';
      saveBtn.disabled = false;
    }
  }

  function showLoadedQuoteSettings() {
    if (typeof loadedQuoteId === 'undefined' || !loadedQuoteId) {
      updateSettingsButtonState();
      return;
    }

    const quote = Array.isArray(currentQuotes)
      ? currentQuotes.find(item => item.id === loadedQuoteId)
      : null;
    if (!quote) return;

    const settings = normaliseSettingsSnapshot(activeQuoteSettingsSnapshot)
      || getSettingsForQuote(quote)
      || currentSettings;

    activeQuoteSettingsSnapshot = createQuoteSettingsSnapshot(settings);
    populateSettingsForm(activeQuoteSettingsSnapshot);
    if (typeof wireServiceLevelRemoveButtons === 'function') wireServiceLevelRemoveButtons();
    if (typeof wirePartsCatalogRemoveButtons === 'function') wirePartsCatalogRemoveButtons();
    updateSettingsButtonState();
  }

  async function saveLoadedQuotePricing(event) {
    if (typeof loadedQuoteId === 'undefined' || !loadedQuoteId) return;

    // A job sheet is the lock point. Once it exists, the quote pricing that
    // fed that job must not be changed through the live-quote settings editor.
    if (hasJobSheetForLoadedQuote()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      updateSettingsButtonState();
      if (typeof showToast === 'function') showToast('Quote prices are locked — a job sheet has already been raised');
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    const original = currentQuotes.find(quote => quote.id === loadedQuoteId);
    if (!original) return;

    const quoteSettings = createQuoteSettingsSnapshot(collectSettingsFromForm());
    activeQuoteSettingsSnapshot = quoteSettings;

    // Rebuild the saved quote using the quote form plus the edited pricing
    // snapshot, so totals and the pricing snapshot stay in sync.
    const updated = {
      ...original,
      ...buildSavedQuoteFromForm(original.id, original.createdAt, quoteSettings),
      savedBy: original.savedBy,
    };

    try {
      StorageManager.updateQuote(updated);
      if (!isLocalPreviewMode) await updateQuoteInFirestore(updated);

      // Keep the in-memory quote immediately in sync, then refresh from the
      // normal persistence path so quote history and totals update as well.
      const index = currentQuotes.findIndex(quote => quote.id === updated.id);
      if (index >= 0) currentQuotes[index] = updated;
      await refreshQuoteHistory();

      activeQuoteSettingsSnapshot = createQuoteSettingsSnapshot(updated.settingsSnapshot);
      refreshQuoteFormServiceLevels(activeQuoteSettingsSnapshot);
      recalculate();
      autoSaveForm();
      updateSettingsButtonState();

      if (typeof showToast === 'function') showToast('Live quote prices updated');
    } catch (error) {
      console.error('Could not update live quote pricing', error);
      if (typeof setCloudStatus === 'function') {
        setCloudStatus('error', `Quote price update failed. ${getFirebaseErrorMessage(error)}`);
      }
      if (typeof showToast === 'function') showToast('Could not save the live quote prices');
    }
  }

  function install() {
    const saveBtn = document.getElementById('saveSettings');
    if (saveBtn) {
      // Capture phase lets this replace the app's normal global-settings save
      // only while a saved quote is loaded.
      saveBtn.addEventListener('click', saveLoadedQuotePricing, true);
    }

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.tab === 'settingsPanel') {
          // Run after the app's existing tab handler, which normally fills the
          // Settings screen with global defaults.
          setTimeout(showLoadedQuoteSettings, 0);
        }
      });
    });

    // Quote load and job creation both re-render state without emitting a
    // dedicated event, so observe lightweight UI changes and keep the button
    // label/lock state accurate.
    const jobsPanel = document.getElementById('jobsPanel');
    if (jobsPanel) {
      const observer = new MutationObserver(updateSettingsButtonState);
      observer.observe(jobsPanel, { childList: true, subtree: true });
    }

    updateSettingsButtonState();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install);
  } else {
    install();
  }
})();
