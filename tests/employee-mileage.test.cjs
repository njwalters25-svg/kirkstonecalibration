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
  const files = ['ui.js', ...(wrappers ? ['job-pricing-fix.js', 'part-price-compat.js', 'job-repair.js'] : [])];
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
