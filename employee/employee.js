// Deliberately independent of owner bootstrap, financial calculators and storage.
(() => {
  'use strict';
  const fields=['singleChannelCount','multiChannel6Count','multiChannel8Count','multiChannel12Count','multiChannel16Count'];
  const expenseLabels={mileageMiles:'Mileage (miles)',hotel:'Hotel (£)',food:'Meals (£)',travel:'Other travel / parking (£)',other:'Other expenses (£)'};
  const labels=['Single','6-channel','8-channel','12-channel','16-channel'];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const people={owner:'Dan',shelley:'Shelley',phil:'Phil'};
  let jobs=[],calendar=[],csrf='',dirty=new Set(),opened=new Set(),month=new Date().toISOString().slice(0,7),saving=false;
  const status=(message)=>{document.getElementById('status').textContent=message;};
  const date=d=>/^\d{4}-\d{2}-\d{2}$/.test(d??'');
  const addDays=(d,n)=>{const v=new Date(d+'T12:00:00Z');v.setUTCDate(v.getUTCDate()+n);return v.toISOString().slice(0,10);};
  const weekday=d=>![0,6].includes(new Date(d+'T12:00:00Z').getUTCDay());
  const team=j=>j.participants.map(w=>people[w]||'').join(' + ');
  const onDay=(j,d)=>weekday(d)&&j.participants.some(w=>w==='shelley'&&j.shelleyJoiningDates.length?j.shelleyJoiningDates.includes(d):date(j.scheduleStartDate)&&d>=j.scheduleStartDate&&d<=j.scheduleEndDate);
  async function request(method='GET',body){
    const response=await fetch('api.php',{method,credentials:'same-origin',cache:'no-store',headers:method==='POST'?{'Content-Type':'application/json','X-CSRF-Token':csrf}:{},...(body?{body:JSON.stringify(body)}:{})});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'Connection failed');return result;
  }
  function clear(){jobs=[];calendar=[];csrf='';dirty.clear();document.getElementById('jobSheets').replaceChildren();document.getElementById('calendar').replaceChildren();document.getElementById('agenda').replaceChildren();}
  async function load(){
    if(saving)return;
    if(dirty.size&&!confirm('Discard unsaved changes and refresh?'))return;
    clear();status('Connecting…');
    try{const data=await request();jobs=data.jobs;calendar=data.calendar;csrf=data.csrf;render();status(`${jobs.length} assigned job sheet${jobs.length===1?'':'s'} loaded.`);}
    catch(error){clear();status(error.message);}
  }
  function showJobs(id){document.getElementById('jobsPanel').hidden=false;document.getElementById('calendarPanel').hidden=true;if(id){opened.add(id);renderJobs();document.getElementById('job-'+id)?.scrollIntoView({block:'start'});}}
  function summary(title,counts){return `<section><strong>${title}</strong>${fields.map((f,i)=>`<p>${labels[i]}: ${Number(counts[f])||0}</p>`).join('')}</section>`;}
  function row(job,entry){return `<div class="employee-entry" data-row="${esc(entry.id)}"><input aria-label="Work date" type="date" data-entry="date" value="${esc(entry.date)}"><select aria-label="Service level" data-entry="serviceLevelId">${job.serviceLevels.map(l=>`<option value="${esc(l.id)}" ${l.id===entry.serviceLevelId?'selected':''}>${esc(l.name)}</option>`).join('')}</select>${fields.map((f,i)=>`<input aria-label="${labels[i]}" data-entry="${f}" type="number" min="0" max="100000" step="1" value="${entry[f]}">`).join('')}<button type="button" data-action="remove-day">Remove</button></div>`;}
  function renderJobs(){
    document.getElementById('jobSheets').innerHTML=jobs.length?jobs.map(j=>`<article class="work-sheet-card" id="job-${esc(j.id)}" data-job="${esc(j.id)}"><div class="history-header"><strong>${esc(j.customerName)}</strong><span class="ref-badge">${esc(j.quoteRef)}</span><span class="work-assignee">${esc(team(j))}</span></div><div class="employee-summary">${summary('Expected',j.expected)}${summary('Actual',j.actual)}${summary('Remaining',j.remaining)}</div><button type="button" data-action="expand">${opened.has(j.id)?'Close work sheet':'Open work sheet'}</button><div ${opened.has(j.id)?'':'hidden'}><p><strong>Customer address</strong><br>${esc(j.customerAddress).replace(/\n/g,'<br>')}</p><p>Work dates: ${esc(j.scheduleStartDate||'Not set')} to ${esc(j.scheduleEndDate||'Not set')}</p>${j.shelleyJoiningDates.length?`<p>Shelley joining: ${j.shelleyJoiningDates.map(esc).join(', ')}</p>`:''}${j.employeeInstructions?`<p class="employee-alert">${esc(j.employeeInstructions)}</p>`:''}<h3>Actual pipettes by day</h3><div class="employee-scroll"><div class="employee-entry"><span>Date</span><span>Service level</span>${labels.map(l=>`<span>${l}</span>`).join('')}<span></span></div>${j.actualEntries.map(r=>row(j,r)).join('')}</div><button type="button" data-action="add-day">Add day / service row</button><h3>Parts used</h3>${j.parts.map(p=>`<label class="employee-part">${esc(p.name)}<input aria-label="${esc(p.name)} quantity" data-part="${esc(p.id)}" type="number" min="0" max="100000" step="1" value="${p.quantity}"></label>`).join('')||'<p>No parts listed. Record additional parts in the work notes for Dan to add.</p>'}<h3>Your job expenses</h3><p>Record only your own expenses. Mileage is recorded in miles; no mileage payment is calculated here. Use travel for parking or other travel charges.</p><div class="planner-fields">${Object.entries(expenseLabels).map(([key,label])=>`<label>${label}<input data-expense="${key}" type="number" min="0" max="100000" step="0.01" value="${Number(j.employeeExpenses?.[key])||0}"></label>`).join('')}</div><label class="employee-notes">Work carried out<textarea data-note="employeeWorkCarriedOut" maxlength="10000">${esc(j.employeeWorkCarriedOut)}</textarea></label><label class="employee-notes">Work notes<textarea data-note="employeeNotes" maxlength="10000">${esc(j.employeeNotes)}</textarea></label><div class="employee-actions"><button type="button" data-action="save" ${saving?'disabled':''}>Save Job Sheet</button><button type="button" data-action="print">Print work sheet</button><button type="button" data-action="csv">Export work CSV</button></div></div></article>`).join(''):'<p>No active jobs are currently assigned to you.</p>';
  }
  function renderCalendar(){
    const first=month+'-01',start=addDays(first,-((new Date(first+'T12:00:00Z').getUTCDay()+6)%7));
    document.getElementById('monthTitle').textContent=new Date(first+'T12:00:00Z').toLocaleDateString('en-GB',{month:'long',year:'numeric',timeZone:'UTC'});
    document.getElementById('calendar').innerHTML=`<div class="employee-calendar-wrap"><div class="employee-calendar">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>`<strong>${d}</strong>`).join('')}${Array.from({length:42},(_,i)=>{const d=addDays(start,i);return `<div class="employee-day ${d.startsWith(month)?'':'outside'}"><time datetime="${d}">${Number(d.slice(-2))}</time>${calendar.filter(j=>onDay(j,d)).map(j=>`<button class="employee-event ${j.scheduleStatus}" type="button" data-open="${esc(j.id)}">${esc(j.customerName)} · ${esc(team(j))}${j.scheduleStatus==='provisional'?' · Provisional':''}</button>`).join('')}</div>`;}).join('')}</div></div>`;
    document.getElementById('agenda').innerHTML=calendar.filter(j=>!date(j.scheduleStartDate)).map(j=>`<div class="employee-agenda">${esc(j.customerName)} · ${esc(team(j))} · Needs exact dates${j.shelleyJoiningDates.length?' · Shelley joining: '+j.shelleyJoiningDates.map(esc).join(', '):''}</div>`).join('');
  }
  function render(){renderJobs();renderCalendar();}
  function totals(job){job.actual=Object.fromEntries(fields.map(f=>[f,job.actualEntries.reduce((s,r)=>s+(Number(r[f])||0),0)]));job.remaining=Object.fromEntries(fields.map(f=>[f,job.expected[f]-job.actual[f]]));}
  const payload=j=>({id:j.id,version:j.version,actualEntries:j.actualEntries,parts:j.parts.map(p=>({id:p.id,quantity:p.quantity})),employeeWorkCarriedOut:j.employeeWorkCarriedOut,employeeNotes:j.employeeNotes,employeeExpenses:Object.fromEntries(Object.keys(expenseLabels).map(k=>[k,Number(j.employeeExpenses?.[k])||0]))});
  async function save(j){if(saving)return;saving=true;renderJobs();status('Saving…');try{const result=await request('POST',payload(j));jobs[jobs.findIndex(v=>v.id===j.id)]=result.job;dirty.delete(j.id);status('Job sheet saved.');}catch(e){status(e.message);if(e.message==='Access denied'||e.message==='Job unavailable'){clear();}}finally{saving=false;renderJobs();}}
  function csv(j){const cell=v=>{let value=String(v??'');if(/^[=+@-]/.test(value))value="'"+value;return '"'+value.replace(/"/g,'""')+'"';};
    const rows=[['Job sheet',j.customerName],['Quote reference',j.quoteRef],['Customer address',j.customerAddress],['Working on job',team(j)],['Work dates',j.scheduleStartDate,j.scheduleEndDate],['Shelley joining',j.shelleyJoiningDates.join(', ')],['Date','Service level',...labels],...j.actualEntries.map(r=>[r.date,j.serviceLevels.find(l=>l.id===r.serviceLevelId)?.name||r.serviceLevelId,...fields.map(f=>r[f])]),['Parts','Quantity'],...j.parts.map(p=>[p.name,p.quantity]),['Your expenses'],...Object.entries(expenseLabels).map(([key,label])=>[label,Number(j.employeeExpenses?.[key])||0]),['Work carried out',j.employeeWorkCarriedOut],['Work notes',j.employeeNotes]];
    const url=URL.createObjectURL(new Blob(['\ufeff'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='work-sheet.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  document.getElementById('jobSheets').addEventListener('change',e=>{const article=e.target.closest('[data-job]'),j=jobs.find(j=>j.id===article?.dataset.job);if(!j||saving)return;const t=e.target;
    if(t.dataset.entry){const r=j.actualEntries.find(r=>r.id===t.closest('[data-row]').dataset.row);r[t.dataset.entry]=fields.includes(t.dataset.entry)?Number(t.value):t.value;totals(j);article.querySelector('.employee-summary').innerHTML=summary('Expected',j.expected)+summary('Actual',j.actual)+summary('Remaining',j.remaining);}
    else if(t.dataset.expense){j.employeeExpenses??={};j.employeeExpenses[t.dataset.expense]=Number(t.value);}else if(t.dataset.note)j[t.dataset.note]=t.value;else if(t.dataset.part)j.parts.find(p=>p.id===t.dataset.part).quantity=Number(t.value);else return;dirty.add(j.id);status('Unsaved changes. Save Job Sheet when ready.');
  });
  document.getElementById('jobSheets').addEventListener('click',e=>{const button=e.target.closest('[data-action]'),article=button?.closest('[data-job]'),j=jobs.find(j=>j.id===article?.dataset.job);if(!j||saving)return;
    switch(button.dataset.action){case'expand':opened.has(j.id)?opened.delete(j.id):opened.add(j.id);renderJobs();break;case'add-day':j.actualEntries.push({id:crypto.randomUUID(),date:new Date().toISOString().slice(0,10),serviceLevelId:j.serviceLevels[0]?.id||'',...Object.fromEntries(fields.map(f=>[f,0]))});dirty.add(j.id);renderJobs();break;case'remove-day':j.actualEntries=j.actualEntries.filter(r=>r.id!==button.closest('[data-row]').dataset.row);totals(j);dirty.add(j.id);renderJobs();break;case'save':save(j);break;case'print':window.print();break;case'csv':csv(j);break;}
  });
  document.getElementById('calendar').addEventListener('click',e=>{const id=e.target.closest('[data-open]')?.dataset.open;if(jobs.some(j=>j.id===id))showJobs(id);else if(id)status('This booking is visible on the calendar. Its job sheet is not assigned to you.');});
  document.getElementById('calendarTab').onclick=()=>{document.getElementById('calendarPanel').hidden=false;document.getElementById('jobsPanel').hidden=true;};
  document.getElementById('jobsTab').onclick=()=>showJobs();document.getElementById('refresh').onclick=load;
  for(const [id,step] of [['previousMonth',-1],['nextMonth',1]])document.getElementById(id).onclick=()=>{const d=new Date(month+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+step);month=d.toISOString().slice(0,7);renderCalendar();};
  window.addEventListener('beforeunload',e=>{if(dirty.size){e.preventDefault();e.returnValue='';}});
  // No background refresh can overwrite a work sheet being edited.
  load();
})();
