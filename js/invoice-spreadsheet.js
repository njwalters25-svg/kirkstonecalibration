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

function getInvoiceReferenceFromJob(job) {
  if (!job) return '';
  if (job.quoteRef) return job.quoteRef;

  const snapshotRef = buildRefCode(job.quoteSnapshot?.refPrefix, job.quoteSnapshot?.refNumber, true);
  if (snapshotRef) return snapshotRef;

  const linkedQuote = (typeof currentQuotes !== 'undefined' && job.quoteId)
    ? currentQuotes.find(quote => quote.id === job.quoteId)
    : null;
  if (linkedQuote) return buildRefCode(linkedQuote.refPrefix, linkedQuote.refNumber, true) || '';

  return '';
}

function createInvoiceNumberFromJob(job) {
  const ref = getInvoiceReferenceFromJob(job);
  return ref ? ref.replace(/Q$/i, '') : '';
}

function getInvoiceSpreadsheetJobs() {
  if (typeof currentJobs === 'undefined' || !Array.isArray(currentJobs)) return [];
  return currentJobs
    .filter(job => job.invoiceSpreadsheetAdded === true)
    .slice()
    .sort((a, b) => invoiceSpreadsheetSortDate(a).localeCompare(invoiceSpreadsheetSortDate(b)));
}

function getLiveInvoiceSpreadsheetValues(job) {
  const calc = calculateJobSheet(job);
  return {
    company: job.customerName || '',
    invoiceNumber: job.invoiceNumber || createInvoiceNumberFromJob(job),
    excVat: invoiceSpreadsheetRound(calc.actualRevenue),
    incVat: invoiceSpreadsheetRound(calc.revenueIncVat),
    vat: invoiceSpreadsheetRound(calc.vatAmount),
    cost: invoiceSpreadsheetRound(calc.totalCosts),
    preTaxProfit: invoiceSpreadsheetRound(calc.profit),
    pension: invoiceSpreadsheetRound(Math.max(calc.profit, 0) * 0.07),
    tax: invoiceSpreadsheetRound(calc.taxAt40),
    postTaxProfit: invoiceSpreadsheetRound(calc.profitAfterTax),
    numberOfDays: calc.actualDays,
    mileage: invoiceSpreadsheetRound(parseFloat(job.costs?.mileageMiles) || 0),
  };
}

function getInvoiceSpreadsheetValues(job) {
  if (job.invoiceSpreadsheetLocked && job.invoiceSpreadsheetSnapshot) {
    return job.invoiceSpreadsheetSnapshot;
  }
  return getLiveInvoiceSpreadsheetValues(job);
}

async function persistInvoiceSpreadsheetJob(job, message) {
  job.updatedAt = new Date().toISOString();
  StorageManager.saveJob(job);

  try {
    if (typeof isLocalPreviewMode === 'undefined' || !isLocalPreviewMode) {
      await saveJobToFirestore(job);
    }
    if (typeof refreshJobSheets === 'function') await refreshJobSheets();
    if (typeof showToast === 'function' && message) showToast(message);
  } catch (error) {
    console.error('Could not save invoice spreadsheet job to Firebase', error);
    if (typeof showToast === 'function') showToast('Saved on this device, but cloud save failed');
  }

  renderInvoiceSpreadsheet();
}

async function addJobToInvoiceSpreadsheet(jobId) {
  const job = typeof currentJobs !== 'undefined' ? currentJobs.find(item => item.id === jobId) : null;
  if (!job) return;

  const invoiceNumber = createInvoiceNumberFromJob(job);
  if (!invoiceNumber) {
    if (typeof showToast === 'function') showToast('Could not create invoice number because this job has no quote reference');
    return;
  }

  job.invoiceNumber = invoiceNumber;
  job.invoiceSpreadsheetAdded = true;
  job.invoiceSpreadsheetLocked = false;
  delete job.invoiceSpreadsheetSnapshot;
  delete job.invoiceSpreadsheetLockedAt;

  await persistInvoiceSpreadsheetJob(job, `Added to Invoice Spreadsheet as ${invoiceNumber}`);
}

