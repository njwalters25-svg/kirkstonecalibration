// ============================================================
// invoice-spreadsheet-import-2026-27.js
// One-time, idempotent import of the user's 2026-27 Excel invoice list.
// Re-running is safe: invoice numbers already present are skipped.
// ============================================================

(function () {
  const SOURCE_ROWS = [
    {"company":"Revvity (UK) Ltd","invoiceNumber":"KCRO017","excVat":1123,"incVat":1347.6,"vat":224.6,"cost":170.64,"preTaxProfit":952.36,"pension":71.427,"tax":380.944,"postTaxProfit":571.416,"numberOfDays":0,"clinicRepair":"","invoiceDateIssued":"2026-04-07","invoiceDatePaid":"","mileage":115},
    {"company":"The Rosalind Franklin Institute","invoiceNumber":"KCTRFI032","excVat":1029.86,"incVat":1235.832,"vat":205.972,"cost":500,"preTaxProfit":529.86,"pension":39.7395,"tax":211.944,"postTaxProfit":317.916,"numberOfDays":0,"clinicRepair":"","invoiceDateIssued":"2026-04-16","invoiceDatePaid":"","mileage":0},
    {"company":"Rouken Bio","invoiceNumber":"KCRB022","excVat":3568.5,"incVat":4282.2,"vat":713.7,"cost":795.52,"preTaxProfit":2772.98,"pension":207.9735,"tax":1109.192,"postTaxProfit":1663.788,"numberOfDays":0,"clinicRepair":"","invoiceDateIssued":"2026-04-18","invoiceDatePaid":"","mileage":0},
    {"company":"The Rosalind Franklin Institute","invoiceNumber":"KCTRFI031","excVat":124.4,"incVat":124.4,"vat":0,"cost":32.12,"preTaxProfit":92.28,"pension":6.921,"tax":36.912,"postTaxProfit":55.368,"numberOfDays":0,"clinicRepair":"","invoiceDateIssued":"2026-04-20","invoiceDatePaid":"","mileage":0},
    {"company":"Greiner Bio-One International","invoiceNumber":"KCGBO005","excVat":500,"incVat":600,"vat":100,"cost":150,"preTaxProfit":350,"pension":26.25,"tax":140,"postTaxProfit":210,"numberOfDays":0,"clinicRepair":"","invoiceDateIssued":"2026-04-27","invoiceDatePaid":"","mileage":0},
    {"company":"Rouken Bio","invoiceNumber":"KCRB023","excVat":325,"incVat":390,"vat":65,"cost":150,"preTaxProfit":175,"pension":13.125,"tax":70,"postTaxProfit":105,"numberOfDays":0,"clinicRepair":"","invoiceDateIssued":"2026-04-27","invoiceDatePaid":"","mileage":0},
    {"company":"Greiner Bio-One International","invoiceNumber":"KCGBO006","excVat":2488,"incVat":2985.6,"vat":497.6,"cost":628.05,"preTaxProfit":1859.95,"pension":139.49625,"tax":743.98,"postTaxProfit":1115.97,"numberOfDays":0,"clinicRepair":"","invoiceDateIssued":"2026-04-30","invoiceDatePaid":"","mileage":0},
    {"company":"Sygnature Discovery","invoiceNumber":"KCSYGDC060","excVat":351.57,"incVat":421.884,"vat":70.314,"cost":64,"preTaxProfit":287.57,"pension":21.56775,"tax":115.028,"postTaxProfit":172.542,"numberOfDays":0,"clinicRepair":"","invoiceDateIssued":"2026-05-01","invoiceDatePaid":"","mileage":0},
    {"company":"Sygnature Discovery","invoiceNumber":"KCSYGDC061","excVat":144.36,"incVat":173.232,"vat":28.872,"cost":35,"preTaxProfit":109.36,"pension":8.202,"tax":43.744,"postTaxProfit":65.616,"numberOfDays":0,"clinicRepair":"","invoiceDateIssued":"2026-05-01","invoiceDatePaid":"","mileage":0},
    {"company":"Orchard Therapeutics (Europe) Limited","invoiceNumber":"KCOT001","excVat":5687.36,"incVat":6824.832,"vat":1137.472,"cost":2948.43,"preTaxProfit":2738.93,"pension":205.41975,"tax":1095.572,"postTaxProfit":1643.358,"numberOfDays":0,"clinicRepair":"","invoiceDateIssued":"2026-05-14","invoiceDatePaid":"","mileage":0},
    {"company":"Sygnature Discovery","invoiceNumber":"KCSYGDC062","excVat":4864,"incVat":5836.8,"vat":972.8,"cost":1492.17,"preTaxProfit":3371.83,"pension":252.88725,"tax":1348.732,"postTaxProfit":2023.098,"numberOfDays":0,"clinicRepair":"","invoiceDateIssued":"2026-05-14","invoiceDatePaid":"","mileage":0},
    {"company":"Excellerate Bio","invoiceNumber":"KCEB025","excVat":217.14,"incVat":260.568,"vat":43.428,"cost":50,"preTaxProfit":167.14,"pension":12.5355,"tax":66.856,"postTaxProfit":100.284,"numberOfDays":0,"clinicRepair":"","invoiceDateIssued":"2026-05-19","invoiceDatePaid":"","mileage":0},
    {"company":"Sygnature Discovery","invoiceNumber":"KCSYGDC063","excVat":1944.44,"incVat":2333.328,"vat":388.888,"cost":742.85,"preTaxProfit":1201.59,"pension":90.11925,"tax":480.636,"postTaxProfit":720.954,"numberOfDays":0,"clinicRepair":"","invoiceDateIssued":"2026-05-19","invoiceDatePaid":"","mileage":0},
    {"company":"Alchemab Therapeutics","invoiceNumber":"KCAL002","excVat":122.46,"incVat":146.952,"vat":24.492,"cost":50,"preTaxProfit":72.46,"pension":5.4345,"tax":28.984,"postTaxProfit":43.476,"numberOfDays":0,"clinicRepair":"","invoiceDateIssued":"2026-05-26","invoiceDatePaid":"","mileage":0},
    {"company":"Rouken Bio","invoiceNumber":"KCR024","excVat":196.3,"incVat":235.56,"vat":39.26,"cost":30,"preTaxProfit":166.3,"pension":12.4725,"tax":66.52,"postTaxProfit":99.78,"numberOfDays":0,"clinicRepair":"","invoiceDateIssued":"2026-05-26","invoiceDatePaid":"","mileage":0},
    {"company":"Sygnature Discovery","invoiceNumber":"KCSYGDC064","excVat":861.73,"incVat":1034.076,"vat":172.346,"cost":384,"preTaxProfit":477.73,"pension":35.82975,"tax":191.092,"postTaxProfit":286.638,"numberOfDays":0,"clinicRepair":"","invoiceDateIssued":"2026-05-27","invoiceDatePaid":"","mileage":0},
    {"company":"Scancell Ltd","invoiceNumber":"KCSCANCELL021","excVat":1639,"incVat":1966.8,"vat":327.8,"cost":487.26,"preTaxProfit":1151.74,"pension":86.3805,"tax":460.696,"postTaxProfit":691.044,"numberOfDays":0,"clinicRepair":"","invoiceDateIssued":"2026-06-03","invoiceDatePaid":"","mileage":0},
    {"company":"Sygnature Discovery","invoiceNumber":"KCSYGDC065","excVat":299,"incVat":358.8,"vat":59.8,"cost":0,"preTaxProfit":299,"pension":22.425,"tax":119.6,"postTaxProfit":179.4,"numberOfDays":0,"clinicRepair":"","invoiceDateIssued":"2026-06-15","invoiceDatePaid":"","mileage":0},
    {"company":"Sygnature Discovery","invoiceNumber":"KCSYGDC066","excVat":4345,"incVat":5214,"vat":869,"cost":3807.22,"preTaxProfit":537.78,"pension":40.3335,"tax":215.112,"postTaxProfit":322.668,"numberOfDays":0,"clinicRepair":"","invoiceDateIssued":"2026-06-15","invoiceDatePaid":"","mileage":0},
    {"company":"Sygnature Discovery","invoiceNumber":"KCSYGDC067","excVat":2862,"incVat":3434.4,"vat":572.4,"cost":9.09,"preTaxProfit":2852.91,"pension":213.96825,"tax":1141.164,"postTaxProfit":1711.746,"numberOfDays":0,"clinicRepair":"","invoiceDateIssued":"2026-06-20","invoiceDatePaid":"","mileage":0},
    {"company":"Sygnature Discovery","invoiceNumber":"KCSYGDC068","excVat":1431,"incVat":1717.2,"vat":286.2,"cost":6.75,"preTaxProfit":1424.25,"pension":106.81875,"tax":569.7,"postTaxProfit":854.55,"numberOfDays":0,"clinicRepair":"","invoiceDateIssued":"2026-06-20","invoiceDatePaid":"","mileage":0},
    {"company":"Sygnature Discovery","invoiceNumber":"KCSYGDC069","excVat":237.78,"incVat":285.336,"vat":47.556,"cost":44,"preTaxProfit":193.78,"pension":14.5335,"tax":77.512,"postTaxProfit":116.268,"numberOfDays":0,"clinicRepair":"","invoiceDateIssued":"2026-06-20","invoiceDatePaid":"","mileage":0},
    {"company":"Cellomatics BioSciences Limited","invoiceNumber":"KCCB006","excVat":1643,"incVat":1971.6,"vat":328.6,"cost":57.92,"preTaxProfit":1585.08,"pension":118.881,"tax":634.032,"postTaxProfit":951.048,"numberOfDays":0,"clinicRepair":"","invoiceDateIssued":"2026-06-23","invoiceDatePaid":"","mileage":0},
    {"company":"Greiner Bio-One International","invoiceNumber":"KCCB007","excVat":648.6,"incVat":778.32,"vat":129.72,"cost":400,"preTaxProfit":248.6,"pension":18.645,"tax":99.44,"postTaxProfit":149.16,"numberOfDays":0,"clinicRepair":"","invoiceDateIssued":"2026-06-26","invoiceDatePaid":"","mileage":0},
    {"company":"Greiner Bio-One International","invoiceNumber":"KCCB008","excVat":187.58,"incVat":225.096,"vat":37.516,"cost":30,"preTaxProfit":157.58,"pension":11.8185,"tax":63.032,"postTaxProfit":94.548,"numberOfDays":0,"clinicRepair":"","invoiceDateIssued":"2026-06-26","invoiceDatePaid":"","mileage":0},
    {"company":"Excellerate Bio","invoiceNumber":"KCEB026","excVat":2025.26,"incVat":2430.312,"vat":405.052,"cost":117.22,"preTaxProfit":1908.04,"pension":143.103,"tax":763.216,"postTaxProfit":1144.824,"numberOfDays":0,"clinicRepair":"","invoiceDateIssued":"2026-06-30","invoiceDatePaid":"","mileage":0},
    {"company":"Excellerate Bio","invoiceNumber":"KCEB027","excVat":119.38,"incVat":143.256,"vat":23.876,"cost":50,"preTaxProfit":69.38,"pension":5.2035,"tax":27.752,"postTaxProfit":41.628,"numberOfDays":0,"clinicRepair":"","invoiceDateIssued":"2026-07-11","invoiceDatePaid":"","mileage":0},
    {"company":"Alchemab Therapeutics","invoiceNumber":"KCAL003","excVat":275.6,"incVat":330.72,"vat":55.12,"cost":219.6,"preTaxProfit":56,"pension":4.2,"tax":22.4,"postTaxProfit":33.6,"numberOfDays":0,"clinicRepair":"","invoiceDateIssued":"2026-07-14","invoiceDatePaid":"","mileage":0},
    {"company":"Rouken Bio","invoiceNumber":"KCRB024","excVat":333.82,"incVat":400.584,"vat":66.764,"cost":75,"preTaxProfit":258.82,"pension":19.4115,"tax":103.528,"postTaxProfit":155.292,"numberOfDays":0,"clinicRepair":"","invoiceDateIssued":"2026-07-14","invoiceDatePaid":"","mileage":0},
    {"company":"Greiner Bio-One International","invoiceNumber":"KCGBO008","excVat":4377.7,"incVat":5253.24,"vat":875.54,"cost":951.92,"preTaxProfit":3425.78,"pension":256.9335,"tax":1370.312,"postTaxProfit":2055.468,"numberOfDays":0,"clinicRepair":"","invoiceDateIssued":"2026-07-16","invoiceDatePaid":"","mileage":0},
    {"company":"Greiner Bio-One International","invoiceNumber":"KCGBO009","excVat":133,"incVat":159.6,"vat":26.6,"cost":25,"preTaxProfit":108,"pension":8.1,"tax":43.2,"postTaxProfit":64.8,"numberOfDays":0,"clinicRepair":"","invoiceDateIssued":"2026-07-20","invoiceDatePaid":"","mileage":0},
    {"company":"Excellerate Bio","invoiceNumber":"KCEB028","excVat":115,"incVat":138,"vat":23,"cost":75,"preTaxProfit":40,"pension":3,"tax":16,"postTaxProfit":24,"numberOfDays":0,"clinicRepair":"","invoiceDateIssued":"2026-07-22","invoiceDatePaid":"","mileage":0},
    {"company":"Sygnature Discovery","invoiceNumber":"KCSYGDC070","excVat":158.78,"incVat":190.536,"vat":31.756,"cost":26,"preTaxProfit":132.78,"pension":9.9585,"tax":53.112,"postTaxProfit":79.668,"numberOfDays":0,"clinicRepair":"","invoiceDateIssued":"2026-07-23","invoiceDatePaid":"","mileage":0},
    {"company":"Sygnature Discovery","invoiceNumber":"KCSYGDC071","excVat":353.88,"incVat":424.656,"vat":70.776,"cost":102,"preTaxProfit":251.88,"pension":18.891,"tax":100.752,"postTaxProfit":151.128,"numberOfDays":0,"clinicRepair":"","invoiceDateIssued":"2026-07-23","invoiceDatePaid":"","mileage":0},
    {"company":"Excellerate Bio","invoiceNumber":"KCEB029","excVat":423,"incVat":507.6,"vat":84.6,"cost":null,"preTaxProfit":423,"pension":31.725,"tax":169.2,"postTaxProfit":253.8,"numberOfDays":0,"clinicRepair":"","invoiceDateIssued":"","invoiceDatePaid":"","mileage":0},
    {"company":"Rouken Bio","invoiceNumber":"KCRB025","excVat":1772,"incVat":2126.4,"vat":354.4,"cost":848.9,"preTaxProfit":923.1,"pension":69.2325,"tax":369.24,"postTaxProfit":553.86,"numberOfDays":0,"clinicRepair":"","invoiceDateIssued":"2026-07-31","invoiceDatePaid":"","mileage":600},
    {"company":"Scancell Ltd","invoiceNumber":"KCSCANCELL022","excVat":902,"incVat":1082.4,"vat":180.4,"cost":40.25,"preTaxProfit":861.75,"pension":64.63125,"tax":344.7,"postTaxProfit":517.05,"numberOfDays":0,"clinicRepair":"","invoiceDateIssued":"2026-08-05","invoiceDatePaid":"","mileage":44}
  ];

  const money = value => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? Math.round((parsed + Number.EPSILON) * 1000000) / 1000000 : null;
  };

  function buildImportedJob(row, index) {
    const orderTime = new Date(Date.UTC(2026, 3, 1, 0, 0, index)).toISOString();
    const now = new Date().toISOString();
    const mileage = money(row.mileage) || 0;
    const snapshot = {
      company: row.company || '', invoiceNumber: row.invoiceNumber || '',
      excVat: money(row.excVat) || 0, incVat: money(row.incVat) || 0,
      vat: money(row.vat) || 0, cost: money(row.cost),
      preTaxProfit: money(row.preTaxProfit) || 0, pension: money(row.pension) || 0,
      tax: money(row.tax) || 0, postTaxProfit: money(row.postTaxProfit) || 0,
      numberOfDays: money(row.numberOfDays) || 0, mileage,
      fuel: Math.round(((mileage * 0.55) + Number.EPSILON) * 100) / 100
    };
    return {
      id: `historical-2026-27-${String(row.invoiceNumber || index).toLowerCase()}`,
      createdAt: orderTime, updatedAt: now, status: 'completed', historicalJob: true,
      customerName: row.company || '', customerAddress: '', quoteRef: '',
      invoiceNumber: row.invoiceNumber || '', poNumber: '', clinicRepair: row.clinicRepair || '',
      invoiceDateIssued: row.invoiceDateIssued || '', invoiceDatePaid: row.invoiceDatePaid || '',
      notes: 'Imported from 2026-27 invoice spreadsheet',
      invoiceSpreadsheetAdded: true, invoiceSpreadsheetAddedAt: orderTime,
      invoiceSpreadsheetLocked: true, invoiceSpreadsheetLockedAt: orderTime,
      invoiceSpreadsheetSettled: false, invoiceSpreadsheetSnapshot: snapshot,
      invoiceSpreadsheetImportedFrom: 'Invoice_Spreadsheet_2026-27(1).xlsx',
      historicalValues: {...snapshot, singleCount:0, multi6Count:0, multi8Count:0, multi12Count:0, multi16Count:0, workDate:row.invoiceDateIssued || ''},
      actualEntries: [], plannedLines: [], parts: [], costs: {mileageMiles:mileage},
      quoteSnapshot: {vatExempt:snapshot.vat === 0}
    };
  }

  async function runImport() {
    if (typeof currentJobs === 'undefined' || !Array.isArray(currentJobs)) return false;
    if (typeof StorageManager === 'undefined' || typeof StorageManager.saveJob !== 'function') return false;
    if (typeof saveJobToFirestore !== 'function') return false;
    const existingInvoices = new Set(currentJobs.map(job => String(job.invoiceNumber || job.invoiceSpreadsheetSnapshot?.invoiceNumber || '').trim().toUpperCase()).filter(Boolean));
    const missingRows = SOURCE_ROWS.filter(row => !existingInvoices.has(String(row.invoiceNumber || '').trim().toUpperCase()));
    if (!missingRows.length) return true;
    let imported = 0;
    for (const row of missingRows) {
      const sourceIndex = SOURCE_ROWS.findIndex(item => item.invoiceNumber === row.invoiceNumber);
      const job = buildImportedJob(row, sourceIndex + 1);
      StorageManager.saveJob(job);
      if (typeof isLocalPreviewMode === 'undefined' || !isLocalPreviewMode) await saveJobToFirestore(job);
      currentJobs.push(job);
      existingInvoices.add(String(row.invoiceNumber || '').trim().toUpperCase());
      imported += 1;
    }
    if (typeof refreshJobSheets === 'function') await refreshJobSheets();
    if (typeof renderInvoiceSpreadsheet === 'function') renderInvoiceSpreadsheet();
    if (typeof showToast === 'function' && imported) showToast(`${imported} previous invoice${imported === 1 ? '' : 's'} imported`);
    return true;
  }

  function tryImport() {
    const cloudStatus = document.getElementById('cloudStatus');
    if (cloudStatus && !cloudStatus.classList.contains('cloud-status-ready')) return false;
    runImport().catch(error => {
      console.error('Could not import 2026-27 invoice spreadsheet', error);
      if (typeof showToast === 'function') showToast('Could not import previous invoices');
    });
    return true;
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (tryImport()) return;
    const cloudStatus = document.getElementById('cloudStatus');
    if (!cloudStatus) return;
    const observer = new MutationObserver(() => {
      if (cloudStatus.classList.contains('cloud-status-ready')) {
        observer.disconnect();
        tryImport();
      }
    });
    observer.observe(cloudStatus, {attributes:true, attributeFilter:['class'], childList:true, subtree:true});
  });
})();
