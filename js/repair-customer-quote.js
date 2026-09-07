// ============================================================
// repair-customer-quote.js — Show repair item breakdown on customer quote
// ============================================================

(function () {
  if (window.__kirkstoneRepairCustomerQuoteInstalled) return;
  window.__kirkstoneRepairCustomerQuoteInstalled = true;

  const originalGenerateCustomerQuoteWindow = window.generateCustomerQuoteWindow;
  if (typeof originalGenerateCustomerQuoteWindow !== 'function') return;

  function injectRepairRows(quoteWindow, result) {
    if (!quoteWindow || quoteWindow.closed) return false;

    let doc;
    try {
      doc = quoteWindow.document;
    } catch (error) {
      return false;
    }

    const tbody = doc.querySelector('table.items tbody');
    if (!tbody) return false;
    if (tbody.querySelector('tr[data-repair-quote-row="true"]')) return true;

    const repairLines = Array.isArray(result?.repairLines) ? result.repairLines : [];
    if (!repairLines.length) return true;

    const firstSummaryRow = tbody.querySelector('.row-summary-label');
    repairLines.forEach(line => {
      const description = String(line?.description || 'Repair');
      const price = Number(line?.price || 0);
      const row = doc.createElement('tr');
      row.dataset.repairQuoteRow = 'true';

      const descriptionCell = doc.createElement('td');
      descriptionCell.textContent = description;

      const quantityCell = doc.createElement('td');
      quantityCell.textContent = '1';

      const unitPriceCell = doc.createElement('td');
      unitPriceCell.textContent = typeof formatCurrency === 'function' ? formatCurrency(price) : `£${price.toFixed(2)}`;

      const totalCell = doc.createElement('td');
      totalCell.textContent = typeof formatCurrency === 'function' ? formatCurrency(price) : `£${price.toFixed(2)}`;

      row.append(descriptionCell, quantityCell, unitPriceCell, totalCell);
      tbody.insertBefore(row, firstSummaryRow);
    });

    return true;
  }

  window.generateCustomerQuoteWindow = function (result, input, quoteSettings) {
    if (!result?.repairMode) {
      return originalGenerateCustomerQuoteWindow(result, input, quoteSettings);
    }

    const originalOpen = window.open;
    let quoteWindow = null;

    window.open = function (...args) {
      quoteWindow = originalOpen.apply(window, args);
      return quoteWindow;
    };

    try {
      originalGenerateCustomerQuoteWindow(result, input, quoteSettings);
    } finally {
      window.open = originalOpen;
    }

    let attempts = 0;
    const tryInject = () => {
      attempts += 1;
      if (injectRepairRows(quoteWindow, result) || attempts >= 20) return;
      setTimeout(tryInject, 100);
    };
    setTimeout(tryInject, 50);
  };
})();
