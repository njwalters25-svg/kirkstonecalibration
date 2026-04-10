// ============================================================
// app.js — Bootstrap, event wiring, tab switching
// ============================================================

let currentSettings;

document.addEventListener('DOMContentLoaded', () => {
  currentSettings = StorageManager.loadSettings();
  populateSettingsForm(currentSettings);
  populateServiceLevelDropdown(currentSettings);
  restoreFormState();
  recalculate();
  renderQuoteHistory(StorageManager.loadQuoteHistory());

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });

  // Live recalculation on any form change
  document.getElementById('quoteForm').addEventListener('input', () => {
    recalculate();
    autoSaveForm();
  });
  document.getElementById('quoteForm').addEventListener('change', () => {
    recalculate();
    autoSaveForm();
  });

  // Auto-estimate calibration time button
  document.getElementById('autoEstimate').addEventListener('click', () => {
    const input = collectQuoteInputFromForm();
    const result = calculateQuote(input, currentSettings);
    document.getElementById('calibrationTime').value = result.estimatedCalMinutes;
    recalculate();
  });

  // London checkbox — suggest overnight & day-before travel
  document.getElementById('isLondon').addEventListener('change', (e) => {
    document.getElementById('londonNote').style.display = e.target.checked ? 'block' : 'none';
  });

  // Overnight toggle — show/hide hotel fields
  document.getElementById('overnightStay').addEventListener('change', (e) => {
    document.getElementById('hotelFields').style.display = e.target.checked ? 'block' : 'none';
  });

  // Custom discount toggle
  document.querySelectorAll('input[name="discountType"]').forEach(r => {
    r.addEventListener('change', () => {
      document.getElementById('customDiscountField').style.display =
        document.getElementById('discountCustom').checked ? 'block' : 'none';
    });
  });

  // --- Service levels editor: Add / Remove ---
  document.getElementById('addServiceLevel').addEventListener('click', () => {
    const levels = collectServiceLevelsFromEditor();
    levels.push({
      id: 'new_' + Date.now(),
      name: 'New level',
      readings: 2,
      volumes: 2,
      chargeSingleChannel: 25,
      chargeMultiChannel8: 45,
      chargeMultiChannel12: 55,
      chargeMultiChannel16: 65,
      minutesPerSingleChannel: 15,
      minutesPerMultiChannel: 25,
    });
    currentSettings.serviceLevels = levels;
    renderServiceLevelsEditor(currentSettings);
    wireServiceLevelRemoveButtons();
  });

  wireServiceLevelRemoveButtons();

  // Settings save
  document.getElementById('saveSettings').addEventListener('click', () => {
    currentSettings = collectSettingsFromForm();
    StorageManager.saveSettings(currentSettings);
    populateServiceLevelDropdown(currentSettings);
    recalculate();
    showToast('Settings saved');
  });

  // Settings reset
  document.getElementById('resetSettings').addEventListener('click', () => {
    if (confirm('Reset all settings to defaults?')) {
      currentSettings = StorageManager.resetSettings();
      populateSettingsForm(currentSettings);
      populateServiceLevelDropdown(currentSettings);
      wireServiceLevelRemoveButtons();
      recalculate();
      showToast('Settings reset to defaults');
    }
  });

  // Save quote
  document.getElementById('saveQuote').addEventListener('click', () => {
    const input = collectQuoteInputFromForm();
    const result = calculateQuote(input, currentSettings);
    const saved = {
      ...input,
      serviceLevelName: result.serviceLevelName,
      totalPipettes: result.totalPipettes,
      totalQuotePrice: result.totalQuotePrice,
      totalInternalCost: result.totalInternalCost,
      profitAmount: result.profitAmount,
      profitMarginPercent: result.profitMarginPercent,
    };
    StorageManager.saveQuote(saved);
    renderQuoteHistory(StorageManager.loadQuoteHistory());
    showToast('Quote saved');
  });

  // Print
  document.getElementById('printQuote').addEventListener('click', () => {
    window.print();
  });

  // Clear form
  document.getElementById('clearForm').addEventListener('click', () => {
    document.getElementById('quoteForm').reset();
    document.getElementById('hotelFields').style.display = 'none';
    document.getElementById('londonNote').style.display = 'none';
    document.getElementById('customDiscountField').style.display = 'none';
    StorageManager.clearFormState();
    recalculate();
  });
});

function wireServiceLevelRemoveButtons() {
  document.querySelectorAll('.sl-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const levels = collectServiceLevelsFromEditor();
      if (levels.length <= 1) return;
      const idx = parseInt(btn.dataset.index);
      levels.splice(idx, 1);
      currentSettings.serviceLevels = levels;
      renderServiceLevelsEditor(currentSettings);
      wireServiceLevelRemoveButtons();
    });
  });
}

function recalculate() {
  const input = collectQuoteInputFromForm();
  const result = calculateQuote(input, currentSettings);
  renderQuoteSummary(result);
}

function autoSaveForm() {
  const input = collectQuoteInputFromForm();
  StorageManager.saveFormState(input);
}

function restoreFormState() {
  const saved = StorageManager.loadFormState();
  if (!saved) return;

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el && val !== undefined && val !== null) el.value = val;
  };
  const setChecked = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.checked = !!val;
  };

  setVal('customerName', saved.customerName);
  setVal('serviceLevelId', saved.serviceLevelId);
  setVal('singleChannelCount', saved.singleChannelCount);
  setVal('multiChannel8Count', saved.multiChannel8Count);
  setVal('multiChannel12Count', saved.multiChannel12Count);
  setVal('multiChannel16Count', saved.multiChannel16Count);
  setVal('travelDistance', saved.travelDistanceMiles);
  setVal('travelTime', saved.travelTimeMinutes);
  setChecked('travelDayBefore', saved.travelDayBefore);
  setChecked('isLondon', saved.isLondon);
  setChecked('overnightStay', saved.overnightStay);
  setVal('hotelCost', saved.hotelCost);
  setVal('nights', saved.nights);
  setVal('calibrationTime', saved.calibrationTimeMinutes);
  setVal('customDiscount', saved.customDiscountPercent);
  setVal('quoteNotes', saved.notes);

  if (saved.discountType) {
    const radio = document.querySelector(`input[name="discountType"][value="${saved.discountType}"]`);
    if (radio) radio.checked = true;
  }

  // Show/hide conditional fields
  if (saved.overnightStay) document.getElementById('hotelFields').style.display = 'block';
  if (saved.isLondon) document.getElementById('londonNote').style.display = 'block';
  if (saved.discountType === 'custom') document.getElementById('customDiscountField').style.display = 'block';
}

function deleteQuote(id) {
  if (confirm('Delete this saved quote?')) {
    StorageManager.deleteQuote(id);
    renderQuoteHistory(StorageManager.loadQuoteHistory());
    showToast('Quote deleted');
  }
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}
