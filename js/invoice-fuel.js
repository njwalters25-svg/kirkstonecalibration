// Invoice Spreadsheet: derived fuel allowance column (mileage × £0.55)
(function () {
  const RATE = 0.55;

  function money(value) {
    return typeof formatCurrency === 'function'
      ? formatCurrency(value)
      : `£${Number(value || 0).toFixed(2)}`;
  }

  function addFuelColumn() {
    const table = document.querySelector('#invoiceSpreadsheet .invoice-table');
    if (!table) return;

    const headerRow = table.tHead?.rows?.[0];
    if (!headerRow || headerRow.querySelector('[data-invoice-fuel]')) return;

    const mileageHeader = Array.from(headerRow.cells).find(cell => cell.textContent.trim() === 'Mileage');
    if (!mileageHeader) return;

    const fuelHeader = document.createElement('th');
    fuelHeader.textContent = 'Fuel';
    fuelHeader.dataset.invoiceFuel = 'true';
    mileageHeader.insertAdjacentElement('afterend', fuelHeader);

    Array.from(table.tBodies?.[0]?.rows || []).forEach(row => {
      const mileageIndex = Array.from(headerRow.cells).indexOf(mileageHeader);
      const mileage = parseFloat((row.cells[mileageIndex]?.textContent || '').replace(/[^0-9.-]/g, '')) || 0;
      const fuelCell = document.createElement('td');
      fuelCell.className = 'invoice-money';
      fuelCell.dataset.invoiceFuel = 'true';
      fuelCell.textContent = money(mileage * RATE);
      row.cells[mileageIndex]?.insertAdjacentElement('afterend', fuelCell);
    });

    const footerRow = table.tFoot?.rows?.[0];
    if (footerRow) {
      const totalMileage = Array.from(table.tBodies?.[0]?.rows || []).reduce((sum, row) => {
        const fuelCell = row.querySelector('td[data-invoice-fuel]');
        return sum + ((parseFloat((fuelCell?.textContent || '').replace(/[^0-9.-]/g, '')) || 0) / RATE);
      }, 0);
      const fuelTotal = document.createElement('th');
      fuelTotal.className = 'invoice-money';
      fuelTotal.dataset.invoiceFuel = 'true';
      fuelTotal.textContent = money(totalMileage * RATE);
      footerRow.lastElementChild?.insertAdjacentElement('afterend', fuelTotal);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    addFuelColumn();
    const container = document.getElementById('invoiceSpreadsheet');
    if (!container) return;
    const observer = new MutationObserver(addFuelColumn);
    observer.observe(container, { childList: true, subtree: true });
  });
})();
