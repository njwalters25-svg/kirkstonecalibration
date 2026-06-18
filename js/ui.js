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

function formatProposedDate(value) {
  if (!value) return '';
  const match = String(value).match(/^(\d{4})-(\d{2})$/);
  if (!match) return String(value);
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMultilineText(value) {
  return escapeHtml(value).replace(/\n/g, '<br>');
}

function escapeJsString(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}

function getProfitClass(margin) {
  if (margin >= 20) return 'profit-good';
  if (margin >= 10) return 'profit-ok';
  return 'profit-low';
}

// --- Pipette line items ---

function buildServiceLevelOptions(settings, selectedId) {
  return settings.serviceLevels.map(sl =>
    `<option value="${escapeHtml(sl.id)}" ${sl.id === selectedId ? 'selected' : ''}>${escapeHtml(sl.name)}</option>`
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
      <div class="form-row-5">
        <div class="form-group">
          <label>Single-ch</label>
          <input type="number" class="pl-single" min="0" value="${line.singleChannelCount || 0}">
        </div>
        <div class="form-group">
          <label>Multi 6-ch</label>
          <input type="number" class="pl-multi6" min="0" value="${line.multiChannel6Count || 0}">
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
    multiChannel6Count: parseInt(el.querySelector('.pl-multi6').value) || 0,
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
    multiChannel6Count: 0,
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
    customerAddress: document.getElementById('customerAddress').value.trim(),
    proposedDate: document.getElementById('proposedDate').value,
    refPrefix: document.getElementById('refPrefix').value.trim().toUpperCase(),
    refNumber: parseInt(document.getElementById('refNumber').value) || null,
    pipetteLines: collectPipetteLinesFromForm(),
    destinationPostcode: document.getElementById('destinationPostcode').value.trim(),
    travelDistanceMiles: parseFloat(document.getElementById('travelDistance').value) || 0,
    travelTimeMinutes: parseInt(document.getElementById('travelTime').value) || 0,
    travelDayBefore: document.getElementById('travelDayBefore').checked,
    isLondon: document.getElementById('isLondon').checked,
    overnightStay: document.getElementById('overnightStay').checked,
    hotelCost: parseFloat(document.getElementById('hotelCost').value) || 0,
    nights: parseInt(document.getElementById('nights').value) || 1,
    hotelPostcode: document.getElementById('hotelPostcode').value.trim(),
    hotelToWorkDistanceMiles: parseFloat(document.getElementById('hotelToWorkDistance').value) || 0,
    hotelToWorkMinutes: parseInt(document.getElementById('hotelToWorkTime').value) || 0,
    returnHome: document.getElementById('returnHome').checked,
    returnHomeTrips: parseInt(document.getElementById('returnHomeTrips').value) || 1,
    calibrationTimeMinutes: parseInt(document.getElementById('calibrationTime').value) || 0,
    newJob: document.getElementById('newJob').checked,
    secondPerson: document.getElementById('secondPerson').checked,
    discountType: document.querySelector('input[name="discountType"]:checked')?.value || 'none',
    customDiscountPercent: parseFloat(document.getElementById('customDiscount').value) || 0,
    vatExempt: document.getElementById('vatExempt').checked,
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
    if (lr.multi6Count > 0) rows.push(`<div class="summary-row"><span>Multi 6-ch ×${lr.multi6Count}</span><span>${formatCurrency(lr.chargeMulti6)}</span></div>`);
    if (lr.multi8Count > 0) rows.push(`<div class="summary-row"><span>Multi 8-ch ×${lr.multi8Count}</span><span>${formatCurrency(lr.chargeMulti8)}</span></div>`);
    if (lr.multi12Count > 0) rows.push(`<div class="summary-row"><span>Multi 12-ch ×${lr.multi12Count}</span><span>${formatCurrency(lr.chargeMulti12)}</span></div>`);
    if (lr.multi16Count > 0) rows.push(`<div class="summary-row"><span>Multi 16-ch ×${lr.multi16Count}</span><span>${formatCurrency(lr.chargeMulti16)}</span></div>`);
    if (rows.length === 0) return '';
    return `
      <div class="line-result">
        <div class="service-level-badge">${escapeHtml(lr.serviceLevelName)}</div>
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
        <span>Travel out${result.timePlan.travelDayBefore ? ' (day before → hotel)' : ' (one way)'}</span>
        <span>${formatTime(result.timePlan.travelOutMins)}</span>
      </div>
      ${result.timePlan.totalHotelCommuteMins > 0 ? `
      <div class="summary-row">
        <span>Hotel ↔ work commute (${formatTime(result.timePlan.hotelToWorkMins)} each way × ${result.timePlan.totalDays} day${result.timePlan.totalDays !== 1 ? 's' : ''})</span>
        <span>${formatTime(result.timePlan.totalHotelCommuteMins)}</span>
      </div>` : ''}
      <div class="summary-row">
        <span>Calibration work${result.secondPerson ? ' (with 2nd person)' : ''}</span>
        <span>${formatTime(result.timePlan.jobMins)}</span>
      </div>
      ${result.newJob && result.newJobExtraMins > 0 ? `
      <div class="summary-row" style="font-size:0.75rem; color:#1e40af;">
        <span>Includes +${formatTime(result.newJobExtraMins)} new job setup (${result.totalPipettes} pipettes × 2 min)</span>
        <span></span>
      </div>` : ''}
      ${result.secondPerson && result.baseJobMins !== result.timePlan.jobMins ? `
      <div class="summary-row" style="font-size:0.75rem; color:var(--green);">
        <span>Reduced from ${formatTime(result.baseJobMins)} (-${result.timeReductionPercent}%)</span>
        <span></span>
      </div>` : ''}
      <div class="summary-row">
        <span>Travel return (home)</span>
        <span>${formatTime(result.timePlan.travelReturnMins)}</span>
      </div>
      ${result.returnHomeTrips > 0 ? `
      <div class="summary-row">
        <span>Return home mid-job (${result.returnHomeTrips} trip${result.returnHomeTrips !== 1 ? 's' : ''} × ${formatTime(result.timePlan.travelTotalMins)})</span>
        <span>${formatTime(result.returnHomeTimeMins)}</span>
      </div>` : ''}
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
      ${result.hotelCommuteTotalMiles > 0 || result.returnHomeMiles > 0 ? `
      <div class="summary-row" style="font-size:0.75rem; color:var(--muted);">
        <span>Includes${result.hotelCommuteTotalMiles > 0 ? ` ${result.hotelCommuteTotalMiles} mi hotel commute` : ''}${result.hotelCommuteTotalMiles > 0 && result.returnHomeMiles > 0 ? ' + ' : ''}${result.returnHomeMiles > 0 ? `${result.returnHomeMiles} mi return home` : ''}</span>
        <span></span>
      </div>` : ''}
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
      ${result.costSubsistence > 0 ? `
      <div class="summary-row">
        <span>Subsistence (${result.subsistenceDays} day${result.subsistenceDays !== 1 ? 's' : ''} @ ${formatCurrency(result.subsistenceRate)}/day)</span>
        <span>${formatCurrency(result.costSubsistence)}</span>
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
      <p class="notes-text">${formatMultilineText(result.notes)}</p>
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
            <input type="text" class="sl-name" value="${escapeHtml(sl.name)}">
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
        <div class="form-row-5">
          <div class="form-group">
            <label>Single-ch</label>
            <input type="number" class="sl-chargeSingle" step="0.50" min="0" value="${sl.chargeSingleChannel}">
          </div>
          <div class="form-group">
            <label>Multi 6-ch</label>
            <input type="number" class="sl-chargeMulti6" step="0.50" min="0" value="${sl.chargeMultiChannel6 || 0}">
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
        <div class="form-row-5">
          <div class="form-group">
            <label>Single-ch</label>
            <input type="number" class="sl-minsSingle" step="1" min="1" value="${sl.minutesPerSingleChannel}">
          </div>
          <div class="form-group">
            <label>Multi 6-ch</label>
            <input type="number" class="sl-minsMulti6" step="1" min="1" value="${sl.minutesPerMultiChannel6 || 1}">
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
      chargeMultiChannel6: parseFloat(card.querySelector('.sl-chargeMulti6').value) || 0,
      chargeMultiChannel8: parseFloat(card.querySelector('.sl-chargeMulti8').value) || 0,
      chargeMultiChannel12: parseFloat(card.querySelector('.sl-chargeMulti12').value) || 0,
      chargeMultiChannel16: parseFloat(card.querySelector('.sl-chargeMulti16').value) || 0,
      minutesPerSingleChannel: parseInt(card.querySelector('.sl-minsSingle').value) || 1,
      minutesPerMultiChannel6: parseInt(card.querySelector('.sl-minsMulti6').value) || 1,
      minutesPerMultiChannel8: parseInt(card.querySelector('.sl-minsMulti8').value) || 1,
      minutesPerMultiChannel12: parseInt(card.querySelector('.sl-minsMulti12').value) || 1,
      minutesPerMultiChannel16: parseInt(card.querySelector('.sl-minsMulti16').value) || 1,
    };
  });
}

