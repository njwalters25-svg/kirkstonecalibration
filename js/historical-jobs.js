// ============================================================
// historical-jobs.js — Add/edit completed jobs from before the app existed
// ============================================================

(function () {
  const money = value => Math.round(((parseFloat(value) || 0) + Number.EPSILON) * 100) / 100;

  function buildHistoricalSnapshot(values) {
    const excVat = money(values.excVat);
    const incVatInput = parseFloat(values.incVat);
    const incVat = Number.isFinite(incVatInput) && incVatInput > 0 ? money(incVatInput) : money(excVat * 1.20);
    const vat = money(Math.max(0, incVat - excVat));
    const cost = money(values.cost);
    const preTaxProfit = money(excVat - cost);
    const pension = money(Math.max(preTaxProfit, 0) * 0.07);
    const tax = money(Math.max(preTaxProfit, 0) * 0.40);
    const postTaxProfit = money(preTaxProfit - tax);
    const mileage = money(values.mileage);
    return {
      company: String(values.company || '').trim(),
      invoiceNumber: String(values.invoiceNumber || '').trim().toUpperCase(),
      excVat,
      incVat,
      vat,
      cost,
      preTaxProfit,
      pension,
      tax,
      postTaxProfit,
      numberOfDays: parseFloat(values.numberOfDays) || 0,
      mileage,
      fuel: money(mileage * 0.55),
    };
  }

  function buildHistoricalJob(values, existingJob) {
    const now = new Date().toISOString();
    const snapshot = buildHistoricalSnapshot(values);
    const job = existingJob || {};
    job.id = job.id || crypto.randomUUID();
    job.createdAt = job.createdAt || now;
    job.updatedAt = now;
    job.status = 'completed';
    job.historicalJob = true;
    job.customerName = snapshot.company;
    job.customerAddress = String(values.customerAddress || job.customerAddress || '').trim();
    job.quoteRef = String(values.quoteRef || '').trim().toUpperCase();
    job.invoiceNumber = snapshot.invoiceNumber;
    job.poNumber = String(values.poNumber || '').trim();
    job.clinicRepair = values.clinicRepair || '';
    job.invoiceDateIssued = values.invoiceDateIssued || '';
    job.invoiceDatePaid = values.invoiceDatePaid || '';
    job.notes = String(values.notes || '').trim();
    job.invoiceSpreadsheetAdded = true;
    job.invoiceSpreadsheetLocked = true;
    job.invoiceSpreadsheetLockedAt = job.invoiceSpreadsheetLockedAt || now;
    job.invoiceSpreadsheetSnapshot = snapshot;
    job.historicalValues = {
      ...snapshot,
      singleCount: parseInt(values.singleCount) || 0,
      multi6Count: parseInt(values.multi6Count) || 0,
      multi8Count: parseInt(values.multi8Count) || 0,
      multi12Count: parseInt(values.multi12Count) || 0,
      multi16Count: parseInt(values.multi16Count) || 0,
      workDate: values.workDate || values.invoiceDateIssued || '',
    };
    job.actualEntries = [];
    job.plannedLines = [];
    job.parts = job.parts || [];
    job.costs = {
      ...(job.costs || {}),
      mileageMiles: snapshot.mileage,
    };
    job.quoteSnapshot = job.quoteSnapshot || { vatExempt: vat === 0 };
    return job;
  }

  async function saveHistoricalJob(values, existingJob) {
    const job = buildHistoricalJob(values, existingJob);
    StorageManager.saveJob(job);
    if (typeof isLocalPreviewMode === 'undefined' || !isLocalPreviewMode) {
      await saveJobToFirestore(job);
    }
    if (typeof refreshJobSheets === 'function') await refreshJobSheets();
    if (typeof renderInvoiceSpreadsheet === 'function') renderInvoiceSpreadsheet();
    if (typeof showToast === 'function') showToast(existingJob ? 'Previous job updated' : 'Previous job added');
    closeHistoricalJobModal();
  }

  function field(id) {
    return document.getElementById(id);
  }

  function collectHistoricalForm() {
    return {
      company: field('histCompany')?.value || '',
      customerAddress: field('histAddress')?.value || '',
      quoteRef: field('histQuoteRef')?.value || '',
      invoiceNumber: field('histInvoiceNumber')?.value || '',
      poNumber: field('histPoNumber')?.value || '',
      clinicRepair: field('histClinicRepair')?.value || '',
      workDate: field('histWorkDate')?.value || '',
      invoiceDateIssued: field('histDateIssued')?.value || '',
      invoiceDatePaid: field('histDatePaid')?.value || '',
      numberOfDays: field('histDays')?.value || 0,
      mileage: field('histMileage')?.value || 0,
      excVat: field('histExcVat')?.value || 0,
      incVat: field('histIncVat')?.value || 0,
      cost: field('histCost')?.value || 0,
      singleCount: field('histSingle')?.value || 0,
      multi6Count: field('hist6')?.value || 0,
      multi8Count: field('hist8')?.value || 0,
      multi12Count: field('hist12')?.value || 0,
      multi16Count: field('hist16')?.value || 0,
      notes: field('histNotes')?.value || '',
    };
  }

  function getHistoricalJob(jobId) {
    return typeof currentJobs !== 'undefined' ? currentJobs.find(job => job.id === jobId) : null;
  }

  function ensureHistoricalJobUi() {
    const jobsPanelCard = document.querySelector('#jobsPanel .card');
    if (jobsPanelCard && !document.getElementById('addPreviousJob')) {
      const bar = document.createElement('div');
      bar.className = 'historical-job-toolbar';
      bar.innerHTML = '<button type="button" id="addPreviousJob" class="btn btn-primary">+ Add Previous Job</button><span>Add completed work from earlier in the financial year. It will be locked and placed in the Invoice Spreadsheet by invoice date.</span>';
      const jobSheets = document.getElementById('jobSheets');
      jobsPanelCard.insertBefore(bar, jobSheets);
      document.getElementById('addPreviousJob').addEventListener('click', () => openHistoricalJobModal());
    }

    if (!document.getElementById('historicalJobModal')) {
      const modal = document.createElement('div');
      modal.id = 'historicalJobModal';
      modal.className = 'historical-modal-backdrop';
      modal.style.display = 'none';
      modal.innerHTML = `
        <div class="historical-modal" role="dialog" aria-modal="true" aria-labelledby="historicalJobTitle">
          <div class="historical-modal-header">
            <div><h2 id="historicalJobTitle">Add Previous Job</h2><p>Enter the figures from the old job sheet/invoice. Financial figures will be locked into the Invoice Spreadsheet.</p></div>
            <button type="button" class="btn-small" id="historicalClose">Close</button>
          </div>
          <input type="hidden" id="histJobId">
          <div class="historical-grid">
            <div class="form-group"><label>Company *</label><input id="histCompany" type="text"></div>
            <div class="form-group"><label>Quote reference</label><input id="histQuoteRef" type="text" placeholder="e.g. KCSYGDC095Q"></div>
            <div class="form-group"><label>Invoice number *</label><input id="histInvoiceNumber" type="text" placeholder="e.g. KCSYGDC095"></div>
            <div class="form-group"><label>PO number</label><input id="histPoNumber" type="text"></div>
            <div class="form-group"><label>Clinic / Repair</label><select id="histClinicRepair"><option value="">Select</option><option value="Clinic">Clinic</option><option value="Repair">Repair</option></select></div>
            <div class="form-group"><label>Work date</label><input id="histWorkDate" type="date"></div>
            <div class="form-group"><label>Date issued *</label><input id="histDateIssued" type="date"></div>
            <div class="form-group"><label>Date paid</label><input id="histDatePaid" type="date"></div>
            <div class="form-group"><label>Number of days</label><input id="histDays" type="number" min="0" step="0.5"></div>
            <div class="form-group"><label>Mileage</label><input id="histMileage" type="number" min="0" step="1"></div>
            <div class="form-group"><label>Amount exc VAT *</label><input id="histExcVat" type="number" min="0" step="0.01"></div>
            <div class="form-group"><label>Amount inc VAT</label><input id="histIncVat" type="number" min="0" step="0.01"><span class="field-hint">Leave at 0 and the app will use 20% VAT.</span></div>
            <div class="form-group"><label>Total cost</label><input id="histCost" type="number" min="0" step="0.01"></div>
          </div>
          <h3 class="historical-subheading">Pipettes completed (optional)</h3>
          <div class="historical-pipette-grid">
            <div class="form-group"><label>Single</label><input id="histSingle" type="number" min="0" step="1"></div>
            <div class="form-group"><label>6 channel</label><input id="hist6" type="number" min="0" step="1"></div>
            <div class="form-group"><label>8 channel</label><input id="hist8" type="number" min="0" step="1"></div>
            <div class="form-group"><label>12 channel</label><input id="hist12" type="number" min="0" step="1"></div>
            <div class="form-group"><label>16 channel</label><input id="hist16" type="number" min="0" step="1"></div>
          </div>
          <div class="form-group"><label>Customer address / site (optional)</label><textarea id="histAddress" rows="2"></textarea></div>
          <div class="form-group"><label>Notes</label><textarea id="histNotes" rows="3"></textarea></div>
          <div class="historical-actions"><button type="button" id="historicalSave" class="btn btn-primary">Save Previous Job</button><button type="button" id="historicalCancel" class="btn btn-secondary">Cancel</button></div>
        </div>`;
      document.body.appendChild(modal);
      document.getElementById('historicalClose').addEventListener('click', closeHistoricalJobModal);
      document.getElementById('historicalCancel').addEventListener('click', closeHistoricalJobModal);
      document.getElementById('historicalSave').addEventListener('click', async () => {
        const values = collectHistoricalForm();
        if (!values.company.trim() || !values.invoiceNumber.trim() || !values.invoiceDateIssued) {
          if (typeof showToast === 'function') showToast('Company, invoice number and date issued are required');
          return;
        }
        const existing = getHistoricalJob(field('histJobId')?.value || '');
        try {
          await saveHistoricalJob(values, existing);
        } catch (error) {
          console.error('Could not save previous job', error);
          if (typeof showToast === 'function') showToast('Could not save previous job');
        }
      });
    }

    installHistoricalJobButtons();
  }

  window.openHistoricalJobModal = function (jobId) {
    ensureHistoricalJobUi();
    const modal = document.getElementById('historicalJobModal');
    const job = jobId ? getHistoricalJob(jobId) : null;
    const h = job?.historicalValues || {};
    const set = (id, value) => { const el = field(id); if (el) el.value = value ?? ''; };
    set('histJobId', job?.id || '');
    set('histCompany', job?.customerName || '');
    set('histAddress', job?.customerAddress || '');
    set('histQuoteRef', job?.quoteRef || '');
    set('histInvoiceNumber', job?.invoiceNumber || '');
    set('histPoNumber', job?.poNumber || '');
    set('histClinicRepair', job?.clinicRepair || '');
    set('histWorkDate', h.workDate || '');
    set('histDateIssued', job?.invoiceDateIssued || '');
    set('histDatePaid', job?.invoiceDatePaid || '');
    set('histDays', h.numberOfDays ?? job?.invoiceSpreadsheetSnapshot?.numberOfDays ?? '');
    set('histMileage', h.mileage ?? job?.invoiceSpreadsheetSnapshot?.mileage ?? '');
    set('histExcVat', h.excVat ?? job?.invoiceSpreadsheetSnapshot?.excVat ?? '');
    set('histIncVat', h.incVat ?? job?.invoiceSpreadsheetSnapshot?.incVat ?? '');
    set('histCost', h.cost ?? job?.invoiceSpreadsheetSnapshot?.cost ?? '');
    set('histSingle', h.singleCount || '');
    set('hist6', h.multi6Count || '');
    set('hist8', h.multi8Count || '');
    set('hist12', h.multi12Count || '');
    set('hist16', h.multi16Count || '');
    set('histNotes', job?.notes || '');
    const title = document.getElementById('historicalJobTitle');
    if (title) title.textContent = job ? 'Edit Previous Job' : 'Add Previous Job';
    modal.style.display = 'flex';
  };

  window.closeHistoricalJobModal = function () {
    const modal = document.getElementById('historicalJobModal');
    if (modal) modal.style.display = 'none';
  };

  function installHistoricalJobButtons() {
    document.querySelectorAll('#jobSheets .job-card').forEach(card => {
      const jobId = card.dataset.id;
      const job = getHistoricalJob(jobId);
      if (!job?.historicalJob) return;
      const header = card.querySelector('.history-header');
      if (header && !header.querySelector('.historical-badge')) {
        const badge = document.createElement('span');
        badge.className = 'historical-badge';
        badge.textContent = 'Previous Job';
        header.appendChild(badge);
      }
      const actions = card.querySelector('.history-actions');
      if (actions && !actions.querySelector('[data-edit-historical-job]')) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn-small btn-quote';
        button.dataset.editHistoricalJob = jobId;
        button.textContent = 'Edit Previous Job';
        button.addEventListener('click', () => openHistoricalJobModal(jobId));
        actions.insertBefore(button, actions.firstChild);
      }
    });
  }

  // Give historical jobs meaningful figures in the normal Jobs card too.
  if (typeof calculateJobSheet === 'function') {
    const originalCalculateJobSheet = calculateJobSheet;
    window.calculateJobSheet = function (job) {
      if (!job?.historicalJob || !job.invoiceSpreadsheetSnapshot) return originalCalculateJobSheet(job);
      const s = job.invoiceSpreadsheetSnapshot;
      const h = job.historicalValues || {};
      const actualTotals = {
        single: h.singleCount || 0,
        multi6: h.multi6Count || 0,
        multi8: h.multi8Count || 0,
        multi12: h.multi12Count || 0,
        multi16: h.multi16Count || 0,
      };
      const actualCount = Object.values(actualTotals).reduce((sum, value) => sum + (parseInt(value) || 0), 0);
      return {
        plannedTotals: actualTotals,
        actualTotals,
        remainingTotals: { single:0, multi6:0, multi8:0, multi12:0, multi16:0 },
        plannedCount: actualCount,
        actualCount,
        pipetteRevenue: money(s.excVat),
        partsRevenue: 0,
        partsCost: 0,
        actualRevenue: money(s.excVat),
        mileageRatePence: 55,
        stickerCostPerPipette: 0,
        stickerCost: 0,
        vatAmount: money(s.vat),
        revenueIncVat: money(s.incVat),
        mileageCost: money(s.fuel),
        totalCosts: money(s.cost),
        profit: money(s.preTaxProfit),
        profitMarginPercent: money((parseFloat(s.excVat) || 0) > 0 ? ((parseFloat(s.preTaxProfit) || 0) / parseFloat(s.excVat)) * 100 : 0),
        taxAt40: money(s.tax),
        profitAfterTax: money(s.postTaxProfit),
        actualDays: parseFloat(s.numberOfDays) || 0,
        profitPerDay: money((parseFloat(s.numberOfDays) || 0) > 0 ? (parseFloat(s.preTaxProfit) || 0) / parseFloat(s.numberOfDays) : (parseFloat(s.preTaxProfit) || 0)),
      };
    };
  }

  function installStyles() {
    if (document.getElementById('historicalJobStyles')) return;
    const style = document.createElement('style');
    style.id = 'historicalJobStyles';
    style.textContent = `
      .historical-job-toolbar{display:flex;align-items:center;gap:.8rem;flex-wrap:wrap;margin:0 0 1rem;padding:.8rem;background:#f8fafc;border:1px solid var(--border);border-radius:8px}.historical-job-toolbar span{font-size:.82rem;color:var(--text-light)}
      .historical-badge{font-size:.7rem;font-weight:700;background:#e0f2fe;color:#075985;border:1px solid #7dd3fc;border-radius:4px;padding:.12rem .45rem}
      .historical-modal-backdrop{position:fixed;inset:0;z-index:1000;background:rgba(15,23,42,.55);align-items:flex-start;justify-content:center;padding:4vh 16px;overflow:auto}.historical-modal{width:min(900px,100%);background:#fff;border-radius:12px;padding:1.25rem;box-shadow:0 20px 60px rgba(0,0,0,.25)}
      .historical-modal-header{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;margin-bottom:1rem}.historical-modal-header h2{margin:0;color:var(--primary)}.historical-modal-header p{margin:.25rem 0 0;color:var(--text-light);font-size:.85rem}
      .historical-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.75rem 1rem}.historical-pipette-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:.75rem}.historical-modal input,.historical-modal select,.historical-modal textarea{width:100%;padding:.5rem .625rem;border:1px solid var(--border);border-radius:var(--radius);font:inherit}.historical-subheading{margin:1rem 0 .5rem;color:var(--primary);font-size:.9rem}.historical-actions{display:flex;gap:.6rem;margin-top:1rem}
      @media(max-width:760px){.historical-grid{grid-template-columns:1fr 1fr}.historical-pipette-grid{grid-template-columns:1fr 1fr 1fr}}@media(max-width:520px){.historical-grid,.historical-pipette-grid{grid-template-columns:1fr}.historical-modal-header{flex-direction:column}}
    `;
    document.head.appendChild(style);
  }

  document.addEventListener('DOMContentLoaded', () => {
    installStyles();
    ensureHistoricalJobUi();
    const jobsContainer = document.getElementById('jobSheets');
    if (jobsContainer) {
      const observer = new MutationObserver(() => installHistoricalJobButtons());
      observer.observe(jobsContainer, { childList:true, subtree:true });
    }
  });
})();
