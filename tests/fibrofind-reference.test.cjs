const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/renumber-fibrofind-nov2026.js'), 'utf8');
function fixtures() {
  const quote = { id: 'nov', customerName: 'Greiner Bio-One Ltd - Fibrofind', proposedDate: '2026-11',
    refPrefix: 'GBOF', refNumber: 100, quoteRef: 'KCGBOF100Q', reference: 'KCGBOF100Q',
    totalPipettes: 54, totalQuotePrice: 1047, totalInternalCost: 333, settingsSnapshot: { rate: 17 } };
  const may = { ...quote, id: 'may', proposedDate: '2027-05', totalPipettes: 46, totalQuotePrice: 867 };
  const job = { id: 'job', quoteId: 'nov', quoteRef: 'KCGBOF100Q', invoiceNumber: 'KCGBOF100',
    quoteSnapshot: { ...quote }, invoiceSpreadsheetSnapshot: { invoiceNumber: 'KCGBOF100',
      quoteRef: 'KCGBOF100Q', revenue: 1047, profit: 714 }, actualEntries: [{ cost: 22 }] };
  return { quotes: [quote, may], jobs: [job, { ...structuredClone(job), id: 'may-job', quoteId: 'may', quoteSnapshot: structuredClone(may) }] };
}
function planner() {
  const context = { window: { addEventListener() {} }, document: { getElementById() {}, readyState: 'loading' } };
  vm.runInNewContext(source, context);
  return context.window.planFibrofindNov2026Repair;
}
const plan = planner();
function apply(data, changes) {
  for (const { collection, id, patch } of changes) {
    const record = data[collection].find(item => item.id === id);
    for (const [key, value] of Object.entries(patch)) {
      const parts = key.split('.');
      const last = parts.pop();
      parts.reduce((obj, part) => obj[part], record)[last] = value;
    }
  }
}
test('repairs every linked reference, preserves finances and May, and is idempotent', () => {
  const data = fixtures(), before = structuredClone(data);
  const changes = plan(data.quotes, data.jobs);
  assert.equal(changes.length, 2);
  assert.deepEqual(data, before, 'planning cannot mutate input');
  apply(data, changes);
  assert.equal(data.quotes[0].reference, 'KCGBOF101Q');
  assert.equal(data.jobs[0].quoteSnapshot.refNumber, 101);
  assert.equal(data.jobs[0].quoteSnapshot.reference, 'KCGBOF101Q');
  assert.equal(data.jobs[0].invoiceSpreadsheetSnapshot.invoiceNumber, 'KCGBOF101');
  assert.equal(data.jobs[0].invoiceSpreadsheetSnapshot.quoteRef, 'KCGBOF101Q');
  assert.equal(data.jobs[0].invoiceNumber, 'KCGBOF101');
  assert.deepEqual(data.quotes[1], before.quotes[1]);
  assert.deepEqual(data.jobs[1], before.jobs[1]);
  assert.equal(data.quotes[0].totalInternalCost, 333);
  assert.equal(data.jobs[0].invoiceSpreadsheetSnapshot.profit, 714);
  assert.deepEqual(data.jobs[0].actualEntries, before.jobs[0].actualEntries);
  assert.equal(plan(data.quotes, data.jobs).length, 0);
});
for (const location of ['quoteRef', 'reference', 'refNumber', 'invoiceNumber', 'snapshot', 'spreadsheet']) {
  test(`aborts without mutation for 101 conflict in ${location}`, () => {
    const data = fixtures();
    if (location === 'refNumber') data.quotes.push({ id: 'other', refPrefix: 'gbof', refNumber: '101' });
    else if (location === 'snapshot') data.jobs.push({ id: 'other', quoteSnapshot: { reference: 'KCGBOF101Q' } });
    else if (location === 'spreadsheet') data.jobs.push({ id: 'other', invoiceSpreadsheetSnapshot: { invoiceNumber: 'KCGBOF101' } });
    else data.jobs.push({ id: 'other', [location]: ' kcgbof101q ' });
    const before = structuredClone(data);
    assert.throws(() => plan(data.quotes, data.jobs), /already used/);
    assert.deepEqual(data, before);
  });
}
test('ambiguous identity, missing linked job and contradictory dates abort', () => {
  let data = fixtures();
  data.quotes.push({ ...data.quotes[0], id: 'duplicate' });
  assert.throws(() => plan(data.quotes, data.jobs), /Ambiguous/);
  data = fixtures();
  assert.throws(() => plan(data.quotes, []), /No unambiguous/);
  data.jobs[0].quoteSnapshot.proposedDate = '2027-05';
  assert.throws(() => plan(data.quotes, data.jobs), /Conflicting/);
});
test('legacy missing optional snapshots and partial prior repair remain safe', () => {
  const data = fixtures();
  delete data.jobs[0].invoiceSpreadsheetSnapshot;
  delete data.jobs[0].quoteSnapshot;
  data.quotes[0].refNumber = 101;
  data.quotes[0].quoteRef = 'KCGBOF101Q';
  apply(data, plan(data.quotes, data.jobs));
  assert.equal(data.jobs[0].invoiceNumber, 'KCGBOF101');
  assert.equal(plan(data.quotes, data.jobs).length, 0);
});
for (const fail of [false, true]) {
  test(`server transaction ${fail ? 'failure leaves all records untouched' : 'commits only reference patches'}`, async () => {
    const data = fixtures(), before = structuredClone(data);
    let pending, refreshes = 0;
    const docs = collection => data[collection].map(record => ({ id: record.id,
      ref: { collection, id: record.id }, data: () => structuredClone(record), exists: true }));
    const context = {
      window: { addEventListener() {} }, isLocalPreviewMode: false,
      document: { readyState: 'complete', getElementById: () => ({ classList: { contains: () => true } }) },
      MutationObserver: class { observe() {} }, console: { error() {} },
      refreshQuoteHistory: async () => { refreshes++; }, refreshJobSheets: async () => { refreshes++; },
      db: { collection: collection => ({
        get: async options => { assert.equal(options.source, 'server'); return { docs: docs(collection) }; },
        doc: id => ({ collection, id })
      }), runTransaction: callback => {
        pending = (async () => {
          const writes = [];
          await callback({ get: async ref => docs(ref.collection).find(doc => doc.id === ref.id),
            update: (ref, patch) => writes.push({ ...ref, patch }) });
          if (fail) throw new Error('write rejected');
          apply(data, writes);
        })();
        return pending;
      } }
    };
    vm.runInNewContext(source, context);
    await new Promise(resolve => setImmediate(resolve));
    if (fail) { assert.deepEqual(data, before); assert.equal(refreshes, 0); }
    else {
      assert.equal(data.jobs[0].invoiceNumber, 'KCGBOF101');
      assert.deepEqual(data.jobs[1], before.jobs[1]);
      assert.equal(refreshes, 2);
    }
  });
}