function getCatalogPartName(part) {
  return part.name || [part.pipette, part.description].filter(Boolean).join(' ').trim() || 'Unnamed part';
}

function getEffectivePartsCatalog(settings) {
  return Array.isArray(settings?.partsCatalog) && settings.partsCatalog.length > 0
    ? settings.partsCatalog
    : JSON.parse(JSON.stringify(DEFAULT_SETTINGS.partsCatalog || []));
}

function renderPartsCatalogEditor(settings) {
  const container = document.getElementById('partsCatalogEditor');
  if (!container) return;
  const parts = getEffectivePartsCatalog(settings);
  if (settings && (!Array.isArray(settings.partsCatalog) || settings.partsCatalog.length === 0)) {
    settings.partsCatalog = JSON.parse(JSON.stringify(parts));
  }
  if (parts.length === 0) {
    container.innerHTML = '<p class="empty-state compact">No parts yet. Add one below.</p>';
    return;
  }

  container.innerHTML = parts.map((part, i) => `
    <div class="part-card" data-index="${i}">
      <div class="form-group">
        <label>Pipette / model</label>
        <input type="text" class="part-pipette" value="${escapeHtml(part.pipette || '')}">
      </div>
      <div class="form-group">
        <label>Part</label>
        <input type="text" class="part-description" value="${escapeHtml(part.description || '')}">
      </div>
      <div class="form-group">
        <label>Dropdown name</label>
        <input type="text" class="part-name" value="${escapeHtml(getCatalogPartName(part))}">
      </div>
      <div class="form-group">
        <label>Cost</label>
        <input type="number" class="part-cost" step="0.01" min="0" value="${part.costPerUnit || 0}">
      </div>
      <div class="form-group">
        <label>Customer price</label>
        <input type="number" class="part-price" step="0.01" min="0" value="${part.pricePerUnit || 0}">
      </div>
      <button type="button" class="btn-small btn-delete part-remove" data-index="${i}">Remove</button>
    </div>
  `).join('');
}

