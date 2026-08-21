// ============================================================
// customer-completed-quote.js — Customer-facing completed job quote
// ============================================================

function getCompletedQuotePipetteRows(job) {
  const settings = typeof getSettingsForQuote === 'function'
    ? getSettingsForQuote(job.quoteSnapshot || {}, job.settingsSnapshot || DEFAULT_SETTINGS)
    : (job.settingsSnapshot || DEFAULT_SETTINGS);
  const grouped = new Map();
  const types = [
    ['singleChannelCount', 'Single-channel', 'chargeSingleChannel'],
    ['multiChannel6Count', '6-channel', 'chargeMultiChannel6'],
    ['multiChannel8Count', '8-channel', 'chargeMultiChannel8'],
    ['multiChannel12Count', '12-channel', 'chargeMultiChannel12'],
    ['multiChannel16Count', '16-channel', 'chargeMultiChannel16'],
  ];

  (job.actualEntries || []).forEach(entry => {
    const serviceLevel = getServiceLevel(entry.serviceLevelId, settings);
    types.forEach(([countField, typeLabel, priceField]) => {
      const quantity = parseInt(entry[countField]) || 0;
      if (!quantity) return;
      const unitPrice = parseFloat(serviceLevel?.[priceField]) || 0;
      const serviceName = serviceLevel?.name || 'Service';
      const key = `${entry.serviceLevelId || serviceName}|${typeLabel}|${unitPrice}`;
      const current = grouped.get(key) || { typeLabel, serviceName, quantity: 0, unitPrice };
      current.quantity += quantity;
      grouped.set(key, current);
    });
  });

  return Array.from(grouped.values()).map(row => ({
    ...row,
    total: row.quantity * row.unitPrice,
  }));
}

function getCompletedQuotePartRows(job) {
  const catalog = typeof getJobPartsCatalog === 'function' ? getJobPartsCatalog(job) : [];
  return (job.parts || []).map(part => {
    const catalogPart = catalog.find(item => item.id === part.catalogPartId);
    const name = catalogPart
      ? getCatalogPartName(catalogPart)
      : (part.name || part.description || part.catalogPartId || 'Part');
    const quantity = parseFloat(part.quantity) || 0;
    // Legacy stored names are reversed: costPerUnit is the customer price.
    const unitPrice = parseFloat(part.costPerUnit) || 0;
    return { name, quantity, unitPrice, total: quantity * unitPrice };
  }).filter(row => row.quantity > 0);
}

function getCompletedQuoteOriginalRef(job) {
  if (job.quoteRef) return job.quoteRef;

  const snapshotRef = buildRefCode(job.quoteSnapshot?.refPrefix, job.quoteSnapshot?.refNumber, true);
  if (snapshotRef) return snapshotRef;

  // Older job sheets may not have quoteRef/ref fields in their snapshot.
  // Recover the reference from the original saved quote linked by quoteId.
  const linkedQuote = (typeof currentQuotes !== 'undefined' && job.quoteId)
    ? currentQuotes.find(quote => quote.id === job.quoteId)
    : null;
  if (linkedQuote) {
    return buildRefCode(linkedQuote.refPrefix, linkedQuote.refNumber, true) || '';
  }

  return '';
}

