// Date-only job calendar, proposed-month list and optional Outlook overlay.
(() => {
  const P=KirkstonePlanning;
  const now=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  let month=now().slice(0,7),filter='all',externalVisible=true;
  const esc=value=>escapeHtml(String(value??''));
  function bounds(){
    const first=month+'-01',d=new Date(first+'T12:00:00Z'),offset=(d.getUTCDay()+6)%7;
    const start=P.addDays(first,-offset),end=P.addDays(start,41);return {start,end};
  }
  const shownJobs=()=>currentJobs.filter(job=>P.active(job)&&(filter==='all'||P.person(job)===filter));
  const linkedJob=event=>currentJobs.find(job=>job.outlookLink?.eventId===event.id
    && job.outlookLink?.accountId===KirkstoneOutlook.profile?.id&&job.outlookLink?.calendarId===KirkstoneOutlook.selected?.id);
  function jump(nextMonth){month=nextMonth;render();refreshOutlook();}
  async function refreshOutlook(){if(!KirkstoneOutlook.connected)return;const range=bounds();try{await KirkstoneOutlook.load(range.start,range.end);}catch{}}
  function render(){
    const root=document.getElementById('jobCalendar');if(!root)return;
    const jobs=shownJobs(),range=bounds(),scheduled=jobs.filter(job=>P.schedule(job)),undated=jobs.filter(job=>!P.schedule(job)
      &&(!job.proposedDate || job.proposedDate.slice(0,7)===month));
    const title=new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(month+'-01T12:00:00Z'));
    const outlook=KirkstoneOutlook,external=externalVisible?outlook.events:[];
    root.innerHTML='<div class="calendar-heading"><div><h2>Work calendar</h2><p>Booked dates, provisional work and upcoming Outlook events.</p></div>'
      +'<div class="planner-actions"><button class="btn-small" data-cal-action="previous" aria-label="Previous month">←</button><strong>'+esc(title)+'</strong>'
      +'<button class="btn-small" data-cal-action="next" aria-label="Next month">→</button><button class="btn-small" data-cal-action="today">Today</button></div></div>'
      +'<div class="planner-actions"><label>Show jobs for <select id="calendarPerson"><option value="all">Everyone</option><option value="owner" '+(filter==='owner'?'selected':'')+'>Owner</option>'
      +'<option value="shelley" '+(filter==='shelley'?'selected':'')+'>Shelley</option></select></label>'
      +'<button class="btn-small" data-cal-action="export">Export jobs for Outlook (.ics)</button></div>'
      +'<div class="outlook-controls"><p role="status">'+esc(outlook.status)+'</p><div class="planner-actions">'
      +(outlook.connected?'<label>Outlook calendar <select id="outlookCalendar">'+outlook.calendars.map(item=>'<option value="'+esc(item.id)+'" '+(item.id===outlook.selected?.id?'selected':'')+'>'+esc(item.name)+(item.canEdit?'':' (read-only)')+'</option>').join('')+'</select></label>'
        +'<button class="btn-small" data-cal-action="refresh">Refresh Outlook</button><button class="btn-small" data-cal-action="disconnect">Disconnect Outlook</button>'
        +'<label><input id="showOutlookEvents" type="checkbox" '+(externalVisible?'checked':'')+'> Show Outlook events</label>'
        :'<button class="btn-small" data-cal-action="connect">Connect Outlook</button>')
      +'</div><p class="field-hint">Outlook connection needs a Microsoft application ID in Settings. Exports work without it. Exported files are snapshots, not a live subscription.</p></div>'
      +'<div class="calendar-scroll"><div class="work-calendar-grid" role="grid" aria-label="'+esc(title)+'">'
      +['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day=>'<div class="calendar-weekday" role="columnheader">'+day+'</div>').join('')
      +Array.from({length:42},(_,i)=>{
        const date=P.addDays(range.start,i),items=scheduled.filter(job=>{const dates=P.schedule(job);return date>=dates.start&&date<=dates.end;});
        const other=external.filter(event=>{
          const dates=P.outlookDates(event);if(!dates||date<dates.start||date>dates.end)return false;
          const linked=linkedJob(event),planned=linked&&P.schedule(linked);
          return !planned||planned.start!==dates.start||planned.end!==dates.end;
        });
        return '<div class="calendar-day '+(date.slice(0,7)!==month?'outside-month ':'')+(date===now()?'today':'')+'" role="gridcell" aria-label="'+date+'">'
          +'<span class="calendar-date">'+Number(date.slice(-2))+'</span>'
          +items.map(job=>'<button class="calendar-event '+P.person(job)+(job.scheduleStatus==='provisional'?' provisional':'')+'" data-cal-job="'+esc(job.id)+'">'+esc(job.customerName || 'Unnamed job')+'<small>'+P.personName(P.person(job))+' · '+esc(job.quoteRef || '')+'</small></button>').join('')
          +other.map(event=>'<button class="calendar-event outlook" data-cal-event="'+esc(event.id)+'">'+esc(event.subject || 'Outlook event')+'</button>').join('')+'</div>';
      }).join('')+'</div></div>'
      +'<div class="calendar-legend"><span>Owner</span><span>Shelley</span><span>Outlook</span><span>Dashed: provisional</span></div>'
      +'<h3>Work dates</h3><div class="calendar-agenda">'+scheduled.filter(job=>{const dates=P.schedule(job);return dates.start<=range.end&&dates.end>=range.start;})
      .sort((a,b)=>P.schedule(a).start.localeCompare(P.schedule(b).start)).map(job=>agenda(job,true)).join('')
      +'<h3>Needs exact dates</h3>'+(!undated.length?'<p>No undated jobs for this month.</p>':undated.map(job=>agenda(job,false)).join(''))+'</div>'
      +'<div id="outlookEventDetail"></div>';
  }
  function agenda(job,dated){
    const dates=P.schedule(job);
    return '<article class="calendar-job" data-id="'+esc(job.id)+'"><div><strong>'+esc(job.customerName || 'Unnamed job')+'</strong> · '+esc(job.quoteRef || '')+' · '+P.personName(P.person(job))
      +'<p>'+(dated?esc(dates.start+' to '+dates.end)+(job.scheduleStatus==='provisional'?' · Provisional':''):
        job.proposedDate?'Proposed '+esc(job.proposedDate)+' — exact dates not set':'No dates set')+'</p></div>'
      +'<div class="planner-fields"><label>Assigned to<select data-calendar-field="assignedPerson"><option value="owner">Owner</option><option value="shelley" '+(P.person(job)==='shelley'?'selected':'')+'>Shelley</option></select></label>'
      +'<label>Start date<input type="date" data-calendar-field="scheduleStartDate" value="'+esc(job.scheduleStartDate || '')+'"></label>'
      +'<label>End date<input type="date" data-calendar-field="scheduleEndDate" value="'+esc(job.scheduleEndDate || '')+'"></label></div>'
      +'<div class="planner-actions"><button class="btn-small" data-cal-action="save" data-job-id="'+esc(job.id)+'">Save schedule</button>'
      +'<button class="btn-small" data-cal-job="'+esc(job.id)+'">Open Job Sheet</button>'
      +(KirkstoneOutlook.connected?'<button class="btn-small" data-cal-action="send" data-job-id="'+esc(job.id)+'" '+(!KirkstoneOutlook.selected?.canEdit||!dates?'disabled':'')+'>Send / update in Outlook</button>':'')+'</div></article>';
  }
  function eventDetail(event){
    const root=document.getElementById('outlookEventDetail');if(!root)return;
    const job=linkedJob(event),dates=P.outlookDates(event);
    root.innerHTML='<div class="calendar-job"><h3>'+esc(event.subject || 'Outlook event')+'</h3><p>'+esc(dates?dates.start+' to '+dates.end:'Dates unavailable')+'</p><p>'+esc(event.location?.displayName || '')+'</p>'
      +(job?'<button class="btn-small" data-cal-action="apply" data-job-id="'+esc(job.id)+'" data-event-id="'+esc(event.id)+'">Use Outlook dates for this job</button>':'')
      +'<button class="btn-small" data-cal-action="close-detail">Close</button></div>';
  }
  window.renderJobCalendar=render;
  document.addEventListener('DOMContentLoaded',()=>{
    render();document.getElementById('calendarPanel').addEventListener('change',event=>{
      if(event.target.id==='calendarPerson'){filter=event.target.value;render();}
      else if(event.target.id==='outlookCalendar'){KirkstoneOutlook.selectCalendar(event.target.value);refreshOutlook();}
      else if(event.target.id==='showOutlookEvents'){externalVisible=event.target.checked;render();}
      else if(event.target.dataset.calendarField){const job=getJobById(event.target.closest('[data-id]').dataset.id);
        KirkstoneWork.change(job,event.target.dataset.calendarField,event.target.value);}
    });
    document.getElementById('calendarPanel').addEventListener('click',async event=>{
      const button=event.target.closest('button');if(!button)return;
      if(button.dataset.calJob){openJobSheet(button.dataset.calJob);return;}
      if(button.dataset.calEvent){const item=KirkstoneOutlook.events.find(row=>row.id===button.dataset.calEvent);if(item)eventDetail(item);return;}
      const action=button.dataset.calAction,job=button.dataset.jobId?getJobById(button.dataset.jobId):null;
      button.disabled=true;
      try{switch(action){
        case 'previous':{const date=new Date(month+'-01T12:00:00Z');date.setUTCMonth(date.getUTCMonth()-1);jump(date.toISOString().slice(0,7));break;}
        case 'next':{const date=new Date(month+'-01T12:00:00Z');date.setUTCMonth(date.getUTCMonth()+1);jump(date.toISOString().slice(0,7));break;}
        case 'today':jump(now().slice(0,7));break;
        case 'export':KirkstoneWork.download(P.calendarFile(shownJobs()),'kirkstone-jobs.ics','text/calendar;charset=utf-8');break;
        case 'save':await KirkstoneWork.save(job);render();break;
        case 'connect':await KirkstoneOutlook.connect();await refreshOutlook();break;
        case 'disconnect':KirkstoneOutlook.disconnect();break;
        case 'refresh':await refreshOutlook();break;
        case 'send':await KirkstoneOutlook.send(job);await refreshOutlook();break;
        case 'apply':{const item=KirkstoneOutlook.events.find(row=>row.id===button.dataset.eventId);if(item)await KirkstoneOutlook.applyDates(job,item);render();break;}
        case 'close-detail':document.getElementById('outlookEventDetail').replaceChildren();break;
      }}catch(error){showToast(error.message || 'Calendar action could not be completed.');}finally{button.disabled=false;}
    });
  });
})();

