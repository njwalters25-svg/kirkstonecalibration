// ============================================================
// day-rate-override.js — Allow a quote to be treated as one long working day
// ============================================================

(function () {
  if (window.__kirkstoneDayRateOverrideInstalled) return;
  window.__kirkstoneDayRateOverrideInstalled = true;

  const originalCollectQuoteInputFromForm = window.collectQuoteInputFromForm;
  const originalCalculateQuote = window.calculateQuote;
  const originalRenderQuoteSummary = window.renderQuoteSummary;
  const originalLoadQuote = window.loadQuote;

  function getButton() {
    return document.getElementById('dayRateOverrideBtn');
  }

  function isEnabled() {
    return getButton()?.getAttribute('aria-pressed') === 'true';
  }

  function setEnabled(enabled, recalc = false) {
    const button = getButton();
    if (!button) return;
    const on = !!enabled;
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
    button.classList.toggle('active', on);
    button.textContent = on ? 'Day Rate / Single Day ✓' : 'Day Rate / Single Day';

    if (on) {
      const overnight = document.getElementById('overnightStay');
      const travelDayBefore = document.getElementById('travelDayBefore');
      const returnHome = document.getElementById('returnHome');
      if (overnight) overnight.checked = false;
      if (travelDayBefore) travelDayBefore.checked = false;
      if (returnHome) returnHome.checked = false;
      const hotelFields = document.getElementById('hotelFields');
      const returnHomeFields = document.getElementById('returnHomeFields');
      if (hotelFields) hotelFields.style.display = 'none';
      if (returnHomeFields) returnHomeFields.style.display = 'none';
    }

    if (recalc) {
      if (typeof recalculate === 'function') recalculate();
      if (typeof autoSaveForm === 'function') autoSaveForm();
    }
  }

  function ensureButton() {
    if (getButton()) return;
    const calibrationTime = document.getElementById('calibrationTime');
    const card = calibrationTime?.closest('.card');
    if (!card) return;

    const wrap = document.createElement('div');
    wrap.className = 'day-rate-override-wrap';
    wrap.innerHTML = `
      <button type="button" id="dayRateOverrideBtn" class="btn btn-secondary day-rate-override-btn" aria-pressed="false">Day Rate / Single Day</button>
      <div class="field-hint day-rate-override-hint">Use when the job can be completed in one longer day. This overrides travel-based day planning, uses one return trip and does not suggest a hotel.</div>`;

    const autoEstimate = document.getElementById('autoEstimate');
    if (autoEstimate) autoEstimate.insertAdjacentElement('afterend', wrap);
    else card.appendChild(wrap);

    getButton().addEventListener('click', () => setEnabled(!isEnabled(), true));
  }

  if (typeof originalCollectQuoteInputFromForm === 'function') {
    window.collectQuoteInputFromForm = function () {
      const input = originalCollectQuoteInputFromForm();
      input.dayRateOverride = isEnabled();
      return input;
    };
  }

  if (typeof originalCalculateQuote === 'function') {
    window.calculateQuote = function (input, settings) {
      if (!input?.dayRateOverride) return originalCalculateQuote(input, settings);

      const adjustedInput = {
        ...input,
        overnightStay: false,
        travelDayBefore: false,
        returnHome: false,
        returnHomeTrips: 0,
        dayRateOverride: true,
      };
      const adjustedSettings = {
        ...settings,
        // Deliberately make the planning day very long so the standard engine
        // keeps all real travel/work minutes and costs but treats it as one trip/day.
        workingHoursPerDay: 100,
      };
      const result = originalCalculateQuote(adjustedInput, adjustedSettings);
      result.dayRateOverride = true;
      result.overnightSuggested = false;
      result.suggestedNights = 0;
      result.travelNight = 0;
      result.jobNights = 0;
      if (result.timePlan && (result.timePlan.jobMins > 0 || result.timePlan.travelTotalMins > 0)) {
        result.timePlan.totalDays = 1;
      }
      result.commuteTrips = 1;
      if (typeof result.profitAmount === 'number') result.profitPerDay = result.profitAmount;
      return result;
    };
  }

  if (typeof originalRenderQuoteSummary === 'function') {
    window.renderQuoteSummary = function (result) {
      originalRenderQuoteSummary.apply(this, arguments);
      if (!result?.dayRateOverride) return;
      const container = document.getElementById('quoteSummary');
      if (!container || container.querySelector('.day-rate-summary-note')) return;
      const timeSection = Array.from(container.querySelectorAll('.summary-section'))
        .find(section => section.querySelector('h3')?.textContent.trim() === 'Time Plan');
      if (!timeSection) return;
      const note = document.createElement('div');
      note.className = 'summary-row day-rate-summary-note';
      note.innerHTML = '<span>Planning override</span><span>Single long day · one return trip</span>';
      const heading = timeSection.querySelector('h3');
      if (heading) heading.insertAdjacentElement('afterend', note);
      else timeSection.prepend(note);
    };
  }

  if (typeof originalLoadQuote === 'function') {
    window.loadQuote = function (id) {
      const quote = (typeof currentQuotes !== 'undefined' && Array.isArray(currentQuotes))
        ? currentQuotes.find(item => item.id === id)
        : null;
      const result = originalLoadQuote.apply(this, arguments);
      setTimeout(() => setEnabled(!!quote?.dayRateOverride, true), 0);
      return result;
    };
  }

  function installStyles() {
    if (document.getElementById('dayRateOverrideStyles')) return;
    const style = document.createElement('style');
    style.id = 'dayRateOverrideStyles';
    style.textContent = `
      .day-rate-override-wrap{margin-top:.8rem;padding:.75rem;border:1px solid var(--border);border-radius:var(--radius);background:#f8fafc}
      .day-rate-override-btn{width:100%;font-weight:700}
      .day-rate-override-btn.active{background:#1a365d;color:#fff;border-color:#1a365d}
      .day-rate-override-hint{display:block;margin-top:.45rem;line-height:1.45}
      .day-rate-summary-note{background:#ebf8ff;border-left:3px solid #3182ce;padding-left:.6rem;font-weight:600}
    `;
    document.head.appendChild(style);
  }

  function initialise() {
    installStyles();
    ensureButton();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialise);
  else initialise();
})();
