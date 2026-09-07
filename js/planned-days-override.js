// ============================================================
// planned-days-override.js — Manual planned-day control + timing diagnostics
// ============================================================

(function () {
  if (window.__kirkstonePlannedDaysOverrideInstalled) return;
  window.__kirkstonePlannedDaysOverrideInstalled = true;

  const originalCollectQuoteInputFromForm = window.collectQuoteInputFromForm;
  const originalCalculateQuote = window.calculateQuote;
  const originalRenderQuoteSummary = window.renderQuoteSummary;
  const originalLoadQuote = window.loadQuote;

  function getInput() {
    return document.getElementById('plannedDaysOverride');
  }

  function getOverrideDays() {
    const value = parseInt(getInput()?.value, 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function getServiceLevelForLine(line, settings) {
    const levels = Array.isArray(settings?.serviceLevels) ? settings.serviceLevels : [];
    return levels.find(sl => sl.id === line?.serviceLevelId) || levels[0] || null;
  }

  function timingBasis(input, settings) {
    return (input?.pipetteLines || []).map(line => {
      if (line?.isRepair) return null;
      const sl = getServiceLevelForLine(line, settings);
      if (!sl) return null;
      const types = [
        ['Single', line.singleChannelCount || 0, sl.minutesPerSingleChannel || 0],
        ['6-ch', line.multiChannel6Count || 0, sl.minutesPerMultiChannel6 || sl.minutesPerMultiChannel || 0],
        ['8-ch', line.multiChannel8Count || 0, sl.minutesPerMultiChannel8 || sl.minutesPerMultiChannel || 0],
        ['12-ch', line.multiChannel12Count || 0, sl.minutesPerMultiChannel12 || sl.minutesPerMultiChannel || 0],
        ['16-ch', line.multiChannel16Count || 0, sl.minutesPerMultiChannel16 || sl.minutesPerMultiChannel || 0],
      ].filter(([, count]) => count > 0);
      if (!types.length) return null;
      return { serviceLevelName: sl.name || line.serviceLevelId || 'Service level', types };
    }).filter(Boolean);
  }

  function recalcTotals(result, input, settings, days) {
    const overnightStay = !!input.overnightStay;
    const travelDayBefore = !!input.travelDayBefore;
    const travelMinutes = parseFloat(input.travelTimeMinutes) || 0;
    const distanceMiles = parseFloat(input.travelDistanceMiles) || 0;
    const roundTripMiles = distanceMiles * 2;
    const commuteTrips = (!overnightStay && days > 0) ? days : 1;
    const homeTripMiles = roundTripMiles * commuteTrips;

    const hotelToWorkDistanceMiles = overnightStay ? (parseFloat(input.hotelToWorkDistanceMiles) || 0) : 0;
    const hotelToWorkMins = overnightStay ? (parseFloat(input.hotelToWorkMinutes) || 0) : 0;
    let hotelCommuteTotalMiles = 0;
    let hotelCommuteTotalMins = 0;

    if (overnightStay && days > 0) {
      if (travelDayBefore) {
        hotelCommuteTotalMiles = hotelToWorkDistanceMiles > 0
          ? ((days - 1) * hotelToWorkDistanceMiles * 2) + hotelToWorkDistanceMiles
          : 0;
        hotelCommuteTotalMins = hotelToWorkMins > 0 ? hotelToWorkMins * (2 * days - 1) : 0;
      } else {
        hotelCommuteTotalMiles = hotelToWorkDistanceMiles > 0 && days > 1
          ? (days - 1) * hotelToWorkDistanceMiles * 2
          : 0;
        hotelCommuteTotalMins = hotelToWorkMins > 0 && days > 1
          ? (days - 1) * hotelToWorkMins * 2
          : 0;
      }
    }

    const returnHomeTrips = (overnightStay && input.returnHome) ? (parseInt(input.returnHomeTrips, 10) || 1) : 0;
    const returnHomeMiles = returnHomeTrips * roundTripMiles;
    const returnHomeTimeMins = returnHomeTrips * travelMinutes * 2;
    const totalTripMiles = homeTripMiles + hotelCommuteTotalMiles + returnHomeMiles;

    result.commuteTrips = commuteTrips;
    result.roundTripMiles = roundTripMiles;
    result.homeTripMiles = homeTripMiles;
    result.hotelToWorkDistanceMiles = hotelToWorkDistanceMiles;
    result.hotelCommuteTotalMiles = Math.round(hotelCommuteTotalMiles * 10) / 10;
    result.returnHomeTrips = returnHomeTrips;
    result.returnHomeMiles = Math.round(returnHomeMiles * 10) / 10;
    result.returnHomeTimeMins = returnHomeTimeMins;
    result.totalTripMiles = Math.round(totalTripMiles * 10) / 10;

    result.timePlan.totalDays = days;
    result.timePlan.totalHotelCommuteMins = hotelCommuteTotalMins;
    result.timePlan.totalMins = (result.timePlan.jobMins || 0)
      + (travelMinutes * 2 * commuteTrips)
      + hotelCommuteTotalMins
      + returnHomeTimeMins;

    result.jobNights = days > 1 ? days - 1 : 0;
    result.travelNight = travelDayBefore ? 1 : 0;
    result.suggestedNights = result.jobNights + result.travelNight;

    result.travelCharge = settings.travelChargeToCustomer
      ? result.totalTripMiles * (settings.travelChargePerMile || 0)
      : 0;

    result.costTravel = result.totalTripMiles * ((settings.mileageRatePence || 0) / 100);

    const homeTravelTotalMins = travelMinutes * 2 * commuteTrips;
    result.costLabourTravel = ((homeTravelTotalMins + hotelCommuteTotalMins + returnHomeTimeMins) / 60)
      * (settings.labourRatePerHour || 0);

    result.secondPersonDays = result.secondPerson ? days : 0;
    result.costSecondPerson = result.secondPerson
      ? days * (settings.secondPersonDayCost || 350)
      : 0;

    const totalDaysAway = days + (travelDayBefore ? 1 : 0);
    if (overnightStay && totalDaysAway > 0) {
      result.subsistenceDays = totalDaysAway;
      result.subsistenceRate = settings.subsistenceOvernightRate || 25;
      result.costSubsistence = totalDaysAway * result.subsistenceRate;
    } else if (days > 0) {
      result.subsistenceDays = days;
      result.subsistenceRate = settings.subsistenceDayTripRate || 10;
      result.costSubsistence = days * result.subsistenceRate;
    } else {
      result.subsistenceDays = 0;
      result.subsistenceRate = 0;
      result.costSubsistence = 0;
    }

    // Rebuild customer price because a manual day count can change chargeable travel.
    result.subtotalBeforeDiscount = (result.pipetteChargesTotal || 0)
      + (result.travelCharge || 0)
      + (result.accommodationCharge || 0)
      + (result.londonPremium || 0);
    result.discountAmount = result.subtotalBeforeDiscount * ((result.discountPercent || 0) / 100);
    result.totalQuotePrice = result.subtotalBeforeDiscount - result.discountAmount;

    result.totalInternalCost =
      (result.costPipettesTotal || 0) +
      (result.costTravel || 0) +
      (result.costAccommodation || 0) +
      (result.costLabourCalibration || 0) +
      (result.costLabourTravel || 0) +
      (result.costSecondPerson || 0) +
      (result.costSubsistence || 0);

    result.profitAmount = result.totalQuotePrice - result.totalInternalCost;
    result.profitMarginPercent = result.totalQuotePrice > 0
      ? (result.profitAmount / result.totalQuotePrice) * 100
      : 0;
    result.profitPerDay = days > 0 ? result.profitAmount / days : result.profitAmount;
  }

  function ensureControl() {
    if (getInput()) return;
    const calibrationTime = document.getElementById('calibrationTime');
    const card = calibrationTime?.closest('.card');
    if (!card) return;

    const wrap = document.createElement('div');
    wrap.className = 'planned-days-override-wrap';
    wrap.innerHTML = `
      <label for="plannedDaysOverride">Planned days override <span style="font-weight:400">(optional)</span></label>
      <input type="number" id="plannedDaysOverride" min="1" step="1" placeholder="e.g. 8">
      <div class="field-hint">Use your experience when the automatic time estimate is unrealistic. This recalculates daily travel, second-person days, subsistence and profit per day.</div>`;

    const dayRate = document.querySelector('.day-rate-override-wrap');
    if (dayRate) dayRate.insertAdjacentElement('afterend', wrap);
    else card.appendChild(wrap);

    getInput().addEventListener('input', () => {
      if (getOverrideDays() > 0) {
        const button = document.getElementById('dayRateOverrideBtn');
        if (button?.getAttribute('aria-pressed') === 'true') {
          button.setAttribute('aria-pressed', 'false');
          button.classList.remove('active');
          button.textContent = 'Day Rate / Single Day';
        }
      }
      if (typeof recalculate === 'function') recalculate();
      if (typeof autoSaveForm === 'function') autoSaveForm();
    });
  }

  if (typeof originalCollectQuoteInputFromForm === 'function') {
    window.collectQuoteInputFromForm = function () {
      const input = originalCollectQuoteInputFromForm();
      input.plannedDaysOverride = getOverrideDays();
      return input;
    };
  }

  if (typeof originalCalculateQuote === 'function') {
    window.calculateQuote = function (input, settings) {
      const result = originalCalculateQuote(input, settings);

      // The core engine used the manual calibration field for labour cost even when
      // its time plan fell back to the automatic pipette estimate. Use the actual
      // planned calibration/work minutes so internal labour is never silently zero.
      const plannedCalibrationMins = result?.timePlan?.jobMins || 0;
      if (!result?.repairMode) {
        result.costLabourCalibration = (plannedCalibrationMins / 60) * (settings.labourRatePerHour || 0);
      }

      result.timingBasis = timingBasis(input, settings);
      const requestedDays = parseInt(input?.plannedDaysOverride, 10) || 0;
      if (requestedDays > 0 && !input?.dayRateOverride && result?.timePlan) {
        result.autoCalculatedDays = result.timePlan.totalDays || 0;
        result.plannedDaysOverride = requestedDays;
        recalcTotals(result, input, settings, requestedDays);
      } else {
        // Labour fix can alter profit even without a manual-day override.
        result.totalInternalCost =
          (result.costPipettesTotal || 0) +
          (result.costTravel || 0) +
          (result.costAccommodation || 0) +
          (result.costLabourCalibration || 0) +
          (result.costLabourTravel || 0) +
          (result.costSecondPerson || 0) +
          (result.costSubsistence || 0);
        result.profitAmount = result.totalQuotePrice - result.totalInternalCost;
        result.profitMarginPercent = result.totalQuotePrice > 0
          ? (result.profitAmount / result.totalQuotePrice) * 100
          : 0;
        result.profitPerDay = result.timePlan?.totalDays > 0
          ? result.profitAmount / result.timePlan.totalDays
          : result.profitAmount;
      }
      return result;
    };
  }

  if (typeof originalRenderQuoteSummary === 'function') {
    window.renderQuoteSummary = function (result) {
      originalRenderQuoteSummary.apply(this, arguments);
      const container = document.getElementById('quoteSummary');
      if (!container) return;
      const timeSection = Array.from(container.querySelectorAll('.summary-section'))
        .find(section => section.querySelector('h3')?.textContent.trim() === 'Time Plan');
      if (!timeSection) return;

      if (result?.plannedDaysOverride && !timeSection.querySelector('.planned-days-summary-note')) {
        const note = document.createElement('div');
        note.className = 'summary-row planned-days-summary-note';
        const auto = result.autoCalculatedDays || 0;
        note.innerHTML = `<span>Planned days override</span><span>${result.plannedDaysOverride} days${auto ? ` · auto estimate was ${auto}` : ''}</span>`;
        const heading = timeSection.querySelector('h3');
        if (heading) heading.insertAdjacentElement('afterend', note);
      }

      if (Array.isArray(result?.timingBasis) && result.timingBasis.length && !timeSection.querySelector('.timing-basis-box')) {
        const box = document.createElement('div');
        box.className = 'timing-basis-box';
        const esc = typeof escapeHtml === 'function' ? escapeHtml : (v => String(v));
        box.innerHTML = `<strong>Timing used by this quote</strong>${result.timingBasis.map(line =>
          `<div><span>${esc(line.serviceLevelName)}:</span> ${line.types.map(([name, count, mins]) => `${count} × ${esc(name)} @ ${mins} min`).join(' · ')}</div>`
        ).join('')}`;
        timeSection.appendChild(box);
      }
    };
  }

  if (typeof originalLoadQuote === 'function') {
    window.loadQuote = function (id) {
      const quote = (typeof currentQuotes !== 'undefined' && Array.isArray(currentQuotes))
        ? currentQuotes.find(item => item.id === id)
        : null;
      const result = originalLoadQuote.apply(this, arguments);
      setTimeout(() => {
        ensureControl();
        if (getInput()) getInput().value = quote?.plannedDaysOverride || '';
        if (typeof recalculate === 'function') recalculate();
      }, 0);
      return result;
    };
  }

  function installStyles() {
    if (document.getElementById('plannedDaysOverrideStyles')) return;
    const style = document.createElement('style');
    style.id = 'plannedDaysOverrideStyles';
    style.textContent = `
      .planned-days-override-wrap{margin-top:.8rem;padding:.75rem;border:1px solid var(--border);border-radius:var(--radius);background:#fffaf0}
      .planned-days-override-wrap label{display:block;font-weight:700;margin-bottom:.4rem}
      .planned-days-override-wrap input{width:120px}
      .planned-days-override-wrap .field-hint{display:block;margin-top:.45rem;line-height:1.45}
      .planned-days-summary-note{background:#fffaf0;border-left:3px solid #d69e2e;padding-left:.6rem;font-weight:600}
      .timing-basis-box{margin-top:.65rem;padding:.65rem .75rem;background:#f7fafc;border:1px solid #e2e8f0;border-radius:5px;font-size:.82rem;line-height:1.55}
      .timing-basis-box strong{display:block;margin-bottom:.2rem}
    `;
    document.head.appendChild(style);
  }

  function initialise() {
    installStyles();
    ensureControl();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialise);
  else initialise();
})();
