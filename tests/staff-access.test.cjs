const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
function firebaseContext(config) {
  const writes = [];
  const db = {
    collection(name) { return { doc(id) {
      return { name, id, get: async () => ({ exists: !!config, data: () => config }) };
    } }; },
    batch() { return { set(ref, data, options) { writes.push({ ref, data, options }); }, commit: async () => {} }; },
  };
  const auth = Object.assign(() => ({ getRedirectResult: () => Promise.resolve() }), { GoogleAuthProvider: function() {} });
  const context = vm.createContext({
    window: { location: { hostname: 'production.test', search: '' }, firebase: { initializeApp() {}, auth, firestore: () => db } },
    URLSearchParams, console, setTimeout,
  });
  context.firebase = context.window.firebase;
  vm.runInContext(read('js/firebase.js'), context);
  return { context, writes };
}
const user = { uid: 'employee', email: 'EMPLOYEE@example.com', emailVerified: true };
test('roles fail closed, explicit staff overrides legacy owners, readiness required', async () => {
  let {context} = firebaseContext({ emails: ['employee@example.com'], roles: {'employee@example.com':'staff'} });
  await assert.rejects(context.resolveUserAccess(user), /security setup/);
  ({context} = firebaseContext({ emails: ['employee@example.com'], roles: {'employee@example.com':'staff'}, staffAccessReady:true }));
  assert.equal(await context.resolveUserAccess(user), 'staff');
  assert.equal(await context.resolveUserAccess({...user, emailVerified:false}), null);
  assert.equal(await context.resolveUserAccess({...user, isAnonymous:true}), null);
  assert.equal(await context.resolveUserAccess({...user, email:'unknown@example.com'}), null);
  ({context} = firebaseContext({ emails:['employee@example.com'], roles:{'employee@example.com':''} }));
  assert.equal(await context.resolveUserAccess(user), null);
  ({context} = firebaseContext({ emails:['employee@example.com'] }));
  assert.equal(await context.resolveUserAccess(user), 'owner');
});
test('all owner collection helpers reject staff', () => {
  const {context} = firebaseContext({});
  vm.runInContext("currentAccessRole = 'staff'", context);
  for (const name of ['getJobsRef','getQuotesRef','getCustomersRef']) assert.throws(() => context[name](), /Owner access/);
});
test('safe projection excludes nested pricing, expenses, notes and snapshots', () => {
  const {context} = firebaseContext({});
  const result = context.buildStaffJobSheet({
    customerName:'Test', quoteRef:'KC105Q', costs:{ hotel:123 }, notes:'financial private',
    plannedLines:[{singleChannelCount:10, chargeSingleChannel:900}],
    actualEntries:[{singleChannelCount:2}], staffReports:[{singleChannelCount:3, expense:11}],
    settingsSnapshot:{serviceLevels:[{id:'standard', name:'Standard', chargeSingleChannel:999}], wages:777},
    parts:[{pricePerUnit:999}], quoteSnapshot:{totalQuotePrice:999},
  });
  assert.deepEqual(Object.keys(result).sort(), ['customerName','quoteRef','proposedDate','status','expected','ownerActual','serviceLevelIds','serviceLevels'].sort());
  assert.equal(result.expected.singleChannelCount,10);
  assert.equal(result.ownerActual.singleChannelCount,2); // staff progress counted separately
  assert.deepEqual(Object.keys(result.serviceLevels[0]), ['id','name']);
  assert(!JSON.stringify(result).includes('999'));
  assert.equal(context.buildStaffJobSheet({status:'active'}).status,'open');
  assert.equal(context.buildStaffJobSheet({status:'completed'}).status,'closed');
  assert.equal(context.buildStaffJobSheet({status:'open',historicalJob:true}).status,'closed');
});
test('owner persistence strips attached reports and atomically replaces safe projection', async () => {
  const {context,writes} = firebaseContext({});
  vm.runInContext("currentAccessRole = 'owner'", context);
  await context.saveJobToFirestore({id:'job', staffReports:[{expense:12}], notes:'owner data'});
  assert.equal(writes.length,2);
  assert.equal(writes[0].ref.name,'jobs');
  assert(!('staffReports' in writes[0].data));
  assert.equal(writes[1].ref.name,'staffJobSheets');
  assert.equal(writes[1].options,undefined);
  assert(!('notes' in writes[1].data));
});
test('owner totals, price overrides, profit and repeat calculations include staff once', () => {
  const document = {addEventListener(){}, getElementById(){return null;}};
  const context = vm.createContext({console,document,localStorage:{getItem(){return null;}}});
  context.window = context;
  for (const name of ['js/data.js','js/quote.js','js/ui.js','js/job-pricing-fix.js']) vm.runInContext(read(name),context);
  const job = {
    plannedLines:[{singleChannelCount:20}],
    settingsSnapshot:{serviceLevels:[{id:'s',name:'Standard',chargeSingleChannel:10}], mileageRatePence:55},
    quoteSnapshot:{vatExempt:false}, unitPriceOverrides:{s:{single:15}},
    actualEntries:[{date:'2026-10-08',serviceLevelId:'s',singleChannelCount:2}],
    staffReports:[{date:'2026-10-09',serviceLevelId:'s',singleChannelCount:3,expense:12}],
    costs:{hotel:5}, stickerCostPerPipette:0.1, parts:[],
  };
  const calc = context.calculateJobSheet(job);
  assert.equal(calc.actualCount,5); assert.equal(calc.remainingTotals.single,15);
  assert.equal(calc.actualRevenue,75); assert.equal(calc.totalCosts,17.5);
  assert.equal(calc.profit,57.5); assert.equal(calc.actualDays,2);
  assert.equal(context.calculateJobSheet(job).actualCount,5);
  const ownerHtml=context.renderOwnerStaffReports(job);
  assert(ownerHtml.includes('£12.00'));
});
test('staff authorisation loads only the staff module and removes owner markup', async () => {
  let handler, authHandler;
  const loaded = [], removed = [];
  const elements = Object.fromEntries(['accessGate','accessMessage','accessSignIn','appHeader','appMain','staffHeader']
    .map(id => [id,{appendChild(){},remove(){removed.push(id);}}]));
  const document = {
    addEventListener(name, callback){handler=callback;},
    getElementById(id){return elements[id];},
    createElement(){return {};},
    body:{appendChild(script){loaded.push(script.src);script.onload();}},
  };
  const context=vm.createContext({
    document,localStorage:{},location:{reload(){throw Error('Unexpected reload');}},
    onAuthStateChanged(callback){authHandler=callback;},
    resolveUserAccess:async()=> 'staff', startStaffJobSheets:async()=>{},
    signOut:async()=>{},signInWithGoogle:async()=>{},
  });
  vm.runInContext(read('js/access.js'),context);
  await handler(); await authHandler(user);
  assert.deepEqual(loaded,['js/staff-job-sheets.js?v=20261008-1']);
  assert(removed.includes('appHeader') && removed.includes('appMain'));
});
test('staff module never reads financial collections or browser storage', () => {
  const staff=read('js/staff-job-sheets.js').replace(/^\/\/.*$/gm, '');
  assert(!/localStorage|StorageManager|collection\(['"](?:jobs|quotes|customers|config)['"]\)/.test(staff));
  assert(staff.includes("where('uid', '==', getCurrentUser().uid)"));
  assert(staff.includes('await batch.commit()'));
});

