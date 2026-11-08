const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');

function setup(wrappers = true) {
  const c = vm.createContext({ console, Intl,
    DEFAULT_SETTINGS: { mileageRatePence: 55, stickerCostPerPipette: 0 },
    normalizeMileageRatePence: value => Number(value),
    getServiceLevel: () => ({ chargeSingleChannel: 10 }),
    document: { getElementById: () => null, querySelectorAll: () => [],
      createElement: () => ({}), head: { appendChild() {} }, addEventListener() {} },
  });
  c.window = c;
  const files = ['planning-core.js', 'ui.js', ...(wrappers ? ['job-pricing-fix.js', 'part-price-compat.js', 'job-repair.js'] : [])];
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'), c);
  return c;
}

function job(miles = 150) {
  return { costs: { mileageMiles: 100, hotel: 20 }, employeeExpenses: { mileageMiles: miles, hotel: 99 },
    actualEntries: [{ date: '2026-11-09', serviceLevelId: 'standard', singleChannelCount: 30 }],
    parts: [{ quantity: 2, costPerUnit: 3, pricePerUnit: 5 }], repairItems: [{ price: 20, cost: 4 }] };
}

test('150 employee miles add £82.50 through the full parts and repair calculation', () => {
  const c = setup(), j = job(), before = JSON.stringify(j);
  const baseline = c.calculateJobSheet({ ...j, employeeExpenses: {} });
  const result = c.calculateJobSheet(j);
  assert.equal(result.employeeMileageCost, 82.5);
  assert.equal(result.employeeMileageMiles, 150);
  assert.equal(result.mileageCost, 55);
  assert.equal(result.totalCosts, baseline.totalCosts + 82.5);
  assert.equal(result.profit, baseline.profit - 82.5);
  assert.equal(result.totalCosts, 167.5);
  assert.equal(result.actualRevenue, 330);
  assert.equal(result.taxAt40, 65);
  assert.equal(result.profitAfterTax, 97.5);
  assert.equal(result.profitPerDay, 162.5);
  assert.equal(JSON.stringify(j), before);
  assert.equal(c.calculateJobSheet(j).totalCosts, result.totalCosts);
  assert.equal(c.calculateJobSheet(JSON.parse(JSON.stringify(j))).totalCosts, result.totalCosts);
});

test('mileage edits replace the previous calculated amount and retain the fixed 55p rate', () => {
  const c = setup(), j = job(); j.mileageRatePence = 35;
  assert.equal(c.calculateJobSheet(j).employeeMileageCost, 82.5);
  assert.equal(c.calculateJobSheet(j).mileageCost, 35);
  j.employeeExpenses.mileageMiles = 200;
  assert.equal(c.calculateJobSheet(j).employeeMileageCost, 110);
  j.employeeExpenses.mileageMiles = 0;
  assert.equal(c.calculateJobSheet(j).employeeMileageCost, 0);
});

test('base calculation includes mileage before optional pricing scripts load', () => {
  const c = setup(false), j = job();
  const baseline = c.calculateJobSheet({ ...j, employeeExpenses: {} });
  assert.equal(c.calculateJobSheet(j).totalCosts, baseline.totalCosts + 82.5);
});

test('missing and invalid legacy mileage adds zero; fractional miles round to pennies', () => {
  const c = setup();
  for (const miles of [undefined, '', -1, 'invalid', Infinity, NaN]) {
    const j = job(); j.employeeExpenses.mileageMiles = miles;
    assert.equal(c.calculateJobSheet(j).employeeMileageCost, 0);
  }
  assert.equal(c.calculateJobSheet(job(1.23)).employeeMileageCost, 0.68);
});

