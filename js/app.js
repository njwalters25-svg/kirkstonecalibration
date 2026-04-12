// ============================================================
// app.js — Bootstrap, event wiring, tab switching
// ============================================================

let currentSettings;
let isSignedIn = false;
let currentQuotes = [];

document.addEventListener('DOMContentLoaded', () => {
  currentSettings = StorageManager.loadSettings();
  populateSettingsForm(currentSettings);

  // Initialise with one pipette line
  renderPipetteLines([getDefaultPipetteLine(currentSettings)], currentSettings);
  wirePipetteLineEvents();

  restoreFormState();
  recalculate();
  currentQuotes = StorageManager.loadQuoteHistory();
  renderQuoteHistory(currentQuotes, currentSettings);

  // --- Auth UI ---
  document.getElementById('signInBtn').addEventListener('click', async () => {
    try {
      await signInWithGoogle();
    } catch (err) {
      showToast('Sign in failed: ' + err.message);
    }
  });

  document.getElementById('signOutBtn').addEventListener('click', async () => {
    await signOut();
  });

  // Lock screen sign-in button
  document.getElementById('lockSignInBtn').addEventListener('click', async () => {
    const lockError = document.getElementById('lockError');
    lockError.style.display = 'none';
    try {
      await signInWithGoogle();
    } catch (err) {
      lockError.textContent = 'Sign in failed: ' + err.message;
      lockError.style.display = 'block';
    }
  });

  // Auth state listener — controls lock screen
  onAuthStateChanged(async (user) => {
    const lockScreen = document.getElementById('lockScreen');
    const appHeader = document.getElementById('appHeader');
    const appMain = document.getElementById('appMain');
    const signInBtn = document.getElementById('signInBtn');
    const userInfo = document.getElementById('userInfo');
    const userName = document.getElementById('userName');
    const lockError = document.getElementById('lockError');

    if (user) {
      // Check if user is allowed
      if (!(await isUserAllowed(user))) {
        await signOut();
        lockError.textContent = 'Access denied — your email is not authorised.';
        lockError.style.display = 'block';
        return;
      }

      isSignedIn = true;

      // Show app, hide lock screen
      lockScreen.style.display = 'none';
      appHeader.style.display = 'flex';
      appMain.style.display = 'block';

      signInBtn.style.display = 'none';
      userInfo.style.display = 'flex';
      userName.textContent = user.displayName || user.email;

      // Load settings from Firestore
      const cloudSettings = await loadSettingsFromFirestore();
      if (cloudSettings) {
        currentSettings = { ...DEFAULT_SETTINGS, ...cloudSettings };
        if (cloudSettings.serviceLevels) currentSettings.serviceLevels = cloudSettings.serviceLevels;
        populateSettingsForm(currentSettings);
      }

      // Load quotes from Firestore
      await refreshQuoteHistory();
      recalculate();
    } else {
      isSignedIn = false;

      // Show lock screen, hide app
      lockScreen.style.display = 'flex';
      appHeader.style.display = 'none';
      appMain.style.display = 'none';

      signInBtn.style.display = 'block';
      userInfo.style.display = 'none';
      userName.textContent = '';
    }
  });

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

  // Calculate hotel → work route
  document.getElementById('calcHotelRoute').addEventListener('click', async () => {
    const hotelPC = document.getElementById('hotelPostcode').value.trim();
    const destPC = document.getElementById('destinationPostcode').value.trim();
    const statusEl = document.getElementById('hotelRouteStatus');

    if (!hotelPC) {
      statusEl.textContent = 'Please enter a hotel postcode.';
      statusEl.className = 'route-status route-error';
      return;
    }
    if (!destPC) {
      statusEl.textContent = 'Please enter a destination postcode first (in the Travel section).';
      statusEl.className = 'route-status route-error';
      return;
    }

    statusEl.textContent = 'Calculating route...';
    statusEl.className = 'route-status route-loading';

    try {
      const route = await calculateRoute(hotelPC, destPC);
      document.getElementById('hotelToWorkDistance').value = route.distanceMiles;
      document.getElementById('hotelToWorkTime').value = route.durationMinutes;
      statusEl.textContent = `${route.from} → ${route.to}: ${route.distanceMiles} miles, ~${route.durationMinutes} mins`;
      statusEl.className = 'route-status route-success';
      recalculate();
      autoSaveForm();
    } catch (err) {
      statusEl.textContent = err.message;
      statusEl.className = 'route-status route-error';
    }
  });

  // New job checkbox
  document.getElementById('newJob').addEventListener('change', (e) => {
    document.getElementById('newJobNote').style.display = e.target.checked ? 'block' : 'none';
  });

  // Travel day before / second person — reset nights auto-fill when these change
  document.getElementById('travelDayBefore').addEventListener('change', () => {

  });
  document.getElementById('secondPerson').addEventListener('change', () => {

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
      chargeMultiChannel6: 40,
      chargeMultiChannel8: 45,
      chargeMultiChannel12: 55,
      chargeMultiChannel16: 65,
      minutesPerSingleChannel: 15,
      minutesPerMultiChannel6: 22,
      minutesPerMultiChannel8: 25,
      minutesPerMultiChannel12: 30,
      minutesPerMultiChannel16: 35,
    });
    currentSettings.serviceLevels = levels;
    renderServiceLevelsEditor(currentSettings);
    wireServiceLevelRemoveButtons();
  });

  wireServiceLevelRemoveButtons();

  // Settings save
  document.getElementById('saveSettings').addEventListener('click', async () => {
    currentSettings = collectSettingsFromForm();
    StorageManager.saveSettings(currentSettings);
    if (isSignedIn) await saveSettingsToFirestore(currentSettings);
    // Re-render pipette lines to update service level dropdowns
    const currentLines = collectPipetteLinesFromForm();
    renderPipetteLines(currentLines, currentSettings);
    wirePipetteLineEvents();
    recalculate();
    showToast('Settings saved');
  });

  // Settings reset
  document.getElementById('resetSettings').addEventListener('click', async () => {
    if (confirm('Reset all settings to defaults?')) {
      currentSettings = StorageManager.resetSettings();
      if (isSignedIn) await saveSettingsToFirestore(currentSettings);
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
  document.getElementById('saveQuote').addEventListener('click', async () => {
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
    if (isSignedIn) await saveQuoteToFirestore(saved);
    await refreshQuoteHistory();
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
    document.getElementById('newJobNote').style.display = 'none';
    document.getElementById('customDiscountField').style.display = 'none';
    renderPipetteLines([getDefaultPipetteLine(currentSettings)], currentSettings);
    wirePipetteLineEvents();
    StorageManager.clearFormState();

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

function recalculate() {
  const input = collectQuoteInputFromForm();
  const result = calculateQuote(input, currentSettings);

  // Always update nights field to match suggestion
  const nightsEl = document.getElementById('nights');
  if (result.suggestedNights > 0 && input.overnightStay) {
    nightsEl.value = result.suggestedNights;
  }

  // Re-collect and recalculate with the updated nights value
  const finalInput = collectQuoteInputFromForm();
  const finalResult = calculateQuote(finalInput, currentSettings);
  renderQuoteSummary(finalResult);

  // Show overnight suggestion hint if not already ticked
  const hint = document.getElementById('overnightHint');
  if (finalResult.overnightSuggested && !finalInput.overnightStay) {
    hint.textContent = `Travel is ${finalResult.timePlan.travelOutMins} mins one way — overnight stay recommended (${finalResult.suggestedNights} night${finalResult.suggestedNights !== 1 ? 's' : ''})`;
    hint.style.display = 'block';
  } else {
    hint.style.display = 'none';
  }

  // Second person note
  const spNote = document.getElementById('secondPersonNote');
  if (finalResult.secondPerson && finalResult.secondPersonDays > 0) {
    spNote.textContent = `2nd person: ${finalResult.secondPersonDays} day${finalResult.secondPersonDays !== 1 ? 's' : ''} on site (${formatCurrency(finalResult.costSecondPerson)}). Calibration time reduced by ${finalResult.timeReductionPercent}%.`;
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
  setVal('hotelPostcode', saved.hotelPostcode);
  setVal('hotelToWorkDistance', saved.hotelToWorkDistanceMiles);
  setVal('hotelToWorkTime', saved.hotelToWorkMinutes);
  setVal('calibrationTime', saved.calibrationTimeMinutes);
  setChecked('newJob', saved.newJob);
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
  if (saved.newJob) document.getElementById('newJobNote').style.display = 'block';
  if (saved.discountType === 'custom') document.getElementById('customDiscountField').style.display = 'block';
}

async function refreshQuoteHistory() {
  if (isSignedIn) {
    currentQuotes = await loadQuotesFromFirestore();
  } else {
    currentQuotes = StorageManager.loadQuoteHistory();
  }
  renderQuoteHistory(currentQuotes, currentSettings);
}

async function deleteQuote(id) {
  if (confirm('Delete this saved quote?')) {
    StorageManager.deleteQuote(id);
    if (isSignedIn) await deleteQuoteFromFirestore(id);
    await refreshQuoteHistory();
    showToast('Quote deleted');
  }
}

function toggleQuoteDetail(id) {
  const summaryEl = document.getElementById('history-summary-' + id);
  if (!summaryEl) return;

  if (summaryEl.style.display === 'none') {
    // Show: recalculate and render the full summary
    const q = currentQuotes.find(quote => quote.id === id);
    if (!q) return;
    const result = calculateQuote(q, currentSettings);
    const contentEl = summaryEl.querySelector('.history-summary-content');
    // Reuse the same summary renderer
    const tempDiv = document.createElement('div');
    tempDiv.id = 'quoteSummary';
    renderQuoteSummary.call(null, result, tempDiv);
    contentEl.innerHTML = tempDiv.innerHTML || '';
    // Manually render if renderQuoteSummary uses getElementById
    const profitClass = getProfitClass(result.profitMarginPercent);
    const lineRows = result.lineResults.map(lr => {
      const rows = [];
      if (lr.singleCount > 0) rows.push(`<div class="summary-row"><span>Single-ch ×${lr.singleCount}</span><span>${formatCurrency(lr.chargeSingle)}</span></div>`);
      if (lr.multi6Count > 0) rows.push(`<div class="summary-row"><span>Multi 6-ch ×${lr.multi6Count}</span><span>${formatCurrency(lr.chargeMulti6)}</span></div>`);
      if (lr.multi8Count > 0) rows.push(`<div class="summary-row"><span>Multi 8-ch ×${lr.multi8Count}</span><span>${formatCurrency(lr.chargeMulti8)}</span></div>`);
      if (lr.multi12Count > 0) rows.push(`<div class="summary-row"><span>Multi 12-ch ×${lr.multi12Count}</span><span>${formatCurrency(lr.chargeMulti12)}</span></div>`);
      if (lr.multi16Count > 0) rows.push(`<div class="summary-row"><span>Multi 16-ch ×${lr.multi16Count}</span><span>${formatCurrency(lr.chargeMulti16)}</span></div>`);
      if (rows.length === 0) return '';
      return `<div class="line-result"><div class="service-level-badge">${lr.serviceLevelName}</div>${rows.join('')}<div class="summary-row subtotal"><span>Line subtotal</span><span>${formatCurrency(lr.chargeTotal)}</span></div></div>`;
    }).filter(Boolean).join('');

    contentEl.innerHTML = `
      <div class="summary-section">
        <h3>Revenue</h3>
        ${lineRows}
        <div class="summary-row subtotal"><span>All pipettes</span><span>${formatCurrency(result.pipetteChargesTotal)}</span></div>
        ${result.travelCharge > 0 ? `<div class="summary-row"><span>Travel</span><span>${formatCurrency(result.travelCharge)}</span></div>` : ''}
        ${result.accommodationCharge > 0 ? `<div class="summary-row"><span>Accommodation</span><span>${formatCurrency(result.accommodationCharge)}</span></div>` : ''}
        ${result.londonPremium > 0 ? `<div class="summary-row premium"><span>London premium</span><span>+${formatCurrency(result.londonPremium)}</span></div>` : ''}
        ${result.discountAmount > 0 ? `<div class="summary-row discount"><span>Discount: ${result.discountLabel}</span><span>-${formatCurrency(result.discountAmount)}</span></div>` : ''}
        <div class="summary-row total"><span>QUOTE TOTAL</span><span>${formatCurrency(result.totalQuotePrice)}</span></div>
      </div>
      <div class="summary-section">
        <h3>Time Plan</h3>
        <div class="summary-row"><span>Travel (one way)</span><span>${formatTime(result.timePlan.travelOutMins)}</span></div>
        <div class="summary-row"><span>Calibration${result.secondPerson ? ' (with 2nd person)' : ''}</span><span>${formatTime(result.timePlan.jobMins)}</span></div>
        <div class="summary-row subtotal"><span>${result.timePlan.totalDays} day${result.timePlan.totalDays !== 1 ? 's' : ''}${result.suggestedNights > 0 ? `, ${result.suggestedNights} night${result.suggestedNights !== 1 ? 's' : ''}` : ''}</span><span>${formatTime(result.timePlan.totalMins)}</span></div>
      </div>
      <div class="summary-section">
        <h3>Internal Costs</h3>
        <div class="summary-row"><span>Pipettes</span><span>${formatCurrency(result.costPipettesTotal)}</span></div>
        <div class="summary-row"><span>Mileage (${result.totalTripMiles} mi${result.commuteTrips > 1 ? ` × ${result.commuteTrips} days` : ''})</span><span>${formatCurrency(result.costTravel)}</span></div>
        ${result.costAccommodation > 0 ? `<div class="summary-row"><span>Accommodation</span><span>${formatCurrency(result.costAccommodation)}</span></div>` : ''}
        <div class="summary-row"><span>Labour — calibration</span><span>${formatCurrency(result.costLabourCalibration)}</span></div>
        <div class="summary-row"><span>Labour — travel</span><span>${formatCurrency(result.costLabourTravel)}</span></div>
        ${result.costSecondPerson > 0 ? `<div class="summary-row"><span>2nd person (${result.secondPersonDays} days)</span><span>${formatCurrency(result.costSecondPerson)}</span></div>` : ''}
        <div class="summary-row total"><span>TOTAL COST</span><span>${formatCurrency(result.totalInternalCost)}</span></div>
      </div>
      <div class="summary-section profit-section ${profitClass}">
        <div class="profit-amount">${formatCurrency(result.profitAmount)}</div>
        <div class="profit-margin">${formatPercent(result.profitMarginPercent)} margin</div>
      </div>
    `;
    summaryEl.style.display = 'block';
  } else {
    summaryEl.style.display = 'none';
  }
}

function loadQuote(id) {
  const q = currentQuotes.find(quote => quote.id === id);
  if (!q) return;

  // Load into form using restoreFormState logic
  const setVal = (elId, val) => {
    const el = document.getElementById(elId);
    if (el && val !== undefined && val !== null) el.value = val;
  };
  const setChecked = (elId, val) => {
    const el = document.getElementById(elId);
    if (el) el.checked = !!val;
  };

  setVal('customerName', q.customerName);
  setVal('destinationPostcode', q.destinationPostcode);
  setVal('travelDistance', q.travelDistanceMiles);
  setVal('travelTime', q.travelTimeMinutes);
  setChecked('travelDayBefore', q.travelDayBefore);
  setChecked('isLondon', q.isLondon);
  setChecked('overnightStay', q.overnightStay);
  setVal('hotelCost', q.hotelCost);
  setVal('nights', q.nights);
  setVal('hotelPostcode', q.hotelPostcode);
  setVal('hotelToWorkDistance', q.hotelToWorkDistanceMiles);
  setVal('hotelToWorkTime', q.hotelToWorkMinutes);
  setVal('calibrationTime', q.calibrationTimeMinutes);
  setChecked('newJob', q.newJob);
  setChecked('secondPerson', q.secondPerson);
  setVal('customDiscount', q.customDiscountPercent);
  setVal('quoteNotes', q.notes);

  if (q.pipetteLines && q.pipetteLines.length > 0) {
    renderPipetteLines(q.pipetteLines, currentSettings);
    wirePipetteLineEvents();
  }

  if (q.discountType) {
    const radio = document.querySelector(`input[name="discountType"][value="${q.discountType}"]`);
    if (radio) radio.checked = true;
  }

  document.getElementById('hotelFields').style.display = q.overnightStay ? 'block' : 'none';
  document.getElementById('londonNote').style.display = q.isLondon ? 'block' : 'none';
  document.getElementById('newJobNote').style.display = q.newJob ? 'block' : 'none';
  document.getElementById('customDiscountField').style.display = q.discountType === 'custom' ? 'block' : 'none';

  // Switch to quote tab
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelector('[data-tab="quotePanel"]').classList.add('active');
  document.getElementById('quotePanel').classList.add('active');

  recalculate();
  showToast('Quote loaded');
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}