async function completeInvoiceSpreadsheetJob(jobId) {
  const job = typeof currentJobs !== 'undefined' ? currentJobs.find(item => item.id === jobId) : null;
  if (!job || !job.invoiceSpreadsheetAdded || job.invoiceSpreadsheetLocked) return;

  const confirmed = confirm('Mark this job as completed? This will lock the job-sheet figures in the Invoice Spreadsheet so later job-sheet changes will not alter them.');
  if (!confirmed) return;

  job.invoiceSpreadsheetSnapshot = getLiveInvoiceSpreadsheetValues(job);
  job.invoiceSpreadsheetLocked = true;
  job.invoiceSpreadsheetLockedAt = new Date().toISOString();

  await persistInvoiceSpreadsheetJob(job, 'Job completed and Invoice Spreadsheet figures locked');
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

function installInvoiceSpreadsheetJobButtons() {
  document.querySelectorAll('#jobSheets .job-card').forEach(card => {
    const jobId = card.dataset.id;
    const actions = card.querySelector('.history-actions');
    const job = typeof currentJobs !== 'undefined' ? currentJobs.find(item => item.id === jobId) : null;
    if (!jobId || !actions || !job) return;

    actions.querySelectorAll('[data-invoice-spreadsheet-action]').forEach(button => button.remove());

    if (!job.invoiceSpreadsheetAdded) {
      const addButton = document.createElement('button');
      addButton.type = 'button';
      addButton.className = 'btn-small btn-quote';
      addButton.dataset.invoiceSpreadsheetAction = 'add';
      addButton.textContent = 'Add to Invoice Spreadsheet';
      addButton.addEventListener('click', () => addJobToInvoiceSpreadsheet(jobId));
      actions.appendChild(addButton);
      return;
    }

    if (!job.invoiceSpreadsheetLocked) {
      const liveButton = document.createElement('button');
      liveButton.type = 'button';
      liveButton.className = 'btn-small';
      liveButton.dataset.invoiceSpreadsheetAction = 'live';
      liveButton.textContent = 'Invoice Spreadsheet: Live';
      liveButton.disabled = true;
      actions.appendChild(liveButton);

      const completeButton = document.createElement('button');
      completeButton.type = 'button';
      completeButton.className = 'btn-small btn-quote';
      completeButton.dataset.invoiceSpreadsheetAction = 'complete';
      completeButton.textContent = 'Completed';
      completeButton.addEventListener('click', () => completeInvoiceSpreadsheetJob(jobId));
      actions.appendChild(completeButton);
      return;
    }

    const lockedButton = document.createElement('button');
    lockedButton.type = 'button';
    lockedButton.className = 'btn-small';
    lockedButton.dataset.invoiceSpreadsheetAction = 'locked';
    lockedButton.textContent = 'Invoice Spreadsheet: Locked';
    lockedButton.disabled = true;
    actions.appendChild(lockedButton);
  });
}

function renderInvoiceSpreadsheet() {
  const container = document.getElementById('invoiceSpreadsheet');
  if (!container) return;

  const jobs = getInvoiceSpreadsheetJobs();
  if (!jobs.length) {
    container.innerHTML = '<p class="empty-state">No jobs have been added yet. Use the “Add to Invoice Spreadsheet” button on a job sheet.</p>';
    return;
  }

  const rows = jobs.map(job => {
    const values = getInvoiceSpreadsheetValues(job);
    const daysToPay = invoiceSpreadsheetDaysBetween(job.invoiceDateIssued, job.invoiceDatePaid);
    const clinicRepair = job.clinicRepair || '';
    const rowClass = job.invoiceSpreadsheetLocked ? ' invoice-row-locked' : '';
    return `
      <tr class="${rowClass.trim()}">
        <td class="invoice-company">${escapeHtml(values.company || '')}</td>
        <td>${escapeHtml(values.invoiceNumber || '')}</td>
        <td class="invoice-money">${invoiceSpreadsheetMoney(values.excVat)}</td>
        <td class="invoice-money">${invoiceSpreadsheetMoney(values.incVat)}</td>
        <td class="invoice-money">${invoiceSpreadsheetMoney(values.vat)}</td>
        <td class="invoice-money">${invoiceSpreadsheetMoney(values.cost)}</td>
        <td class="invoice-money">${invoiceSpreadsheetMoney(values.preTaxProfit)}</td>
        <td class="invoice-money">${invoiceSpreadsheetMoney(values.pension)}</td>
        <td class="invoice-money">${invoiceSpreadsheetMoney(values.tax)}</td>
        <td class="invoice-money">${invoiceSpreadsheetMoney(values.postTaxProfit)}</td>
        <td class="invoice-number">${values.numberOfDays || 0}</td>
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
        <td class="invoice-number">${values.mileage || 0}</td>
      </tr>`;
  }).join('');

  const totals = jobs.reduce((sum, job) => {
    const values = getInvoiceSpreadsheetValues(job);
    sum.excVat += parseFloat(values.excVat) || 0;
    sum.incVat += parseFloat(values.incVat) || 0;
    sum.vat += parseFloat(values.vat) || 0;
    sum.cost += parseFloat(values.cost) || 0;
    sum.preTax += parseFloat(values.preTaxProfit) || 0;
    sum.pension += parseFloat(values.pension) || 0;
    sum.tax += parseFloat(values.tax) || 0;
    sum.postTax += parseFloat(values.postTaxProfit) || 0;
    sum.days += parseFloat(values.numberOfDays) || 0;
    sum.mileage += parseFloat(values.mileage) || 0;
    return sum;
  }, { excVat: 0, incVat: 0, vat: 0, cost: 0, preTax: 0, pension: 0, tax: 0, postTax: 0, days: 0, mileage: 0 });

  const liveCount = jobs.filter(job => !job.invoiceSpreadsheetLocked).length;
  const lockedCount = jobs.length - liveCount;

  container.innerHTML = `
    <div class="invoice-spreadsheet-header">
      <div>
        <h2>${escapeHtml(invoiceSpreadsheetPeriodLabel())}</h2>
        <p>${jobs.length} job${jobs.length !== 1 ? 's' : ''} · ${liveCount} live · ${lockedCount} completed/locked</p>
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
    .invoice-table tbody tr.invoice-row-locked { background:#f1f5f9; }
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
  installInvoiceSpreadsheetJobButtons();

  const jobsContainer = document.getElementById('jobSheets');
  if (jobsContainer) {
    const observer = new MutationObserver(() => {
      // Installing/updating the buttons itself changes #jobSheets. Disconnect while
      // doing that work so those button changes do not recursively trigger this observer.
      observer.disconnect();
      renderInvoiceSpreadsheet();
      installInvoiceSpreadsheetJobButtons();
      observer.observe(jobsContainer, { childList: true, subtree: true });
    });
    observer.observe(jobsContainer, { childList: true, subtree: true });
  }
});
