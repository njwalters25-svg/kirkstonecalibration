// ============================================================
// invoice-wage-allocation.js — Informational wage allocation only
// Does not alter invoice spreadsheet profit/loss calculations.
// ============================================================

(function () {
  if (window.__kirkstoneInvoiceWageAllocationLoaded) return;
  window.__kirkstoneInvoiceWageAllocationLoaded = true;

  function money(value) {
    if (typeof formatCurrency === 'function') return formatCurrency(parseFloat(value) || 0);
    return `£${(parseFloat(value) || 0).toFixed(2)}`;
  }

  function getAllocation(job) {
    if (!job) return { labour: 0, travel: 0, total: 0 };

    // Prefer a saved snapshot if one is added in future.
    if (job.wageAllocationSnapshot) {
      const labour = parseFloat(job.wageAllocationSnapshot.labour) || 0;
      const travel = parseFloat(job.wageAllocationSnapshot.travel) || 0;
      return { labour, travel, total: labour + travel };
    }

    // Job sheets retain the original quote and settings snapshots, so this
    // reproduces the wage allowances that were used when the quote was built.
    const quote = job.quoteSnapshot;
    const settings = job.settingsSnapshot || quote?.settingsSnapshot;
    if (!quote || !settings || typeof calculateQuote !== 'function') {
      return { labour: 0, travel: 0, total: 0 };
    }

    try {
      const result = calculateQuote(quote, settings);
      const labour = parseFloat(result.costLabourCalibration) || 0;
      const travel = parseFloat(result.costLabourTravel) || 0;
      return { labour, travel, total: labour + travel };
    } catch (error) {
      console.warn('Could not calculate wage allocation for job', job.id, error);
      return { labour: 0, travel: 0, total: 0 };
    }
  }

  function getSpreadsheetJobs() {
    try {
      if (typeof getInvoiceSpreadsheetJobs === 'function') return getInvoiceSpreadsheetJobs();
    } catch (_) {}
    if (typeof currentJobs === 'undefined' || !Array.isArray(currentJobs)) return [];
    return currentJobs.filter(job => job.invoiceSpreadsheetAdded === true);
  }

  function decorateInvoiceSpreadsheet() {
    const table = document.querySelector('#invoiceSpreadsheet .invoice-table');
    if (!table) return;

    const headerRow = table.querySelector('thead tr');
    if (!headerRow || headerRow.querySelector('[data-wage-allocation-heading]')) return;

    const headings = [
      ['Wages – Labour', 'labour'],
      ['Wages – Travel', 'travel'],
      ['Wages to Set Aside', 'total'],
    ];
    headings.forEach(([label, key], index) => {
      const th = document.createElement('th');
      th.textContent = label;
      th.dataset.wageAllocationHeading = key;
      th.className = `invoice-wage-heading${index === 0 ? ' invoice-wage-separator' : ''}`;
      th.title = 'Informational only — not included in Cost, Profit, Pension, Tax or Annual Summary calculations.';
      headerRow.appendChild(th);
    });

    const jobs = getSpreadsheetJobs();
    const bodyRows = Array.from(table.querySelectorAll('tbody tr'));
    let totalLabour = 0;
    let totalTravel = 0;

    bodyRows.forEach((row, index) => {
      const allocation = getAllocation(jobs[index]);
      totalLabour += allocation.labour;
      totalTravel += allocation.travel;
      [allocation.labour, allocation.travel, allocation.total].forEach((value, valueIndex) => {
        const td = document.createElement('td');
        td.className = `invoice-money invoice-wage-cell${valueIndex === 0 ? ' invoice-wage-separator' : ''}`;
        td.textContent = money(value);
        td.title = 'Wage allocation from the original quote. Informational only.';
        row.appendChild(td);
      });
    });

    const footerRow = table.querySelector('tfoot tr');
    if (footerRow) {
      [totalLabour, totalTravel, totalLabour + totalTravel].forEach((value, valueIndex) => {
        const th = document.createElement('th');
        th.className = `invoice-money invoice-wage-total${valueIndex === 0 ? ' invoice-wage-separator' : ''}`;
        th.textContent = money(value);
        footerRow.appendChild(th);
      });
    }
  }

  function installStyles() {
    if (document.getElementById('invoiceWageAllocationStyles')) return;
    const style = document.createElement('style');
    style.id = 'invoiceWageAllocationStyles';
    style.textContent = `
      .invoice-table thead th.invoice-wage-heading{background:#334e68;color:#fff}
      .invoice-wage-cell{background:#f0f4f8;font-weight:600;color:#243b53}
      .invoice-wage-total{background:#d9e2ec!important;color:#102a43!important;font-weight:800}
      .invoice-wage-separator{border-left:4px solid #829ab1!important}
      .invoice-row-settled .invoice-wage-cell{background:#dcfce7!important}
    `;
    document.head.appendChild(style);
  }

  function hookRenderer() {
    if (window.__kirkstoneInvoiceWageRendererHooked || typeof renderInvoiceSpreadsheet !== 'function') return;
    window.__kirkstoneInvoiceWageRendererHooked = true;
    const original = renderInvoiceSpreadsheet;
    window.renderInvoiceSpreadsheet = function renderInvoiceSpreadsheetWithWages(...args) {
      const result = original.apply(this, args);
      setTimeout(decorateInvoiceSpreadsheet, 0);
      return result;
    };
  }

  installStyles();
  hookRenderer();
  setTimeout(() => {
    hookRenderer();
    decorateInvoiceSpreadsheet();
  }, 0);

  const target = document.getElementById('invoiceSpreadsheet');
  if (target) {
    const observer = new MutationObserver(() => setTimeout(decorateInvoiceSpreadsheet, 0));
    observer.observe(target, { childList: true, subtree: true });
  }
})();
