// ============================================================
// invoice-spreadsheet.js — Invoice spreadsheet from completed job sheets
// ============================================================

function ensureInvoiceSpreadsheetUi() {
  const nav = document.querySelector('.tab-nav');
  if (nav && !nav.querySelector('[data-tab="invoicePanel"]')) {
    const button = document.createElement('button');
    button.className = 'tab-btn';
    button.dataset.tab = 'invoicePanel';
    button.textContent = 'Invoice Spreadsheet';
    nav.appendChild(button);

    button.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      button.classList.add('active');
      document.getElementById('invoicePanel')?.classList.add('active');
      if (typeof saveKirkstoneUiState === 'function') saveKirkstoneUiState('invoicePanel', null);
      renderInvoiceSpreadsheet();
    });
  }

  const main = document.getElementById('appMain');
  if (main && !document.getElementById('invoicePanel')) {
    const section = document.createElement('section');
    section.id = 'invoicePanel';
    section.className = 'tab-panel';
    section.innerHTML = '<div class="card"><div id="invoiceSpreadsheet"></div></div>';
    main.appendChild(section);
  }
}

function invoiceSpreadsheetMoney(value) {
  return formatCurrency(parseFloat(value) || 0);
}

function invoiceSpreadsheetRound(value) {
  return Math.round(((parseFloat(value) || 0) + Number.EPSILON) * 100) / 100;
}

function invoiceSpreadsheetDaysBetween(start, end) {
  if (!start || !end) return '';
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return '';
  return Math.max(0, Math.round((endDate - startDate) / 86400000));
}

function invoiceSpreadsheetPeriodLabel() {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `April ${year}-April ${year + 1}`;
}

function invoiceSpreadsheetSortDate(job) {
  if (job.invoiceDateIssued) return job.invoiceDateIssued;
  const datedEntries = (job.actualEntries || []).map(entry => entry.date).filter(Boolean).sort();
  if (datedEntries.length) return datedEntries[datedEntries.length - 1];
  return job.updatedAt || job.createdAt || '';
}

function getInvoiceSpreadsheetJobs() {
  if (typeof currentJobs === 'undefined' || !Array.isArray(currentJobs)) return [];
  return currentJobs
    .filter(job => String(job.invoiceNumber || '').trim())
    .slice()
    .sort((a, b) => invoiceSpreadsheetSortDate(a).localeCompare(invoiceSpreadsheetSortDate(b)));
}

async function updateInvoiceSpreadsheetField(jobId, field, value) {
  const job = typeof currentJobs !== 'undefined' ? currentJobs.find(item => item.id === jobId) : null;
  if (!job) return;

  job[field] = value;
  job.updatedAt = new Date().toISOString();
  StorageManager.saveJob(job);

  try {
    if (typeof isLocalPreviewMode === 'undefined' || !isLocalPreviewMode) {
      await saveJobToFirestore(job);
    }
    if (typeof showToast === 'function') showToast('Invoice spreadsheet updated');
  } catch (error) {
    console.error('Could not save invoice spreadsheet field to Firebase', error);
    if (typeof showToast === 'function') showToast('Saved on this device, but cloud save failed');
  }

  renderInvoiceSpreadsheet();
}

