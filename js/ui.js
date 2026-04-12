// ============================================================
// ui.js — DOM rendering helpers & form data collection
// ============================================================

const fmt = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  minimumFractionDigits: 2,
});

function formatCurrency(amount) {
  return fmt.format(amount);
}

function formatPercent(value) {
  return value.toFixed(1) + '%';
}

function formatTime(minutes) {
  if (!minutes) return '0 mins';
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hrs === 0) return `${mins} mins`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

function getProfitClass(margin) {
  if (margin >= 20) return 'profit-good';
  if (margin >= 10) return 'profit-ok';
  return 'profit-low';
}

// --- Pipette line items ---

function buildServiceLevelOptions(settings, selectedId) {
  return settings.serviceLevels.map(sl =>
    `<option value="${sl.id}" ${sl.id === selectedId ? 'selected' : ''}>${sl.name}</option>`
  ).join('');
}

function renderPipetteLines(lines, settings) {
  const container = document.getElementById('pipetteLines');
  container.innerHTML = lines.map((line, i) => `
    <div class="pipette-line" data-index="${i}">
      <div class="pipette-line-header">
        <div class="form-group" style="flex:1">
          <label>Service Level</label>
          <select class="pl-serviceLevel">${buildServiceLevelOptions(settings, line.serviceLevelId)}</select>
        </div>
        ${lines.length > 1 ? `<button type="button" class="btn-small btn-delete pl-remove" data-index="${i}">Remove</button>` : ''}
      </div>
      <div class="form-row-4">
        <div class="form-group">
          <label>Single-ch</label>
          <input type="number" class="pl-single" min="0" value="${line.singleChannelCount || 0}">
        </div>
        <div class="form-group">
          <label>Multi 8-ch</label>
          <input type="number" class="pl-multi8" min="0" value="${line.multiChannel8Count || 0}">
        </div>
        <div class="form-group">
          <label>Multi 12-ch</label>
          <input type="number" class="pl-multi12" min="0" value="${line.multiChannel12Count || 0}">
        </div>
        <div class="form-group">
          <label>Multi 16-ch</label>
          <input type="number" class="pl-multi16" min="0" value="${line.multiChannel16Count || 0}">
        </div>
      </div>
    </div>
  `).join('');
}

function collectPipetteLinesFromForm() {
  const lineEls = document.querySelectorAll('#pipetteLines .pipette-line');
  return Array.from(lineEls).map(el => ({
    serviceLevelId: el.querySelector('.pl-serviceLevel').value,
    singleChannelCount: parseInt(el.querySelector('.pl-single').value) || 0,
    multiChannel8Count: parseInt(el.querySelector('.pl-multi8').value) || 0,
    multiChannel12Count: parseInt(el.querySelector('.pl-multi12').value) || 0,
    multiChannel16Count: parseInt(el.querySelector('.pl-multi16').value) || 0,
  }));
}

function getDefaultPipetteLine(settings) {
  const firstLevel = settings.serviceLevels[0];
  return {
    serviceLevelId: firstLevel ? firstLevel.id : '',
    singleChannelCount: 0,
    multiChannel8Count: 0,
    multiChannel12Count: 0,
    multiChannel16Count: 0,
  };
}

// --- Collect quote form ---

function collectQuoteInputFromForm() {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    customerName: document.getElementById('customerName').value.trim(),
    pipetteLines: collectPipetteLinesFromForm(),
    destinationPostcode: document.getElementById('destinationPostcode').value.trim(),
    travelDistanceMiles: parseFloat(document.getElementById('travelDistance').value) || 0,
    travelTimeMinutes: parseInt(document.getElementById('travelTime').value) || 0,
    travelDayBefore: document.getElementById('travelDayBefore').checked,
    isLondon: document.getElementById('isLondon').checked,
    overnightStay: document.getElementById('overnightStay').checked,
    hotelCost: parseFloat(document.getElementById('hotelCost').value) || 0,
    nights: parseInt(document.getElementById('nights').value) || 1,
    calibrationTimeMinutes: parseInt(document.getElementById('calibrationTime').value) || 0,
    secondPerson: document.getElementById('secondPerson').checked,
    discountType: document.querySelector('input[name="discountType"]:checked')?.value || 'none',
    customDiscountPercent: parseFloat(document.getElementById('customDiscount').value) || 0,
    notes: document.getElementById('quoteNotes').value.trim(),
  };
}

