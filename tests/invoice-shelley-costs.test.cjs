const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(path.resolve(__dirname,'../../tools/ui/node_modules/jsdom'));

function setup(){
 const dom=new JSDOM('<!doctype html><html><head></head><body><main id="appMain"><div id="invoiceSpreadsheet"></div></main></body></html>',{runScripts:'outside-only'}),w=dom.window;
 w.formatCurrency=v=>'£'+Number(v).toFixed(2);w.escapeHtml=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');w.escapeJsString=String;
 w.calculateJobSheet=()=>({actualRevenue:2000,revenueIncVat:2400,vatAmount:400,totalCosts:1350.24,profit:649.76,taxAt40:259.9,profitAfterTax:389.86,actualDays:2,employeeDayPayCost:253.92,employeeMileageCost:268.4});
 w.eval(fs.readFileSync(path.join(__dirname,'../js/invoice-spreadsheet.js'),'utf8'));
 return {dom,w};
}

test('live invoice breakdown totals pay and mileage without adding either to overall cost again',()=>{
 const {dom,w}=setup();const job={customerName:'Example laboratory',invoiceNumber:'KC100',costs:{mileageMiles:100}};
 const before=JSON.stringify(job),v=w.getLiveInvoiceSpreadsheetValues(job);
 assert.equal(v.shelleyPay,253.92);assert.equal(v.shelleyMileage,268.4);assert.equal(v.shelleyCost,522.32);
 assert.equal(v.cost,1350.24);assert.equal(v.preTaxProfit,649.76);assert.equal(v.fuel,55);
 assert.equal(JSON.stringify(job),before);dom.window.close();
});

test('locked invoices use the saved breakdown even after current pay or mileage changes',()=>{
 const {dom,w}=setup();const snapshot={cost:500,shelleyPay:126.96,shelleyMileage:55,shelleyCost:181.96};
 const job={invoiceSpreadsheetLocked:true,invoiceSpreadsheetSnapshot:snapshot};
 const v=w.getInvoiceSpreadsheetValues(job);assert.equal(v.shelleyCost,181.96);assert.equal(v.cost,500);
 assert.deepEqual(snapshot,{cost:500,shelleyPay:126.96,shelleyMileage:55,shelleyCost:181.96});dom.window.close();
});

test('completing an invoice saves Shelley pay and the displayed breakdown before locking',async()=>{
 const {dom,w}=setup(),job={id:'complete-check',invoiceNumber:'KC101',invoiceSpreadsheetAdded:true,customerName:'Example',costs:{}};
 w.currentJobs=[job];w.confirm=()=>true;w.isLocalPreviewMode=true;w.StorageManager={saveJob(){}};
 w.KirkstonePlanning={shelleyDayPay:()=>({applies:true,days:2,cost:253.92,otherWorkerCost:0})};
 await w.completeInvoiceSpreadsheetJob(job.id);
 assert.equal(job.invoiceSpreadsheetLocked,true);assert.equal(job.shelleyDayPaySnapshot.cost,253.92);
 assert.equal(job.invoiceSpreadsheetSnapshot.shelleyPay,253.92);
 assert.equal(job.invoiceSpreadsheetSnapshot.shelleyCost,522.32);
 assert.equal(job.invoiceSpreadsheetSnapshot.cost,1350.24);dom.window.close();
});

test('older locked invoices mark an unrecorded breakdown as unknown rather than recalculate history',()=>{
 const {dom,w}=setup(),snapshot={cost:500,fuel:55},job={invoiceSpreadsheetLocked:true,invoiceSpreadsheetSnapshot:snapshot};
 const v=w.getInvoiceSpreadsheetValues(job);assert.equal(v.shelleyPay,null);assert.equal(v.shelleyMileage,null);assert.equal(v.shelleyCost,null);
 assert.equal(v.cost,500);assert.deepEqual(snapshot,{cost:500,fuel:55});assert.equal(w.invoiceSpreadsheetShelleyMoney(null),'—');dom.window.close();
});

test('columns and footer align, match existing cost colours, and sum recorded amounts only',()=>{
 const {dom,w}=setup();w.currentJobs=[{id:'live',customerName:'Example laboratory',invoiceNumber:'KC100',invoiceSpreadsheetAdded:true,costs:{mileageMiles:100}},
 {id:'locked',invoiceSpreadsheetAdded:true,invoiceSpreadsheetLocked:true,invoiceSpreadsheetSnapshot:{company:'Historic example',invoiceNumber:'KC099',cost:500,fuel:20}}];
 w.installInvoiceSpreadsheetStyles();w.renderInvoiceSpreadsheet();const d=w.document,table=d.querySelector('.invoice-table');
 const headings=[...table.tHead.rows[0].cells],names=headings.map(c=>c.textContent);
 const first=names.indexOf('Shelley pay');assert.equal(first,names.indexOf('Fuel')+1);
 assert.deepEqual(names.slice(first,first+4),['Shelley pay','Shelley mileage','Shelley total','Paid Off']);
 for(const h of headings.slice(first,first+3))assert(h.classList.contains('invoice-highlight-heading'));
 for(const row of table.tBodies[0].rows){assert.equal(row.cells.length,headings.length);for(const cell of row.querySelectorAll('[data-shelley-cost]'))assert(cell.classList.contains('invoice-highlight'));}
 const footer=table.tFoot.rows[0];assert.equal([...footer.cells].reduce((n,c)=>n+c.colSpan,0),headings.length);
 assert.equal(d.querySelector('[data-shelley-total="total"]').textContent,'£522.32');
 assert.equal(table.tBodies[0].rows[0].cells[5].textContent,'£1350.24');
 assert.equal(table.tBodies[0].rows[1].querySelector('[data-shelley-cost="total"]').textContent,'—');
 assert.match(d.body.textContent,/already included in Cost/);dom.window.close();
});
