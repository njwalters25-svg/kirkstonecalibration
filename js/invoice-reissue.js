// Owner invoice replacement: keep one job and retain the cancelled version.
(function () {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const stable = value => JSON.stringify(value, function (key, item) {
    return item && typeof item === 'object' && !Array.isArray(item)
      ? Object.keys(item).sort().reduce((result, name) => { result[name] = item[name]; return result; }, {}) : item;
  });
  const normalise = value => String(value || '').trim().toUpperCase();
  function references(job) {
    return [job.invoiceNumber, job.quoteRef, job.reference,
      job.invoiceSpreadsheetSnapshot?.invoiceNumber,
      ...(job.invoiceHistory || []).map(item => item.invoiceNumber)]
      .filter(Boolean).map(value => normalise(value).replace(/[QA]$/, ''));
  }
  function validate(job, input, jobs, quotes) {
    if (!job?.invoiceSpreadsheetAdded || !job.invoiceNumber) throw new Error('Add this job to the invoice spreadsheet first.');
    if (job.invoiceSpreadsheetSettled || job.invoiceDatePaid) throw new Error('This invoice is marked paid. It cannot be cancelled and reissued here.');
    const number = normalise(input.invoiceNumber);
    const original = normalise(job.invoiceNumber).match(/^KC([A-Z][A-Z0-9_-]*?)(\d+)$/);
    const match = number.match(/^KC([A-Z][A-Z0-9_-]*?)(\d+)$/);
    if (!original || !match || original[1] !== match[1] || Number(match[2]) <= Number(original[2])) throw new Error('Use a higher invoice number with the same customer prefix.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date || '') || Number.isNaN(Date.parse(input.date)) || new Date(input.date).toISOString().slice(0,10) !== input.date) throw new Error('Choose a valid issue date.');
    if (!String(input.reason || '').trim()) throw new Error('Enter a reason for replacing the invoice.');
    if (String(input.reason).length > 1000 || String(input.poNumber || '').length > 200) throw new Error('Shorten the reason or PO number.');
    if (jobs.some(item => references(item).includes(number)) || quotes.some(item => {
      const refs = [item.quoteRef, item.reference, item.refPrefix && `KC${item.refPrefix}${item.refNumber}`];
      return refs.filter(Boolean).some(ref => normalise(ref).replace(/[QA]$/, '') === number);
    })) throw new Error(`${number} is already used or reserved. Choose another number.`);
    return { number, prefix: match[1], sequence: Number(match[2]) };
  }
  function build(job, input, values, now) {
    const next = clone(job), original = clone(job);
    delete original.invoiceHistory;
    next.invoiceHistory = [...(next.invoiceHistory || []), {
      invoiceNumber: job.invoiceNumber, status: 'cancelled', cancelledAt: now,
      reason: input.reason.trim(), replacementInvoiceNumber: normalise(input.invoiceNumber),
      values: clone(values), jobSnapshot: original
    }];
    next.invoiceNumber = normalise(input.invoiceNumber);
    next.invoiceReplaces = job.invoiceNumber;
    next.invoiceDateIssued = input.date;
    next.poNumber = String(input.poNumber || '').trim();
    next.invoiceDatePaid = '';
    next.invoiceSpreadsheetSettled = false;
    if (next.invoiceSpreadsheetSnapshot) next.invoiceSpreadsheetSnapshot.invoiceNumber = next.invoiceNumber;
    next.invoiceRevision = (Number(job.invoiceRevision) || 0) + 1;
    next.updatedAt = now;
    // Leave room below Firestore's document limit, including field overhead.
    if (new TextEncoder().encode(JSON.stringify(next)).length > 700000) throw new Error('Invoice history is too large. No changes have been saved.');
    return next;
  }
  async function commit(job, input) {
    if (typeof isLocalPreviewMode !== 'undefined' && isLocalPreviewMode) throw new Error('Reissuing invoices requires the live owner connection.');
    if (typeof db === 'undefined' || !db) throw new Error('Connect to Firebase before reissuing.');
    // Fail closed on refresh errors, rather than allocating from stale local data.
    const [jobs, quotes] = await Promise.all([loadJobsFromFirestore(), loadQuotesFromFirestore()]);
    const allocation = validate(job, input, jobs, quotes);
    const values = getInvoiceSpreadsheetValues(job), now = new Date().toISOString();
    const next = build(job, input, values, now);
    const jobRef = getJobsRef().doc(job.id);
    const counterRef = db.collection('config').doc(`reference_counter_${allocation.prefix}`);
    await db.runTransaction(async tx => {
      const fresh = await tx.get(jobRef), counter = await tx.get(counterRef);
      // Compare the complete displayed job so employee or owner edits cannot be lost.
      if (!fresh.exists || stable(fresh.data()) !== stable(job)) throw new Error('This job has changed. Refresh the job sheets and try again.');
      const last = counter.exists ? Number(counter.data().lastNumber) || 99 : 99;
      if (allocation.sequence <= last) throw new Error(`${allocation.number} is already reserved. Choose a number above ${last}.`);
      tx.set(jobRef, next);
      tx.set(counterRef, {prefix: allocation.prefix, lastNumber: allocation.sequence, updatedAt: now}, {merge:true});
    });
    // Publish the result locally only after the atomic cloud commit succeeds.
    const index = currentJobs.findIndex(item => item.id === job.id);
    if (index >= 0) currentJobs[index] = next;
    try { StorageManager.saveJob(next); } catch (error) { console.warn('Replacement saved in Firebase; local cache could not be updated.', error); }
    return next;
  }
  function field(form, label, name, value, type = 'text') {
    const wrapper = document.createElement('label');
    wrapper.style.cssText = 'display:block;margin:12px 0';
    wrapper.append(document.createTextNode(label));
    const input = document.createElement('input');
    input.name = name; input.type = type; input.value = value || ''; input.required = name !== 'poNumber';
    input.style.cssText = 'display:block;width:100%;box-sizing:border-box;padding:8px;margin-top:4px';
    wrapper.append(input); form.append(wrapper); return input;
  }
  function dialog(title) {
    const modal = document.createElement('dialog');
    modal.style.cssText = 'max-width:600px;width:90%;border:1px solid #cbd5e1;border-radius:10px;padding:24px;color:#1e293b';
    const heading = document.createElement('h2'); heading.textContent = title; modal.append(heading);
    const close = document.createElement('button'); close.textContent = 'Close'; close.type = 'button';
    close.onclick = () => modal.close(); modal.append(close);
    modal.addEventListener('close', () => modal.remove());
    document.body.append(modal); modal.showModal(); return modal;
  }
  window.openInvoiceReissue = function (id) {
    const job = currentJobs.find(item => item.id === id); if (!job) return;
    const modal = dialog('Cancel and reissue invoice');
    const intro = document.createElement('p');
    intro.textContent = `${job.customerName}: ${job.invoiceNumber}. The replacement keeps the existing job, prices and costs. The original is retained in invoice history. This does not update Xero or send an invoice to the customer.`;
    modal.append(intro);
    const form = document.createElement('form'); modal.append(form);
    const suggested = normalise(job.invoiceNumber).replace(/\d+$/, digits => String(Number(digits) + 1).padStart(digits.length, '0'));
    field(form, 'Replacement invoice number', 'invoiceNumber', suggested);
    field(form, 'Purchase order', 'poNumber', job.poNumber);
    field(form, 'New issue date', 'date', new Date().toLocaleDateString('en-CA', {timeZone:'Europe/London'}), 'date');
    field(form, 'Reason', 'reason', 'Customer requested replacement following purchase order amendment');
    const error = document.createElement('p'); error.setAttribute('role','alert'); error.style.color = '#b91c1c'; form.append(error);
    const submit = document.createElement('button'); submit.type='submit'; submit.className='btn btn-primary'; submit.textContent='Confirm cancellation and create replacement'; form.append(submit);
    form.onsubmit = async event => {
      event.preventDefault(); if (submit.disabled) return;
      submit.disabled=true; error.textContent=''; modal.querySelector('button').disabled=true;
      const preventClose = event => event.preventDefault(); modal.addEventListener('cancel', preventClose);
      try {
        const input = Object.fromEntries(new FormData(form));
        const saved = await commit(job, input);
        modal.close();
        if (typeof renderJobSheets === 'function') renderJobSheets(currentJobs);
        renderInvoiceSpreadsheet();
        if (typeof renderAnnualSummary === 'function') renderAnnualSummary();
        showToast(`${job.invoiceNumber} cancelled; replacement ${saved.invoiceNumber} saved`);
      } catch (e) { error.textContent=e.message; }
      finally { submit.disabled=false; modal.querySelector('button').disabled=false; modal.removeEventListener('cancel', preventClose); }
    };
  };
  window.openInvoiceHistory = function (id) {
    const job = currentJobs.find(item => item.id === id); if (!job) return;
    const modal=dialog('Invoice history');
    const current=document.createElement('p'); current.textContent=`Current invoice: ${job.invoiceNumber}. Replaces: ${job.invoiceReplaces || '—'}`; modal.append(current);
    for (const item of [...(job.invoiceHistory || [])].reverse()) {
      const details=document.createElement('details'), summary=document.createElement('summary');
      summary.textContent=`${item.invoiceNumber} — cancelled; replaced by ${item.replacementInvoiceNumber}`; details.append(summary);
      const text=document.createElement('p');
      text.textContent=`Cancelled: ${item.cancelledAt}. Reason: ${item.reason}. Original PO: ${item.jobSnapshot?.poNumber || '—'}. Original issue date: ${item.jobSnapshot?.invoiceDateIssued || '—'}. Amount exc VAT: ${invoiceSpreadsheetMoney(item.values?.excVat)}. VAT: ${invoiceSpreadsheetMoney(item.values?.vat)}. Amount inc VAT: ${invoiceSpreadsheetMoney(item.values?.incVat)}.`;
      details.append(text);
      const download=document.createElement('button'); download.type='button'; download.textContent='Download original record';
      download.onclick=()=>{
        const url=URL.createObjectURL(new Blob([JSON.stringify(item,null,2)],{type:'application/json'}));
        const link=document.createElement('a'); link.href=url; link.download=`${item.invoiceNumber}-cancelled.json`; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
      };
      details.append(download);modal.append(details);
    }
  };
  window.KirkstoneInvoiceReissue = {validate, build, commit};
})();