// --- Quote summary ---

function renderQuoteSummary(result) {
  const container = document.getElementById('quoteSummary');
  const profitClass = getProfitClass(result.profitMarginPercent);

  // Build per-line revenue rows
  const lineRows = result.lineResults.map(lr => {
    const rows = [];
    if (lr.singleCount > 0) rows.push(`<div class="summary-row"><span>Single-ch ×${lr.singleCount}</span><span>${formatCurrency(lr.chargeSingle)}</span></div>`);
    if (lr.multi8Count > 0) rows.push(`<div class="summary-row"><span>Multi 8-ch ×${lr.multi8Count}</span><span>${formatCurrency(lr.chargeMulti8)}</span></div>`);
    if (lr.multi12Count > 0) rows.push(`<div class="summary-row"><span>Multi 12-ch ×${lr.multi12Count}</span><span>${formatCurrency(lr.chargeMulti12)}</span></div>`);
    if (lr.multi16Count > 0) rows.push(`<div class="summary-row"><span>Multi 16-ch ×${lr.multi16Count}</span><span>${formatCurrency(lr.chargeMulti16)}</span></div>`);
    if (rows.length === 0) return '';
    return `
      <div class="line-result">
        <div class="service-level-badge">${lr.serviceLevelName}</div>
        ${rows.join('')}
        <div class="summary-row subtotal"><span>Line subtotal</span><span>${formatCurrency(lr.chargeTotal)}</span></div>
      </div>`;
  }).filter(Boolean).join('');

  container.innerHTML = `
    <div class="summary-section">
      <h3>Revenue Breakdown</h3>
      ${lineRows || `<div class="summary-row"><span>No pipettes entered</span><span>${formatCurrency(0)}</span></div>`}
      <div class="summary-row subtotal">
        <span>All pipettes</span>
        <span>${formatCurrency(result.pipetteChargesTotal)}</span>
      </div>
      ${result.travelCharge > 0 ? `
      <div class="summary-row">
        <span>Travel charge (${result.totalTripMiles} mi${result.commuteTrips > 1 ? ` — ${result.commuteTrips} daily return trips` : ' round trip'})</span>
        <span>${formatCurrency(result.travelCharge)}</span>
      </div>` : ''}
      ${result.accommodationCharge > 0 && result.travelNight > 0 ? `
      <div class="summary-row">
        <span>Hotel — travel night (day before)</span>
        <span>${formatCurrency(result.hotelCostPerNight * result.travelNight)}</span>
      </div>
      ${result.jobNights > 0 ? `<div class="summary-row">
        <span>Hotel — job (${result.jobNights} night${result.jobNights !== 1 ? 's' : ''})</span>
        <span>${formatCurrency(result.hotelCostPerNight * result.jobNights)}</span>
      </div>` : ''}
      <div class="summary-row subtotal">
        <span>Accommodation total (${result.nights} @ ${formatCurrency(result.hotelCostPerNight)})</span>
        <span>${formatCurrency(result.accommodationCharge)}</span>
      </div>` : ''}
      ${result.accommodationCharge > 0 && result.travelNight === 0 ? `
      <div class="summary-row">
        <span>Accommodation (${result.nights} night${result.nights !== 1 ? 's' : ''} @ ${formatCurrency(result.hotelCostPerNight)})</span>
        <span>${formatCurrency(result.accommodationCharge)}</span>
      </div>` : ''}
      ${result.londonPremium > 0 ? `
      <div class="summary-row premium">
        <span>London premium</span>
        <span>+${formatCurrency(result.londonPremium)}</span>
      </div>` : ''}
      ${result.discountAmount > 0 ? `
      <div class="summary-row discount">
        <span>Discount: ${result.discountLabel}</span>
        <span>-${formatCurrency(result.discountAmount)}</span>
      </div>` : ''}
      <div class="summary-row total">
        <span>QUOTE TOTAL</span>
        <span>${formatCurrency(result.totalQuotePrice)}</span>
      </div>
    </div>

    <div class="summary-section time-plan-section">
      <h3>Time Plan</h3>
      <div class="summary-row">
        <span>Travel out (one way)</span>
        <span>${formatTime(result.timePlan.travelOutMins)}</span>
      </div>
      <div class="summary-row">
        <span>Calibration work${result.secondPerson ? ' (with 2nd person)' : ''}</span>
        <span>${formatTime(result.timePlan.jobMins)}</span>
      </div>
      ${result.secondPerson && result.baseJobMins !== result.timePlan.jobMins ? `
      <div class="summary-row" style="font-size:0.75rem; color:var(--green);">
        <span>Reduced from ${formatTime(result.baseJobMins)} (-${result.timeReductionPercent}%)</span>
        <span></span>
      </div>` : ''}
      <div class="summary-row">
        <span>Travel return</span>
        <span>${formatTime(result.timePlan.travelReturnMins)}</span>
      </div>
      <div class="summary-row subtotal">
        <span>Total time</span>
        <span>${formatTime(result.timePlan.totalMins)}</span>
      </div>
      <div class="time-plan-days">
        <div class="days-count">${result.timePlan.totalDays || '—'} day${result.timePlan.totalDays !== 1 ? 's' : ''}</div>
        <div class="days-detail">Based on ${result.timePlan.workMinsPerDay / 60}hr working day</div>
        ${result.suggestedNights > 0 ? `
        <div class="nights-count">${result.suggestedNights} night${result.suggestedNights !== 1 ? 's' : ''} hotel</div>
        ${result.travelNight > 0 ? `<div class="nights-detail">1 travel night (day before) ${result.jobNights > 0 ? `+ ${result.jobNights} job night${result.jobNights !== 1 ? 's' : ''}` : ''}</div>` : ''}
        <div class="nights-cost">Est. accommodation: ${formatCurrency(result.suggestedNights * (result.hotelCostPerNight || 0))}</div>
        ` : ''}
      </div>
    </div>

    <div class="summary-section">
      <h3>Internal Costs</h3>
      <div class="summary-row">
        <span>Pipette costs</span>
        <span>${formatCurrency(result.costPipettesTotal)}</span>
      </div>
      <div class="summary-row">
        <span>Mileage (${result.totalTripMiles} mi${result.commuteTrips > 1 ? ` — ${result.commuteTrips} daily trips` : ' round trip'})</span>
        <span>${formatCurrency(result.costTravel)}</span>
      </div>
      ${result.costAccommodation > 0 && result.travelNight > 0 ? `
      <div class="summary-row">
        <span>Hotel — travel night</span>
        <span>${formatCurrency(result.hotelCostPerNight * result.travelNight)}</span>
      </div>
      ${result.jobNights > 0 ? `<div class="summary-row">
        <span>Hotel — job (${result.jobNights} night${result.jobNights !== 1 ? 's' : ''})</span>
        <span>${formatCurrency(result.hotelCostPerNight * result.jobNights)}</span>
      </div>` : ''}` : ''}
      ${result.costAccommodation > 0 && result.travelNight === 0 ? `
      <div class="summary-row">
        <span>Accommodation (${result.nights} night${result.nights !== 1 ? 's' : ''})</span>
        <span>${formatCurrency(result.costAccommodation)}</span>
      </div>` : ''}
      <div class="summary-row">
        <span>Labour — calibration</span>
        <span>${formatCurrency(result.costLabourCalibration)}</span>
      </div>
      <div class="summary-row">
        <span>Labour — travel${result.commuteTrips > 1 ? ` (${result.commuteTrips} days)` : ''}</span>
        <span>${formatCurrency(result.costLabourTravel)}</span>
      </div>
      ${result.costSecondPerson > 0 ? `
      <div class="summary-row">
        <span>2nd person (${result.secondPersonDays} day${result.secondPersonDays !== 1 ? 's' : ''})</span>
        <span>${formatCurrency(result.costSecondPerson)}</span>
      </div>` : ''}
      <div class="summary-row total">
        <span>TOTAL COST</span>
        <span>${formatCurrency(result.totalInternalCost)}</span>
      </div>
    </div>

    <div class="summary-section profit-section ${profitClass}">
      <div class="profit-amount">${formatCurrency(result.profitAmount)}</div>
      <div class="profit-margin">${formatPercent(result.profitMarginPercent)} margin</div>
      <div class="profit-pipettes">${result.totalPipettes} pipette${result.totalPipettes !== 1 ? 's' : ''} total</div>
    </div>

    ${result.notes ? `
    <div class="summary-section notes-section">
      <h3>Notes</h3>
      <p class="notes-text">${result.notes.replace(/\n/g, '<br>')}</p>
    </div>` : ''}
  `;
}

