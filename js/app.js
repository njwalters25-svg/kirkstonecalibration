// ============================================================
// app.js — Bootstrap, event wiring, tab switching
// ============================================================

let currentSettings;
let isSignedIn = false;
let currentQuotes = [];
let currentCustomers = [];
let currentLogoDataUrl = null;

document.addEventListener('DOMContentLoaded', () => {
  currentSettings = StorageManager.loadSettings();
  populateSettingsForm(currentSettings);
  currentLogoDataUrl = StorageManager.loadLogo();
  if (currentLogoDataUrl) {
    showLogoPreview(currentLogoDataUrl);
  } else {
    // Try the committed asset as the default logo
    fetch('assets/logo.png').then(r => {
      if (!r.ok) return;
      return r.blob();
    }).then(blob => {
      if (!blob) return;
      const reader = new FileReader();
      reader.onload = e => {
        currentLogoDataUrl = e.target.result;
        showLogoPreview(currentLogoDataUrl);
      };
      reader.readAsDataURL(blob);
    }).catch(() => {});
  }

  // Initialise with one pipette line
  renderPipetteLines([getDefaultPipetteLine(currentSettings)], currentSettings);
  wirePipetteLineEvents();

  restoreFormState();
  recalculate();
  currentQuotes = StorageManager.loadQuoteHistory();
  renderQuoteHistory(currentQuotes, currentSettings);

  // Load customers from localStorage and wire autofill
  currentCustomers = StorageManager.loadCustomers();
  updateCustomerDatalist();

  document.getElementById('customerName').addEventListener('input', function () {
    const name = this.value.trim().toLowerCase();
    const match = currentCustomers.find(c => c.name.toLowerCase() === name);
    if (match) {
      document.getElementById('customerAddress').value = match.address || '';
    }
  });

  // Sign in anonymously to enable Firestore access
  signInAnonymously().then(async () => {
    isSignedIn = true;

    // Load settings from Firestore
    const cloudSettings = await loadSettingsFromFirestore();
    if (cloudSettings) {
      currentSettings = { ...DEFAULT_SETTINGS, ...cloudSettings };
      if (cloudSettings.serviceLevels) currentSettings.serviceLevels = cloudSettings.serviceLevels;
      populateSettingsForm(currentSettings);
    }

    // Load quotes from Firestore
    await refreshQuoteHistory();

    // Load customers from Firestore
    const cloudCustomers = await loadCustomersFromFirestore();
    if (cloudCustomers.length > 0) {
      currentCustomers = cloudCustomers;
      StorageManager.saveCustomers(currentCustomers);
    }
    updateCustomerDatalist();
    recalculate();
  }).catch(() => {
    // Firestore unavailable — app still works from localStorage
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

  // Return home mid-job checkbox
  document.getElementById('returnHome').addEventListener('change', (e) => {
    document.getElementById('returnHomeFields').style.display = e.target.checked ? 'block' : 'none';
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
    await upsertCustomer(input.customerName, input.customerAddress);
    await refreshQuoteHistory();
    showToast('Quote saved');
  });

  // Print
  document.getElementById('printQuote').addEventListener('click', () => {
    window.print();
  });

  // Generate customer quote
  document.getElementById('generateCustomerQuote').addEventListener('click', () => {
    const input = collectQuoteInputFromForm();
    const result = calculateQuote(input, currentSettings);
    generateCustomerQuoteWindow(result, input);
  });

  // Logo upload
  document.getElementById('logoUpload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      currentLogoDataUrl = evt.target.result;
      StorageManager.saveLogo(currentLogoDataUrl);
      showLogoPreview(currentLogoDataUrl);
      showToast('Logo saved');
    };
    reader.readAsDataURL(file);
  });

  // Clear form
  document.getElementById('clearForm').addEventListener('click', () => {
    document.getElementById('quoteForm').reset();
    document.getElementById('hotelFields').style.display = 'none';
    document.getElementById('returnHomeFields').style.display = 'none';
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
  setChecked('returnHome', saved.returnHome);
  setVal('returnHomeTrips', saved.returnHomeTrips);
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
  if (saved.returnHome) document.getElementById('returnHomeFields').style.display = 'block';
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
        ${result.costSubsistence > 0 ? `<div class="summary-row"><span>Subsistence (${result.subsistenceDays} days)</span><span>${formatCurrency(result.costSubsistence)}</span></div>` : ''}
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
  setChecked('returnHome', q.returnHome);
  setVal('returnHomeTrips', q.returnHomeTrips);
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
  document.getElementById('returnHomeFields').style.display = q.returnHome ? 'block' : 'none';
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

function updateCustomerDatalist() {
  const list = document.getElementById('customerList');
  if (!list) return;
  list.innerHTML = currentCustomers.map(c => `<option value="${c.name.replace(/"/g, '&quot;')}"></option>`).join('');
}

async function upsertCustomer(name, address) {
  if (!name) return;
  const existing = currentCustomers.find(c => c.name.toLowerCase() === name.toLowerCase());
  const customer = {
    id: existing ? existing.id : crypto.randomUUID(),
    name,
    address: address || (existing ? existing.address : ''),
    updatedAt: new Date().toISOString(),
  };
  currentCustomers = StorageManager.upsertCustomer(customer);
  updateCustomerDatalist();
  if (isSignedIn) await saveCustomerToFirestore(customer);
}

function showLogoPreview(dataUrl) {
  const preview = document.getElementById('logoPreview');
  if (!preview) return;
  if (dataUrl) {
    preview.innerHTML = `
      <img src="${dataUrl}" style="max-height:60px; max-width:200px; object-fit:contain; border:1px solid #e2e8f0; border-radius:4px; padding:4px; display:block;">
      <button type="button" id="clearLogoBtn" class="btn-link" style="margin-top:0.25rem; font-size:0.75rem; color:#9b2c2c;">Remove logo</button>`;
    document.getElementById('clearLogoBtn').addEventListener('click', () => {
      currentLogoDataUrl = null;
      StorageManager.clearLogo();
      const logoInput = document.getElementById('logoUpload');
      if (logoInput) logoInput.value = '';
      showLogoPreview(null);
      showToast('Logo removed');
    });
  } else {
    preview.innerHTML = '<span style="font-size:0.75rem; color:#718096;">No logo uploaded.</span>';
  }
}

function openCustomerQuoteFromHistory(id) {
  const q = currentQuotes.find(quote => quote.id === id);
  if (!q) return;
  const result = calculateQuote(q, currentSettings);
  generateCustomerQuoteWindow(result, q);
}

function generateCustomerQuoteWindow(result, input) {
  const settings = currentSettings;
  const logoDataUrl = currentLogoDataUrl;
  const esc = str => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const fmt = v => formatCurrency(v);

  const customerName = input.customerName || 'Customer';
  const customerAddrLines = (input.customerAddress || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => `<div>${esc(l)}</div>`).join('');
  const quoteRef = 'KC-' + (input.id || 'XXXXXXXX').slice(0, 8).toUpperCase();
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const validDays = settings.quoteValidDays || 30;
  const validUntil = new Date(now.getTime() + validDays * 24 * 60 * 60 * 1000);
  const validStr = validUntil.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const companyName = settings.companyName || 'Kirkstone Calibration';
  const logoHtml = logoDataUrl
    ? `<img src="${logoDataUrl}" alt="Logo" style="max-height:75px; max-width:220px; object-fit:contain; display:block; margin-bottom:0.4rem;">`
    : '';

  const addrLines = (settings.companyAddress || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => `<div>${esc(l)}</div>`).join('');
  const contactLines = [
    settings.companyPhone ? `Tel: ${esc(settings.companyPhone)}` : '',
    settings.companyEmail ? `Email: ${esc(settings.companyEmail)}` : '',
    settings.companyWebsite ? esc(settings.companyWebsite) : '',
    settings.vatNumber ? `VAT No: ${esc(settings.vatNumber)}` : '',
  ].filter(Boolean).map(l => `<div>${l}</div>`).join('');

  // Line item rows
  let itemRows = '';
  result.lineResults.forEach(lr => {
    const sl = esc(lr.serviceLevelName);
    const sub = `<small style="display:block;font-size:9pt;color:#718096;margin-top:2px;">${sl}</small>`;
    if (lr.singleCount > 0) {
      const u = fmt(lr.chargeSingle / lr.singleCount);
      itemRows += `<tr><td>Single-channel pipette calibration${sub}</td><td>${lr.singleCount}</td><td>${u}</td><td>${fmt(lr.chargeSingle)}</td></tr>`;
    }
    if (lr.multi6Count > 0) {
      const u = fmt(lr.chargeMulti6 / lr.multi6Count);
      itemRows += `<tr><td>Multi-channel (6-ch) pipette calibration${sub}</td><td>${lr.multi6Count}</td><td>${u}</td><td>${fmt(lr.chargeMulti6)}</td></tr>`;
    }
    if (lr.multi8Count > 0) {
      const u = fmt(lr.chargeMulti8 / lr.multi8Count);
      itemRows += `<tr><td>Multi-channel (8-ch) pipette calibration${sub}</td><td>${lr.multi8Count}</td><td>${u}</td><td>${fmt(lr.chargeMulti8)}</td></tr>`;
    }
    if (lr.multi12Count > 0) {
      const u = fmt(lr.chargeMulti12 / lr.multi12Count);
      itemRows += `<tr><td>Multi-channel (12-ch) pipette calibration${sub}</td><td>${lr.multi12Count}</td><td>${u}</td><td>${fmt(lr.chargeMulti12)}</td></tr>`;
    }
    if (lr.multi16Count > 0) {
      const u = fmt(lr.chargeMulti16 / lr.multi16Count);
      itemRows += `<tr><td>Multi-channel (16-ch) pipette calibration${sub}</td><td>${lr.multi16Count}</td><td>${u}</td><td>${fmt(lr.chargeMulti16)}</td></tr>`;
    }
  });

  // VAT calculation
  const vatExempt = !!input.vatExempt;
  const vatAmount = vatExempt ? 0 : result.totalQuotePrice * 0.20;
  const grandTotal = result.totalQuotePrice + vatAmount;

  // Extra rows (travel, accommodation, London — discount moved to summary)
  let extraRows = '';
  const hasExtras = result.travelCharge > 0 || result.accommodationCharge > 0 || result.londonPremium > 0;

  if (result.travelCharge > 0) {
    extraRows += `<tr><td>Travel — mileage (${result.totalTripMiles} miles)</td><td>—</td><td>—</td><td>${fmt(result.travelCharge)}</td></tr>`;
  }
  if (result.accommodationCharge > 0) {
    extraRows += `<tr><td>Accommodation — ${result.nights} night${result.nights !== 1 ? 's' : ''} @ ${fmt(result.hotelCostPerNight)}/night</td><td>${result.nights}</td><td>${fmt(result.hotelCostPerNight)}</td><td>${fmt(result.accommodationCharge)}</td></tr>`;
  }
  if (result.londonPremium > 0) {
    extraRows += `<tr class="row-premium"><td>London area supplement (${settings.londonPremiumPercent}%)</td><td>—</td><td>—</td><td>+${fmt(result.londonPremium)}</td></tr>`;
  }

  const subtotalRow = (hasExtras && itemRows)
    ? `<tr class="row-subtotal"><td colspan="3">Calibration subtotal</td><td>${fmt(result.pipetteChargesTotal)}</td></tr>`
    : '';

  const css = `
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#edf2f7;color:#1a202c;font-size:11pt;}
    .toolbar{background:#1a365d;color:white;padding:.65rem 1.5rem;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:10;}
    .toolbar-title{font-size:.9rem;font-weight:600;opacity:.9;}
    .toolbar-btns{display:flex;gap:.5rem;}
    .btn-p{background:white;color:#1a365d;border:none;padding:.4rem 1rem;border-radius:5px;font-size:.85rem;font-weight:600;cursor:pointer;}
    .btn-p:hover{background:#ebf8ff;}
    .btn-c{background:transparent;color:rgba(255,255,255,.8);border:1px solid rgba(255,255,255,.3);padding:.4rem .75rem;border-radius:5px;font-size:.85rem;cursor:pointer;}
    .page{max-width:820px;margin:1.5rem auto 3rem;background:white;box-shadow:0 4px 30px rgba(0,0,0,.15);}
    .doc-header{display:flex;justify-content:space-between;align-items:flex-start;padding:2.5rem 2.5rem 1.5rem;border-bottom:3px solid #1a365d;gap:1rem;}
    .doc-company-name{font-size:1.25rem;font-weight:700;color:#1a365d;margin-top:.2rem;}
    .doc-contact{text-align:right;font-size:9pt;color:#4a5568;line-height:1.8;}
    .doc-title{padding:1.1rem 2.5rem;font-size:1.4rem;font-weight:700;color:#1a365d;letter-spacing:.1em;background:#f7fafc;border-bottom:1px solid #e2e8f0;}
    .doc-meta{display:flex;justify-content:space-between;align-items:flex-start;padding:1.25rem 2.5rem 1rem;gap:1rem;}
    .doc-field-label{font-size:7.5pt;text-transform:uppercase;letter-spacing:.08em;color:#718096;font-weight:600;margin-bottom:.3rem;}
    .doc-customer{font-size:1.1rem;font-weight:600;color:#1a365d;}
    .ref-table{border-collapse:collapse;font-size:9.5pt;}
    .ref-table td{padding:.2rem 0 .2rem 1rem;}
    .ref-label{color:#718096;font-size:8.5pt;white-space:nowrap;}
    table.items{width:100%;border-collapse:collapse;}
    table.items thead tr{background:#1a365d;color:white;}
    table.items thead th{padding:.6rem 1rem;font-size:8pt;font-weight:600;letter-spacing:.04em;text-transform:uppercase;}
    table.items thead th:not(:first-child){text-align:right;}
    table.items tbody tr{border-bottom:1px solid #e2e8f0;}
    table.items td{padding:.65rem 1rem;vertical-align:top;font-size:10pt;}
    table.items td:not(:first-child){text-align:right;white-space:nowrap;}
    .row-subtotal{background:#f0f4f8!important;font-weight:500;color:#4a5568;}
    .row-subtotal td{padding:.5rem 1rem;font-size:9.5pt;}
    .row-premium td{color:#975a16;}
    .row-discount td{color:#276749;}
    .row-summary-label{background:#f7fafc!important;color:#1a202c;font-weight:600;}
    .row-summary-label td{padding:.65rem 1rem;font-size:10pt;border-top:2px solid #e2e8f0;}
    .row-summary-label td:not(:first-child){text-align:right;}
    .row-total{background:#1a365d!important;color:white;font-weight:700;}
    .row-total td{padding:.85rem 1rem;font-size:1rem;}
    .row-total td:not(:first-child){text-align:right;}
    .doc-terms{padding:1.5rem 2.5rem 2rem;border-top:1px solid #e2e8f0;}
    .doc-terms p{font-size:8.5pt;color:#718096;line-height:1.7;margin-bottom:.2rem;}
    .doc-disclaimer{margin:1.5rem 2.5rem;padding:1rem 1.25rem;border:2px solid #1a202c;font-size:10pt;text-align:center;line-height:1.6;}
    @media print{
      body{background:white;}
      .toolbar{display:none!important;}
      .page{margin:0;box-shadow:none;max-width:100%;}
      @page{margin:1.5cm;size:A4 portrait;}
    }
  `;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Quote — ${esc(customerName)} — ${quoteRef}</title>
<style>${css}</style>
</head>
<body>
<div class="toolbar">
  <span class="toolbar-title">Customer Quote Preview — ${esc(customerName)}</span>
  <div class="toolbar-btns">
    <button class="btn-p" onclick="window.print()">Print / Save as PDF</button>
    <button class="btn-c" onclick="window.close()">✕ Close</button>
  </div>
</div>
<div class="page">
  <div class="doc-header">
    <div>
      ${logoHtml}
      <div class="doc-company-name">${esc(companyName)}</div>
    </div>
    <div class="doc-contact">
      ${addrLines}${contactLines}
    </div>
  </div>
  <div class="doc-title">QUOTATION</div>
  <div class="doc-meta">
    <div>
      <div class="doc-field-label">Prepared for</div>
      <div class="doc-customer">${esc(customerName)}</div>
      ${customerAddrLines ? `<div style="font-size:9pt;color:#4a5568;line-height:1.8;margin-top:.35rem;">${customerAddrLines}</div>` : ''}
    </div>
    <div>
      <table class="ref-table">
        <tr><td class="ref-label">Date:</td><td>${dateStr}</td></tr>
        <tr><td class="ref-label">Quote Ref:</td><td><strong>${quoteRef}</strong></td></tr>
        <tr><td class="ref-label">Valid Until:</td><td>${validStr}</td></tr>
      </table>
    </div>
  </div>
  <table class="items">
    <thead>
      <tr>
        <th style="width:52%;text-align:left">Description</th>
        <th style="width:8%">Qty</th>
        <th style="width:18%">Unit Price</th>
        <th style="width:22%">Total</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
      ${subtotalRow}
      ${extraRows}
      <tr class="row-summary-label">
        <td colspan="3">Sub Total</td>
        <td>${fmt(result.subtotalBeforeDiscount)}</td>
      </tr>
      <tr class="row-summary-label">
        <td colspan="3">VAT @20%</td>
        <td>${vatExempt ? 'N/A' : fmt(vatAmount)}</td>
      </tr>
      <tr class="row-summary-label">
        <td colspan="3">Discount</td>
        <td>${result.discountAmount > 0 ? '−' + fmt(result.discountAmount) : 'N/A'}</td>
      </tr>
      <tr class="row-total">
        <td colspan="3">Total${vatExempt ? ' (excl. VAT)' : ''}</td>
        <td>${fmt(grandTotal)}</td>
      </tr>
    </tbody>
  </table>
  <div class="doc-disclaimer">
    This is a quotation on the goods named, subject to the conditions noted: Service and calibration of pipettes, any parts needed will be charge at extra cost, any part costing £25 or more will be quoted before fitting
  </div>
  <div class="doc-terms">
    <p>This quotation is valid for ${validDays} days from the date of issue.</p>
    ${vatExempt ? '<p>VAT has not been applied to this quotation — customer confirmed VAT exempt.</p>' : '<p>All prices are exclusive of VAT. VAT at 20% is included in the total above.</p>'}
    <p>Calibration certificates will be issued on completion of work.</p>
  </div>
</div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if (!w) {
    showToast('Pop-up blocked — please allow pop-ups for this site');
  }
}
