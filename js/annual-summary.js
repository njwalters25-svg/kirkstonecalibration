// ============================================================
// annual-summary.js — Live annual summary based on Invoice Spreadsheet
// Mirrors the Annual Summary 2026-27 workbook logic.
// ============================================================

(function () {
  const MONEY = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
  const FIXED_MONTHLY = {
    rent: 483,
    software: 150,
    printer: 3,
    insurance: 103.17,
    sundries: 100,
  };
  const ANNUAL_CALIBRATION = 3000;
  const MONTHLY_CALIBRATION = ANNUAL_CALIBRATION / 12;
  const MONTHLY_FIXED = Object.values(FIXED_MONTHLY).reduce((sum, value) => sum + value, 0) + MONTHLY_CALIBRATION;

  function money(value) {
    return MONEY.format(Number(value) || 0);
  }

  function round(value) {
    return Math.round(((Number(value) || 0) + Number.EPSILON) * 100) / 100;
  }

  function getFinancialYearMonths() {
    const now = new Date();
    const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return Array.from({ length: 12 }, (_, index) => {
      const date = new Date(startYear, 3 + index, 1);
      return {
        year: date.getFullYear(),
        month: date.getMonth(),
        label: date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
      };
    });
  }

  function getInvoiceJobs() {
    if (typeof getInvoiceSpreadsheetJobs === 'function') return getInvoiceSpreadsheetJobs();
    if (typeof currentJobs === 'undefined' || !Array.isArray(currentJobs)) return [];
    return currentJobs.filter(job => job.invoiceSpreadsheetAdded === true);
  }

  function getValues(job) {
    if (typeof getInvoiceSpreadsheetValues === 'function') return getInvoiceSpreadsheetValues(job);
    return job.invoiceSpreadsheetSnapshot || {};
  }

  function validDate(value) {
    if (!value) return null;
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function estimatedTax(profit) {
    const p = Math.max(0, Number(profit) || 0);
    if (p <= 12570) return 0;
    if (p <= 50270) return (p - 12570) * 0.20;
    if (p <= 125140) return 7540 + (p - 50270) * 0.40;
    return 37488 + (p - 125140) * 0.45;
  }

  function estimatedNi(profit) {
    const p = Math.max(0, Number(profit) || 0);
    if (p <= 12570) return 0;
    if (p <= 50270) return (p - 12570) * 0.06;
    return 2262 + (p - 50270) * 0.02;
  }

  function buildSummary() {
    const months = getFinancialYearMonths();
    const jobs = getInvoiceJobs();
    const monthly = months.map(m => ({ ...m, income: 0, costs: 0, extra: 0, fixed: MONTHLY_FIXED, profit: 0, cumulative: 0 }));

    let unpaidProfit = 0;
    let totalDays = 0;

    jobs.forEach(job => {
      const values = getValues(job);
      totalDays += Number(values.numberOfDays) || 0;

      if (!job.invoiceDatePaid) {
        unpaidProfit += Number(values.preTaxProfit) || 0;
        return;
      }

      const paidDate = validDate(job.invoiceDatePaid);
      if (!paidDate) return;
      const bucket = monthly.find(m => m.year === paidDate.getFullYear() && m.month === paidDate.getMonth());
      if (!bucket) return;
      bucket.income += Number(values.excVat) || 0;
      bucket.costs += Number(values.cost) || 0;
    });

    let cumulative = 0;
    monthly.forEach(m => {
      m.income = round(m.income);
      m.costs = round(m.costs);
      m.profit = round(m.income - m.costs - m.fixed - m.extra);
      cumulative = round(cumulative + m.profit);
      m.cumulative = cumulative;
    });

    const annualIncome = round(monthly.reduce((sum, m) => sum + m.income, 0));
    const annualCosts = round(monthly.reduce((sum, m) => sum + m.costs, 0));
    const annualFixed = round(MONTHLY_FIXED * 12);
    const annualProfit = round(monthly.reduce((sum, m) => sum + m.profit, 0));
    const tax = round(estimatedTax(annualProfit));
    const ni = round(estimatedNi(annualProfit));
    const taxNi = round(tax + ni);
    const paidMonths = monthly.filter(m => m.income > 0).length;
    const averageActiveMonthProfit = paidMonths ? round(annualProfit / paidMonths) : 0;
    const averageGrossMargin = paidMonths ? round((annualIncome - annualCosts) / paidMonths) : 0;

    return {
      months, monthly, annualIncome, annualCosts, annualFixed, annualProfit,
      tax, ni, taxNi, unpaidProfit: round(unpaidProfit), unpaidTax: round(unpaidProfit * 0.42),
      totalDays: round(totalDays), profitPerMonth: round(annualProfit / 12),
      averageTakeHome: round((annualProfit - taxNi) / 12),
      averageActiveMonthProfit, averageGrossMargin,
    };
  }

  function ensureUi() {
    const nav = document.querySelector('.tab-nav');
    if (nav && !nav.querySelector('[data-tab="annualSummaryPanel"]')) {
      const button = document.createElement('button');
      button.className = 'tab-btn';
      button.dataset.tab = 'annualSummaryPanel';
      button.textContent = 'Annual Summary';
      nav.appendChild(button);
      button.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        button.classList.add('active');
        document.getElementById('annualSummaryPanel')?.classList.add('active');
        if (typeof saveKirkstoneUiState === 'function') saveKirkstoneUiState('annualSummaryPanel', null);
        renderAnnualSummary();
      });
    }

    const main = document.getElementById('appMain');
    if (main && !document.getElementById('annualSummaryPanel')) {
      const section = document.createElement('section');
      section.id = 'annualSummaryPanel';
      section.className = 'tab-panel';
      section.innerHTML = '<div class="card"><div id="annualSummary"></div></div>';
      main.appendChild(section);
    }
  }

  function renderAnnualSummary() {
    const container = document.getElementById('annualSummary');
    if (!container) return;
    const s = buildSummary();
    const yearLabel = `${s.months[0].year}-${String(s.months[11].year).slice(-2)}`;

    const row = (label, key, cls = '') => `<tr class="${cls}"><th>${label}</th>${s.monthly.map(m => `<td>${money(m[key])}</td>`).join('')}<td class="annual-ytd">${key === 'cumulative' ? money(s.annualProfit) : key === 'income' ? money(s.annualIncome) : key === 'costs' ? money(s.annualCosts) : key === 'fixed' ? money(s.annualFixed) : key === 'profit' ? money(s.annualProfit) : ''}</td></tr>`;

    container.innerHTML = `
      <div class="annual-summary-header">
        <div><h2>Annual Summary ${yearLabel}</h2><p>Live from the Invoice Spreadsheet. Monthly income and costs are counted when the invoice is marked paid, matching your Excel annual summary.</p></div>
      </div>

      <div class="annual-kpis">
        <div class="annual-kpi"><span>Income exc VAT</span><strong>${money(s.annualIncome)}</strong></div>
        <div class="annual-kpi"><span>Costs</span><strong>${money(s.annualCosts)}</strong></div>
        <div class="annual-kpi"><span>Estimated pre-tax profit</span><strong>${money(s.annualProfit)}</strong></div>
        <div class="annual-kpi"><span>Average take home / month</span><strong>${money(s.averageTakeHome)}</strong></div>
      </div>

      <div class="annual-table-wrap">
        <table class="annual-table">
          <thead><tr><th>Estimated Profits</th>${s.months.map(m => `<th>${m.label}</th>`).join('')}<th>Year total</th></tr></thead>
          <tbody>
            ${row('Income exc VAT', 'income')}
            ${row('Costs', 'costs')}
            ${row('Fixed costs', 'fixed')}
            ${row('Extra costs', 'extra')}
            ${row('Pre-tax profit', 'profit', 'annual-profit-row')}
            ${row('Cumulative profit', 'cumulative', 'annual-cumulative-row')}
          </tbody>
        </table>
      </div>

      <div class="annual-detail-grid">
        <div class="annual-detail-card"><h3>Monthly Fixed Costs</h3>
          <div><span>Rent</span><strong>${money(FIXED_MONTHLY.rent)}</strong></div>
          <div><span>Software</span><strong>${money(FIXED_MONTHLY.software)}</strong></div>
          <div><span>Printer</span><strong>${money(FIXED_MONTHLY.printer)}</strong></div>
          <div><span>Insurance</span><strong>${money(FIXED_MONTHLY.insurance)}</strong></div>
          <div><span>Sundries</span><strong>${money(FIXED_MONTHLY.sundries)}</strong></div>
          <div><span>Calibration (${money(ANNUAL_CALIBRATION)}/year)</span><strong>${money(MONTHLY_CALIBRATION)}</strong></div>
          <div class="annual-detail-total"><span>Total fixed / month</span><strong>${money(MONTHLY_FIXED)}</strong></div>
        </div>
        <div class="annual-detail-card"><h3>Profit & Work</h3>
          <div><span>Profit per month (annual ÷ 12)</span><strong>${money(s.profitPerMonth)}</strong></div>
          <div><span>Average profit in active months</span><strong>${money(s.averageActiveMonthProfit)}</strong></div>
          <div><span>Average income less job costs / active month</span><strong>${money(s.averageGrossMargin)}</strong></div>
          <div><span>Number of days</span><strong>${s.totalDays}</strong></div>
        </div>
        <div class="annual-detail-card"><h3>Estimated Tax & NI</h3>
          <div><span>Estimated Tax</span><strong>${money(s.tax)}</strong></div>
          <div><span>Estimated NI</span><strong>${money(s.ni)}</strong></div>
          <div class="annual-detail-total"><span>Estimated Tax + NI</span><strong>${money(s.taxNi)}</strong></div>
          <div><span>Invoices still owed (pre-tax profit)</span><strong>${money(s.unpaidProfit)}</strong></div>
          <div><span>Tax on unpaid invoices (42%)</span><strong>${money(s.unpaidTax)}</strong></div>
        </div>
      </div>

      <p class="annual-tax-note">Tax & NI are a rough 2026-27 estimate only: personal allowance £12,570, 40% from £50,270, 45% from £125,140, Class 4 NI 6% then 2%. Figures are for guidance; the accountant does the real return.</p>`;
  }

  function installStyles() {
    if (document.getElementById('annualSummaryStyles')) return;
    const style = document.createElement('style');
    style.id = 'annualSummaryStyles';
    style.textContent = `
      .annual-summary-header{margin-bottom:1rem}.annual-summary-header h2{margin:0;color:var(--primary)}.annual-summary-header p{margin:.3rem 0 0;color:var(--text-light)}
      .annual-kpis{display:grid;grid-template-columns:repeat(4,minmax(160px,1fr));gap:12px;margin-bottom:16px}.annual-kpi{padding:14px;border:1px solid var(--border);border-radius:8px;background:#f8fafc}.annual-kpi span{display:block;color:var(--text-light);font-size:12px;margin-bottom:5px}.annual-kpi strong{font-size:20px;color:var(--primary)}
      .annual-table-wrap{width:100%;overflow:auto;border:1px solid var(--border);border-radius:8px;background:#fff}.annual-table{width:max-content;min-width:100%;border-collapse:separate;border-spacing:0;font-size:12px}.annual-table th,.annual-table td{padding:8px 10px;border-right:1px solid #edf2f7;border-bottom:1px solid #edf2f7;white-space:nowrap;text-align:right;font-variant-numeric:tabular-nums}.annual-table thead th{position:sticky;top:0;z-index:3;background:var(--primary);color:#fff;text-align:center}.annual-table thead th:first-child{left:0;z-index:5;text-align:left}.annual-table tbody th{position:sticky;left:0;z-index:2;background:#fff;text-align:left;color:var(--text);min-width:145px}.annual-table tbody tr:nth-child(even) th,.annual-table tbody tr:nth-child(even) td{background:#f8fafc}.annual-table .annual-profit-row th,.annual-table .annual-profit-row td{font-weight:800;background:#ecfdf5}.annual-table .annual-cumulative-row th,.annual-table .annual-cumulative-row td{font-weight:700;background:#eff6ff}.annual-ytd{font-weight:800;border-left:2px solid #cbd5e1}
      .annual-detail-grid{display:grid;grid-template-columns:repeat(3,minmax(240px,1fr));gap:14px;margin-top:16px}.annual-detail-card{border:1px solid var(--border);border-radius:8px;padding:14px;background:#fff}.annual-detail-card h3{margin:0 0 10px;color:var(--primary)}.annual-detail-card>div{display:flex;justify-content:space-between;gap:14px;padding:6px 0;border-bottom:1px solid #edf2f7}.annual-detail-card>div:last-child{border-bottom:0}.annual-detail-card span{color:var(--text-light)}.annual-detail-total{font-weight:800}.annual-detail-total span{color:var(--text)!important}.annual-tax-note{margin:16px 0 0;padding:10px 12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:7px;color:#9a3412;font-size:12px}
      @media(max-width:950px){.annual-kpis{grid-template-columns:repeat(2,minmax(150px,1fr))}.annual-detail-grid{grid-template-columns:1fr}}
      @media(max-width:600px){.annual-kpis{grid-template-columns:1fr}.annual-table{font-size:11px}}
    `;
    document.head.appendChild(style);
  }

  window.renderAnnualSummary = renderAnnualSummary;

  document.addEventListener('DOMContentLoaded', () => {
    ensureUi();
    installStyles();
    renderAnnualSummary();

    if (typeof window.renderInvoiceSpreadsheet === 'function') {
      const originalRender = window.renderInvoiceSpreadsheet;
      window.renderInvoiceSpreadsheet = function () {
        const result = originalRender.apply(this, arguments);
        renderAnnualSummary();
        return result;
      };
    }
  });
})();
