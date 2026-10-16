// Optional Microsoft Graph calendar connection. App/Firebase authentication is unchanged.
window.KirkstoneOutlook = (() => {
  const scopes=['User.Read','Calendars.ReadWrite'];
  let instance=null,initializing=null,account=null,profile=null,calendars=[],selected=null,events=[],status='Outlook not connected';
  let connectionVersion=0,loadVersion=0;const busy=new Set();
  const notify=()=>window.renderJobCalendar?.();
  async function client(){
    const clientId=currentSettings.outlookClientId?.trim();
    if(!clientId)throw new Error('Add your Microsoft application ID in Settings to enable the Outlook connection. Calendar export is available now.');
    if(!instance){
      const library=await import('https://cdn.jsdelivr.net/npm/@azure/msal-browser@4.29.0/+esm');
      instance=new library.PublicClientApplication({auth:{clientId,authority:'https://login.microsoftonline.com/common',
        redirectUri:new URL('outlook-callback.html',location.href).href},cache:{cacheLocation:'memoryStorage'}});
      const created=instance;
      initializing=created.initialize().catch(error=>{if(instance===created){instance=null;initializing=null;}throw error;});
    }
    await initializing;
    return instance;
  }
  async function request(path,method='GET',data){
    if(!account)throw new Error('Connect Outlook first.');
    const version=connectionVersion,requestAccount=account;
    const url=new URL(path.startsWith('https:')?path:'https://graph.microsoft.com/v1.0'+path);
    if(url.origin!=='https://graph.microsoft.com'||!(url.pathname==='/v1.0/me'||url.pathname.startsWith('/v1.0/me/')))
      throw new Error('Invalid Outlook request.');
    const auth=await (await client()).acquireTokenSilent({account:requestAccount,scopes}).catch(()=>{throw new Error('Reconnect Outlook to continue.');});
    if(version!==connectionVersion||account!==requestAccount)throw new Error('Outlook connection changed. Please try again.');
    const response=await fetch(url.href,{method,credentials:'omit',
      headers:{Authorization:'Bearer '+auth.accessToken,'Content-Type':'application/json',Prefer:'outlook.timezone="GMT Standard Time", IdType="ImmutableId"'},
      ...(data?{body:JSON.stringify(data)}:{})});
    if(!response.ok){
      const error=new Error(response.status===404?'The linked Outlook event is no longer available. Restore it in Outlook before updating it.':
        response.status===403?'You do not have permission to change this Outlook calendar.':'Outlook could not complete the request. Try reconnecting.');
      error.status=response.status;throw error;
    }
    return response.status===204?null:response.json();
  }
  async function connect(){
    const version=++connectionVersion;loadVersion++;events=[];status='Connecting to Outlook…';notify();
    try{
      const app=await client(),response=await app.loginPopup({scopes,prompt:'select_account'});
      if(version!==connectionVersion)return;
      account=response.account;
      const user=await request('/me?$select=id,displayName,userPrincipalName');
      const list=await request('/me/calendars?$select=id,name,canEdit,isDefaultCalendar');
      if(version!==connectionVersion)return;
      profile={id:user.id,name:user.displayName || user.userPrincipalName};
      calendars=list.value || [];
      selected=calendars.find(item=>item.isDefaultCalendar&&item.canEdit)||calendars.find(item=>item.canEdit)||calendars[0]||null;
      status=selected?'Connected as '+profile.name:'No Outlook calendars available';notify();
    }catch(error){if(version===connectionVersion){account=null;profile=null;calendars=[];selected=null;status=error.message || 'Could not connect Outlook.';notify();}throw error;}
  }
  function disconnect(){
    connectionVersion++;loadVersion++;
    const old=instance,oldAccount=account;
    instance=null;initializing=null;account=null;profile=null;calendars=[];selected=null;events=[];status='Outlook disconnected';notify();
    old?.clearCache({account:oldAccount}).catch(()=>{});
  }
  function selectCalendar(id){
    selected=calendars.find(item=>item.id===id)||null;events=[];loadVersion++;notify();
  }
  async function load(start,end){
    if(!account||!selected)return;
    const version=++loadVersion,connection=connectionVersion,calendarId=selected.id;
    status='Loading Outlook events…';notify();
    try{
      const params=new URLSearchParams({startDateTime:KirkstonePlanning.addDays(start,-1)+'T00:00:00Z',
        endDateTime:KirkstonePlanning.addDays(end,2)+'T00:00:00Z',
        '$select':'id,subject,start,end,isAllDay,webLink,location,lastModifiedDateTime','$top':'200'});
      let next='/me/calendars/'+encodeURIComponent(calendarId)+'/calendarView?'+params.toString(),items=[],pages=0;
      while(next&&pages++<20){const result=await request(next);items.push(...(result.value||[]));next=result['@odata.nextLink'];}
      if(next)throw new Error('Too many Outlook events in this range. Choose a shorter calendar range.');
      if(version!==loadVersion||connection!==connectionVersion)return;
      events=items;status='Connected as '+profile.name+' · '+selected.name;notify();
    }catch(error){if(version===loadVersion){events=[];status=error.message;notify();}throw error;}
  }
  function receiptKey(job){return 'kirkstone_outlook_receipt_'+encodeURIComponent(profile.id+'|'+selected.id+'|'+job.id);}
  function receipt(job){
    if(job.outlookLink?.accountId===profile.id&&job.outlookLink?.calendarId===selected.id)return job.outlookLink;
    try{return JSON.parse(localStorage.getItem(receiptKey(job)) || 'null');}catch{return null;}
  }
  async function transactionId(job){
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(profile.id+'|'+selected.id+'|'+job.id));
    const hex=Array.from(new Uint8Array(bytes)).map(value=>value.toString(16).padStart(2,'0')).join('');
    return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20,32);
  }
  async function send(job){
    if(!account||!profile||!selected)throw new Error('Connect Outlook first.');
    if(!selected.canEdit)throw new Error('This Outlook calendar is read-only. Select a calendar you can edit.');
    if(busy.has(job.id))throw new Error('This job is already being sent to Outlook.');
    busy.add(job.id);
    const connection=connectionVersion,calendarId=selected.id,accountId=profile.id,storageKey=receiptKey(job);
    const ensureContext=()=>{if(connection!==connectionVersion||calendarId!==selected?.id)throw new Error('Outlook connection changed. Please try again.');};
    try{
      await KirkstoneWork.save(job);
      ensureContext();
      const link=receipt(job),base='/me/calendars/'+encodeURIComponent(calendarId)+'/events';
      let saved;
      if(link?.eventId){
        const existing=await request(base+'/'+encodeURIComponent(link.eventId)+'?$select=id,attendees');
        if(existing.attendees?.length)throw new Error('This Outlook event has attendees. Edit it in Outlook to manage invitations.');
        ensureContext();
        saved=await request(base+'/'+encodeURIComponent(link.eventId),'PATCH',KirkstonePlanning.outlookPayload(job));
      }else {const id=await transactionId(job);ensureContext();saved=await request(base,'POST',KirkstonePlanning.outlookPayload(job,id));}
      const result={eventId:saved?.id || link.eventId,calendarId,accountId};
      try{localStorage.setItem(storageKey,JSON.stringify(result));}catch{}
      try{await KirkstoneWork.saveFields(job,{outlookLink:result});}
      catch{throw new Error('Outlook was updated, but the link could not be saved. Retry to finish linking the same event.');}
      showToast(link?'Outlook job updated':'Job added to Outlook');
    }finally{busy.delete(job.id);}
  }
  async function applyDates(job,event){
    if(job.outlookLink?.accountId!==profile?.id||job.outlookLink?.calendarId!==selected?.id||job.outlookLink?.eventId!==event.id)
      throw new Error('This Outlook event is not linked to that job.');
    const dates=KirkstonePlanning.outlookDates(event);if(!dates)throw new Error('Outlook dates could not be read.');
    await KirkstoneWork.saveFields(job,{scheduleStartDate:dates.start,scheduleEndDate:dates.end});
  }
  return {connect,disconnect,selectCalendar,load,send,applyDates,
    get connected(){return Boolean(account&&profile);},get calendars(){return calendars;},get selected(){return selected;},
    get events(){return events;},get status(){return status;},get profile(){return profile;}};
})();

