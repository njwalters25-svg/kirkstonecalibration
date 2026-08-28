// ============================================================
// repair-quote.js — Repair mode for the New Quote pipette section
// ============================================================

(function () {
  let repairMode = false;

  const originalRenderPipetteLines = window.renderPipetteLines;
  const originalCollectPipetteLinesFromForm = window.collectPipetteLinesFromForm;
  const originalGetDefaultPipetteLine = window.getDefaultPipetteLine;
  const originalCollectQuoteInputFromForm = window.collectQuoteInputFromForm;
  const originalCalculateQuote = window.calculateQuote;
  const originalRenderQuoteSummary = window.renderQuoteSummary;

  function blankRepairLine() {
    return {
      isRepair: true,
      repairDescription: '',
      repairPrice: 0,
      serviceLevelId: '',
      singleChannelCount: 0,
      multiChannel6Count: 0,
      multiChannel8Count: 0,
      multiChannel12Count: 0,
      multiChannel16Count: 0,
    };
  }

  function isRepairLine(line) {
    return !!line?.isRepair || line?.repairDescription !== undefined || line?.repairPrice !== undefined;
  }

  function setButtonState() {
    const calibration = document.getElementById('quoteModeCalibration');
    const repair = document.getElementById('quoteModeRepair');
    if (calibration) calibration.classList.toggle('active', !repairMode);
    if (repair) repair.classList.toggle('active', repairMode);
    const add = document.getElementById('addPipetteLine');
    if (add) add.textContent = repairMode ? '+ Add repair item' : '+ Add line';
    const autoEstimate = document.getElementById('autoEstimate');
    if (autoEstimate) autoEstimate.style.display = repairMode ? 'none' : '';
  }

  function ensureModeButtons() {
    const container = document.getElementById('pipetteLines');
    if (!container || document.getElementById('quoteModeSwitch')) return;
    const switcher = document.createElement('div');
    switcher.id = 'quoteModeSwitch';
    switcher.className = 'quote-mode-switch';
    switcher.innerHTML = `
      <button type="button" id="quoteModeCalibration" class="btn btn-secondary active">Calibration</button>
      <button type="button" id="quoteModeRepair" class="btn btn-secondary">Repair</button>`;
    container.parentNode.insertBefore(switcher, container);

    document.getElementById('quoteModeCalibration').addEventListener('click', () => {
      if (!repairMode) return;
      repairMode = false;
      const settings = typeof getCalculationSettings === 'function' ? getCalculationSettings() : currentSettings;
      originalRenderPipetteLines([originalGetDefaultPipetteLine(settings)], settings);
      if (typeof wirePipetteLineEvents === 'function') wirePipetteLineEvents();
      setButtonState();
      if (typeof recalculate === 'function') recalculate();
      if (typeof autoSaveForm === 'function') autoSaveForm();
    });

    document.getElementById('quoteModeRepair').addEventListener('click', () => {
      if (repairMode) return;
      repairMode = true;
      renderRepairLines([blankRepairLine()]);
      setButtonState();
      if (typeof recalculate === 'function') recalculate();
      if (typeof autoSaveForm === 'function') autoSaveForm();
    });
    setButtonState();
  }

  function renderRepairLines(lines) {
    const container = document.getElementById('pipetteLines');
    if (!container) return;
    const repairLines = lines.length ? lines : [blankRepairLine()];
    container.innerHTML = repairLines.map((line, i) => `
      <div class="pipette-line repair-quote-line" data-index="${i}">
        <div class="repair-quote-grid">
          <div class="form-group repair-description-group">
            <label>Repair / work required</label>
            <input type="text" class="pl-repair-description" value="${escapeHtml(line.repairDescription || '')}" placeholder="e.g. Repair Gilson P1000 — replace seal and service">
          </div>
          <div class="form-group repair-price-group">
            <label>Price</label>
            <div class="repair-currency-input"><span class="repair-currency-prefix">£</span><input type="number" class="pl-repair-price" min="0" step="0.01" value="${parseFloat(line.repairPrice) || 0}"></div>
          </div>
          ${repairLines.length > 1 ? `<button type="button" class="btn-small btn-delete pl-remove" data-index="${i}">Remove</button>` : '<span></span>'}
        </div>
      </div>`).join('');
    if (typeof wirePipetteLineEvents === 'function') wirePipetteLineEvents();
    setButtonState();
  }

  window.renderPipetteLines = function (lines, settings) {
    const list = Array.isArray(lines) ? lines : [];
    if (repairMode || list.some(isRepairLine)) {
      repairMode = true;
      renderRepairLines(list.filter(isRepairLine));
      return;
    }
    repairMode = false;
    originalRenderPipetteLines(list, settings);
    setButtonState();
  };

  window.collectPipetteLinesFromForm = function () {
    if (!repairMode) return originalCollectPipetteLinesFromForm();
    return Array.from(document.querySelectorAll('#pipetteLines .repair-quote-line')).map(el => ({
      isRepair: true,
      repairDescription: el.querySelector('.pl-repair-description')?.value.trim() || '',
      repairPrice: parseFloat(el.querySelector('.pl-repair-price')?.value) || 0,
      serviceLevelId: '',
      singleChannelCount: 0,
      multiChannel6Count: 0,
      multiChannel8Count: 0,
      multiChannel12Count: 0,
      multiChannel16Count: 0,
    }));
  };

  window.getDefaultPipetteLine = function (settings) {
    return repairMode ? blankRepairLine() : originalGetDefaultPipetteLine(settings);
  };

  window.collectQuoteInputFromForm = function () {
    const input = originalCollectQuoteInputFromForm();
    input.repairMode = repairMode || (input.pipetteLines || []).some(isRepairLine);
    return input;
  };

  window.calculateQuote = function (input, settings) {
    const repairLines = (input?.pipetteLines || []).filter(isRepairLine);
    if (!input?.repairMode && !repairLines.length) return originalCalculateQuote(input, settings);

    const baseInput = { ...input, pipetteLines: [], repairMode: true };
    const result = originalCalculateQuote(baseInput, settings);
    const cleanLines = repairLines.map(line => ({
      description: String(line.repairDescription || '').trim() || 'Repair',
      price: parseFloat(line.repairPrice) || 0,
    }));
    const repairTotal = cleanLines.reduce((sum, line) => sum + line.price, 0);

    result.repairMode = true;
    result.repairLines = cleanLines;
    result.lineResults = cleanLines.map(line => ({
      repair: true,
      serviceLevelName: line.description,
      repairDescription: line.description,
      repairPrice: line.price,
      singleCount: 0,
      multi6Count: 0,
      multi8Count: 0,
      multi12Count: 0,
      multi16Count: 0,
      chargeSingle: 0,
      chargeMulti6: 0,
      chargeMulti8: 0,
      chargeMulti12: 0,
      chargeMulti16: 0,
      chargeTotal: line.price,
      estimatedMins: 0,
    }));
    result.totalPipettes = cleanLines.length;
    result.totalChannels = 0;
    result.pipetteChargesTotal = repairTotal;
    result.costPipettesTotal = 0;
    result.londonPremium = input.isLondon ? repairTotal * ((settings.londonPremiumPercent || 0) / 100) : 0;
    result.subtotalBeforeDiscount = repairTotal + result.travelCharge + result.accommodationCharge + result.londonPremium;
    result.discountAmount = result.subtotalBeforeDiscount * ((result.discountPercent || 0) / 100);
    result.totalQuotePrice = result.subtotalBeforeDiscount - result.discountAmount;
    result.profitAmount = result.totalQuotePrice - result.totalInternalCost;
    result.profitMarginPercent = result.totalQuotePrice > 0 ? (result.profitAmount / result.totalQuotePrice) * 100 : 0;
    result.profitPerDay = result.timePlan.totalDays > 0 ? result.profitAmount / result.timePlan.totalDays : result.profitAmount;
    return result;
  };

  window.renderQuoteSummary = function (result) {
    originalRenderQuoteSummary(result);
    if (!result?.repairMode) return;

    const container = document.getElementById('quoteSummary');
    const revenue = container?.querySelector('.summary-section');
    if (revenue) {
      Array.from(revenue.querySelectorAll('.summary-row')).forEach(row => {
        if (row.textContent.includes('No pipettes entered')) row.remove();
      });
      const subtotalRow = Array.from(revenue.querySelectorAll('.summary-row.subtotal')).find(row => row.textContent.includes('All pipettes'));
      if (subtotalRow) {
        const label = subtotalRow.querySelector('span');
        if (label) label.textContent = 'Repairs';
        (result.repairLines || []).forEach(line => {
          const row = document.createElement('div');
          row.className = 'summary-row';
          row.innerHTML = `<span>${escapeHtml(line.description)}</span><span>${formatCurrency(line.price)}</span>`;
          revenue.insertBefore(row, subtotalRow);
        });
      }
    }
    const pipetteCount = container?.querySelector('.profit-pipettes');
    if (pipetteCount) pipetteCount.textContent = `${(result.repairLines || []).length} repair item${(result.repairLines || []).length !== 1 ? 's' : ''}`;
  };

  function installStyles() {
    if (document.getElementById('repairQuoteStyles')) return;
    const style = document.createElement('style');
    style.id = 'repairQuoteStyles';
    style.textContent = `
      .quote-mode-switch{display:flex;gap:.5rem;margin:0 0 .85rem}.quote-mode-switch .btn{padding:.45rem .9rem}.quote-mode-switch .active{background:var(--primary);color:#fff;border-color:var(--primary)}
      .repair-quote-grid{display:grid;grid-template-columns:minmax(0,1fr) 160px auto;gap:.75rem;align-items:end}.repair-quote-line{padding:.85rem}.repair-description-group{min-width:0}.repair-price-group{min-width:0}
      .repair-currency-input{display:flex;align-items:center;width:100%;border:1px solid var(--border);border-radius:var(--radius);background:#fff;overflow:hidden}.repair-currency-prefix{flex:0 0 auto;padding:0 .45rem 0 .6rem;color:var(--text-light);font-weight:600;line-height:2.35}.repair-currency-input .pl-repair-price{flex:1 1 auto;min-width:0;width:100%;border:0!important;border-radius:0!important;padding-left:.15rem!important;box-shadow:none!important;background:transparent}.repair-currency-input .pl-repair-price:focus{outline:none;box-shadow:none!important}
      @media(max-width:650px){.repair-quote-grid{grid-template-columns:1fr}.repair-quote-grid .btn-delete{justify-self:start}}
    `;
    document.head.appendChild(style);
  }

  function initialise() {
    installStyles();
    ensureModeButtons();
    const existing = originalCollectPipetteLinesFromForm ? (() => {
      try { return originalCollectPipetteLinesFromForm(); } catch { return []; }
    })() : [];
    if ((existing || []).some(isRepairLine)) repairMode = true;
    setButtonState();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialise);
  else initialise();
})();
