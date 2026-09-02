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

function invoiceSpreadsheetMoney(value) { return formatCurrency(parseFloat(value) || 0); }
function invoiceSpreadsheetRound(value) { return Math.round(((parseFloat(value) || 0) + Number.EPSILON) * 100) / 100; }
function invoiceSpreadsheetDaysBetween(start, end) {
  if (!start || !end) return '';
  const startDate = new Date(`${start}T00:00:00`), endDate = new Date(`${end}T00:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return '';
  return Math.max(0, Math.round((endDate - startDate) / 86400000));
}
function invoiceSpreadsheetPeriodLabel() {
  const now = new Date(); const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
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
  const linkedQuote = (typeof currentQuotes !== 'undefined' && job.quoteId) ? currentQuotes.find(quote => quote.id === job.quoteId) : null;
  if (linkedQuote) return buildRefCode(linkedQuote.refPrefix, linkedQuote.refNumber, true) || '';
  return '';
}
function createInvoiceNumberFromJob(job) { const ref = getInvoiceReferenceFromJob(job); return ref ? ref.replace(/Q$/i, '') : ''; }
function getInvoiceSpreadsheetJobs() {
  if (typeof currentJobs === 'undefined' || !Array.isArray(currentJobs)) return [];
  return currentJobs.filter(job => job.invoiceSpreadsheetAdded === true).slice().sort((a,b) => invoiceSpreadsheetSortDate(a).localeCompare(invoiceSpreadsheetSortDate(b)));
}
function getLiveInvoiceSpreadsheetValues(job) {
  const calc = calculateJobSheet(job); const mileage = invoiceSpreadsheetRound(parseFloat(job.costs?.mileageMiles) || 0);
  return { company:job.customerName||'', invoiceNumber:job.invoiceNumber||createInvoiceNumberFromJob(job), excVat:invoiceSpreadsheetRound(calc.actualRevenue), incVat:invoiceSpreadsheetRound(calc.revenueIncVat), vat:invoiceSpreadsheetRound(calc.vatAmount), cost:invoiceSpreadsheetRound(calc.totalCosts), preTaxProfit:invoiceSpreadsheetRound(calc.profit), pension:invoiceSpreadsheetRound(Math.max(calc.profit,0)*0.07), tax:invoiceSpreadsheetRound(calc.taxAt40), postTaxProfit:invoiceSpreadsheetRound(calc.profitAfterTax), numberOfDays:calc.actualDays, mileage, fuel:invoiceSpreadsheetRound(mileage*0.55) };
}
function getInvoiceSpreadsheetValues(job) {
  if (job.invoiceSpreadsheetLocked && job.invoiceSpreadsheetSnapshot) {
    const snapshot={...job.invoiceSpreadsheetSnapshot};
    if (snapshot.fuel===undefined||snapshot.fuel===null) snapshot.fuel=invoiceSpreadsheetRound((parseFloat(snapshot.mileage)||0)*0.55);
    return snapshot;
  }
  return getLiveInvoiceSpreadsheetValues(job);
}
async function persistInvoiceSpreadsheetJob(job,message) {
  job.updatedAt=new Date().toISOString(); StorageManager.saveJob(job);
  try { if(typeof isLocalPreviewMode==='undefined'||!isLocalPreviewMode) await saveJobToFirestore(job); if(typeof refreshJobSheets==='function') await refreshJobSheets(); if(typeof showToast==='function'&&message) showToast(message); }
  catch(error){ console.error('Could not save invoice spreadsheet job to Firebase',error); if(typeof showToast==='function') showToast('Saved on this device, but cloud save failed'); }
  renderInvoiceSpreadsheet();
}
async function addJobToInvoiceSpreadsheet(jobId) {
  const job=typeof currentJobs!=='undefined'?currentJobs.find(item=>item.id===jobId):null; if(!job)return;
  const invoiceNumber=createInvoiceNumberFromJob(job); if(!invoiceNumber){if(typeof showToast==='function')showToast('Could not create invoice number because this job has no quote reference');return;}
  job.invoiceNumber=invoiceNumber; job.invoiceSpreadsheetAdded=true; job.invoiceSpreadsheetLocked=false; delete job.invoiceSpreadsheetSnapshot; delete job.invoiceSpreadsheetLockedAt;
  await persistInvoiceSpreadsheetJob(job,`Added to Invoice Spreadsheet as ${invoiceNumber}`);
}
async function completeInvoiceSpreadsheetJob(jobId) {
  const job=typeof currentJobs!=='undefined'?currentJobs.find(item=>item.id===jobId):null; if(!job||!job.invoiceSpreadsheetAdded||job.invoiceSpreadsheetLocked)return;
  if(!confirm('Mark this job as completed? This will lock the job-sheet figures in the Invoice Spreadsheet so later job-sheet changes will not alter them.'))return;
  job.invoiceSpreadsheetSnapshot=getLiveInvoiceSpreadsheetValues(job); job.invoiceSpreadsheetLocked=true; job.invoiceSpreadsheetLockedAt=new Date().toISOString();
  await persistInvoiceSpreadsheetJob(job,'Job completed and Invoice Spreadsheet figures locked');
}
async function updateInvoiceSpreadsheetField(jobId,field,value) {
  const job=typeof currentJobs!=='undefined'?currentJobs.find(item=>item.id===jobId):null; if(!job)return;
  job[field]=value; job.updatedAt=new Date().toISOString(); StorageManager.saveJob(job);
  try { if(typeof isLocalPreviewMode==='undefined'||!isLocalPreviewMode) await saveJobToFirestore(job); if(typeof showToast==='function')showToast('Invoice spreadsheet updated'); }
  catch(error){console.error('Could not save invoice spreadsheet field to Firebase',error);if(typeof showToast==='function')showToast('Saved on this device, but cloud save failed');}
  renderInvoiceSpreadsheet();
}
async function setInvoiceSpreadsheetSettled(jobId,checked) {
  const job=typeof currentJobs!=='undefined'?currentJobs.find(item=>item.id===jobId):null; if(!job)return;
  job.invoiceSpreadsheetSettled=!!checked;
  job.invoiceSpreadsheetSettledAt=checked?new Date().toISOString():null;
  await persistInvoiceSpreadsheetJob(job,checked?'Invoice marked as settled':'Invoice marked as outstanding');
}
function installInvoiceSpreadsheetJobButtons() {
  document.querySelectorAll('#jobSheets .job-card').forEach(card=>{
    const jobId=card.dataset.id, actions=card.querySelector('.history-actions'); const job=typeof currentJobs!=='undefined'?currentJobs.find(item=>item.id===jobId):null; if(!jobId||!actions||!job)return;
    actions.querySelectorAll('[data-invoice-spreadsheet-action]').forEach(button=>button.remove());
    if(!job.invoiceSpreadsheetAdded){const b=document.createElement('button');b.type='button';b.className='btn-small btn-quote';b.dataset.invoiceSpreadsheetAction='add';b.textContent='Add to Invoice Spreadsheet';b.addEventListener('click',()=>addJobToInvoiceSpreadsheet(jobId));actions.appendChild(b);return;}
    if(!job.invoiceSpreadsheetLocked){const live=document.createElement('button');live.type='button';live.className='btn-small';live.dataset.invoiceSpreadsheetAction='live';live.textContent='Invoice Spreadsheet: Live';live.disabled=true;actions.appendChild(live);const complete=document.createElement('button');complete.type='button';complete.className='btn-small btn-quote';complete.dataset.invoiceSpreadsheetAction='complete';complete.textContent='Completed';complete.addEventListener('click',()=>completeInvoiceSpreadsheetJob(jobId));actions.appendChild(complete);return;}
    const locked=document.createElement('button');locked.type='button';locked.className='btn-small';locked.dataset.invoiceSpreadsheetAction='locked';locked.textContent='Invoice Spreadsheet: Locked';locked.disabled=true;actions.appendChild(locked);
  });
}
function renderInvoiceSpreadsheet() {
  const container=document.getElementById('invoiceSpreadsheet'); if(!container)return;
  const jobs=getInvoiceSpreadsheetJobs(); if(!jobs.length){container.innerHTML='<p class="empty-state">No jobs have been added yet. Use the “Add to Invoice Spreadsheet” button on a job sheet.</p>';return;}
  const rows=jobs.map(job=>{
    const values=getInvoiceSpreadsheetValues(job), daysToPay=invoiceSpreadsheetDaysBetween(job.invoiceDateIssued,job.invoiceDatePaid), clinicRepair=job.clinicRepair||'';
    const rowClass=[job.invoiceSpreadsheetLocked?'invoice-row-locked':'',job.invoiceSpreadsheetSettled?'invoice-row-settled':''].filter(Boolean).join(' ');
    return `<tr class="${rowClass}">
      <td class="invoice-company">${escapeHtml(values.company||'')}</td><td>${escapeHtml(values.invoiceNumber||'')}</td><td class="invoice-money">${invoiceSpreadsheetMoney(values.excVat)}</td><td class="invoice-money">${invoiceSpreadsheetMoney(values.incVat)}</td><td class="invoice-money invoice-highlight">${invoiceSpreadsheetMoney(values.vat)}</td><td class="invoice-money invoice-highlight">${invoiceSpreadsheetMoney(values.cost)}</td><td class="invoice-money">${invoiceSpreadsheetMoney(values.preTaxProfit)}</td><td class="invoice-money invoice-highlight">${invoiceSpreadsheetMoney(values.pension)}</td><td class="invoice-money invoice-highlight">${invoiceSpreadsheetMoney(values.tax)}</td><td class="invoice-money">${invoiceSpreadsheetMoney(values.postTaxProfit)}</td><td class="invoice-number">${values.numberOfDays||0}</td>
      <td><select class="invoice-cell-input" onchange="updateInvoiceSpreadsheetField('${escapeJsString(job.id)}','clinicRepair',this.value)"><option value="" ${clinicRepair===''?'selected':''}>Select</option><option value="Clinic" ${clinicRepair==='Clinic'?'selected':''}>Clinic</option><option value="Repair" ${clinicRepair==='Repair'?'selected':''}>Repair</option></select></td>
      <td><input class="invoice-cell-input invoice-date" type="date" value="${escapeHtml(job.invoiceDateIssued||'')}" onchange="updateInvoiceSpreadsheetField('${escapeJsString(job.id)}','invoiceDateIssued',this.value)"></td><td><input class="invoice-cell-input invoice-date" type="date" value="${escapeHtml(job.invoiceDatePaid||'')}" onchange="updateInvoiceSpreadsheetField('${escapeJsString(job.id)}','invoiceDatePaid',this.value)"></td><td class="invoice-number">${daysToPay}</td><td class="invoice-spacer"></td><td class="invoice-number">${values.mileage||0}</td><td class="invoice-money invoice-highlight">${invoiceSpreadsheetMoney(values.fuel)}</td>
      <td class="invoice-settled-cell"><input class="invoice-settled-checkbox" type="checkbox" ${job.invoiceSpreadsheetSettled?'checked':''} aria-label="Mark ${escapeHtml(values.invoiceNumber||values.company||'invoice')} as settled" onchange="setInvoiceSpreadsheetSettled('${escapeJsString(job.id)}',this.checked)"></td></tr>`;
  }).join('');
  const totals=jobs.reduce((sum,job)=>{const v=getInvoiceSpreadsheetValues(job);sum.excVat+=parseFloat(v.excVat)||0;sum.incVat+=parseFloat(v.incVat)||0;sum.vat+=parseFloat(v.vat)||0;sum.cost+=parseFloat(v.cost)||0;sum.preTax+=parseFloat(v.preTaxProfit)||0;sum.pension+=parseFloat(v.pension)||0;sum.tax+=parseFloat(v.tax)||0;sum.postTax+=parseFloat(v.postTaxProfit)||0;sum.days+=parseFloat(v.numberOfDays)||0;sum.mileage+=parseFloat(v.mileage)||0;sum.fuel+=parseFloat(v.fuel)||0;return sum;},{excVat:0,incVat:0,vat:0,cost:0,preTax:0,pension:0,tax:0,postTax:0,days:0,mileage:0,fuel:0});
  const liveCount=jobs.filter(job=>!job.invoiceSpreadsheetLocked).length, lockedCount=jobs.length-liveCount, settledCount=jobs.filter(job=>job.invoiceSpreadsheetSettled===true).length, outstandingCount=jobs.length-settledCount;
  container.innerHTML=`<div class="invoice-spreadsheet-header"><div><h2>${escapeHtml(invoiceSpreadsheetPeriodLabel())}</h2><p>${jobs.length} job${jobs.length!==1?'s':''} · ${liveCount} live · ${lockedCount} completed/locked · <span class="invoice-settled-summary">Settled: ${settledCount}</span> · <span class="invoice-outstanding-summary">Outstanding: ${outstandingCount}</span></p></div></div>
    <div class="invoice-table-wrap"><table class="invoice-table"><thead><tr><th>Company</th><th>Invoice number</th><th>Amount exc vat</th><th>Amount inc vat</th><th class="invoice-highlight-heading">VAT</th><th class="invoice-highlight-heading">Cost</th><th>Pre tax profit</th><th class="invoice-highlight-heading">Pension</th><th class="invoice-highlight-heading">Tax</th><th>Post Tax Profit</th><th>Number of days</th><th>Clinic/Repair</th><th>Date issued</th><th>Date paid</th><th>Days taken to pay</th><th class="invoice-spacer"></th><th>Mileage</th><th class="invoice-highlight-heading">Fuel</th><th>Paid Off</th></tr></thead>
    <tbody>${rows}</tbody><tfoot><tr><th colspan="2">TOTAL</th><th class="invoice-money">${invoiceSpreadsheetMoney(totals.excVat)}</th><th class="invoice-money">${invoiceSpreadsheetMoney(totals.incVat)}</th><th class="invoice-money invoice-highlight">${invoiceSpreadsheetMoney(totals.vat)}</th><th class="invoice-money invoice-highlight">${invoiceSpreadsheetMoney(totals.cost)}</th><th class="invoice-money">${invoiceSpreadsheetMoney(totals.preTax)}</th><th class="invoice-money invoice-highlight">${invoiceSpreadsheetMoney(totals.pension)}</th><th class="invoice-money invoice-highlight">${invoiceSpreadsheetMoney(totals.tax)}</th><th class="invoice-money">${invoiceSpreadsheetMoney(totals.postTax)}</th><th class="invoice-number">${totals.days}</th><th colspan="5"></th><th class="invoice-number">${invoiceSpreadsheetRound(totals.mileage)}</th><th class="invoice-money invoice-highlight">${invoiceSpreadsheetMoney(totals.fuel)}</th><th></th></tr></tfoot></table></div>`;
}
function installInvoiceSpreadsheetStyles(){
  if(document.getElementById('invoiceSpreadsheetStyles'))return;const style=document.createElement('style');style.id='invoiceSpreadsheetStyles';style.textContent=`
    .invoice-spreadsheet-header{display:flex;justify-content:space-between;align-items:flex-end;gap:1rem;margin-bottom:1rem}.invoice-spreadsheet-header h2{margin:0;color:var(--primary)}.invoice-spreadsheet-header p{margin:.2rem 0 0;color:var(--text-light)}
    .invoice-settled-summary{font-weight:700;color:#276749}.invoice-outstanding-summary{font-weight:700}
    .invoice-table-wrap{width:100%;overflow-x:auto;border:1px solid var(--border);border-radius:8px;background:#fff}.invoice-table{width:max-content;min-width:100%;border-collapse:collapse;font-size:12px}.invoice-table th,.invoice-table td{padding:8px 9px;border-right:1px solid #edf2f7;border-bottom:1px solid #edf2f7;white-space:nowrap;vertical-align:middle}.invoice-table thead th{position:sticky;top:0;z-index:1;background:var(--primary);color:#fff;font-weight:700;text-align:left}.invoice-table thead th.invoice-highlight-heading{background:#8a5a00}.invoice-table tbody tr:nth-child(even){background:#f8fafc}.invoice-table tbody tr:hover{background:#eef4fb}.invoice-table tbody tr.invoice-row-locked{background:#f1f5f9}.invoice-table td.invoice-highlight,.invoice-table tfoot th.invoice-highlight{background:#fff3bf;font-weight:700}.invoice-table tbody tr:hover td.invoice-highlight{background:#ffe69c}
    .invoice-table tbody tr.invoice-row-settled,.invoice-table tbody tr.invoice-row-settled:nth-child(even),.invoice-table tbody tr.invoice-row-settled:hover{background:#dcfce7}.invoice-table tbody tr.invoice-row-settled td,.invoice-table tbody tr.invoice-row-settled td.invoice-highlight{background:#dcfce7}.invoice-table tbody tr.invoice-row-settled:hover td,.invoice-table tbody tr.invoice-row-settled:hover td.invoice-highlight{background:#d1fae5}
    .invoice-table tfoot th{background:#e8eef6;color:var(--text);font-weight:800}.invoice-company{min-width:210px}.invoice-money,.invoice-number{text-align:right!important;font-variant-numeric:tabular-nums}.invoice-spacer{min-width:18px;width:18px;background:#f7f8fa;border-right:0!important}.invoice-cell-input{width:115px;min-width:100px;padding:5px 6px;border:1px solid #cbd5e1;border-radius:5px;background:#fff;font:inherit}.invoice-date{width:132px}.invoice-settled-cell{text-align:center!important;min-width:70px}.invoice-settled-checkbox{width:20px;height:20px;cursor:pointer;accent-color:#2f855a}
    @media(max-width:700px){.invoice-table{font-size:11px}.invoice-table th,.invoice-table td{padding:7px}}
  `;document.head.appendChild(style);
}
document.addEventListener('DOMContentLoaded',()=>{ensureInvoiceSpreadsheetUi();installInvoiceSpreadsheetStyles();renderInvoiceSpreadsheet();installInvoiceSpreadsheetJobButtons();const jobsContainer=document.getElementById('jobSheets');if(jobsContainer){const observer=new MutationObserver(()=>{observer.disconnect();renderInvoiceSpreadsheet();installInvoiceSpreadsheetJobButtons();observer.observe(jobsContainer,{childList:true,subtree:true});});observer.observe(jobsContainer,{childList:true,subtree:true});}});
