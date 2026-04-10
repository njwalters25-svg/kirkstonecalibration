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

function getProfitClass(margin) {
  if (margin >= 20) return 'profit-good';
  if (margin >= 10) return 'profit-ok';
  return 'profit-low';
}

function collectQuoteInputFromForm() {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    customerName: document.getElementById('customerName').value.trim(),
    serviceLevel: document.querySelector('input[name="serviceLevel"]:checked')?.value || 'standard',
    singleChannelCount: parseInt(document.getElementById('singleChannelCount').value) || 0,
    multiChannel8Count: parseInt(document.getElementById('multiChannel8Count').value) || 0,
    multiChannel12Count: parseInt(document.getElementById('multiChannel12Count').value) || 0,
    multiChannel16Count: parseInt(document.getElementById('multiChannel16Count').value) || 0,
    travelDistanceMiles: parseFloat(document.getElementById('travelDistance').value) || 0,
    travelTimeMinutes: parseInt(document.getElementById('travelTime').value) || 0,
    travelDayBefore: document.getElementById('travelDayBefore').checked,
    isLondon: document.getElementById('isLondon').checked,
    overnightStay: document.getElementById('overnightStay').checked,
    hotelCost: parseFloat(document.getElementById('hotelCost').value) || 0,
    nights: parseInt(document.getElementById('nights').value) || 1,
    calibrationTimeMinutes: parseInt(document.getElementById('calibrationTime').value) || 0,
    discountType: document.querySelector('input[name="discountType"]:checked')?.value || 'none',
    customDiscountPercent: parseFloat(document.getElementById('customDiscount').value) || 0,
    notes: document.getElementById('quoteNotes').value.trim(),
  };
}