// --- Settings: service levels editor ---

function renderServiceLevelsEditor(settings) {
  const container = document.getElementById('serviceLevelsEditor');
  if (!container) return;

  container.innerHTML = settings.serviceLevels.map((sl, i) => `
    <div class="sl-card" data-index="${i}">
      <div class="sl-card-header">
        <div class="form-row">
          <div class="form-group">
            <label>Name</label>
            <input type="text" class="sl-name" value="${sl.name}">
          </div>
          <div class="form-group">
            <label>Readings</label>
            <input type="number" class="sl-readings" min="1" value="${sl.readings}">
          </div>
          <div class="form-group">
            <label>Volumes</label>
            <input type="number" class="sl-volumes" min="1" value="${sl.volumes}">
          </div>
        </div>
      </div>
      <div class="sl-card-body">
        <div class="sl-section-label">Customer charges (GBP per pipette)</div>
        <div class="form-row-4">
          <div class="form-group">
            <label>Single-ch</label>
            <input type="number" class="sl-chargeSingle" step="0.50" min="0" value="${sl.chargeSingleChannel}">
          </div>
          <div class="form-group">
            <label>Multi 8-ch</label>
            <input type="number" class="sl-chargeMulti8" step="0.50" min="0" value="${sl.chargeMultiChannel8}">
          </div>
          <div class="form-group">
            <label>Multi 12-ch</label>
            <input type="number" class="sl-chargeMulti12" step="0.50" min="0" value="${sl.chargeMultiChannel12}">
          </div>
          <div class="form-group">
            <label>Multi 16-ch</label>
            <input type="number" class="sl-chargeMulti16" step="0.50" min="0" value="${sl.chargeMultiChannel16}">
          </div>
        </div>
        <div class="sl-section-label">Time per pipette (minutes)</div>
        <div class="form-row-4">
          <div class="form-group">
            <label>Single-ch</label>
            <input type="number" class="sl-minsSingle" step="1" min="1" value="${sl.minutesPerSingleChannel}">
          </div>
          <div class="form-group">
            <label>Multi 8-ch</label>
            <input type="number" class="sl-minsMulti8" step="1" min="1" value="${sl.minutesPerMultiChannel8}">
          </div>
          <div class="form-group">
            <label>Multi 12-ch</label>
            <input type="number" class="sl-minsMulti12" step="1" min="1" value="${sl.minutesPerMultiChannel12}">
          </div>
          <div class="form-group">
            <label>Multi 16-ch</label>
            <input type="number" class="sl-minsMulti16" step="1" min="1" value="${sl.minutesPerMultiChannel16}">
          </div>
        </div>
      </div>
      <div class="sl-card-footer">
        <button type="button" class="btn-small btn-delete sl-remove" data-index="${i}"
          ${settings.serviceLevels.length <= 1 ? 'disabled title="Need at least one level"' : ''}>Remove</button>
      </div>
    </div>
  `).join('');
}

