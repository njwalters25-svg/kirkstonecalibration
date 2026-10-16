// Assignment, travel defaults and an operational Job Sheet view. This is not an access-control boundary.
window.KirkstoneWork = (() => {
  const P=KirkstonePlanning, ownerViews=new Set();let quoteOriginExplicit=false,teamCostingVersion=1;
  const esc=value=>escapeHtml(String(value??''));
  const costNames={hotel:'Hotel',food:'Food',fuel:'Other travel',shipping:'Shipping',secondPerson:'Second person job cost',other:'Other',mileageMiles:'Total mileage (miles)'};
  function quoteOrigin(){return document.getElementById('quoteTravelOrigin')?.value.trim()
    || P.defaultOrigin(document.getElementById('quoteAssignee')?.value,currentSettings);}
  function workerOptions(lead,selected){return ['phil','shelley','owner'].filter(who=>who!==lead)
    .map(who=>'<option value="'+who+'" '+(selected===who?'selected':'')+'>'+P.personName(who)+'</option>').join('');}
  function restoreTeam(quote={}){
    const select=document.getElementById('secondPersonKind');if(!select)return;
    select.innerHTML=workerOptions(P.person(quote),P.secondWorker(quote));
    for(const [key,fallback] of Object.entries({shelleyHourlyRate:15.87,shelleyAvailableDays:'',shelleyPaidHours:'',shelleyHotelCost:0,shelleyFuelCost:'',shelleyFoodCost:0})){
      const field=document.getElementById(key);if(field)field.value=quote[key] ?? fallback;
    }
    document.getElementById('shelleyNoTimeSaving').checked=!!quote.shelleyNoTimeSaving;
    showShelleyCosts();
    queueMicrotask(showShelleyCosts);
  }
  function showShelleyCosts(){
    const lead=document.getElementById('quoteAssignee').value,other=document.getElementById('secondPersonKind').value;
    document.getElementById('shelleyQuoteCosts').hidden=!(lead==='shelley'||(document.getElementById('secondPerson').checked&&other==='shelley'));
  }
  function restoreQuote(quote={}){
    teamCostingVersion=quote.teamCostingVersion===1?1:(quote.id||quote.pipetteLines?0:1);
    quoteOriginExplicit=Boolean(quote.travelOriginPostcode);
    const who=quote.assignedPerson==='shelley'?'shelley':'owner';
    const select=document.getElementById('quoteAssignee'),input=document.getElementById('quoteTravelOrigin');
    if(select)select.value=who;if(input)input.value=quote.travelOriginPostcode || P.defaultOrigin(who,currentSettings);
    restoreTeam(quote);
  }
  const collectQuote=collectQuoteInputFromForm;
  window.collectQuoteInputFromForm=()=>({...collectQuote(),assignedPerson:document.getElementById('quoteAssignee')?.value || 'owner',
    secondPersonKind:document.getElementById('secondPersonKind')?.value || 'phil',teamCostingVersion,
    shelleyNoTimeSaving:document.getElementById('shelleyNoTimeSaving').checked,
    ...Object.fromEntries(['shelleyHourlyRate','shelleyHotelCost','shelleyFuelCost','shelleyFoodCost'].map(key=>[key,Math.max(0,Number(document.getElementById(key)?.value)||0)])),
    shelleyAvailableDays:document.getElementById('shelleyAvailableDays')?.value === '' ? null : Math.max(0,Math.floor(Number(document.getElementById('shelleyAvailableDays')?.value)||0)),
    shelleyPaidHours:document.getElementById('shelleyPaidHours')?.value === '' ? null : Math.max(0,Number(document.getElementById('shelleyPaidHours')?.value)||0),
    travelOriginPostcode:quoteOrigin()});
  window.getQuoteTravelOrigin=quoteOrigin;window.restoreQuotePlanning=restoreQuote;
  function sheet(job){
    const safe=P.operational(job,calculateJobSheet(job),currentSettings);
    safe.parts=safe.parts.map((part,i)=>({...part,costPerUnit:typeof getNormalisedPartValues==='function'
      ? getNormalisedPartValues(job.parts[i]).costPerUnit : part.costPerUnit}));
    return safe;
  }
  const field=(job,name,label,type,value,extra='')=>'<label>'+label+'<input data-plan-field="'+name+'" type="'+type+'" value="'+esc(value)+'" '+extra+'></label>';
  function controls(job){
    return '<div class="planning-controls">'+(window.renderShelleyJoiningDates?renderShelleyJoiningDates(job):'')+'<div class="planner-fields"><label>Assigned to<select data-plan-field="assignedPerson">'
      +'<option value="owner" '+(P.person(job)==='owner'?'selected':'')+'>Dan</option><option value="shelley" '+(P.person(job)==='shelley'?'selected':'')+'>Shelley</option></select></label>'
      +'<label>Also working on this job<select data-plan-field="secondPersonKind"><option value="none" '+(!P.hasSecondPerson(job)?'selected':'')+'>No additional worker</option>'+workerOptions(P.person(job),P.hasSecondPerson(job)?P.secondWorker(job):'none')+'</select></label>'
      +(P.participants(job).includes('shelley') && P.availability(job) !== null?'<p>Shelley available: '+esc(P.availability(job))+' days (set on quote)</p>':'')
      +field(job,'travelOriginPostcode','Travel starting postcode','text',P.origin(job,currentSettings))
      +field(job,'destinationPostcode','Job destination postcode','text',job.destinationPostcode || job.quoteSnapshot?.destinationPostcode || '')
      +field(job,'scheduleStartDate','Work start date','date',job.scheduleStartDate || '')
      +field(job,'scheduleEndDate','Work end date','date',job.scheduleEndDate || '')
      +'<label>Calendar status<select data-plan-field="scheduleStatus"><option value="booked">Booked</option><option value="provisional" '+(job.scheduleStatus==='provisional'?'selected':'')+'>Provisional</option></select></label></div>'
      +'<p class="field-hint">Save the Job Sheet to keep assignment, travel and calendar changes.</p>'
      +'<div class="planner-actions"><button class="btn-small" data-work-action="route">Calculate travel</button>'
      +'<button class="btn-small" data-work-action="save">Save Job Sheet</button></div>'
      +(job.travelNeedsReview?'<p class="field-hint">Travel start changed. Recalculate travel before using the previous mileage estimate.</p>':'')
      +(job.travelPlan?'<p class="field-hint">One-way estimate: '+esc(job.travelPlan.distanceMiles)+' miles · '+esc(job.travelPlan.durationMinutes)+' minutes. Enter total job mileage in costs.</p>':'')+'</div>';
  }
  function totals(title,values){return '<div class="job-mini-table"><strong>'+title+'</strong>'
    +P.fields.map((key,i)=>'<span>'+P.labels[i]+': '+values[key]+'</span>').join('')+'</div>';}
  function card(job){
    const safe=sheet(job),expanded=expandedJobIds.has(job.id),root=document.createElement('article');
    root.id='job-card-'+job.id;root.dataset.id=job.id;root.className='work-sheet-card';
    const catalog=typeof getJobPartsCatalog==='function'?getJobPartsCatalog(job):[];
    root.innerHTML='<div class="history-header"><strong>'+esc(safe.customerName)+'</strong><span class="ref-badge">'+esc(safe.quoteRef)+'</span><span class="work-assignee">'+esc(P.teamName(job))+'</span></div>'
      +'<div class="job-summary-grid">'+totals('Expected',safe.expected)+totals('Actual',safe.actual)+totals('Remaining',safe.remaining)+'</div>'
      +'<div class="planner-actions"><button class="btn-small" data-work-action="expand">'+(expanded?'Close work sheet':'Open work sheet')+'</button>'
      +'<button class="btn-small" data-work-action="finance">Owner financial view</button></div>'
      +'<div class="operational-detail" '+(expanded?'':'hidden')+'>'
      +controls(job)+'<p><strong>Customer address</strong><br>'+esc(safe.customerAddress).replace(/\n/g,'<br>')+'</p>'
      +'<h3>Actual pipettes by day</h3><div class="work-entry-scroll"><div class="job-entry-row job-entry-header"><span>Date</span><span>Service level</span>'
      +P.labels.map(label=>'<span>'+label+'</span>').join('')+'<span></span></div>'
      +(job.actualEntries || []).map(row=>renderJobEntryRow(job,row)).join('')+'</div>'
      +'<button class="btn-small" data-work-action="add-day">Add day / service row</button><h3>Job costs and expenses</h3><div class="planner-fields">'
      +Object.entries(safe.costs).map(([key,value])=>'<label>'+costNames[key]+(key==='mileageMiles'?'':' (£)')+'<input data-work-cost="'+key+'" type="number" min="0" step="0.01" value="'+value+'"></label>').join('')+'</div>'
      +'<div class="work-cost-totals"><span>Parts cost '+formatCurrency(safe.calculatedCosts.parts)+'</span><span>Mileage cost '+formatCurrency(safe.calculatedCosts.mileage)+'</span><span>Sticker costs '+formatCurrency(safe.calculatedCosts.stickers)+'</span><strong>Total job costs '+formatCurrency(safe.calculatedCosts.total)+'</strong></div>'
      +'<h3>Parts used</h3>'+safe.parts.map(part=>'<div class="work-part-row"><label>Part<select data-work-part="catalogPartId" data-part-id="'+esc(part.id)+'">'
        +catalog.map(item=>'<option value="'+esc(item.id)+'" '+(item.id===part.catalogPartId?'selected':'')+'>'+esc(typeof getCatalogPartName==='function'?getCatalogPartName(item):item.name)+'</option>').join('')
        +'</select></label><label>Quantity<input data-work-part="quantity" data-part-id="'+esc(part.id)+'" type="number" min="0" step="1" value="'+part.quantity+'"></label>'
        +'<label>Purchase cost per part (£)<input data-work-part="costPerUnit" data-part-id="'+esc(part.id)+'" type="number" min="0" step="0.01" value="'+part.costPerUnit+'"></label>'
        +'<button class="btn-small" data-work-action="remove-part" data-part-id="'+esc(part.id)+'">Remove part</button></div>').join('')
      +'<button class="btn-small" data-work-action="add-part">Add part</button>'
      +'<label class="work-note">Work carried out<textarea data-plan-field="workCarriedOut" rows="3">'+esc(safe.workCarriedOut)+'</textarea></label>'
      +'<label class="work-note">Work notes<textarea data-plan-field="operationalNotes" rows="3">'+esc(safe.operationalNotes)+'</textarea></label>'
      +'<div class="planner-actions"><button class="btn-small" data-work-action="save">Save Job Sheet</button><button class="btn-small" data-work-action="print">Print work sheet</button>'
      +'<button class="btn-small" data-work-action="csv">Export work CSV</button></div></div>';
    return root;
  }
  function decorate(){
    for(const node of document.querySelectorAll('#jobSheets .job-card, #archiveJobSheets .job-card')){
      const job=getJobById(node.dataset.id);if(!job)continue;
      if(P.person(job)==='shelley'&&!ownerViews.has(job.id)){node.replaceWith(card(job));continue;}
      const editor=node.querySelector('.job-editor');if(!editor||editor.querySelector('.planning-controls'))continue;
      const block=document.createElement('div');block.className='planning-controls-holder';block.innerHTML=controls(job);
      if(P.person(job)==='shelley')block.insertAdjacentHTML('afterbegin','<button class="btn-small" data-work-action="finance">Back to work sheet</button>');
      editor.insertBefore(block,editor.firstChild);
    }
  }
  const render=renderJobSheets;
  window.renderJobSheets=function(jobs){render(jobs);decorate();window.renderJobCalendar?.();};
  function validate(job){
    const range=P.schedule(job);
    if(range&&P.joiningDates(job).some(date=>date<range.start||date>range.end))throw new Error('Shelley’s joining dates must fall within the job start and end dates.');
    if((job.scheduleStartDate || job.scheduleEndDate)&&!P.schedule(job))throw new Error('Choose a valid start date and an end date on or after it.');
  }
  async function save(job){
    validate(job);await persistJob(job,'Job sheet saved');window.renderJobCalendar?.();
  }
  async function saveFields(job,patch){
    const allowed=['outlookLink','scheduleStartDate','scheduleEndDate'];
    if(Object.keys(patch).some(key=>!allowed.includes(key)))throw new Error('Unsupported calendar update.');
    const latest=getJobById(job.id) || job,candidate={...latest,...patch};validate(candidate);
    const updatedAt=new Date().toISOString();
    if(!isLocalPreviewMode)await getJobsRef().doc(job.id).set({...patch,updatedAt},{merge:true});
    Object.assign(latest,patch,{updatedAt});StorageManager.saveJob(latest);renderJobSheets(currentJobs);
  }
  function download(content,name,type){
    const url=URL.createObjectURL(new Blob([content],{type})),link=document.createElement('a');
    link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  function print(job){
    const safe=sheet(job),date=safe.schedule?safe.schedule.start+' to '+safe.schedule.end:'Dates not set';
    const html='<!doctype html><html><head><meta charset="utf-8"><title>Work sheet '+esc(safe.quoteRef)+'</title><style>body{font:14px Arial;max-width:900px;margin:2rem auto;padding:1rem}table{border-collapse:collapse;width:100%;margin:1rem 0}td,th{padding:.5rem;border:1px solid #ccc;text-align:left}pre{white-space:pre-wrap}@media print{button{display:none}}</style></head><body>'
      +'<button onclick="window.print()">Print / PDF</button><h1>Kirkstone Calibration — Work sheet</h1><h2>'+esc(safe.customerName)+'</h2><p>Quote reference: '+esc(safe.quoteRef)+' · Assigned to '+P.personName(safe.assignedPerson)+'</p><p>Working on job: '+esc(P.teamName(safe))+'</p><p>'+esc(date)+'</p><p>Customer address: '+esc(safe.customerAddress)+'</p><p>Travel start: '+esc(safe.travelOriginPostcode)+'</p>'
      +'<table><tr><th>Pipettes</th>'+P.labels.map(l=>'<th>'+l+'</th>').join('')+'</tr>'
      +[['Expected',safe.expected],['Actual',safe.actual],['Remaining',safe.remaining]].map(([label,values])=>'<tr><th>'+label+'</th>'+P.fields.map(k=>'<td>'+values[k]+'</td>').join('')+'</tr>').join('')+'</table>'
      +(P.joiningDates(safe).length?'<p>Shelley joining: '+P.joiningDates(safe).join(', ')+'</p>':safe.shelleyAvailableDays !== null?'<p>Shelley available: '+safe.shelleyAvailableDays+' days (attendance dates not set)</p>':'')
      +'<h3>Daily work</h3><table><tr><th>Date</th><th>Service level</th>'+P.labels.map(l=>'<th>'+l+'</th>').join('')+'</tr>'
      +safe.actualEntries.map(row=>'<tr><td>'+esc(row.date)+'</td><td>'+esc(safe.serviceLevels.find(l=>l.id===row.serviceLevelId)?.name || row.serviceLevelId)+'</td>'+P.fields.map(k=>'<td>'+row[k]+'</td>').join('')+'</tr>').join('')+'</table>'
      +'<h3>Job expenses</h3>'+Object.entries(safe.costs).map(([key,value])=>'<p>'+costNames[key]+': '+(key==='mileageMiles'?value:formatCurrency(value))+'</p>').join('')
      +'<h3>Parts used</h3>'+safe.parts.map(p=>'<p>'+esc(p.name)+' × '+p.quantity+' · Purchase cost '+formatCurrency(p.costPerUnit)+'</p>').join('')
      +'<p><strong>Total job costs: '+formatCurrency(safe.calculatedCosts.total)+'</strong></p><h3>Work carried out</h3><pre>'+esc(safe.workCarriedOut)+'</pre><h3>Work notes</h3><pre>'+esc(safe.operationalNotes)+'</pre></body></html>';
    const url=URL.createObjectURL(new Blob([html],{type:'text/html'}));window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  async function route(job){
    const start=P.origin(job,currentSettings),destination=job.destinationPostcode || job.quoteSnapshot?.destinationPostcode;
    if(!destination)throw new Error('Enter the job destination postcode first.');
    const result=await calculateRoute(start,destination);
    if(start!==P.origin(job,currentSettings))throw new Error('Travel start changed. Calculate the route again.');
    job.travelPlan={origin:start,destination,...result};job.travelNeedsReview=false;
    renderJobSheets(currentJobs);showToast('One-way travel estimate updated. Save Job Sheet to keep it.');
  }
  function change(job,name,value){
    if(name==='assignedPerson'){
      const previousLead=P.person(job),previousOther=P.secondWorker(job);
      job.secondPerson=P.hasSecondPerson(job);
      job.assignedPerson=value==='shelley'?'shelley':'owner';job.travelOriginPostcode=P.defaultOrigin(job.assignedPerson,currentSettings);
      job.secondPersonKind=previousOther===job.assignedPerson?previousLead:previousOther;
      job.travelNeedsReview=true;delete job.travelPlan;ownerViews.delete(job.id);
      renderJobSheets(currentJobs);
    }else if(name==='secondPersonKind'){
      job.secondPerson=value!=='none';job.secondPersonKind=value==='none'?'phil':value;
      renderJobSheets(currentJobs);
    }else if(['scheduleStartDate','scheduleEndDate','scheduleStatus','travelOriginPostcode','destinationPostcode','workCarriedOut','operationalNotes'].includes(name)){
      job[name]=value;
      if(name==='travelOriginPostcode'||name==='destinationPostcode'){job.travelNeedsReview=true;delete job.travelPlan;}
      window.renderJobCalendar?.();
    }
  }
  function settings(){
    const grid=document.querySelector('#settingsPanel .settings-grid');if(!grid)return;
    const section=document.createElement('div');section.className='settings-card settings-full-width';section.id='workPlannerSettings';
    section.innerHTML='<h3>Team travel and Outlook calendar</h3><div class="planner-fields"><label>Shelley’s starting postcode<input id="s_shelleyHomePostcode" type="text" value="NE32 5QA"></label>'
      +'<label>Microsoft application ID (optional)<input id="s_outlookClientId" type="text" placeholder="For the optional Outlook connection"></label></div>'
      +'<p class="field-hint">Existing login stays unchanged. Outlook setup is optional; calendar export works without it.</p><button type="button" class="btn-small" id="savePlanningSettings">Save team and calendar settings</button>';
    grid.appendChild(section);
    document.getElementById('savePlanningSettings').onclick=async event=>{
      const button=event.currentTarget;button.disabled=true;
      try{
        const postcode=document.getElementById('s_shelleyHomePostcode').value.trim().toUpperCase();
        const id=document.getElementById('s_outlookClientId').value.trim();
        if(!postcode)throw new Error('Enter Shelley’s starting postcode.');
        if(id&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw new Error('Enter a valid Microsoft application ID.');
        const next={...currentSettings,shelleyHomePostcode:postcode,outlookClientId:id};
        if(!isLocalPreviewMode)await saveSettingsToFirestore(next);
        const oldId=currentSettings.outlookClientId;currentSettings=next;StorageManager.saveSettings(next);
        if(oldId!==id)window.KirkstoneOutlook?.disconnect();
        if(!quoteOriginExplicit)document.getElementById('quoteTravelOrigin').value=P.defaultOrigin(document.getElementById('quoteAssignee').value,currentSettings);
        showToast('Team and calendar settings saved');
      }catch(error){showToast(error.message);}finally{button.disabled=false;}
    };
    populatePlanningSettings(currentSettings);
  }
  function populatePlanningSettings(value={}){
    const home=document.getElementById('s_shelleyHomePostcode'),id=document.getElementById('s_outlookClientId');
    if(home)home.value=value.shelleyHomePostcode || currentSettings?.shelleyHomePostcode || 'NE32 5QA';
    if(id)id.value=value.outlookClientId || currentSettings?.outlookClientId || '';
  }
  const populate=populateSettingsForm;
  window.populateSettingsForm=function(value){populate(value);populatePlanningSettings(value);
    if(!quoteOriginExplicit&&document.getElementById('quoteTravelOrigin'))document.getElementById('quoteTravelOrigin').value=P.defaultOrigin(document.getElementById('quoteAssignee').value,currentSettings);};
  const collect=collectSettingsFromForm;
  window.collectSettingsFromForm=function(){return {...collect(),shelleyHomePostcode:document.getElementById('s_shelleyHomePostcode')?.value.trim() || 'NE32 5QA',
    outlookClientId:document.getElementById('s_outlookClientId')?.value.trim() || currentSettings.outlookClientId || ''};};
  document.addEventListener('DOMContentLoaded',()=>{
    settings();if(!document.getElementById('quoteTravelOrigin').value)restoreQuote(StorageManager.loadFormState() || {});
    document.getElementById('quoteAssignee').addEventListener('change',()=>{
      teamCostingVersion=1;
      const selected=document.getElementById('secondPersonKind').value,lead=document.getElementById('quoteAssignee').value;
      const selector=document.getElementById('secondPersonKind');
      selector.innerHTML=workerOptions(lead,selected===lead?(lead==='owner'?'shelley':'owner'):selected);
      showShelleyCosts();
      quoteOriginExplicit=false;
      document.getElementById('quoteTravelOrigin').value=P.defaultOrigin(document.getElementById('quoteAssignee').value,currentSettings);
      document.getElementById('routeStatus').textContent='Travel start changed. Recalculate the route if needed.';recalculate();autoSaveForm();
    });
    for(const key of ['secondPerson','secondPersonKind'])document.getElementById(key).addEventListener('change',()=>{teamCostingVersion=1;showShelleyCosts();recalculate();autoSaveForm();});
    for(const event of ['input','change'])document.getElementById('quoteForm').addEventListener(event,e=>{
      if(e.target.closest('#shelleyQuoteCosts'))teamCostingVersion=1;
    },true);
    // The main form restores its checkbox after restoreQuotePlanning is called.
    queueMicrotask(showShelleyCosts);
    document.getElementById('quoteTravelOrigin').addEventListener('change',()=>{quoteOriginExplicit=true;autoSaveForm();});
    document.addEventListener('change',event=>{
      const root=event.target.closest('[data-id]');if(!root)return;const job=getJobById(root.dataset.id);if(!job)return;
      if(event.target.dataset.planField)change(job,event.target.dataset.planField,event.target.value);
      else if(event.target.dataset.workCost){const key=event.target.dataset.workCost;if(!(key in costNames))return;
        job.costs=job.costs || {};job.costs[key]=Math.max(0,Number(event.target.value)||0);renderJobSheets(currentJobs);}
      else if(event.target.dataset.workPart)updateJobPart(job.id,event.target.dataset.partId,event.target.dataset.workPart,event.target.value);
    });
    document.addEventListener('click',async event=>{
      const button=event.target.closest('[data-work-action]'),root=button?.closest('[data-id]');if(!button||!root)return;
      const job=getJobById(root.dataset.id);if(!job)return;button.disabled=true;
      try{switch(button.dataset.workAction){
        case 'save':await save(job);break;
        case 'finance':ownerViews.has(job.id)?ownerViews.delete(job.id):ownerViews.add(job.id);renderJobSheets(currentJobs);break;
        case 'expand':expandedJobIds.has(job.id)?expandedJobIds.delete(job.id):expandedJobIds.add(job.id);renderJobSheets(currentJobs);break;
        case 'add-day':addJobEntry(job.id);break;case 'add-part':addJobPart(job.id);break;
        case 'remove-part':deleteJobPart(job.id,button.dataset.partId);break;
        case 'route':await route(job);break;case 'print':print(job);break;
        case 'csv':download(P.operationalCsv(sheet(job)),(job.quoteRef || 'work-sheet')+'.csv','text/csv;charset=utf-8');break;
      }}catch(error){showToast(error.message || 'Could not save the job.');}finally{button.disabled=false;}
    });
    decorate();
  });
  return {sheet,save,saveFields,change,download,print,route,decorate};
})();

