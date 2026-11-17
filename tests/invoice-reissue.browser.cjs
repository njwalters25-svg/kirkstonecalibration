const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.KIRKSTONE_TEST_CHROME,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage(), errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setContent('<!doctype html><html><head></head><body><main id="appMain"><div id="invoiceSpreadsheet"></div></main></body></html>');
  await page.addScriptTag({content:`
    window.currentJobs=[{id:'amici',customerName:'Amici - Artios Pharma Ltd',quoteId:'quote100',quoteRef:'KCAPL100Q',invoiceNumber:'KCAPL100',invoiceDateIssued:'2026-11-10',poNumber:'PO100',invoiceSpreadsheetAdded:true,invoiceSpreadsheetLocked:true,invoiceSpreadsheetSnapshot:{invoiceNumber:'KCAPL100',company:'Amici - Artios Pharma Ltd',excVat:1000,incVat:1200,vat:200,cost:300,numberOfDays:1,shelleyPay:126.96,shelleyMileage:55,shelleyCost:181.96}}];
    window.currentQuotes=[];window.server=JSON.parse(JSON.stringify(currentJobs[0]));window.counter=100;
    window.escapeHtml=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');window.escapeJsString=String;window.formatCurrency=v=>'£'+Number(v||0).toFixed(2);
    window.isLocalPreviewMode=false;window.StorageManager={saveJob(){}};window.showToast=message=>window.lastToast=message;
    window.loadJobsFromFirestore=async()=>[JSON.parse(JSON.stringify(server))];window.loadQuotesFromFirestore=async()=>[];
    window.getJobsRef=()=>({doc:id=>({kind:'job',id})});window.db={collection:()=>({doc:id=>({kind:'counter',id})}),runTransaction:async callback=>{let pending=[];await callback({get:async ref=>({exists:true,data:()=>ref.kind==='job'?server:{lastNumber:counter}}),set:(ref,value)=>pending.push([ref,value])});pending.forEach(([ref,value])=>{if(ref.kind==='job')server=value;else counter=value.lastNumber;});}};
  `});
  for(const name of ['invoice-spreadsheet.js','invoice-spreadsheet-order-lock.js','invoice-number-edit.js','invoice-reissue.js'])await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'../js',name),'utf8')});
  await page.evaluate(()=>renderInvoiceSpreadsheet());
  await page.getByRole('button',{name:'Cancel & reissue'}).click();
  assert.equal(await page.locator('[name=invoiceNumber]').inputValue(),'KCAPL101');assert.equal(await page.locator('[name=poNumber]').inputValue(),'PO100');
  await page.locator('[name=poNumber]').fill('PO101');await page.getByRole('button',{name:'Confirm cancellation and create replacement'}).click();
  await page.waitForFunction(()=>!document.querySelector('dialog'));
  assert.equal(await page.locator('tbody tr').count(),1);assert.equal(await page.evaluate(()=>server.invoiceNumber),'KCAPL101');
  assert.equal(await page.evaluate(()=>server.invoiceSpreadsheetSnapshot.cost),300);assert.equal(await page.evaluate(()=>server.invoiceSpreadsheetSnapshot.shelleyCost),181.96);
  await page.getByRole('button',{name:'History (1)'}).click();await page.locator('summary').click();
  assert.match(await page.locator('dialog').innerText(),/KCAPL100 — cancelled; replaced by KCAPL101/);assert.match(await page.locator('dialog').innerText(),/Original PO: PO100/);
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download original record'}).click();const download=await downloadPromise;
  assert.equal(download.suggestedFilename(),'KCAPL100-cancelled.json');const record=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(record.jobSnapshot.invoiceNumber,'KCAPL100');assert.equal(record.values.incVat,1200);
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.evaluate(()=>{currentJobs[0].invoiceDatePaid='2026-11-17';server=JSON.parse(JSON.stringify(currentJobs[0]));});
  await page.getByRole('button',{name:'Cancel & reissue'}).click();await page.getByRole('button',{name:'Confirm cancellation and create replacement'}).click();
  await page.getByRole('alert').filter({hasText:'marked paid'}).waitFor();assert.equal(await page.evaluate(()=>server.invoiceNumber),'KCAPL101');
  assert.deepEqual(errors,[]);console.log('PASS: prefilled replacement, one invoice row, unchanged costs, original history/download, paid-invoice error.');
 } finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