function collectServiceLevelsFromEditor() {
  const cards = document.querySelectorAll('#serviceLevelsEditor .sl-card');
  return Array.from(cards).map((card, i) => {
    const name = card.querySelector('.sl-name').value.trim() || `Level ${i + 1}`;
    const readings = parseInt(card.querySelector('.sl-readings').value) || 1;
    const volumes = parseInt(card.querySelector('.sl-volumes').value) || 1;
    return {
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      name,
      readings,
      volumes,
      chargeSingleChannel: parseFloat(card.querySelector('.sl-chargeSingle').value) || 0,
      chargeMultiChannel8: parseFloat(card.querySelector('.sl-chargeMulti8').value) || 0,
      chargeMultiChannel12: parseFloat(card.querySelector('.sl-chargeMulti12').value) || 0,
      chargeMultiChannel16: parseFloat(card.querySelector('.sl-chargeMulti16').value) || 0,
      minutesPerSingleChannel: parseInt(card.querySelector('.sl-minsSingle').value) || 1,
      minutesPerMultiChannel8: parseInt(card.querySelector('.sl-minsMulti8').value) || 1,
      minutesPerMultiChannel12: parseInt(card.querySelector('.sl-minsMulti12').value) || 1,
      minutesPerMultiChannel16: parseInt(card.querySelector('.sl-minsMulti16').value) || 1,
    };
  });
}

// --- Settings: scalar fields ---

