// Shared date-only planning and operational export helpers. No authentication changes.
window.KirkstonePlanning = (() => {
  const fields = ['singleChannelCount','multiChannel6Count','multiChannel8Count','multiChannel12Count','multiChannel16Count'];
  const labels = ['Single','6-channel','8-channel','12-channel','16-channel'];
  const person = job => job?.assignedPerson === 'shelley' ? 'shelley' : 'owner';
  const personName = value => value === 'shelley' ? 'Shelley' : value === 'phil' ? 'Phil' : 'Dan';
  const hasSecondPerson = job => Boolean(job?.secondPerson ?? job?.quoteSnapshot?.secondPerson);
  // Old second-person quotes used the day-rate worker (Phil).
  const secondWorker = job => {
    const value = job?.secondPersonKind ?? job?.quoteSnapshot?.secondPersonKind ?? 'phil';
    return ['owner','shelley','phil'].includes(value) && value !== person(job) ? value : 'phil';
  };
  const participants = job => hasSecondPerson(job) ? [person(job),secondWorker(job)] : [person(job)];
  const teamName = job => participants(job).map(personName).join(' + ');
  const availability = job => {
    const value=job?.shelleyAvailableDays ?? job?.quoteSnapshot?.shelleyAvailableDays;
    return value == null || value === '' ? null : Math.max(0,Math.floor(Number(value)||0));
  };
  const defaultOrigin = (who, settings = {}) => who === 'shelley'
    ? (settings.shelleyHomePostcode || 'NE32 5QA') : (settings.homePostcode || 'DE75 7UJ');
  const origin = (job, settings) => job?.travelOriginPostcode?.trim() || defaultOrigin(person(job), settings);
  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
    const date = new Date(value + 'T12:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value;
  }
  function addDays(value, days) {
    if (!validDate(value)) throw new Error('Choose a valid calendar date.');
    const date = new Date(value + 'T12:00:00Z'); date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0,10);
  }
  function schedule(job) {
    const start = job.scheduleStartDate || '', end = job.scheduleEndDate || start;
    return validDate(start) && validDate(end) && end >= start ? { start, end } : null;
  }
  function joiningDates(job) {
    const dates=job?.shelleyJoiningDates ?? job?.quoteSnapshot?.shelleyJoiningDates;
    return Array.isArray(dates) ? [...new Set(dates.filter(validDate))].sort() : [];
  }
  function onDate(job,date,who='all') {
    const range=schedule(job),within=!!range&&date>=range.start&&date<=range.end,joining=joiningDates(job);
    return participants(job).some(person=>(who==='all'||who===person)
      &&(person==='shelley'&&joining.length ? joining.includes(date) : within));
  }
  const dayTeamName=(job,date)=>participants(job).filter(who=>onDate(job,date,who)).map(personName).join(' + ');
  function calendarBounds(job) {
    const range=schedule(job),dates=joiningDates(job);
    return range || (dates.length ? {start:dates[0],end:dates[dates.length-1]} : null);
  }
  const active = job => !job.historicalJob && !job.deletedAt && !job.isDeleted
    && !['completed','closed','deleted','cancelled'].includes(String(job.status || '').toLowerCase());
  const totals = rows => Object.fromEntries(fields.map(field => [field,
    (rows || []).reduce((sum,row) => sum + (Number(row[field]) || 0), 0)]));
  function operational(job, calculated = {}, settings = {}) {
    const expected = totals(job.plannedLines), actual = totals(job.actualEntries);
    const countRows = (job.actualEntries || []).map(row => ({
      id:row.id, date:row.date || '', serviceLevelId:row.serviceLevelId || '',
      ...Object.fromEntries(fields.map(field => [field,Number(row[field]) || 0])),
    }));
    const allowedCosts = ['hotel','food','fuel','shipping','secondPerson','other','mileageMiles'];
    return {
      id:job.id, customerName:job.customerName || '', customerAddress:job.customerAddress || '',
      quoteRef:job.quoteRef || '', assignedPerson:person(job), secondPerson:hasSecondPerson(job), secondPersonKind:secondWorker(job), travelOriginPostcode:origin(job,settings),
      destinationPostcode:job.destinationPostcode || job.quoteSnapshot?.destinationPostcode || '',
      expected, actual, remaining:Object.fromEntries(fields.map(field=>[field,expected[field]-actual[field]])),
      actualEntries:countRows, schedule:schedule(job), shelleyAvailableDays:availability(job),shelleyJoiningDates:joiningDates(job),
      serviceLevels:(job.settingsSnapshot?.serviceLevels || settings.serviceLevels || []).map(level=>({id:level.id,name:level.name})),
      costs:Object.fromEntries(allowedCosts.map(field=>[field,Number(job.costs?.[field]) || 0])),
      parts:(job.parts || []).map(part=>({id:part.id,catalogPartId:part.catalogPartId || '',
        name:part.name || part.description || '',quantity:Number(part.quantity) || 0,costPerUnit:Number(part.costPerUnit) || 0})),
      calculatedCosts:{ parts:Number(calculated.partsCost) || 0, mileage:Number(calculated.mileageCost) || 0,
        stickers:Number(calculated.stickerCost) || 0, total:Number(calculated.totalCosts) || 0 },
      workCarriedOut:job.workCarriedOut || '', operationalNotes:job.operationalNotes || '',
    };
  }
  function outlookPayload(job, transactionId) {
    const dates=schedule(job); if(!dates)throw new Error('Set valid start and end dates first.');
    return {
      subject:'Kirkstone · ' + (job.customerName || 'Calibration job') + (job.quoteRef ? ' · ' + job.quoteRef : ''),
      body:{contentType:'text',content:'Job reference: ' + (job.quoteRef || '') + '\nAssigned to: ' + personName(person(job)) + '\nWorking on job: ' + teamName(job)
        + (participants(job).includes('shelley') && joiningDates(job).length ? '\nShelley joining: '+joiningDates(job).join(', ')
          : participants(job).includes('shelley') && availability(job) !== null ? '\nShelley available: '+availability(job)+' days (attendance dates not set)' : '')},
      location:{displayName:job.customerAddress || ''},isAllDay:true,isReminderOn:false,
      showAs:job.scheduleStatus === 'provisional' ? 'tentative' : 'busy',
      start:{dateTime:dates.start+'T00:00:00',timeZone:'GMT Standard Time'},
      end:{dateTime:addDays(dates.end,1)+'T00:00:00',timeZone:'GMT Standard Time'},
      ...(transactionId ? {transactionId} : {}),
    };
  }
  function outlookDates(event) {
    const start=event.start?.dateTime?.slice(0,10), rawEnd=event.end?.dateTime?.slice(0,10);
    if(!validDate(start)||!validDate(rawEnd))return null;
    const midnight=/T00:00:00(?:\.0+)?$/.test(event.end.dateTime);
    const end=(event.isAllDay || midnight) && rawEnd>start ? addDays(rawEnd,-1) : rawEnd;
    return {start,end:end<start?start:end};
  }
  const icsEscape=value=>String(value??'').replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
  function foldLine(line) {
    let lines=[],current='',bytes=0;
    for(const char of line){const length=new TextEncoder().encode(char).length;
      if(bytes+length>75){lines.push(current);current=' ';bytes=1;}
      current+=char;bytes+=length;
    }
    lines.push(current);return lines.join('\r\n');
  }
  function calendarFile(jobs, now = new Date(), personFilter = 'all') {
    const stamp=now.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
    const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Kirkstone Calibration//Job Calendar//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH'];
    for(const source of jobs.filter(active)){
      const joining=joiningDates(source);
      const ownDates=joining.length && (personFilter==='shelley'||(!schedule(source)&&personFilter==='all'));
      const entries=ownDates?joining.map(date=>({...source,id:source.id+'-shelley-'+date,scheduleStartDate:date,scheduleEndDate:date})): [source];
      for(const job of entries){
      const dates=schedule(job);if(!dates)continue;
      const event=outlookPayload(job);if(ownDates)event.subject+=' · Shelley joining';
      lines.push('BEGIN:VEVENT','UID:'+encodeURIComponent(job.id)+'@kirkstonecalibration','DTSTAMP:'+stamp,
        'DTSTART;VALUE=DATE:'+dates.start.replace(/-/g,''),'DTEND;VALUE=DATE:'+addDays(dates.end,1).replace(/-/g,''),
        'SUMMARY:'+icsEscape(event.subject),'DESCRIPTION:'+icsEscape(event.body.content),
        'LOCATION:'+icsEscape(event.location.displayName),'STATUS:'+(job.scheduleStatus==='provisional'?'TENTATIVE':'CONFIRMED'),'END:VEVENT');
    }
    }
    lines.push('END:VCALENDAR');return lines.map(foldLine).join('\r\n')+'\r\n';
  }
  function csvCell(value) {
    let str=String(value ?? '');
    if(typeof value==='string' && /^[=+@-]/.test(str))str="'"+str;
    return '"'+str.replace(/"/g,'""')+'"';
  }
  function operationalCsv(sheet) {
    const rows=[['Job sheet',sheet.customerName],['Quote reference',sheet.quoteRef],['Assigned to',personName(sheet.assignedPerson)],
      ['Working on job',teamName(sheet)],['Customer address',sheet.customerAddress],['Travel start',sheet.travelOriginPostcode],
      ['Start date',sheet.schedule?.start || ''],['End date',sheet.schedule?.end || ''],
      ['Pipettes',...labels],['Expected',...fields.map(f=>sheet.expected[f])],['Actual',...fields.map(f=>sheet.actual[f])],
      ['Remaining',...fields.map(f=>sheet.remaining[f])],[],['Date','Service level',...labels]];
    for(const row of sheet.actualEntries)rows.push([row.date,sheet.serviceLevels.find(l=>l.id===row.serviceLevelId)?.name || row.serviceLevelId,...fields.map(f=>row[f])]);
    if(participants(sheet).includes('shelley') && availability(sheet) !== null)rows.push(['Shelley available days',availability(sheet)]);
    if(joiningDates(sheet).length)rows.push(['Shelley joining dates',joiningDates(sheet).join(', ')]);
    rows.push([],['Job expenses']);for(const [key,value] of Object.entries(sheet.costs))rows.push([key,value]);
    rows.push([],['Parts','Quantity','Unit cost']);for(const part of sheet.parts)rows.push([part.name,part.quantity,part.costPerUnit]);
    rows.push(['Total job costs',sheet.calculatedCosts.total],['Work carried out',sheet.workCarriedOut],['Work notes',sheet.operationalNotes]);
    return '\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
  }
  return {fields,labels,person,personName,hasSecondPerson,secondWorker,participants,teamName,availability,joiningDates,onDate,dayTeamName,calendarBounds,defaultOrigin,origin,validDate,addDays,schedule,active,totals,operational,outlookPayload,outlookDates,calendarFile,operationalCsv};
})();

