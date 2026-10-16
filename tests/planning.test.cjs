const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context=vm.createContext({TextEncoder,console,URLSearchParams});context.window=context;
vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/planning-core.js'),'utf8'),context);
const P=context.KirkstonePlanning;
test('assignee-specific origins do not replace the customer destination',()=>{
 const settings={homePostcode:'DE75 7UJ',shelleyHomePostcode:'NE32 5QA'};
 assert.equal(P.defaultOrigin('shelley',settings),'NE32 5QA');assert.equal(P.defaultOrigin('owner',settings),'DE75 7UJ');
 const job={assignedPerson:'shelley',customerAddress:'Cambridge CB2 0AA',quoteSnapshot:{destinationPostcode:'CB2 0AA'}};
 const sheet=P.operational(job,{},settings);
 assert.equal(sheet.travelOriginPostcode,'NE32 5QA');assert.equal(sheet.customerAddress,'Cambridge CB2 0AA');
 assert.equal(sheet.destinationPostcode,'CB2 0AA');assert.equal(job.customerAddress,'Cambridge CB2 0AA');
});
test('operational projection excludes price snapshots, invoices, salaries, tax and profit',()=>{
 const secret=89765.43;
 const source={id:'job',quoteRef:'KC105Q',customerName:'Lab',assignedPerson:'shelley',invoiceNumber:'PRIVATE-INVOICE',
  costs:{hotel:90,food:12,wages:secret,pension:secret},quoteSnapshot:{profit:secret,notes:'PRIVATE-QUOTE'},
  settingsSnapshot:{serviceLevels:[{id:'s',name:'Standard',chargeSingleChannel:secret}]},
  plannedLines:[{singleChannelCount:10,chargeSingleChannel:secret}],actualEntries:[{id:'day',singleChannelCount:3,price:secret}],
  parts:[{id:'part',name:'Seal',quantity:2,costPerUnit:1.2,pricePerUnit:secret}],notes:'PRIVATE-NOTES'};
 const safe=P.operational(source,{totalCosts:104.4,actualRevenue:secret,profit:secret});
 assert.equal(safe.expected.singleChannelCount,10);assert.equal(safe.remaining.singleChannelCount,7);
 assert.equal(safe.costs.hotel,90);assert.equal(safe.parts[0].costPerUnit,1.2);
 const json=JSON.stringify(safe);assert(!json.includes(String(secret)));assert(!json.includes('PRIVATE'));
 assert(!('settingsSnapshot' in safe));assert(!('quoteSnapshot' in safe));assert(!('invoiceNumber' in safe));
});
test('calendar uses explicit dates and validates leap days and inclusive multi-day end dates',()=>{
 assert.equal(P.schedule({proposedDate:'2026-11'}),null);
 assert.equal(P.schedule({scheduleStartDate:'2026-02-30'}),null);
 assert.equal(P.schedule({scheduleStartDate:'2026-10-20',scheduleEndDate:'2026-10-19'}),null);
 assert.equal(P.addDays('2028-02-28',1),'2028-02-29');
 assert.equal(P.addDays('2026-10-25',1),'2026-10-26');
 const payload=P.outlookPayload({scheduleStartDate:'2026-10-24',scheduleEndDate:'2026-10-26'});
 assert.equal(payload.start.timeZone,'GMT Standard Time');assert.equal(payload.end.dateTime,'2026-10-27T00:00:00');
 assert.equal(payload.isAllDay,true);assert(!('attendees' in payload));
});
test('Outlook payload carries dates and operational identity only',()=>{
 const payload=P.outlookPayload({customerName:'Lab',customerAddress:'Cambridge',quoteRef:'KC105Q',assignedPerson:'shelley',
  scheduleStartDate:'2026-11-01',scheduleStatus:'provisional',costs:{hotel:12345},profit:12345,notes:'PRIVATE-NOTES',
  quoteSnapshot:{price:12345}},'transaction');
 assert.equal(payload.showAs,'tentative');assert(payload.body.content.includes('Shelley'));
 assert(!JSON.stringify(payload).includes('12345'));assert(!JSON.stringify(payload).includes('PRIVATE'));
 assert.equal(payload.transactionId,'transaction');
});
test('ICS is date-only, stable, injection-safe and folded to at most 75 UTF-8 octets',()=>{
 const job={id:'unique',customerName:'Calibration '.repeat(20)+'é'.repeat(20),quoteRef:'KC105Q',customerAddress:'A, B; C',
  assignedPerson:'shelley',scheduleStartDate:'2026-10-24',scheduleEndDate:'2026-10-26'};
 const output=P.calendarFile([job,{id:'undated',proposedDate:'2026-10'},{...job,id:'old',status:'completed'}],new Date('2026-10-16T00:00:00Z'));
 assert(output.includes('DTEND;VALUE=DATE:20261027'));assert(output.includes('UID:unique@kirkstonecalibration'));
 assert(!output.includes('UID:undated'));assert(!output.includes('UID:old'));assert(!output.includes('ATTENDEE'));
 for(const line of output.split('\r\n'))assert(Buffer.byteLength(line,'utf8')<=75);
 assert(output.includes('LOCATION:A\\, B\\; C'));
 assert(output.endsWith('END:VCALENDAR\r\n'));
  const injected=P.calendarFile([{...job,customerName:'Lab\nEND:VEVENT\nBEGIN:VEVENT\nSUMMARY:Injected'}]);
  assert.equal((injected.match(/(?:^|\r\n)BEGIN:VEVENT(?:\r\n|$)/g)||[]).length,1);
});
test('operational CSV cannot expose owner totals or execute formula-like text',()=>{
 const sheet=P.operational({customerName:'=HYPERLINK("bad")',quoteRef:'KC105Q',profit:999999,
  costs:{hotel:12},actualEntries:[{date:'2026-10-16',singleChannelCount:2}],workCarriedOut:'Calibrated'}, {totalCosts:12,actualRevenue:999999});
 const csv=P.operationalCsv(sheet);assert(!csv.includes('999999'));assert(!csv.includes('profit'));
 assert(csv.includes("'=HYPERLINK"));assert(csv.includes('Work carried out'));
});
test('Outlook all-day end dates are interpreted as exclusive',()=>{
 const result=P.outlookDates({isAllDay:true,start:{dateTime:'2026-10-24T00:00:00.0000000'},end:{dateTime:'2026-10-27T00:00:00.0000000'}});
 assert.equal(result.start,'2026-10-24');assert.equal(result.end,'2026-10-26');
});