test('two Shelley joining days replace an old wage allowance with £253.92, alongside mileage', () => {
  const c=setup(), j=job();
  Object.assign(j,{assignedPerson:'owner',secondPerson:true,secondPersonKind:'shelley',
    shelleyJoiningDates:['2026-11-09','2026-11-10']});
  j.costs.secondPerson=500;
  const before=JSON.stringify(j), result=c.calculateJobSheet(j);
  assert.equal(result.employeePaidDays,2);
  assert.equal(result.employeeDayPayCost,253.92);
  assert.equal(result.otherWorkerCost,0);
  assert.equal(result.totalCosts,421.42);
  assert.equal(result.profit,-91.42);
  assert.equal(result.employeeMileageCost,82.5);
  assert.equal(c.calculateJobSheet(j).totalCosts,421.42);
  assert.equal(JSON.stringify(j),before);
});

test('paid days override attendance, including zero and half days', () => {
  const c=setup(),j={...job(),assignedPerson:'shelley',shelleyJoiningDates:['2026-11-09','2026-11-10']};
  for(const [days,cost] of [[0,0],[0.5,63.48],[3,380.88]]){
    j.shelleyPaidDays=days;
    assert.equal(c.calculateJobSheet(j).employeeDayPayCost,cost);
  }
  j.shelleyPaidDays=null;
  assert.equal(c.calculateJobSheet(j).employeeDayPayCost,253.92);
});

test('automatic pay uses valid unique joining weekdays, then availability, then distinct work dates', () => {
  const c=setup(),j={...job(),assignedPerson:'shelley',scheduleStartDate:'2026-11-09',scheduleEndDate:'2026-11-10',
    shelleyJoiningDates:['2026-11-09','2026-11-09','2026-11-08','2026-11-12','bad'],shelleyAvailableDays:8};
  assert.equal(c.calculateJobSheet(j).employeePaidDays,1);
  j.shelleyJoiningDates=[];j.shelleyAvailableDays=2;
  assert.equal(c.calculateJobSheet(j).employeeDayPayCost,253.92);
  j.shelleyAvailableDays=0;
  assert.equal(c.calculateJobSheet(j).employeeDayPayCost,0);
  j.shelleyAvailableDays=null;
  j.actualEntries=[{date:'2026-11-09'},{date:'2026-11-09'},{date:'2026-11-10'},{date:'bad'}];
  assert.equal(c.calculateJobSheet(j).employeePaidDays,2);
});

test('Phil-only jobs and completed records retain their costs; Shelley plus Phil retains his separate pay', () => {
  const c=setup(),j={...job(),secondPerson:true,secondPersonKind:'phil',shelleyPaidDays:2};j.costs.secondPerson=400;
  assert.equal(c.calculateJobSheet(j).employeeDayPayCost,0);
  assert.equal(c.calculateJobSheet(j).otherWorkerCost,400);
  j.assignedPerson='shelley';
  assert.equal(c.calculateJobSheet(j).employeeDayPayCost,253.92);
  assert.equal(c.calculateJobSheet(j).otherWorkerCost,400);
  for(const extra of [{status:'completed'},{historicalJob:true},{invoiceSpreadsheetLocked:true}]){
    const result=c.calculateJobSheet({...j,...extra});
    assert.equal(result.employeeDayPayCost,0);
    assert.equal(result.otherWorkerCost,400);
  }
});

test('archiving retains Shelley pay and restoring an unlocked job resumes day calculation',async()=>{
  const c=setup(),j={...job(),id:'archive-check',assignedPerson:'shelley',shelleyPaidDays:2};
  c.currentJobs=[j];c.renderJobSheets=()=>{};c.confirm=()=>true;c.isLocalPreviewMode=true;
  c.document.querySelector=()=>null;
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/job-close.js'),'utf8'),c);
  const before=c.calculateJobSheet(j).totalCosts;
  await c.completeAndArchiveJob(j.id);
  assert.equal(j.status,'completed');assert.equal(j.shelleyDayPaySnapshot.cost,253.92);
  assert.equal(c.calculateJobSheet(j).totalCosts,before);
  j.shelleyPaidDays=3;
  assert.equal(c.calculateJobSheet(j).employeeDayPayCost,253.92);
  await c.restoreArchivedJob(j.id);
  assert.equal(j.shelleyDayPaySnapshot,undefined);
  assert.equal(c.calculateJobSheet(j).employeeDayPayCost,380.88);
});