function collectPartsCatalogFromEditor() {
  const cards = document.querySelectorAll('#partsCatalogEditor .part-card');
  return Array.from(cards).map((card, i) => {
    const pipette = card.querySelector('.part-pipette').value.trim();
    const description = card.querySelector('.part-description').value.trim();
    const name = card.querySelector('.part-name').value.trim() || [pipette, description].filter(Boolean).join(' ').trim() || `Part ${i + 1}`;
    return {
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, '_') || `part_${i + 1}`,
      pipette,
      description,
      name,
      costPerUnit: parseFloat(card.querySelector('.part-cost').value) || 0,
      pricePerUnit: parseFloat(card.querySelector('.part-price').value) || 0,
    };
  });
}

// --- Settings: scalar fields ---

function populateSettingsForm(settings) {
  const fields = [
    'costSingleChannel', 'costMultiChannel6', 'costMultiChannel8', 'costMultiChannel12', 'costMultiChannel16',
    'stickerCostPerPipette',
    'labourRatePerHour', 'workingHoursPerDay',
    'secondPersonDayCost', 'secondPersonTimeReduction',
    'mileageRatePence', 'travelChargePerMile',
    'homePostcode', 'londonPremiumPercent', 'hotelBudgetDefault', 'overnightThresholdMins',
    'subsistenceOvernightRate', 'subsistenceDayTripRate',
    'discountRegularPercent', 'discountContractPercent',
    'companyName', 'companyAddress', 'companyPhone', 'companyEmail', 'companyWebsite', 'vatNumber', 'quoteValidDays',
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
  renderPartsCatalogEditor(settings);
}

function collectSettingsFromForm() {
  const num = id => parseFloat(document.getElementById(id).value) || 0;
  const str = id => document.getElementById(id)?.value || '';
  return {
    serviceLevels: collectServiceLevelsFromEditor(),
    partsCatalog: collectPartsCatalogFromEditor(),
    costSingleChannel: num('s_costSingleChannel'),
    costMultiChannel6: num('s_costMultiChannel6'),
    costMultiChannel8: num('s_costMultiChannel8'),
    costMultiChannel12: num('s_costMultiChannel12'),
    costMultiChannel16: num('s_costMultiChannel16'),
    stickerCostPerPipette: num('s_stickerCostPerPipette'),
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
    subsistenceOvernightRate: num('s_subsistenceOvernightRate'),
    subsistenceDayTripRate: num('s_subsistenceDayTripRate'),
    discountRegularPercent: num('s_discountRegularPercent'),
    discountContractPercent: num('s_discountContractPercent'),
    companyName: str('s_companyName').trim() || 'Kirkstone Calibration',
    companyAddress: str('s_companyAddress'),
    companyPhone: str('s_companyPhone').trim(),
    companyEmail: str('s_companyEmail').trim(),
    companyWebsite: str('s_companyWebsite').trim(),
    vatNumber: str('s_vatNumber').trim(),
    quoteValidDays: parseInt(str('s_quoteValidDays')) || 30,
  };
}

// --- Reference number helpers ---

function populateRefPrefixDatalist(quotes) {
  const datalist = document.getElementById('refPrefixList');
  if (!datalist) return;
  const seen = new Set();
  const options = [];
  quotes.forEach(q => {
    if (q.refPrefix && !seen.has(q.refPrefix)) {
      seen.add(q.refPrefix);
      options.push(`<option value="${escapeHtml(q.refPrefix)}">`);
    }
  });
  datalist.innerHTML = options.join('');
}

function buildRefCode(prefix, number, isQuote = true) {
  if (!prefix || !number) return '';
  return 'KC' + prefix.toUpperCase() + number + (isQuote ? 'Q' : '');
}

function getEmptyPipetteTotals() {
  return { single: 0, multi6: 0, multi8: 0, multi12: 0, multi16: 0 };
}

function addLineToTotals(totals, line) {
  totals.single += line.singleChannelCount || 0;
  totals.multi6 += line.multiChannel6Count || 0;
  totals.multi8 += line.multiChannel8Count || 0;
  totals.multi12 += line.multiChannel12Count || 0;
  totals.multi16 += line.multiChannel16Count || 0;
}

function sumTotals(totals) {
  return totals.single + totals.multi6 + totals.multi8 + totals.multi12 + totals.multi16;
}

function getJobPlannedTotals(job) {
  const totals = getEmptyPipetteTotals();
  (job.plannedLines || []).forEach(line => addLineToTotals(totals, line));
  return totals;
}

function getJobActualTotals(job) {
  const totals = getEmptyPipetteTotals();
  (job.actualEntries || []).forEach(entry => addLineToTotals(totals, entry));
  return totals;
}

function calculateJobSheet(job) {
  const roundMoney = value => Math.round((value + Number.EPSILON) * 100) / 100;
  const settings = typeof getSettingsForQuote === 'function'
    ? getSettingsForQuote(job.quoteSnapshot || {}, job.settingsSnapshot || DEFAULT_SETTINGS)
    : (job.settingsSnapshot || DEFAULT_SETTINGS);
  const plannedTotals = getJobPlannedTotals(job);
  const actualTotals = getJobActualTotals(job);
  const plannedCount = sumTotals(plannedTotals);
  const actualCount = sumTotals(actualTotals);
  const remainingTotals = {
    single: plannedTotals.single - actualTotals.single,
    multi6: plannedTotals.multi6 - actualTotals.multi6,
    multi8: plannedTotals.multi8 - actualTotals.multi8,
    multi12: plannedTotals.multi12 - actualTotals.multi12,
    multi16: plannedTotals.multi16 - actualTotals.multi16,
  };

  let pipetteRevenue = 0;
  (job.actualEntries || []).forEach(entry => {
    const sl = getServiceLevel(entry.serviceLevelId, settings);
    pipetteRevenue += (entry.singleChannelCount || 0) * (sl?.chargeSingleChannel || 0);
    pipetteRevenue += (entry.multiChannel6Count || 0) * (sl?.chargeMultiChannel6 || 0);
    pipetteRevenue += (entry.multiChannel8Count || 0) * (sl?.chargeMultiChannel8 || 0);
    pipetteRevenue += (entry.multiChannel12Count || 0) * (sl?.chargeMultiChannel12 || 0);
    pipetteRevenue += (entry.multiChannel16Count || 0) * (sl?.chargeMultiChannel16 || 0);
  });

  const partsCost = (job.parts || []).reduce((total, part) =>
    total + ((parseFloat(part.quantity) || 0) * (parseFloat(part.costPerUnit) || 0)), 0);
  const partsRevenue = (job.parts || []).reduce((total, part) =>
    total + ((parseFloat(part.quantity) || 0) * (parseFloat(part.pricePerUnit) || 0)), 0);
  const actualRevenue = pipetteRevenue + partsRevenue;

  const costs = job.costs || {};
  const mileageRatePence = normalizeMileageRatePence(job.mileageRatePence ?? settings.mileageRatePence ?? 55);
  const mileageCost = (parseFloat(costs.mileageMiles) || 0) * (mileageRatePence / 100);
  const stickerCostPerPipette = parseFloat(
    job.stickerCostPerPipette
    ?? job.quotedAssumptions?.stickerCostPerPipette
    ?? settings.stickerCostPerPipette
    ?? DEFAULT_SETTINGS.stickerCostPerPipette
    ?? 0.10
  ) || 0;
  const stickerCost = actualCount * stickerCostPerPipette;
  const otherCosts =
    (parseFloat(costs.hotel) || 0) +
    (parseFloat(costs.food) || 0) +
    (parseFloat(costs.fuel) || 0) +
    stickerCost +
    (parseFloat(costs.shipping) || 0) +
    (parseFloat(costs.secondPerson) || 0) +
    (parseFloat(costs.other) || 0);
  const totalCosts = mileageCost + otherCosts + partsCost;
  const profit = actualRevenue - totalCosts;
  const vatAmount = job.quoteSnapshot?.vatExempt ? 0 : actualRevenue * 0.20;
  const revenueIncVat = actualRevenue + vatAmount;
  const taxAt40 = Math.max(profit, 0) * 0.40;
  const profitAfterTax = profit - taxAt40;
  const actualDays = new Set((job.actualEntries || []).map(entry => entry.date).filter(Boolean)).size;
  return {
    plannedTotals,
    actualTotals,
    remainingTotals,
    plannedCount,
    actualCount,
    pipetteRevenue: roundMoney(pipetteRevenue),
    partsRevenue: roundMoney(partsRevenue),
    partsCost: roundMoney(partsCost),
    actualRevenue: roundMoney(actualRevenue),
    mileageRatePence,
    stickerCostPerPipette,
    stickerCost: roundMoney(stickerCost),
    vatAmount: roundMoney(vatAmount),
    revenueIncVat: roundMoney(revenueIncVat),
    mileageCost: roundMoney(mileageCost),
    totalCosts: roundMoney(totalCosts),
    profit: roundMoney(profit),
    taxAt40: roundMoney(taxAt40),
    profitAfterTax: roundMoney(profitAfterTax),
    actualDays,
    profitPerDay: roundMoney(actualDays > 0 ? profit / actualDays : profit),
  };
}

function renderMiniTotals(title, totals) {
  return `
    <div class="job-mini-table">
      <strong>${escapeHtml(title)}</strong>
      <span>Single ${totals.single}</span>
      <span>6ch ${totals.multi6}</span>
      <span>8ch ${totals.multi8}</span>
      <span>12ch ${totals.multi12}</span>
      <span>16ch ${totals.multi16}</span>
    </div>`;
}

function renderJobSheets(jobs) {
  const container = document.getElementById('jobSheets');
  if (!container) return;
  if (!jobs || jobs.length === 0) {
    container.innerHTML = '<p class="empty-state">No job sheets yet. Create one from a saved quote.</p>';
    return;
  }

  container.innerHTML = jobs.map(job => {
    const calc = calculateJobSheet(job);
    const ref = job.quoteRef || buildRefCode(job.quoteSnapshot?.refPrefix, job.quoteSnapshot?.refNumber, true);
    const isExpanded = typeof expandedJobIds !== 'undefined' && expandedJobIds.has(job.id);
    return `
      <div class="job-card" id="job-card-${escapeHtml(job.id)}" data-id="${escapeHtml(job.id)}">
        <div class="history-header">
          <strong>${escapeHtml(job.customerName || 'Unnamed job')}</strong>
          ${ref ? `<span class="ref-badge">${escapeHtml(ref)}</span>` : ''}
          ${job.proposedDate ? `<span class="history-date">Proposed ${escapeHtml(formatProposedDate(job.proposedDate))}</span>` : ''}
          <span class="history-date">Updated ${escapeHtml(formatDate(job.updatedAt || job.createdAt))}</span>
        </div>
        <div class="job-list-summary">
          <span>Planned <strong>${calc.plannedCount}</strong></span>
          <span>Actual <strong>${calc.actualCount}</strong></span>
          <span>Remaining <strong>${sumTotals(calc.remainingTotals)}</strong></span>
          <span>Profit <strong>${formatCurrency(calc.profit)}</strong></span>
        </div>
        <div class="job-detail" style="display:${isExpanded ? 'block' : 'none'};">
          <div class="job-summary-grid">
          ${renderMiniTotals('Planned', calc.plannedTotals)}
          ${renderMiniTotals('Actual', calc.actualTotals)}
          ${renderMiniTotals('Remaining', calc.remainingTotals)}
          <div class="job-kpis">
            <span>Actual days <strong>${calc.actualDays}</strong></span>
            <span>Actual revenue <strong>${formatCurrency(calc.actualRevenue)}</strong></span>
            <span>Costs <strong>${formatCurrency(calc.totalCosts)}</strong></span>
            <span>Profit <strong>${formatCurrency(calc.profit)}</strong></span>
          </div>
          </div>
          <div class="job-meta-grid">
          <div class="form-group">
            <label>PO number</label>
            <input type="text" value="${escapeHtml(job.poNumber || '')}" onchange="updateJobField('${escapeJsString(job.id)}','poNumber',this.value)">
          </div>
          <div class="form-group">
            <label>Invoice number</label>
            <input type="text" value="${escapeHtml(job.invoiceNumber || '')}" onchange="updateJobField('${escapeJsString(job.id)}','invoiceNumber',this.value)">
          </div>
          </div>
          <div class="job-editor">
          <div class="job-assumptions">
            <strong>From quote</strong>
            <span>Service level: ${escapeHtml(job.quotedServiceLevelSummary || 'Not set')}</span>
            <span>Mileage: ${(job.quotedAssumptions?.totalTripMiles || job.costs?.mileageMiles || 0)} miles @ ${calc.mileageRatePence}p</span>
            ${job.quotedAssumptions?.hotelCost ? `<span>Hotel carried over: ${formatCurrency(job.quotedAssumptions.hotelCost)}</span>` : ''}
            ${job.quotedAssumptions?.stickerCost ? `<span>Sticker estimate: ${formatCurrency(job.quotedAssumptions.stickerCost)} (${formatCurrency(job.quotedAssumptions.stickerCostPerPipette || 0)} each quoted)</span>` : ''}
            ${job.quotedAssumptions?.secondPersonCost ? `<span>Second person: ${formatCurrency(job.quotedAssumptions.secondPersonCost)}</span>` : ''}
          </div>
          <h3>Actual pipettes by day</h3>
          <div class="job-entry-list">
            ${(job.actualEntries || []).map(entry => renderJobEntryRow(job, entry)).join('')}
          </div>
          <button class="btn-small" onclick="addJobEntry('${escapeJsString(job.id)}')">Add day / service row</button>

          <h3>Costs</h3>
          <div class="job-cost-grid">
            ${renderJobCostInput(job.id, 'hotel', 'Hotel', job.costs?.hotel)}
            ${renderJobCostInput(job.id, 'food', 'Food', job.costs?.food)}
            ${renderJobCostInput(job.id, 'fuel', 'Fuel', job.costs?.fuel)}
            ${renderJobCalculatedCost('Extra parts cost', calc.partsCost)}
            ${renderJobCostInput(job.id, 'shipping', 'Shipping', job.costs?.shipping)}
            ${renderJobCostInput(job.id, 'secondPerson', 'Second person', job.costs?.secondPerson)}
            ${renderJobCostInput(job.id, 'other', 'Other', job.costs?.other)}
            ${renderJobCostInput(job.id, 'mileageMiles', 'Mileage miles', job.costs?.mileageMiles)}
            ${renderJobFieldInput(job.id, 'stickerCostPerPipette', 'Sticker cost per pipette', job.stickerCostPerPipette ?? calc.stickerCostPerPipette, '0.01')}
          </div>
          <div class="field-hint">Mileage cost uses ${calc.mileageRatePence}p per mile.</div>
          <div class="field-hint">Sticker cost is ${calc.actualCount} actual pipette${calc.actualCount !== 1 ? 's' : ''} × ${formatCurrency(calc.stickerCostPerPipette)} = ${formatCurrency(calc.stickerCost)}.</div>

          <h3>Parts</h3>
          <div class="job-parts-list">
            ${(job.parts || []).map(part => renderJobPartRow(job, part)).join('')}
          </div>
          <button class="btn-small" onclick="addJobPart('${escapeJsString(job.id)}')">Add part</button>
          <div class="job-parts-summary">
            <span>Parts cost <strong>${formatCurrency(calc.partsCost)}</strong></span>
            <span>Customer parts price <strong>${formatCurrency(calc.partsRevenue)}</strong></span>
          </div>

          <div class="form-group" style="margin-top:0.75rem;">
            <label>Work carried out</label>
            <textarea class="job-notes" data-job-id="${escapeHtml(job.id)}" rows="3" onchange="updateJobField('${escapeJsString(job.id)}','workCarriedOut',this.value)">${escapeHtml(job.workCarriedOut || '')}</textarea>
          </div>
          <div class="form-group">
            <label>Job notes</label>
            <textarea class="job-notes" data-job-id="${escapeHtml(job.id)}" rows="3" onchange="updateJobNotes('${escapeJsString(job.id)}', this.value)">${escapeHtml(job.notes || '')}</textarea>
          </div>
          </div>
        </div>
        <div class="history-actions">
          <button class="btn-small btn-quote" onclick="toggleJobDetail('${escapeJsString(job.id)}')">${isExpanded ? 'Close Job Sheet' : 'Open Job Sheet'}</button>
          <button class="btn-small btn-quote" onclick="saveJobSheet('${escapeJsString(job.id)}')">Save Job Sheet</button>
          <button class="btn-small" onclick="exportJobSheetCsv('${escapeJsString(job.id)}')">Export CSV</button>
          <button class="btn-small btn-delete" onclick="deleteJobSheet('${escapeJsString(job.id)}')">Delete</button>
        </div>
      </div>`;
  }).join('');
}

function renderJobEntryRow(job, entry) {
  const settings = job.settingsSnapshot || DEFAULT_SETTINGS;
  const options = (settings.serviceLevels || []).map(sl =>
    `<option value="${escapeHtml(sl.id)}" ${sl.id === entry.serviceLevelId ? 'selected' : ''}>${escapeHtml(sl.name)}</option>`
  ).join('');
  return `
    <div class="job-entry-row" data-entry-id="${escapeHtml(entry.id)}">
      <input type="date" value="${escapeHtml(entry.date || '')}" onchange="updateJobEntry('${escapeJsString(job.id)}','${escapeJsString(entry.id)}','date',this.value)">
      <select onchange="updateJobEntry('${escapeJsString(job.id)}','${escapeJsString(entry.id)}','serviceLevelId',this.value)">${options}</select>
      <input type="number" min="0" value="${entry.singleChannelCount || 0}" placeholder="Single" onchange="updateJobEntry('${escapeJsString(job.id)}','${escapeJsString(entry.id)}','singleChannelCount',this.value)">
      <input type="number" min="0" value="${entry.multiChannel6Count || 0}" placeholder="6ch" onchange="updateJobEntry('${escapeJsString(job.id)}','${escapeJsString(entry.id)}','multiChannel6Count',this.value)">
      <input type="number" min="0" value="${entry.multiChannel8Count || 0}" placeholder="8ch" onchange="updateJobEntry('${escapeJsString(job.id)}','${escapeJsString(entry.id)}','multiChannel8Count',this.value)">
      <input type="number" min="0" value="${entry.multiChannel12Count || 0}" placeholder="12ch" onchange="updateJobEntry('${escapeJsString(job.id)}','${escapeJsString(entry.id)}','multiChannel12Count',this.value)">
      <input type="number" min="0" value="${entry.multiChannel16Count || 0}" placeholder="16ch" onchange="updateJobEntry('${escapeJsString(job.id)}','${escapeJsString(entry.id)}','multiChannel16Count',this.value)">
      <button class="btn-small btn-delete" onclick="deleteJobEntry('${escapeJsString(job.id)}','${escapeJsString(entry.id)}')">Remove</button>
    </div>`;
}

function getJobPartsCatalog(job) {
  return (typeof currentSettings !== 'undefined' && currentSettings?.partsCatalog)
    || job.partsCatalogSnapshot
    || job.settingsSnapshot?.partsCatalog
    || DEFAULT_SETTINGS.partsCatalog
    || [];
}

function renderJobPartRow(job, part) {
  const catalog = getJobPartsCatalog(job);
  const options = catalog.map(catalogPart =>
    `<option value="${escapeHtml(catalogPart.id)}" ${catalogPart.id === part.catalogPartId ? 'selected' : ''}>${escapeHtml(getCatalogPartName(catalogPart))}</option>`
  ).join('');
  const quantity = part.quantity || 1;
  const costTotal = (parseFloat(quantity) || 0) * (parseFloat(part.costPerUnit) || 0);
  const priceTotal = (parseFloat(quantity) || 0) * (parseFloat(part.pricePerUnit) || 0);
  return `
    <div class="job-part-row" data-part-id="${escapeHtml(part.id)}">
      <select onchange="updateJobPart('${escapeJsString(job.id)}','${escapeJsString(part.id)}','catalogPartId',this.value)">${options}</select>
      <input type="text" value="${escapeHtml(part.name || '')}" placeholder="Part name" onchange="updateJobPart('${escapeJsString(job.id)}','${escapeJsString(part.id)}','name',this.value)">
      <input type="number" min="0" step="1" value="${quantity}" placeholder="Qty" onchange="updateJobPart('${escapeJsString(job.id)}','${escapeJsString(part.id)}','quantity',this.value)">
      <input type="number" min="0" step="0.01" value="${part.costPerUnit || 0}" placeholder="Cost" onchange="updateJobPart('${escapeJsString(job.id)}','${escapeJsString(part.id)}','costPerUnit',this.value)">
      <input type="number" min="0" step="0.01" value="${part.pricePerUnit || 0}" placeholder="Price" onchange="updateJobPart('${escapeJsString(job.id)}','${escapeJsString(part.id)}','pricePerUnit',this.value)">
      <span>${formatCurrency(costTotal)}</span>
      <span>${formatCurrency(priceTotal)}</span>
      <button class="btn-small btn-delete" onclick="deleteJobPart('${escapeJsString(job.id)}','${escapeJsString(part.id)}')">Remove</button>
    </div>`;
}

function renderJobCostInput(jobId, field, label, value) {
  return `
    <div class="form-group">
      <label>${escapeHtml(label)}</label>
      <input type="number" min="0" step="0.01" value="${value || 0}" onchange="updateJobCost('${escapeJsString(jobId)}','${escapeJsString(field)}',this.value)">
    </div>`;
}

function renderJobCalculatedCost(label, value) {
  return `
    <div class="form-group">
      <label>${escapeHtml(label)}</label>
      <input type="number" value="${value || 0}" readonly>
    </div>`;
}

function renderJobFieldInput(jobId, field, label, value, step = '1') {
  return `
    <div class="form-group">
      <label>${escapeHtml(label)}</label>
      <input type="number" min="0" step="${escapeHtml(step)}" value="${value || 0}" onchange="updateJobField('${escapeJsString(jobId)}','${escapeJsString(field)}',this.value)">
    </div>`;
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
    const quoteSettings = typeof getSettingsForQuote === 'function'
      ? getSettingsForQuote(q, settings)
      : settings;
    const result = calculateQuote(q, quoteSettings);
    const refCode = buildRefCode(q.refPrefix, q.refNumber, true);
    const linkedJob = typeof currentJobs !== 'undefined'
      ? currentJobs.find(job => job.quoteId === q.id)
      : null;
    const hasJobSheet = Boolean(linkedJob);

    return `
    <div class="history-card ${hasJobSheet ? 'history-card-job-created' : ''}" data-id="${escapeHtml(q.id)}">
      <div class="history-header">
        <strong>${escapeHtml(q.customerName || 'Unnamed')}</strong>
        ${refCode ? `<span class="ref-badge">${escapeHtml(refCode)}</span>` : ''}
        ${hasJobSheet ? '<span class="job-created-badge">Job sheet created</span>' : ''}
        ${q.proposedDate ? `<span class="history-date">Proposed ${escapeHtml(formatProposedDate(q.proposedDate))}</span>` : ''}
        <span class="history-date">${new Date(q.createdAt).toLocaleDateString('en-GB')}</span>
        ${q.savedBy ? `<span class="history-saved-by">by ${escapeHtml(q.savedBy)}</span>` : ''}
      </div>
      <div class="history-summary" id="history-summary-${escapeHtml(q.id)}" style="display:none;">
        <div class="history-summary-content"></div>
      </div>
      <div class="history-details">
        <span>${result.totalPipettes} pipettes</span>
        <span>${result.timePlan.totalDays} day${result.timePlan.totalDays !== 1 ? 's' : ''}</span>
        <span class="history-total">${formatCurrency(result.totalQuotePrice)}</span>
        <span class="${getProfitClass(result.profitMarginPercent)}">${formatPercent(result.profitMarginPercent)} (${formatCurrency(result.profitAmount)})</span>
      </div>
      ${q.notes ? `<div class="history-notes">${formatMultilineText(q.notes)}</div>` : ''}
      <div class="history-actions">
        <button class="btn-small" onclick="toggleQuoteDetail('${escapeJsString(q.id)}')">View details</button>
        <button class="btn-small" onclick="loadQuote('${escapeJsString(q.id)}')">Load into form</button>
        ${hasJobSheet
          ? `<button class="btn-small btn-quote" onclick="openJobSheet('${escapeJsString(linkedJob.id)}')">Open Job Sheet</button>`
          : `<button class="btn-small btn-quote" onclick="createJobSheetFromQuote('${escapeJsString(q.id)}')">Create Job Sheet</button>`}
        <button class="btn-small btn-quote" onclick="openCustomerQuoteFromHistory('${escapeJsString(q.id)}')">Customer Quote</button>
        <button class="btn-small btn-delete" onclick="deleteQuote('${escapeJsString(q.id)}')">Delete</button>
      </div>
    </div>`;
  }).join('');
}