function openCustomerCompletedQuote(jobId) {
  const job = typeof currentJobs !== 'undefined' ? currentJobs.find(item => item.id === jobId) : null;
  if (!job) return;

  const calc = calculateJobSheet(job);
  const pipetteRows = getCompletedQuotePipetteRows(job);
  const partRows = getCompletedQuotePartRows(job);
  const settings = (typeof currentSettings !== 'undefined' && currentSettings)
    || job.settingsSnapshot
    || DEFAULT_SETTINGS;
  const customerName = job.customerName || job.quoteSnapshot?.customerName || 'Customer';
  const customerAddress = job.quoteSnapshot?.customerAddress || '';
  const originalRef = getCompletedQuoteOriginalRef(job);
  const ref = originalRef ? `${originalRef}a` : '';
  const companyName = settings.companyName || 'Kirkstone Calibration';
  const companyAddress = settings.companyAddress || '';
  const companyPhone = settings.companyPhone || '';
  const companyEmail = settings.companyEmail || '';
  const companyWebsite = settings.companyWebsite || '';
  const vatNumber = settings.vatNumber || '';
  const pipetteTotal = pipetteRows.reduce((sum, row) => sum + row.total, 0);
  const partsTotal = partRows.reduce((sum, row) => sum + row.total, 0);
  const subtotal = pipetteTotal + partsTotal;
  const vatAmount = job.quoteSnapshot?.vatExempt ? 0 : subtotal * 0.20;
  const grandTotal = subtotal + vatAmount;

  const quoteWindow = window.open('', '_blank');
  if (!quoteWindow) {
    if (typeof showToast === 'function') showToast('Please allow pop-ups to open the Customer Completed Quote');
    return;
  }

  const pipetteTableRows = pipetteRows.length
    ? pipetteRows.map(row => `
        <tr>
          <td>${escapeHtml(row.typeLabel)}</td>
          <td>${escapeHtml(row.serviceName)}</td>
          <td class="num">${row.quantity}</td>
          <td class="num">${formatCurrency(row.unitPrice)}</td>
          <td class="num">${formatCurrency(row.total)}</td>
        </tr>`).join('')
    : '<tr><td colspan="5" class="empty">No completed pipettes recorded.</td></tr>';

  const partTableRows = partRows.length
    ? partRows.map(row => `
        <tr>
          <td>${escapeHtml(row.name)}</td>
          <td class="num">${row.quantity}</td>
          <td class="num">${formatCurrency(row.unitPrice)}</td>
          <td class="num">${formatCurrency(row.total)}</td>
        </tr>`).join('')
    : '<tr><td colspan="4" class="empty">No chargeable parts added.</td></tr>';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Customer Completed Quote - ${escapeHtml(customerName)}${ref ? ` - ${escapeHtml(ref)}` : ''}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f3f6fa; color: #1f2937; font-family: Arial, Helvetica, sans-serif; }
    .page { width: min(920px, calc(100% - 32px)); margin: 28px auto; background: #fff; padding: 36px 42px; border-radius: 12px; box-shadow: 0 8px 28px rgba(15,23,42,.10); }
    .header { display:flex; justify-content:space-between; gap:30px; padding-bottom:20px; border-bottom:2px solid #dbe3ee; }
    h1 { margin:0 0 5px; font-size:27px; }
    .subtitle { color:#64748b; font-size:14px; font-weight:700; }
    .company, .customer { font-size:13px; line-height:1.6; color:#475569; }
    .company { text-align:right; }
    .company strong, .customer strong { color:#1f2937; }
    .customer-block { display:flex; justify-content:space-between; gap:24px; margin:22px 0; }
    h2 { font-size:17px; margin:26px 0 10px; }
    table { width:100%; border-collapse:collapse; font-size:14px; }
    th { text-align:left; background:#f8fafc; color:#475569; padding:10px; border-bottom:2px solid #dbe3ee; }
    td { padding:10px; border-bottom:1px solid #e8edf3; }
    .num { text-align:right; white-space:nowrap; }
    .empty { color:#64748b; font-style:italic; }
    .section-total { display:flex; justify-content:flex-end; gap:28px; padding:12px 10px; font-size:15px; font-weight:700; }
    .totals { width:min(420px, 100%); margin:26px 0 0 auto; border-top:2px solid #cbd5e1; }
    .total-row { display:flex; justify-content:space-between; gap:20px; padding:9px 4px; border-bottom:1px solid #edf2f7; }
    .grand { font-size:18px; font-weight:800; border-top:2px solid #94a3b8; border-bottom:0; margin-top:4px; padding-top:13px; }
    .footer { margin-top:34px; padding-top:16px; border-top:1px solid #e2e8f0; color:#64748b; font-size:11px; line-height:1.5; }
    .actions { display:flex; gap:10px; margin-top:28px; }
    button { border:0; border-radius:7px; padding:10px 16px; cursor:pointer; font-size:14px; font-weight:700; }
    .print { background:#1f4f7a; color:#fff; }
    .close { background:#e8edf3; color:#25364a; }
    @media (max-width:700px) { .header,.customer-block { flex-direction:column; } .company { text-align:left; } .page { padding:24px 20px; } }
    @media print {
      @page { size:A4; margin:14mm; }
      body { background:#fff; }
      .page { width:100%; margin:0; padding:0; box-shadow:none; border-radius:0; }
      .actions { display:none; }
      tr, .totals { break-inside:avoid; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div>
        <h1>${escapeHtml(companyName)}</h1>
        <div class="subtitle">Completed Calibration Quote</div>
      </div>
      <div class="company">
        ${companyAddress ? `<div>${formatMultilineText(companyAddress)}</div>` : ''}
        ${companyPhone ? `<div>${escapeHtml(companyPhone)}</div>` : ''}
        ${companyEmail ? `<div>${escapeHtml(companyEmail)}</div>` : ''}
        ${companyWebsite ? `<div>${escapeHtml(companyWebsite)}</div>` : ''}
        ${vatNumber ? `<div>VAT: ${escapeHtml(vatNumber)}</div>` : ''}
      </div>
    </div>

    <div class="customer-block">
      <div class="customer">
        <strong>Customer</strong>
        <div>${escapeHtml(customerName)}</div>
        ${customerAddress ? `<div>${formatMultilineText(customerAddress)}</div>` : ''}
      </div>
      <div class="customer">
        ${ref ? `<div><strong>Reference:</strong> ${escapeHtml(ref)}</div>` : ''}
        ${job.poNumber ? `<div><strong>PO:</strong> ${escapeHtml(job.poNumber)}</div>` : ''}
        ${job.invoiceNumber ? `<div><strong>Invoice:</strong> ${escapeHtml(job.invoiceNumber)}</div>` : ''}
      </div>
    </div>

    <h2>Completed pipettes</h2>
    <table>
      <thead><tr><th>Pipette type</th><th>Service level</th><th class="num">Quantity</th><th class="num">Price each</th><th class="num">Total</th></tr></thead>
      <tbody>${pipetteTableRows}</tbody>
    </table>
    <div class="section-total"><span>Total all pipettes</span><span>${formatCurrency(pipetteTotal)}</span></div>

    <h2>Parts</h2>
    <table>
      <thead><tr><th>Part</th><th class="num">Quantity</th><th class="num">Price each</th><th class="num">Total</th></tr></thead>
      <tbody>${partTableRows}</tbody>
    </table>
    <div class="section-total"><span>Total parts</span><span>${formatCurrency(partsTotal)}</span></div>

    <div class="totals">
      <div class="total-row"><span>Subtotal</span><strong>${formatCurrency(subtotal)}</strong></div>
      <div class="total-row"><span>VAT ${job.quoteSnapshot?.vatExempt ? '(exempt)' : '(20%)'}</span><strong>${formatCurrency(vatAmount)}</strong></div>
      <div class="total-row grand"><span>Total</span><span>${formatCurrency(grandTotal)}</span></div>
    </div>

    <div class="footer">
      <strong>${escapeHtml(companyName)}</strong>${vatNumber ? ` · VAT ${escapeHtml(vatNumber)}` : ''}
      ${companyEmail ? ` · ${escapeHtml(companyEmail)}` : ''}${companyWebsite ? ` · ${escapeHtml(companyWebsite)}` : ''}
    </div>

    <div class="actions">
      <button class="print" onclick="window.print()">Print / Save as PDF</button>
      <button class="close" onclick="window.close()">Close</button>
    </div>
  </div>
</body>
</html>`;

  quoteWindow.document.open();
  quoteWindow.document.write(html);
  quoteWindow.document.close();
  quoteWindow.focus();
}

function installCustomerCompletedQuoteButtons() {
  document.querySelectorAll('#jobSheets .job-card').forEach(card => {
    const jobId = card.dataset.id;
    const actions = card.querySelector('.history-actions');
    if (!jobId || !actions || actions.querySelector('[data-customer-completed-quote-id]')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn-small btn-quote';
    button.textContent = 'Customer Completed Quote';
    button.dataset.customerCompletedQuoteId = jobId;
    button.addEventListener('click', () => openCustomerCompletedQuote(jobId));

    const summaryButton = actions.querySelector('[data-job-summary-id]');
    if (summaryButton && summaryButton.nextSibling) {
      actions.insertBefore(button, summaryButton.nextSibling);
    } else {
      actions.insertBefore(button, actions.firstChild);
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const jobsContainer = document.getElementById('jobSheets');
  if (!jobsContainer) return;

  installCustomerCompletedQuoteButtons();
  const observer = new MutationObserver(() => {
    // Job sheets are re-rendered after Firebase refreshes and invoice updates.
    // Keep this observer active so the customer-facing completed quote button is
    // always restored. Disconnect while inserting buttons so our own DOM changes
    // do not trigger a recursive observer loop.
    observer.disconnect();
    installCustomerCompletedQuoteButtons();
    observer.observe(jobsContainer, { childList: true, subtree: true });
  });
  observer.observe(jobsContainer, { childList: true, subtree: true });
});
