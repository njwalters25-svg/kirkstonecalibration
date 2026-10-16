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


test('named participants preserve one lead and support both owner/Shelley directions and Phil',()=>{
 assert.equal(P.teamName({assignedPerson:'owner',secondPerson:true,secondPersonKind:'shelley'}),'Owner + Shelley');
 assert.equal(P.teamName({assignedPerson:'shelley',secondPerson:true,secondPersonKind:'owner'}),'Shelley + Owner');
 assert.equal(P.teamName({assignedPerson:'shelley',quoteSnapshot:{secondPerson:true}}),'Shelley + Phil');
 assert.equal(P.teamName({secondPerson:false,quoteSnapshot:{secondPerson:true}}),'Owner');
 assert.equal(P.teamName({assignedPerson:'owner',secondPerson:true,secondPersonKind:'owner'}),'Owner + Phil');
});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/data.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/quote.js'),'utf8'),context);
const settings=vm.runInContext('({...DEFAULT_SETTINGS})',context);
test('Shelley work and daily travel hours use 15.87; expenses are added exactly once',()=>{
 const input={teamCostingVersion:1,assignedPerson:'owner',secondPerson:true,secondPersonKind:'shelley',calibrationTimeMinutes:600,travelTimeMinutes:60,
  shelleyHotelCost:80,shelleyFuelCost:25,shelleyFoodCost:15};
 const r=context.calculateQuote(input,settings);
 const hours=(r.timePlan.jobMins+120*r.commuteTrips)/60;
 assert.equal(r.shelleyPaidHours,hours);assert.equal(r.costShelleyPay,hours*15.87);assert.equal(r.costPhil,0);
 const noExpenses=context.calculateQuote({...input,shelleyHotelCost:0,shelleyFuelCost:0,shelleyFoodCost:0},settings);
 assert(Math.abs(r.totalInternalCost-noExpenses.totalInternalCost-120)<1e-8);
 assert.equal(r.totalQuotePrice,noExpenses.totalQuotePrice);
 const manual=context.calculateQuote({...input,shelleyPaidHours:12},settings);assert.equal(manual.costShelleyPay,12*15.87);
 const zero=context.calculateQuote({...input,shelleyPaidHours:0},settings);assert.equal(zero.costShelleyPay,0);
});
test('Phil day rate and old saved quotes retain their existing costing',()=>{
 const old={secondPerson:true,calibrationTimeMinutes:600,travelTimeMinutes:30};
 const a=context.calculateQuote(old,settings),b=context.calculateQuote({...old,teamCostingVersion:1,secondPersonKind:'phil'},settings);
 assert.equal(a.costSecondPerson,b.costPhil);assert.equal(a.totalInternalCost,b.totalInternalCost);
 const stored=context.calculateQuote({...old,secondPersonKind:'shelley',shelleyHourlyRate:999,shelleyHotelCost:10000},settings);
 assert.equal(stored.totalInternalCost,a.totalInternalCost);
});
test('Shelley lead is paid once; adding Owner does not charge a Phil day rate',()=>{
 const r=context.calculateQuote({teamCostingVersion:1,assignedPerson:'shelley',secondPerson:true,secondPersonKind:'owner',calibrationTimeMinutes:600,travelTimeMinutes:30},settings);
 assert.equal(r.costSecondPerson,r.costShelleyPay);assert.equal(r.costPhil,0);assert(r.costLabourTravel>0);
 const solo=context.calculateQuote({teamCostingVersion:1,assignedPerson:'shelley',secondPerson:false,calibrationTimeMinutes:600,travelTimeMinutes:30},settings);
 assert.equal(solo.costLabourCalibration,0);assert.equal(solo.costLabourTravel,0);assert(solo.costShelleyPay>0);
});

test('Shelley hours include overnight hotel commutes, travel day before, and return-home trips',()=>{
 const r=context.calculateQuote({teamCostingVersion:1,assignedPerson:'owner',secondPerson:true,secondPersonKind:'shelley',
  calibrationTimeMinutes:1800,travelTimeMinutes:120,overnightStay:true,travelDayBefore:true,hotelToWorkMinutes:20,
  returnHome:true,returnHomeTrips:1},settings);
 const expected=(r.timePlan.jobMins+240*r.commuteTrips+r.timePlan.totalHotelCommuteMins+r.returnHomeTimeMins)/60;
 assert.equal(r.shelleyPaidHours,expected);assert(r.timePlan.totalHotelCommuteMins>0);assert(r.returnHomeTimeMins>0);
 assert.equal(r.costShelleyPay,expected*15.87);
});