function renderQuoteSummary(result) {
  const container = document.getElementById('quoteSummary');
  const profitClass = getProfitClass(result.profitMarginPercent);

  container.innerHTML = `
    <div class="summary-section">
      <h3>Revenue Breakdown</h3>
      <div class="summary-row">
        <span>Single-channel pipettes</span>
        <span>${formatCurrency(result.pipetteChargesSingle)}</span>
      </div>
      ${result.pipetteChargesMulti8 > 0 ? `
      <div class="summary-row">
        <span>Multi-channel (8-ch)</span>
        <span>${formatCurrency(result.pipetteChargesMulti8)}</span>
      </div>` : ''}
      ${result.pipetteChargesMulti12 > 0 ? `
      <div class="summary-row">
        <span>Multi-channel (12-ch)</span>
        <span>${formatCurrency(result.pipetteChargesMulti12)}</span>
      </div>` : ''}
      ${result.pipetteChargesMulti16 > 0 ? `
      <div class="summary-row">
        <span>Multi-channel (16-ch)</span>
        <span>${formatCurrency(result.pipetteChargesMulti16)}</span>
      </div>` : ''}
      <div class="summary-row subtotal">
        <span>Pipettes subtotal</span>
        <span>${formatCurrency(result.pipetteChargesTotal)}</span>
      </div>
      ${result.travelCharge > 0 ? `
      <div class="summary-row">
        <span>Travel charge (${result.roundTripMiles} mi round trip)</span>
        <span>${formatCurrency(result.travelCharge)}</span>
      </div>` : ''}
      ${result.accommodationCharge > 0 ? `
      <div class="summary-row">
        <span>Accommodation (${result.nights} night${result.nights > 1 ? 's' : ''})</span>
        <span>${formatCurrency(result.accommodationCharge)}</span>
      </div>` : ''}
      ${result.londonPremium > 0 ? `
      <div class="summary-row premium">
        <span>London premium</span>
        <span>+${formatCurrency(result.londonPremium)}</span>
      </div>` : ''}
      ${result.expressPremium > 0 ? `
      <div class="summary-row premium">
        <span>Express premium</span>
        <span>+${formatCurrency(result.expressPremium)}</span>
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

    <div class="summary-section">
      <h3>Internal Costs</h3>
      <div class="summary-row">
        <span>Pipette costs</span>
        <span>${formatCurrency(result.costPipettesTotal)}</span>
      </div>
      <div class="summary-row">
        <span>Mileage (${result.roundTripMiles} mi round trip)</span>
        <span>${formatCurrency(result.costTravel)}</span>
      </div>
      ${result.costAccommodation > 0 ? `
      <div class="summary-row">
        <span>Accommodation</span>
        <span>${formatCurrency(result.costAccommodation)}</span>
      </div>` : ''}
      <div class="summary-row">
        <span>Labour — calibration</span>
        <span>${formatCurrency(result.costLabourCalibration)}</span>
      </div>
      <div class="summary-row">
        <span>Labour — travel</span>
        <span>${formatCurrency(result.costLabourTravel)}</span>
      </div>
      <div class="summary-row total">
        <span>TOTAL COST</span>
        <span>${formatCurrency(result.totalInternalCost)}</span>
      </div>
    </div>

    <div class="summary-section profit-section ${profitClass}">
      <div class="profit-amount">${formatCurrency(result.profitAmount)}</div>
      <div class="profit-margin">${formatPercent(result.profitMarginPercent)} margin</div>
      <div class="profit-pipettes">${result.totalPipettes} pipette${result.totalPipettes !== 1 ? 's' : ''} total</div>
      ${result.estimatedCalMinutes > 0 ? `
      <div class="profit-estimate">Est. calibration time: ${Math.ceil(result.estimatedCalMinutes / 60 * 10) / 10} hrs</div>` : ''}
    </div>

    ${result.notes ? `
    <div class="summary-section notes-section">
      <h3>Notes</h3>
      <p class="notes-text">${result.notes.replace(/\n/g, '<br>')}</p>
    </div>` : ''}
  `;
}

function populateSettingsForm(settings) {
  const fields = [
    'chargeSingleChannel', 'chargeMultiChannel8', 'chargeMultiChannel12', 'chargeMultiChannel16',
    'costSingleChannel', 'costMultiChannel8', 'costMultiChannel12', 'costMultiChannel16',
    'labourRatePerHour', 'mileageRatePence', 'travelChargePerMile',
    'londonPremiumPercent', 'hotelBudgetDefault', 'expressPremiumPercent',
    'discountRegularPercent', 'discountContractPercent',
    'minutesPerSingleChannel', 'minutesPerMultiChannel',
  ];
  fields.forEach(f => {
    const el = document.getElementById('s_' + f);
    if (el) el.value = settings[f];
  });

  const travelCharge = document.getElementById('s_travelChargeToCustomer');
  if (travelCharge) travelCharge.checked = settings.travelChargeToCustomer;

  const accomCharge = document.getElementById('s_chargeAccommodationToCustomer');
  if (accomCharge) accomCharge.checked = settings.chargeAccommodationToCustomer;
}

function collectSettingsFromForm() {
  const num = id => parseFloat(document.getElementById(id).value) || 0;
  return {
    chargeSingleChannel: num('s_chargeSingleChannel'),
    chargeMultiChannel8: num('s_chargeMultiChannel8'),
    chargeMultiChannel12: num('s_chargeMultiChannel12'),
    chargeMultiChannel16: num('s_chargeMultiChannel16'),
    costSingleChannel: num('s_costSingleChannel'),
    costMultiChannel8: num('s_costMultiChannel8'),
    costMultiChannel12: num('s_costMultiChannel12'),
    costMultiChannel16: num('s_costMultiChannel16'),
    labourRatePerHour: num('s_labourRatePerHour'),
    mileageRatePence: num('s_mileageRatePence'),
    travelChargeToCustomer: document.getElementById('s_travelChargeToCustomer').checked,
    travelChargePerMile: num('s_travelChargePerMile'),
    londonPremiumPercent: num('s_londonPremiumPercent'),
    hotelBudgetDefault: num('s_hotelBudgetDefault'),
    chargeAccommodationToCustomer: document.getElementById('s_chargeAccommodationToCustomer').checked,
    expressPremiumPercent: num('s_expressPremiumPercent'),
    discountRegularPercent: num('s_discountRegularPercent'),
    discountContractPercent: num('s_discountContractPercent'),
    minutesPerSingleChannel: num('s_minutesPerSingleChannel'),
    minutesPerMultiChannel: num('s_minutesPerMultiChannel'),
  };
}

function renderQuoteHistory(quotes) {
  const container = document.getElementById('quoteHistory');
  if (!container) return;

  if (quotes.length === 0) {
    container.innerHTML = '<p class="empty-state">No saved quotes yet.</p>';
    return;
  }

  container.innerHTML = quotes.map(q => `
    <div class="history-card" data-id="${q.id}">
      <div class="history-header">
        <strong>${q.customerName || 'Unnamed'}</strong>
        <span class="history-date">${new Date(q.createdAt).toLocaleDateString('en-GB')}</span>
      </div>
      <div class="history-details">
        <span>${q.totalPipettes} pipettes</span>
        <span class="history-total">${formatCurrency(q.totalQuotePrice)}</span>
        <span class="${getProfitClass(q.profitMarginPercent)}">${formatPercent(q.profitMarginPercent)}</span>
      </div>
      ${q.notes ? `<div class="history-notes">${q.notes.length > 80 ? q.notes.substring(0, 80) + '...' : q.notes}</div>` : ''}
      <button class="btn-small btn-delete" onclick="deleteQuote('${q.id}')">Delete</button>
    </div>
  `).join('');
}
