const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function setup(job={}) {
 let html='',renders=0;
 const base={actualRevenue:100,totalCosts:30,actualDays:2,partsCost:7,partsRevenue:10,profit:70};
 const c=vm.createContext({console,crypto:require('node:crypto'),currentJobs:[job],DEFAULT_SETTINGS:{},
  calculateJobSheet:()=>({...base}),getJobById:id=>id===job.id?job:null,renderJobSheets:()=>renders++,
  escapeHtml:v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
  escapeJsString:String,formatCurrency:v=>'£'+v.toFixed(2),formatMultilineText:String,buildRefCode:()=>'',
  document:{getElementById:()=>null,querySelectorAll:()=>[],createElement:()=>({}),head:{appendChild(){}},addEventListener(){}},
 });
 c.window=c;c.open=()=>({document:{open(){},write(s){html=s;},close(){}},focus(){}});
 for(const file of ['job-repair.js','customer-completed-quote.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',file),'utf8'),c);
 return {c,base,html:()=>html,renders:()=>renders};
}
test('repair prices and internal costs update all financial totals without changing parts',()=>{
 const job={repairItems:[{price:'50',cost:'12.50'},{price:20,cost:7.5}],quoteSnapshot:{}};
 const {c}=setup(job),r=c.calculateJobSheet(job);
 assert.equal(r.actualRevenue,170);assert.equal(r.totalCosts,50);assert.equal(r.profit,120);
 assert.equal(r.repairCost,20);assert.equal(r.repairRevenue,70);assert.equal(r.vatAmount,34);
 assert.equal(r.revenueIncVat,204);assert.equal(r.taxAt40,48);assert.equal(r.profitAfterTax,72);
 assert.equal(r.profitPerDay,60);assert.equal(r.profitMarginPercent,70.59);assert.equal(r.partsCost,7);
 assert.equal(c.calculateJobSheet(job).totalCosts,50);
});
test('cost-only repairs reduce profit and respect VAT exemption',()=>{
 const job={repairItems:[{price:0,cost:90}],quoteSnapshot:{vatExempt:true}};
 const r=setup(job).c.calculateJobSheet(job);
 assert.equal(r.actualRevenue,100);assert.equal(r.totalCosts,120);assert.equal(r.profit,-20);
 assert.equal(r.taxAt40,0);assert.equal(r.profitAfterTax,-20);assert.equal(r.vatAmount,0);
});
test('legacy missing and blank costs default to zero',()=>{
 for(const repairItems of [undefined,[],[{price:25}],[{price:25,cost:''}],[{price:25,cost:'invalid'}]]){
  const job={repairItems},r=setup(job).c.calculateJobSheet(job);
  assert.equal(r.totalCosts,30);assert.equal(r.repairCost,0);
 }
});
test('row editing keeps price and cost distinct and survives JSON persistence',()=>{
 const job={id:'job'},s=setup(job);s.c.addJobRepairItem('job');const row=job.repairItems[0];
 assert.equal(row.cost,0);s.c.updateJobRepairItem('job',row.id,'price','75');
 s.c.updateJobRepairItem('job',row.id,'cost','18.25');s.c.updateJobRepairItem('job',row.id,'description','Seal');
 assert.equal(row.price,75);assert.equal(row.cost,18.25);assert.equal(s.renders(),3);
 assert.equal(JSON.parse(JSON.stringify(job)).repairItems[0].cost,18.25);
 s.c.deleteJobRepairItem('job',row.id);assert.equal(job.repairItems.length,0);
});
test('customer document includes escaped repair descriptions and prices, VAT and no internal cost',()=>{
 const job={id:'job',repairItems:[{description:'Seal <script>',price:50,cost:9876.54},{description:'Free check',price:0}],quoteSnapshot:{}};
 const s=setup(job);s.c.getCompletedQuotePipetteRows=()=>[{typeLabel:'Single',serviceName:'Standard',quantity:2,unitPrice:10,total:20}];
 s.c.getCompletedQuotePartRows=()=>[{name:'Part',quantity:1,unitPrice:5,total:5}];
 s.c.openCustomerCompletedQuote('job');const html=s.html();
 assert(html.includes('Seal &lt;script>'));assert(html.includes('Free check'));assert(html.includes('£50.00'));
 assert(html.includes('£75.00'));assert(html.includes('£15.00'));assert(html.includes('£90.00'));
 assert(!html.includes('9876'));assert(!html.includes('Internal cost'));assert(!html.includes('<script>'));
 job.quoteSnapshot.vatExempt=true;s.c.openCustomerCompletedQuote('job');assert(s.html().includes('(exempt)'));
 assert(!s.html().includes('£90.00'));
});
test('legacy customer documents omit empty repair section',()=>{
 const job={id:'job'},s=setup(job);s.c.getCompletedQuotePipetteRows=()=>[];s.c.getCompletedQuotePartRows=()=>[];
 s.c.openCustomerCompletedQuote('job');assert(!s.html().includes('Repairs / additional work'));
});
