// ============================================================
// invoice-number-edit.js — Safe invoice-number-only editing
// ============================================================

(function () {
  let installed = false;

  function normaliseInvoiceNumber(value) {
    return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  }

  function enhanceInvoiceNumberCells() {
    if (typeof getInvoiceSpreadsheetJobs !== 'function') return;
    const rows = document.querySelectorAll('#invoiceSpreadsheet .invoice-table tbody tr');
    const jobs = getInvoiceSpreadsheetJobs();

    rows.forEach((row, index) => {
      const job = jobs[index];
      const cell = row.children[1];
      if (!job || !cell || cell.querySelector('.invoice-number-edit')) return;

      const values = typeof getInvoiceSpreadsheetValues === 'function'
        ? getInvoiceSpreadsheetValues(job)
        : {};
      const currentNumber = job.invoiceNumber || values.invoiceNumber || '';
      cell.textContent = '';

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'invoice-cell-input invoice-number-edit';
      input.value = currentNumber;
      input.setAttribute('aria-label', `Invoice number for ${job.customerName || 'job'}`);
      input.addEventListener('change', () => {
        const cleaned = normaliseInvoiceNumber(input.value);
        input.value = cleaned;
        updateInvoiceSpreadsheetField(job.id, 'invoiceNumber', cleaned);
      });
      cell.appendChild(input);
    });
  }

  function installStyles() {
    if (document.getElementById('invoiceNumberEditStyles')) return;
    const style = document.createElement('style');
    style.id = 'invoiceNumberEditStyles';
    style.textContent = '.invoice-number-edit{width:125px;min-width:115px;font-weight:600;text-transform:uppercase;}';
    document.head.appendChild(style);
  }

  function install() {
    if (installed || typeof renderInvoiceSpreadsheet !== 'function' || typeof updateInvoiceSpreadsheetField !== 'function') return false;
    installed = true;
    installStyles();

    const originalUpdate = window.updateInvoiceSpreadsheetField;
    window.updateInvoiceSpreadsheetField = async function (jobId, field, value) {
      if (field === 'invoiceNumber') {
        const cleaned = normaliseInvoiceNumber(value);
        const job = Array.isArray(currentJobs) ? currentJobs.find(item => item.id === jobId) : null;
        if (job?.invoiceSpreadsheetSnapshot) {
          // Keep a locked spreadsheet snapshot's displayed invoice number in sync.
          // No financial, date, customer, quote, or job-sheet values are changed.
          job.invoiceSpreadsheetSnapshot.invoiceNumber = cleaned;
        }
        return originalUpdate(jobId, field, cleaned);
      }
      return originalUpdate(jobId, field, value);
    };

    const originalRender = window.renderInvoiceSpreadsheet;
    window.renderInvoiceSpreadsheet = function () {
      const result = originalRender.apply(this, arguments);
      enhanceInvoiceNumberCells();
      return result;
    };

    window.renderInvoiceSpreadsheet();
    return true;
  }

  if (!install()) {
    const timer = setInterval(() => {
      if (install()) clearInterval(timer);
    }, 100);
    setTimeout(() => clearInterval(timer), 10000);
  }
})();
