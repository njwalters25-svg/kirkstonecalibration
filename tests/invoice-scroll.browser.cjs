const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.KIRKSTONE_TEST_CHROME?
  {executablePath:process.env.KIRKSTONE_TEST_CHROME,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']}:{channel:'chrome'})});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:650}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<!doctype html><html><head><style>:root{--primary:#243b53;--text:#243b53;--text-light:#64748b;--border:#cbd5e1}body{font:14px Arial;padding:18px}.page-header{height:150px}.field-hint{font-size:12px}</style></head><body><div class="page-header">Invoice test</div><main id="appMain"><div id="invoiceSpreadsheet"></div></main></body></html>');
  await page.addScriptTag({content:`window.currentJobs=Array.from({length:80},(_,i)=>({id:'job'+i,invoiceSpreadsheetAdded:true,invoiceNumber:'KCTEST'+i,customerName:'Example '+i,createdAt:new Date(Date.UTC(2026,7,1+i)).toISOString(),costs:{mileageMiles:100}}));window.formatCurrency=v=>'£'+Number(v).toFixed(2);window.escapeHtml=String;window.escapeJsString=String;window.isLocalPreviewMode=true;window.StorageManager={saveJob(){}};window.refreshJobSheets=async()=>renderInvoiceSpreadsheet();window.calculateJobSheet=()=>({actualRevenue:2000,revenueIncVat:2400,vatAmount:400,totalCosts:1350.24,profit:649.76,taxAt40:259.9,profitAfterTax:389.86,actualDays:2,employeeDayPayCost:253.92,employeeMileageCost:268.40});`});
  for(const file of ['invoice-spreadsheet.js','invoice-spreadsheet-order-lock.js','invoice-spreadsheet-sticky.js','invoice-wage-allocation.js'])
   await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'../js',file),'utf8')});
  await page.evaluate(()=>{installInvoiceSpreadsheetStyles();renderInvoiceSpreadsheet();window.scrollTo(0,75);});
  await page.locator('[data-wage-allocation-heading]').first().waitFor();
  const position=()=>page.locator('.invoice-table-wrap').evaluate(w=>({top:w.scrollTop,left:w.scrollLeft,pageY:window.scrollY}));
  const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  async function preserveAfterEdit(selector,edit){
   const input=page.locator(selector);await input.focus();await settle();
   const before=await position();assert(before.top>300,'test must edit a scrolled row');assert(before.left>0,'test must exercise horizontal scrolling');
   await edit(input);await settle();
   assert.deepEqual(await position(),before,'editing must keep table and page position');
  }
  await preserveAfterEdit('tbody tr:nth-child(46) td:nth-child(13) input',async input=>{
   await input.fill('2026-11-08');await input.dispatchEvent('change');
  });
  await preserveAfterEdit('tbody tr:nth-child(46) select',input=>input.selectOption('Clinic'));
  await preserveAfterEdit('tbody tr:nth-child(46) .invoice-settled-checkbox',input=>input.check());
  const saved=await page.evaluate(()=>currentJobs[45]);
  assert.equal(saved.invoiceDateIssued,'2026-11-08');assert.equal(saved.clinicRepair,'Clinic');assert.equal(saved.invoiceSpreadsheetSettled,true);
  assert.deepEqual(errors,[]);console.log('PASS: date, type and settled edits retain vertical, horizontal and page scroll through repeated renders.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
