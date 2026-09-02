// ============================================================
// invoice-spreadsheet-sticky.js
// Freezes the heading row and first two columns while scrolling.
// ============================================================

(function () {
  if (document.getElementById('invoiceSpreadsheetStickyStyles')) return;

  const style = document.createElement('style');
  style.id = 'invoiceSpreadsheetStickyStyles';
  style.textContent = `
    .invoice-table-wrap {
      max-height: calc(100vh - 220px);
      overflow: auto;
      position: relative;
    }

    .invoice-table thead th {
      position: sticky;
      top: 0;
      z-index: 4;
    }

    .invoice-table th:nth-child(1),
    .invoice-table td:nth-child(1) {
      position: sticky;
      left: 0;
      width: 210px;
      min-width: 210px;
      max-width: 210px;
      box-sizing: border-box;
    }

    .invoice-table th:nth-child(2),
    .invoice-table td:nth-child(2) {
      position: sticky;
      left: 210px;
      min-width: 125px;
      box-sizing: border-box;
    }

    .invoice-table thead th:nth-child(1),
    .invoice-table thead th:nth-child(2) {
      z-index: 6;
      background: var(--primary);
    }

    .invoice-table tbody td:nth-child(1),
    .invoice-table tbody td:nth-child(2) {
      z-index: 2;
      background: #fff;
    }

    .invoice-table tbody tr:nth-child(even) td:nth-child(1),
    .invoice-table tbody tr:nth-child(even) td:nth-child(2) {
      background: #f8fafc;
    }

    .invoice-table tbody tr.invoice-row-locked td:nth-child(1),
    .invoice-table tbody tr.invoice-row-locked td:nth-child(2) {
      background: #f1f5f9;
    }

    .invoice-table tbody tr:hover td:nth-child(1),
    .invoice-table tbody tr:hover td:nth-child(2) {
      background: #eef4fb;
    }

    .invoice-table tbody tr.invoice-row-settled td:nth-child(1),
    .invoice-table tbody tr.invoice-row-settled td:nth-child(2) {
      background: #dcfce7;
    }

    .invoice-table tbody tr.invoice-row-settled:hover td:nth-child(1),
    .invoice-table tbody tr.invoice-row-settled:hover td:nth-child(2) {
      background: #d1fae5;
    }

    .invoice-table th:nth-child(2),
    .invoice-table td:nth-child(2) {
      box-shadow: 3px 0 5px -4px rgba(0, 0, 0, 0.45);
    }
  `;
  document.head.appendChild(style);
})();