function populateSettingsForm(settings) {
  const fields = [
    'costSingleChannel', 'costMultiChannel8', 'costMultiChannel12', 'costMultiChannel16',
    'labourRatePerHour', 'workingHoursPerDay',
    'secondPersonDayCost', 'secondPersonTimeReduction',
    'mileageRatePence', 'travelChargePerMile',
    'homePostcode', 'londonPremiumPercent', 'hotelBudgetDefault', 'overnightThresholdMins',
    'discountRegularPercent', 'discountContractPercent',
  ];
  fields.forEach(f => {
    const el = document.getElementById('s_' + f);
    if (el) el.value = settings[f];
  });

  const travelCharge = document.getElementById('s_travelChargeToCustomer');
  if (travelCharge) travelCharge.checked = settings.travelChargeToCustomer;

  const accomCharge = document.getElementById('s_chargeAccommodationToCustomer');
  if (accomCharge) accomCharge.checked = settings.chargeAccommodationToCustomer;

  renderServiceLevelsEditor(settings);
}

function collectSettingsFromForm() {
  const num = id => parseFloat(document.getElementById(id).value) || 0;
  return {
    serviceLevels: collectServiceLevelsFromEditor(),
    costSingleChannel: num('s_costSingleChannel'),
    costMultiChannel8: num('s_costMultiChannel8'),
    costMultiChannel12: num('s_costMultiChannel12'),
    costMultiChannel16: num('s_costMultiChannel16'),
    labourRatePerHour: num('s_labourRatePerHour'),
    workingHoursPerDay: num('s_workingHoursPerDay') || 8,
    secondPersonDayCost: num('s_secondPersonDayCost'),
    secondPersonTimeReduction: num('s_secondPersonTimeReduction'),
    mileageRatePence: num('s_mileageRatePence'),
    travelChargeToCustomer: document.getElementById('s_travelChargeToCustomer').checked,
    travelChargePerMile: num('s_travelChargePerMile'),
    homePostcode: document.getElementById('s_homePostcode').value.trim() || 'DE75 7UJ',
    londonPremiumPercent: num('s_londonPremiumPercent'),
    hotelBudgetDefault: num('s_hotelBudgetDefault'),
    overnightThresholdMins: num('s_overnightThresholdMins') || 90,
    chargeAccommodationToCustomer: document.getElementById('s_chargeAccommodationToCustomer').checked,
    discountRegularPercent: num('s_discountRegularPercent'),
    discountContractPercent: num('s_discountContractPercent'),
  };
}

// --- Quote history ---

function renderQuoteHistory(quotes, settings) {
  const container = document.getElementById('quoteHistory');
  if (!container) return;

  if (quotes.length === 0) {
    container.innerHTML = '<p class="empty-state">No saved quotes yet.</p>';
    return;
  }

  container.innerHTML = quotes.map(q => {
    // Recalculate the full result to show the complete summary
    const result = calculateQuote(q, settings);

    return `
    <div class="history-card" data-id="${q.id}">
      <div class="history-header">
        <strong>${q.customerName || 'Unnamed'}</strong>
        <span class="history-date">${new Date(q.createdAt).toLocaleDateString('en-GB')}</span>
        ${q.savedBy ? `<span class="history-saved-by">by ${q.savedBy}</span>` : ''}
      </div>
      <div class="history-summary" id="history-summary-${q.id}" style="display:none;">
        <div class="history-summary-content"></div>
      </div>
      <div class="history-details">
        <span>${result.totalPipettes} pipettes</span>
        <span>${result.timePlan.totalDays} day${result.timePlan.totalDays !== 1 ? 's' : ''}</span>
        <span class="history-total">${formatCurrency(result.totalQuotePrice)}</span>
        <span class="${getProfitClass(result.profitMarginPercent)}">${formatPercent(result.profitMarginPercent)} (${formatCurrency(result.profitAmount)})</span>
      </div>
      ${q.notes ? `<div class="history-notes">${q.notes.replace(/\n/g, '<br>')}</div>` : ''}
      <div class="history-actions">
        <button class="btn-small" onclick="toggleQuoteDetail('${q.id}')">View details</button>
        <button class="btn-small" onclick="loadQuote('${q.id}')">Load into form</button>
        <button class="btn-small btn-delete" onclick="deleteQuote('${q.id}')">Delete</button>
      </div>
    </div>`;
  }).join('');
}
