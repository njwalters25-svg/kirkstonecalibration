// ============================================================
// invoice-spreadsheet-order-lock.js
// Keeps invoice rows in the order they were added and restores
// invoice numbers to read-only display.
// ============================================================

(function () {
  function getAddedTimestamp(job) {
    return job?.invoiceSpreadsheetAddedAt
      || job?.createdAt
      || job?.updatedAt
      || '';
  }

  // Keep the spreadsheet in oldest-added to newest-added order.
  window.getInvoiceSpreadsheetJobs = function getInvoiceSpreadsheetJobsByAddedDate() {
    if (typeof currentJobs === 'undefined' || !Array.isArray(currentJobs)) return [];
    return currentJobs
      .filter(job => job.invoiceSpreadsheetAdded === true)
      .slice()
      .sort((a, b) => getAddedTimestamp(a).localeCompare(getAddedTimestamp(b)));
  };

  // Record the true spreadsheet-add time for all new additions going forward.
  if (typeof window.addJobToInvoiceSpreadsheet === 'function') {
    const originalAddJobToInvoiceSpreadsheet = window.addJobToInvoiceSpreadsheet;
    window.addJobToInvoiceSpreadsheet = async function (jobId) {
      const job = Array.isArray(currentJobs)
        ? currentJobs.find(item => item.id === jobId)
        : null;
      if (job && !job.invoiceSpreadsheetAddedAt) {
        job.invoiceSpreadsheetAddedAt = new Date().toISOString();
      }
      return originalAddJobToInvoiceSpreadsheet.apply(this, arguments);
    };
  }

  function restoreReadOnlyInvoiceNumbers() {
    if (typeof window.getInvoiceSpreadsheetJobs !== 'function') return;
    const jobs = window.getInvoiceSpreadsheetJobs();
    const rows = document.querySelectorAll('#invoiceSpreadsheet .invoice-table tbody tr');

    rows.forEach((row, index) => {
      const job = jobs[index];
      const cell = row.children[1];
      if (!job || !cell) return;

      const editInput = cell.querySelector('.invoice-number-edit');
      if (!editInput) return;

      const values = typeof getInvoiceSpreadsheetValues === 'function'
        ? getInvoiceSpreadsheetValues(job)
        : {};
      cell.textContent = job.invoiceNumber || values.invoiceNumber || '';
    });
  }

  if (typeof window.renderInvoiceSpreadsheet === 'function') {
    const originalRenderInvoiceSpreadsheet = window.renderInvoiceSpreadsheet;
    window.renderInvoiceSpreadsheet = function () {
      const result = originalRenderInvoiceSpreadsheet.apply(this, arguments);
      restoreReadOnlyInvoiceNumbers();
      return result;
    };
  }

  restoreReadOnlyInvoiceNumbers();

  // Load the one-time historical spreadsheet import. The importer is idempotent,
  // so it safely skips any invoice number that is already present in the app.
  const importScript = document.createElement('script');
  importScript.src = 'js/invoice-spreadsheet-import-2026-27.js?v=20260902-1';
  importScript.async = false;
  document.head.appendChild(importScript);
})();
