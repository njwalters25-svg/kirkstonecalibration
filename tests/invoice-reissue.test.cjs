const {test}=require('node:test');
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../js/invoice-reissue.js'),'utf8');
function fixture(overrides={}) {
 const job={id:'amici-job',quoteId:'amici-quote',quoteRef:'KCAPL100Q',customerName:'Amici - Artios Pharma Ltd',invoiceNumber:'KCAPL100',invoiceSpreadsheetAdded:true,invoiceSpreadsheetLocked:true,invoiceDateIssued:'2026-11-10',poNumber:'PO-original',employeeRevision:3,invoiceSpreadsheetSnapshot:{invoiceNumber:'KCAPL100',excVat:1000,vat:200,incVat:1200,cost:300,shelleyCost:181.96},costs:{mileageMiles:150},actualDays:1,...overrides};
 const input={invoiceNumber:'KCAPL101',poNumber:'PO-adjusted',date:'2026-11-17',reason:'Customer PO amendment'};
 let server=structuredClone(job),counter=100; const saved=[],writes=[];
 const context={window:{},TextEncoder,console,Date,JSON,FormData,currentJobs:[job],isLocalPreviewMode:false,
  getInvoiceSpreadsheetValues:j=>structuredClone(j.invoiceSpreadsheetSnapshot),
  loadJobsFromFirestore:async()=>[structuredClone(server)],loadQuotesFromFirestore:async()=>[],
  getJobsRef:()=>({doc:id=>({kind:'job',id})}),StorageManager:{saveJob:j=>saved.push(j)},
  db:{collection:()=>({doc:id=>({kind:'counter',id})}),runTransaction:async callback=>{const pending=[];
   await callback({get:async ref=>ref.kind==='job'?{exists:true,data:()=>structuredClone(server)}:{exists:true,data:()=>({lastNumber:counter})},set:(ref,value)=>pending.push([ref,value])});
   for(const [ref,value]of pending){writes.push([ref,value]);if(ref.kind==='job')server=structuredClone(value);else counter=value.lastNumber;}
  }}
 };
 vm.createContext(context);vm.runInContext(source,context);
 return {api:context.window.KirkstoneInvoiceReissue,context,job,input,saved,writes,get server(){return server},set server(v){server=v},set counter(v){counter=v}};
}
test('replacement retains one job, complete original record, costs and quote linkage',async()=>{
 const f=fixture(), before=structuredClone(f.job);const next=await f.api.commit(f.job,f.input);
 assert.equal(f.context.currentJobs.length,1);assert.equal(next.id,before.id);assert.equal(next.quoteId,before.quoteId);assert.equal(next.quoteRef,'KCAPL100Q');
 assert.equal(next.invoiceNumber,'KCAPL101');assert.equal(next.poNumber,'PO-adjusted');assert.equal(next.invoiceDateIssued,'2026-11-17');assert.equal(next.invoiceSpreadsheetLocked,true);
 assert.equal(next.invoiceSpreadsheetSnapshot.excVat,1000);assert.equal(next.invoiceSpreadsheetSnapshot.cost,300);assert.equal(next.invoiceSpreadsheetSnapshot.shelleyCost,181.96);assert.equal(next.actualDays,1);
 assert.equal(next.invoiceHistory[0].status,'cancelled');assert.equal(next.invoiceHistory[0].invoiceNumber,'KCAPL100');assert.equal(next.invoiceHistory[0].jobSnapshot.poNumber,'PO-original');assert.equal(next.invoiceHistory[0].values.invoiceNumber,'KCAPL100');
 assert.equal(JSON.stringify(f.job),JSON.stringify(before));assert.equal(f.writes.length,2);assert.equal(f.saved.length,1);assert.equal(f.server.invoiceRevision,1);
});
test('paid and settled invoices cannot be cancelled',async()=>{
 for(const extra of [{invoiceDatePaid:'2026-11-16'},{invoiceSpreadsheetSettled:true}]) {
  const f=fixture(extra);await assert.rejects(f.api.commit(f.job,f.input),/marked paid/);assert.equal(f.writes.length,0);
 }
});
test('used, quoted, cancelled and reserved invoice numbers are rejected',async()=>{
 const f=fixture();
 for(const jobs of [[{invoiceNumber:'KCAPL101'}],[{invoiceHistory:[{invoiceNumber:'KCAPL101'}]}]])assert.throws(()=>f.api.validate(f.job,f.input,jobs,[]),/already used/);
 assert.throws(()=>f.api.validate(f.job,f.input,[],[{refPrefix:'APL',refNumber:101}]),/already used/);
 f.counter=101;await assert.rejects(f.api.commit(f.job,f.input),/already reserved/);assert.equal(f.writes.length,0);
});
test('invalid numbers, dates and missing reasons do not reach writes',()=>{
 const f=fixture();for(const change of [{invoiceNumber:'KCAPL100'},{invoiceNumber:'KCOTHER101'},{date:'2026-02-30'},{reason:' '}])assert.throws(()=>f.api.validate(f.job,{...f.input,...change},[],[]));
});
test('employee edits and concurrent reissue reject stale jobs without local mutation',async()=>{
 for(const change of [{employeeRevision:4},{invoiceNumber:'KCAPL102',invoiceRevision:1},{poNumber:'updated elsewhere'}]){
  const f=fixture();f.server={...f.server,...change};await assert.rejects(f.api.commit(f.job,f.input),/has changed/);assert.equal(f.saved.length,0);assert.equal(f.writes.length,0);assert.equal(f.context.currentJobs[0].invoiceNumber,'KCAPL100');
 }
});
test('Firestore field ordering does not create a false stale-job failure',async()=>{
 const f=fixture();f.server=Object.fromEntries(Object.entries(f.server).reverse());assert.equal((await f.api.commit(f.job,f.input)).invoiceNumber,'KCAPL101');
});
test('offline or failed cloud transaction cannot cancel an invoice locally',async()=>{
 for(const mode of ['offline','transaction','preview']){
  const f=fixture();if(mode==='offline')f.context.loadQuotesFromFirestore=async()=>{throw Error('offline')};
  if(mode==='transaction')f.context.db.runTransaction=async()=>{throw Error('network error')};
  if(mode==='preview')f.context.isLocalPreviewMode=true;
  await assert.rejects(f.api.commit(f.job,f.input));assert.equal(f.saved.length,0);assert.equal(f.context.currentJobs[0].invoiceNumber,'KCAPL100');
 }
});
test('repeat replacements preserve prior history without nesting snapshots',()=>{
 const f=fixture();const first=f.api.build(f.job,f.input,f.job.invoiceSpreadsheetSnapshot,'2026-11-17');
 const second=f.api.build(first,{...f.input,invoiceNumber:'KCAPL102'},first.invoiceSpreadsheetSnapshot,'2026-11-18');
 assert.equal(second.invoiceHistory.length,2);assert.equal(second.invoiceHistory[0].invoiceNumber,'KCAPL100');assert.equal(second.invoiceHistory[1].invoiceNumber,'KCAPL101');assert.equal(second.invoiceHistory[1].jobSnapshot.invoiceHistory,undefined);
});

test('ordinary owner saves cannot overwrite a replacement from a stale tab',async()=>{
 const firebase=fs.readFileSync(path.join(__dirname,'../js/firebase.js'),'utf8');
 const fn=firebase.slice(firebase.indexOf('async function saveJobToFirestore(job)'),firebase.indexOf('async function loadJobsFromFirestore()'));
 let writes=0;const context={isLocalPreviewMode:false,getJobsRef:()=>({doc:()=>({})}),db:{},requireFirebase:()=>({runTransaction:async callback=>callback({get:async()=>({exists:true,data:()=>({invoiceRevision:1})}),set:()=>writes++})})};
 vm.createContext(context);vm.runInContext(fn,context);
 await assert.rejects(context.saveJobToFirestore({id:'job'}),/has been reissued/);assert.equal(writes,0);
 await context.saveJobToFirestore({id:'job',invoiceRevision:1});assert.equal(writes,1);
});
