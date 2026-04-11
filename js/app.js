// ============================================================
// app.js — Bootstrap, event wiring, tab switching
// ============================================================

let currentSettings;

document.addEventListener('DOMContentLoaded', () => {
  currentSettings = StorageManager.loadSettings();
  populateSettingsForm(currentSettings);

  // Initialise with one pipette line
  renderPipetteLines([getDefaultPipetteLine(currentSettings)], currentSettings);
  wirePipetteLineEvents();

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

  // Add pipette line
  document.getElementById('addPipetteLine').addEventListener('click', () => {
    const current = collectPipetteLinesFromForm();
    current.push(getDefaultPipetteLine(currentSettings));
    renderPipetteLines(current, currentSettings);
    wirePipetteLineEvents();
    nightsManuallyEdited = false;
    recalculate();
    autoSaveForm();
  });

  // Auto-estimate calibration time button
  document.getElementById('autoEstimate').addEventListener('click', () => {
    const input = collectQuoteInputFromForm();
    const result = calculateQuote(input, currentSettings);
    document.getElementById('calibrationTime').value = result.estimatedCalMinutes;
    nightsManuallyEdited = false;
    recalculate();
  });

  // Calculate route from postcodes
  document.getElementById('calcRoute').addEventListener('click', async () => {
    const dest = document.getElementById('destinationPostcode').value.trim();
    const statusEl = document.getElementById('routeStatus');

    if (!dest) {
      statusEl.textContent = 'Please enter a destination postcode.';
      statusEl.className = 'route-status route-error';
      return;
    }

    const home = currentSettings.homePostcode || 'DE75 7UJ';
    statusEl.textContent = 'Calculating route...';
    statusEl.className = 'route-status route-loading';

    try {
      const route = await calculateRoute(home, dest);
      document.getElementById('travelDistance').value = route.distanceMiles;
      document.getElementById('travelTime').value = route.durationMinutes;
      statusEl.textContent = `${route.from} → ${route.to}: ${route.distanceMiles} miles, ~${route.durationMinutes} mins`;
      statusEl.className = 'route-status route-success';
      recalculate();
      autoSaveForm();
    } catch (err) {
      statusEl.textContent = err.message;
      statusEl.className = 'route-status route-error';
    }
  });

  // London checkbox
  document.getElementById('isLondon').addEventListener('change', (e) => {
    document.getElementById('londonNote').style.display = e.target.checked ? 'block' : 'none';
  });

  // Travel day before / second person — reset nights auto-fill when these change
  document.getElementById('travelDayBefore').addEventListener('change', () => {
    nightsManuallyEdited = false;
  });
  document.getElementById('secondPerson').addEventListener('change', () => {
    nightsManuallyEdited = false;
  });

  // Overnight toggle
  document.getElementById('overnightStay').addEventListener('change', (e) => {
    document.getElementById('hotelFields').style.display = e.target.checked ? 'block' : 'none';
    // Pre-fill hotel cost with budget default if empty
    if (e.target.checked) {
      const hotelCostEl = document.getElementById('hotelCost');
      if (!hotelCostEl.value || parseFloat(hotelCostEl.value) === 0) {
        hotelCostEl.value = currentSettings.hotelBudgetDefault;
      }
    }
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
    // Re-render pipette lines to update service level dropdowns
    const currentLines = collectPipetteLinesFromForm();
    renderPipetteLines(currentLines, currentSettings);
    wirePipetteLineEvents();
    recalculate();
    showToast('Settings saved');
  });

  // Settings reset
  document.getElementById('resetSettings').addEventListener('click', () => {
    if (confirm('Reset all settings to defaults?')) {
      currentSettings = StorageManager.resetSettings();
      populateSettingsForm(currentSettings);
      wireServiceLevelRemoveButtons();
      const currentLines = collectPipetteLinesFromForm();
      renderPipetteLines(currentLines, currentSettings);
      wirePipetteLineEvents();
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
    renderPipetteLines([getDefaultPipetteLine(currentSettings)], currentSettings);
    wirePipetteLineEvents();
    StorageManager.clearFormState();
    nightsManuallyEdited = false;
    recalculate();
  });
});

function wirePipetteLineEvents() {
  document.querySelectorAll('.pl-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const lines = collectPipetteLinesFromForm();
      if (lines.length <= 1) return;
      const idx = parseInt(btn.dataset.index);
      lines.splice(idx, 1);
      renderPipetteLines(lines, currentSettings);
      wirePipetteLineEvents();
      nightsManuallyEdited = false;
      recalculate();
      autoSaveForm();
    });
  });
}

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

let nightsManuallyEdited = false;

// Track when user directly edits the nights field
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('nights').addEventListener('input', () => {
    nightsManuallyEdited = true;
  });
});

function recalculate() {
  const input = collectQuoteInputFromForm();
  const result = calculateQuote(input, currentSettings);

  // Auto-fill nights unless user has manually edited the field
  const nightsEl = document.getElementById('nights');
  if (result.suggestedNights > 0 && !nightsManuallyEdited) {
    nightsEl.value = result.suggestedNights;
    // Re-collect and recalculate with updated nights
    const updatedInput = collectQuoteInputFromForm();
    const updatedResult = calculateQuote(updatedInput, currentSettings);
    renderQuoteSummary(updatedResult);
    Object.assign(result, updatedResult);
    Object.assign(input, updatedInput);
  } else {
    renderQuoteSummary(result);
  }

  // Show overnight suggestion hint if not already ticked
  const hint = document.getElementById('overnightHint');
  if (result.overnightSuggested && !input.overnightStay) {
    hint.textContent = `Travel is ${result.timePlan.travelOutMins} mins one way — overnight stay recommended (${result.suggestedNights} night${result.suggestedNights !== 1 ? 's' : ''})`;
    hint.style.display = 'block';
  } else {
    hint.style.display = 'none';
  }

  // Second person note
  const spNote = document.getElementById('secondPersonNote');
  if (result.secondPerson && result.secondPersonDays > 0) {
    spNote.textContent = `2nd person: ${result.secondPersonDays} day${result.secondPersonDays !== 1 ? 's' : ''} on site (${formatCurrency(result.costSecondPerson)}). Calibration time reduced by ${result.timeReductionPercent}%.`;
    spNote.style.display = 'block';
  } else {
    spNote.style.display = 'none';
  }
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
  setVal('destinationPostcode', saved.destinationPostcode);
  setVal('travelDistance', saved.travelDistanceMiles);
  setVal('travelTime', saved.travelTimeMinutes);
  setChecked('travelDayBefore', saved.travelDayBefore);
  setChecked('isLondon', saved.isLondon);
  setChecked('overnightStay', saved.overnightStay);
  setVal('hotelCost', saved.hotelCost);
  setVal('nights', saved.nights);
  setVal('calibrationTime', saved.calibrationTimeMinutes);
  setChecked('secondPerson', saved.secondPerson);
  setVal('customDiscount', saved.customDiscountPercent);
  setVal('quoteNotes', saved.notes);

  // Restore pipette lines
  if (saved.pipetteLines && saved.pipetteLines.length > 0) {
    renderPipetteLines(saved.pipetteLines, currentSettings);
    wirePipetteLineEvents();
  }

  if (saved.discountType) {
    const radio = document.querySelector(`input[name="discountType"][value="${saved.discountType}"]`);
    if (radio) radio.checked = true;
  }

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
