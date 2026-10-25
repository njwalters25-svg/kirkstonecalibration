const test=require('node:test');
const assert=require('node:assert/strict');
const accounting=require('../js/expense-accounting.js');
test('joint job tracks two drivers separately and excludes unrelated jobs',()=>{
 const claims=[{id:'a',jobId:'job1',employee:'owner',miles:100,status:'approved'},
 {id:'b',jobId:'job1',employee:'shelley',miles:180,status:'approved'},
 {id:'c',jobId:'job2',employee:'shelley',miles:30,status:'approved'}];
 assert.equal(accounting.approvedJobExpenses(claims,'job1').total,154);
});
test('same claim ID is counted only once',()=>{
 const c={id:'a',jobId:'j',employee:'shelley',miles:20,status:'approved'};
 assert.equal(accounting.approvedJobExpenses([c,c],'j').total,11);
});
test('pending and rejected claims are excluded',()=>{
 assert.equal(accounting.approvedJobExpenses([{id:'a',jobId:'j',employee:'shelley',miles:20,status:'submitted'}],'j').total,0);
});
test('estimated mileage is replaced not added twice',()=>{
 const r=accounting.reconcileActualCosts({baseCosts:500,estimatedEmployeeMileage:55,jobId:'j',claims:[{id:'a',jobId:'j',employee:'shelley',miles:120,status:'approved'}]});
 assert.equal(r.actualCosts,511);
});
test('paid reimbursements no longer appear outstanding',()=>{
 const claims=[{id:'a',employee:'shelley',miles:100,status:'approved'},{id:'b',employee:'shelley',miles:50,status:'paid'}];
 assert.equal(accounting.reimbursementOutstanding(claims,'shelley'),55);
});
test('only owner can approve and record payment',()=>{
 assert.equal(accounting.canTransition('submitted','approved','shelley'),false);
 assert.equal(accounting.canTransition('submitted','approved','owner'),true);
 assert.equal(accounting.canTransition('approved','paid','owner'),true);
 assert.equal(accounting.canTransition('submitted','paid','owner'),false);
});
test('rejects negative mileage',()=>assert.throws(()=>accounting.normalizeClaim({id:'a',employee:'shelley',miles:-1}),/Invalid/));
