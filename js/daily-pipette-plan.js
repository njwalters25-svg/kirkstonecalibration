// ============================================================
// daily-pipette-plan.js — Daily pipette availability plan
// Shows how many pipettes of each type the customer should make
// available across the quoted number of working days.
// ============================================================

(function () {
  if (window.__kirkstoneDailyPipettePlanInstalled) return;
  window.__kirkstoneDailyPipettePlanInstalled = true;

  const TYPE_DEFS = [
    ['singleCount', 'Single-channel'],
    ['multi6Count', '6-channel'],
    ['multi8Count', '8-channel'],
    ['multi12Count', '12-channel'],
    ['multi16Count', '16-channel'],
  ];

  function getPlan(result) {
    const days = Math.max(1, parseInt(result?.timePlan?.totalDays, 10) || 1);
    const totals = Object.fromEntries(TYPE_DEFS.map(([field]) => [field, 0]));

    (result?.lineResults || []).forEach(line => {
      TYPE_DEFS.forEach(([field]) => {
        totals[field] += parseInt(line?.[field], 10) || 0;
      });
    });

    return {
      days,
      rows: TYPE_DEFS
        .map(([field, label]) => ({ label, total: totals[field] }))
        .filter(row => row.total > 0),
    };
  }

  function dailyRequirement(total, days) {
    if (days <= 1) return `roughly ${total} per day`;
    return `roughly ${Math.ceil(total / days)} per day`;
  }

  function buildInternalSection(result) {
    const plan = getPlan(result);
    if (!plan.rows.length) return '';

    return `
      <div class="summary-section daily-pipette-plan-section">
        <h3>Pipettes Required Per Day</h3>
        <div class="summary-row" style="font-size:0.78rem;color:var(--text-light);">
          <span>To complete the quoted work over ${plan.days} working day${plan.days === 1 ? '' : 's'}, ask the customer to make approximately the following available:</span><span></span>
        </div>
        ${plan.rows.map(row => `
          <div class="summary-row">
            <span>${typeof escapeHtml === 'function' ? escapeHtml(row.label) : row.label} (${row.total} total)</span>
            <span>${dailyRequirement(row.total, plan.days)}</span>
          </div>`).join('')}
      </div>`;
  }

  function installInternalQuoteSection() {
    if (typeof window.renderQuoteSummary !== 'function' || window.__dailyPipettePlanRenderWrapped) return;
    window.__dailyPipettePlanRenderWrapped = true;
    const originalRenderQuoteSummary = window.renderQuoteSummary;

    window.renderQuoteSummary = function dailyPlanAwareQuoteSummary(result) {
      originalRenderQuoteSummary.apply(this, arguments);
      const container = document.getElementById('quoteSummary');
      if (!container) return;
      container.querySelector('.daily-pipette-plan-section')?.remove();
      const html = buildInternalSection(result);
      if (!html) return;

      const timePlan = container.querySelector('.time-plan-section');
      if (timePlan) timePlan.insertAdjacentHTML('afterend', html);
      else container.insertAdjacentHTML('beforeend', html);
    };
  }

  function injectCustomerQuotePlan(quoteWindow, result) {
    if (!quoteWindow || quoteWindow.closed) return;
    try {
      const doc = quoteWindow.document;
      if (!doc || doc.querySelector('.customer-daily-pipette-plan')) return;

      const plan = getPlan(result);
      if (!plan.rows.length) return;
      const esc = value => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

      const section = doc.createElement('div');
      section.className = 'customer-daily-pipette-plan';
      section.innerHTML = `
        <div style="margin:1.35rem 2.5rem 0;padding:1rem 1.15rem;background:#f7fafc;border:1px solid #dbe3ee;border-radius:6px;">
          <div style="font-size:11pt;font-weight:700;color:#1a365d;margin-bottom:.35rem;">Pipettes required each day</div>
          <div style="font-size:9pt;color:#4a5568;line-height:1.5;margin-bottom:.65rem;">To allow the work to be completed within the quoted ${plan.days} working day${plan.days === 1 ? '' : 's'}, please make approximately the following pipettes available during the visit.</div>
          <table style="width:100%;border-collapse:collapse;font-size:9.5pt;">
            <thead><tr><th style="text-align:left;padding:.4rem .5rem;border-bottom:1px solid #cbd5e1;">Pipette type</th><th style="text-align:right;padding:.4rem .5rem;border-bottom:1px solid #cbd5e1;">Total</th><th style="text-align:right;padding:.4rem .5rem;border-bottom:1px solid #cbd5e1;">Daily requirement</th></tr></thead>
            <tbody>${plan.rows.map(row => `<tr><td style="padding:.45rem .5rem;border-bottom:1px solid #edf2f7;">${esc(row.label)}</td><td style="text-align:right;padding:.45rem .5rem;border-bottom:1px solid #edf2f7;">${row.total}</td><td style="text-align:right;padding:.45rem .5rem;border-bottom:1px solid #edf2f7;">${esc(dailyRequirement(row.total, plan.days))}</td></tr>`).join('')}</tbody>
          </table>
        </div>`;

      const disclaimer = doc.querySelector('.doc-disclaimer');
      if (disclaimer) disclaimer.parentNode.insertBefore(section, disclaimer);
      else doc.querySelector('.page')?.appendChild(section);
    } catch (error) {
      console.warn('Could not add daily pipette plan to customer quote', error);
    }
  }

  function installCustomerQuoteSection() {
    if (typeof window.generateCustomerQuoteWindow !== 'function' || window.__dailyPipettePlanCustomerWrapped) return;
    window.__dailyPipettePlanCustomerWrapped = true;
    const originalGenerateCustomerQuoteWindow = window.generateCustomerQuoteWindow;

    window.generateCustomerQuoteWindow = function dailyPlanAwareCustomerQuote(result) {
      let openedWindow = null;
      const originalOpen = window.open;
      window.open = function () {
        openedWindow = originalOpen.apply(window, arguments);
        return openedWindow;
      };

      try {
        originalGenerateCustomerQuoteWindow.apply(this, arguments);
      } finally {
        window.open = originalOpen;
      }

      if (!openedWindow) return;
      const addPlan = () => injectCustomerQuotePlan(openedWindow, result);
      try {
        openedWindow.addEventListener('load', addPlan, { once: true });
      } catch (_) {}
      setTimeout(addPlan, 250);
      setTimeout(addPlan, 750);
    };
  }

  function install() {
    installInternalQuoteSection();
    installCustomerQuoteSection();
  }

  install();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  setTimeout(install, 500);
})();