test('limited Shelley availability caps team time benefit and charges only her attendance',()=>{
 const input={teamCostingVersion:1,assignedPerson:'owner',secondPerson:true,secondPersonKind:'shelley',calibrationTimeMinutes:2880,travelTimeMinutes:60};
 const full=context.calculateQuote(input,settings),partial=context.calculateQuote({...input,shelleyAvailableDays:2},settings);
 assert(partial.timePlan.jobMins>full.timePlan.jobMins);assert(partial.timeReductionPercent<full.timeReductionPercent);
 const sixDays={...partial,timePlan:{...partial.timePlan,totalDays:6}};
 context.applyTeamCosting(sixDays,{...input,shelleyAvailableDays:2},settings);
 assert.equal(sixDays.shelleyAttendanceDays,2);assert.equal(sixDays.timePlan.totalDays,6);
 assert.equal(sixDays.shelleyPaidHours,2*(settings.workingHoursPerDay+2));assert.equal(sixDays.costShelleyPay,sixDays.shelleyPaidHours*15.87);
 const zero=context.calculateQuote({...input,shelleyAvailableDays:0},settings);
 assert.equal(zero.timePlan.jobMins,2880);assert.equal(zero.costShelleyPay,0);assert.equal(zero.timeReductionPercent,0);
 const blank=context.calculateQuote({...input,shelleyAvailableDays:null},settings);
 assert.equal(blank.totalInternalCost,full.totalInternalCost);assert.equal(blank.timePlan.jobMins,full.timePlan.jobMins);
 const override=context.calculateQuote({...input,shelleyAvailableDays:2,shelleyPaidHours:17.5},settings);
 assert.equal(override.shelleyPaidHours,17.5);
});
test('limited attendance uses her own overnight trip and caps days at job length',()=>{
 const input={teamCostingVersion:1,assignedPerson:'owner',secondPerson:true,secondPersonKind:'shelley',calibrationTimeMinutes:2880,travelTimeMinutes:120,
  hotelToWorkMinutes:30,overnightStay:true,shelleyAvailableDays:2,returnHome:true,returnHomeTrips:3};
 const r=context.calculateQuote(input,settings);
 assert.equal(r.shelleyPaidHours,2*settings.workingHoursPerDay+4+1);
 const capped=context.calculateQuote({...input,calibrationTimeMinutes:60,shelleyAvailableDays:10,travelTimeMinutes:0},settings);
 assert.equal(capped.shelleyAttendanceDays,capped.timePlan.totalDays);
 const phil=context.calculateQuote({...input,secondPersonKind:'phil'},settings);
 assert.equal(phil.costShelleyPay,0);assert.equal(phil.costPhil,phil.timePlan.totalDays*(settings.secondPersonDayCost||350));
 const legacy=context.calculateQuote({...input,teamCostingVersion:undefined},settings);
 const original=context.calculateQuote({...input,teamCostingVersion:undefined,shelleyAvailableDays:null},settings);
 assert.equal(legacy.totalInternalCost,original.totalInternalCost);
});
test('operational outputs include availability but no pay or invented attendance dates',()=>{
 const job={assignedPerson:'owner',secondPerson:true,secondPersonKind:'shelley',shelleyAvailableDays:2,scheduleStartDate:'2026-11-01',scheduleEndDate:'2026-11-06',shelleyHourlyRate:15.87};
 const safe=P.operational(job);assert.equal(safe.shelleyAvailableDays,2);assert(!JSON.stringify(safe).includes('15.87'));
 const event=P.outlookPayload(job);assert(event.body.content.includes('2 days (attendance dates not set)'));
 assert.equal(event.end.dateTime,'2026-11-07T00:00:00');
 assert(P.operationalCsv(safe).includes('Shelley available days'));
});

test('pipette quantities drive eight solo days down to six lead days with two Shelley days',()=>{
 const fixture={...settings,workingHoursPerDay:8,serviceLevels:[{...settings.serviceLevels[0],minutesPerSingleChannel:15}]};
 const input={teamCostingVersion:1,assignedPerson:'owner',pipetteLines:[{serviceLevelId:fixture.serviceLevels[0].id,singleChannelCount:256}],travelTimeMinutes:0};
 const solo=context.calculateQuote(input,fixture);
 const together=context.calculateQuote({...input,secondPerson:true,secondPersonKind:'shelley',shelleyAvailableDays:2},fixture);
 assert.equal(solo.timePlan.totalDays,8);assert.equal(together.timePlan.totalDays,6);
 assert.equal(together.shelleyAttendanceDays,2);assert.equal(together.shelleyPaidHours,16);
 assert.equal(together.timePlan.jobMins,6*8*60);
 const bigger=context.calculateQuote({...input,pipetteLines:[{...input.pipetteLines[0],singleChannelCount:512}],secondPerson:true,secondPersonKind:'shelley',shelleyAvailableDays:2},fixture);
 assert.equal(bigger.timePlan.totalDays,14);
 const all=context.calculateQuote({...input,secondPerson:true,secondPersonKind:'shelley',shelleyAvailableDays:8},fixture);
 assert.equal(all.timePlan.totalDays,4);assert.equal(all.shelleyAttendanceDays,4);
});