function renderInvoiceSpreadsheet() {
  const container = document.getElementById('invoiceSpreadsheet');
  if (!container) return;

  const jobs = getInvoiceSpreadsheetJobs();
  if (!jobs.length) {
    container.innerHTML = '<p class="empty-state">No completed/invoiced job sheets yet. Add an invoice number to a job sheet and it will appear here.</p>';
    return;
  }

  const rows = jobs.map(job => {
    const calc = calculateJobSheet(job);
    const pension = invoiceSpreadsheetRound(Math.max(calc.profit, 0) * 0.07);
    const daysToPay = invoiceSpreadsheetDaysBetween(job.invoiceDateIssued, job.invoiceDatePaid);
    const clinicRepair = job.clinicRepair || '';
    return `
      <tr>
        <td class="invoice-company">${escapeHtml(job.customerName || '')}</td>
        <td>${escapeHtml(job.invoiceNumber || '')}</td>
        <td class="invoice-money">${invoiceSpreadsheetMoney(calc.actualRevenue)}</td>
        <td class="invoice-money">${invoiceSpreadsheetMoney(calc.revenueIncVat)}</td>
        <td class="invoice-money">${invoiceSpreadsheetMoney(calc.vatAmount)}</td>
        <td class="invoice-money">${invoiceSpreadsheetMoney(calc.totalCosts)}</td>
        <td class="invoice-money">${invoiceSpreadsheetMoney(calc.profit)}</td>
        <td class="invoice-money">${invoiceSpreadsheetMoney(pension)}</td>
        <td class="invoice-money">${invoiceSpreadsheetMoney(calc.taxAt40)}</td>
        <td class="invoice-money">${invoiceSpreadsheetMoney(calc.profitAfterTax)}</td>
        <td class="invoice-number">${calc.actualDays}</td>
        <td>
          <select class="invoice-cell-input" onchange="updateInvoiceSpreadsheetField('${escapeJsString(job.id)}','clinicRepair',this.value)">
            <option value="" ${clinicRepair === '' ? 'selected' : ''}>Select</option>
            <option value="Clinic" ${clinicRepair === 'Clinic' ? 'selected' : ''}>Clinic</option>
            <option value="Repair" ${clinicRepair === 'Repair' ? 'selected' : ''}>Repair</option>
          </select>
        </td>
        <td><input class="invoice-cell-input invoice-date" type="date" value="${escapeHtml(job.invoiceDateIssued || '')}" onchange="updateInvoiceSpreadsheetField('${escapeJsString(job.id)}','invoiceDateIssued',this.value)"></td>
        <td><input class="invoice-cell-input invoice-date" type="date" value="${escapeHtml(job.invoiceDatePaid || '')}" onchange="updateInvoiceSpreadsheetField('${escapeJsString(job.id)}','invoiceDatePaid',this.value)"></td>
        <td class="invoice-number">${daysToPay}</td>
        <td class="invoice-spacer"></td>
        <td class="invoice-number">${parseFloat(job.costs?.mileageMiles) || 0}</td>
      </tr>`;
  }).join('');

  const totals = jobs.reduce((sum, job) => {
    const calc = calculateJobSheet(job);
    sum.excVat += calc.actualRevenue;
    sum.incVat += calc.revenueIncVat;
    sum.vat += calc.vatAmount;
    sum.cost += calc.totalCosts;
    sum.preTax += calc.profit;
    sum.pension += Math.max(calc.profit, 0) * 0.07;
    sum.tax += calc.taxAt40;
    sum.postTax += calc.profitAfterTax;
    sum.days += calc.actualDays;
    sum.mileage += parseFloat(job.costs?.mileageMiles) || 0;
    return sum;
  }, { excVat: 0, incVat: 0, vat: 0, cost: 0, preTax: 0, pension: 0, tax: 0, postTax: 0, days: 0, mileage: 0 });

  container.innerHTML = `
    <div class="invoice-spreadsheet-header">
      <div>
        <h2>${escapeHtml(invoiceSpreadsheetPeriodLabel())}</h2>
        <p>${jobs.length} completed/invoiced job sheet${jobs.length !== 1 ? 's' : ''}</p>
      </div>
    </div>
    <div class="invoice-table-wrap">
      <table class="invoice-table">
        <thead>
          <tr>
            <th>Company</th>
            <th>Invoice number</th>
            <th>Amount exc vat</th>
            <th>Amount inc vat</th>
            <th>VAT</th>
            <th>Cost</th>
            <th>Pre tax profit</th>
            <th>Pension</th>
            <th>Tax</th>
            <th>Post Tax Profit</th>
            <th>Number of days</th>
            <th>Clinic/Repair</th>
            <th>Date issued</th>
            <th>Date paid</th>
            <th>Days taken to pay</th>
            <th class="invoice-spacer"></th>
            <th>Mileage</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <th colspan="2">TOTAL</th>
            <th class="invoice-money">${invoiceSpreadsheetMoney(totals.excVat)}</th>
            <th class="invoice-money">${invoiceSpreadsheetMoney(totals.incVat)}</th>
            <th class="invoice-money">${invoiceSpreadsheetMoney(totals.vat)}</th>
            <th class="invoice-money">${invoiceSpreadsheetMoney(totals.cost)}</th>
            <th class="invoice-money">${invoiceSpreadsheetMoney(totals.preTax)}</th>
            <th class="invoice-money">${invoiceSpreadsheetMoney(totals.pension)}</th>
            <th class="invoice-money">${invoiceSpreadsheetMoney(totals.tax)}</th>
            <th class="invoice-money">${invoiceSpreadsheetMoney(totals.postTax)}</th>
            <th class="invoice-number">${totals.days}</th>
            <th colspan="5"></th>
            <th class="invoice-number">${invoiceSpreadsheetRound(totals.mileage)}</th>
          </tr>
        </tfoot>
      </table>
    </div>`;
}

function installInvoiceSpreadsheetStyles() {
  if (document.getElementById('invoiceSpreadsheetStyles')) return;
  const style = document.createElement('style');
  style.id = 'invoiceSpreadsheetStyles';
  style.textContent = `
    .invoice-spreadsheet-header { display:flex; justify-content:space-between; align-items:flex-end; gap:1rem; margin-bottom:1rem; }
    .invoice-spreadsheet-header h2 { margin:0; color:var(--primary); }
    .invoice-spreadsheet-header p { margin:.2rem 0 0; color:var(--text-light); }
    .invoice-table-wrap { width:100%; overflow-x:auto; border:1px solid var(--border); border-radius:8px; background:#fff; }
    .invoice-table { width:max-content; min-width:100%; border-collapse:collapse; font-size:12px; }
    .invoice-table th, .invoice-table td { padding:8px 9px; border-right:1px solid #edf2f7; border-bottom:1px solid #edf2f7; white-space:nowrap; vertical-align:middle; }
    .invoice-table thead th { position:sticky; top:0; z-index:1; background:var(--primary); color:#fff; font-weight:700; text-align:left; }
    .invoice-table tbody tr:nth-child(even) { background:#f8fafc; }
    .invoice-table tbody tr:hover { background:#eef4fb; }
    .invoice-table tfoot th { background:#e8eef6; color:var(--text); font-weight:800; }
    .invoice-company { min-width:210px; }
    .invoice-money, .invoice-number { text-align:right !important; font-variant-numeric:tabular-nums; }
    .invoice-spacer { min-width:18px; width:18px; background:#f7f8fa; border-right:0 !important; }
    .invoice-cell-input { width:115px; min-width:100px; padding:5px 6px; border:1px solid #cbd5e1; border-radius:5px; background:#fff; font:inherit; }
    .invoice-date { width:132px; }
    @media (max-width:700px) { .invoice-table { font-size:11px; } .invoice-table th, .invoice-table td { padding:7px; } }
  `;
  document.head.appendChild(style);
}

document.addEventListener('DOMContentLoaded', () => {
  ensureInvoiceSpreadsheetUi();
  installInvoiceSpreadsheetStyles();
  renderInvoiceSpreadsheet();

  const jobsContainer = document.getElementById('jobSheets');
  if (jobsContainer) {
    const observer = new MutationObserver(renderInvoiceSpreadsheet);
    observer.observe(jobsContainer, { childList: true, subtree: true });
  }
});
