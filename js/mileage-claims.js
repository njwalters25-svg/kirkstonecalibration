/* Kirkstone mileage claims module — isolated from quote/job costing.
   IMPORTANT: Production requires Firestore rules that restrict approval to Dan.
   Never treat UI hiding as authorization. */
(function () {
  'use strict';
  const RATE = 0.55;
  const PEOPLE = {owner:'Dan',shelley:'Shelley'};
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = v => Math.max(0,Number(v)||0);
  const money = n => '£'+n.toFixed(2);
  const userId = () => (typeof getCurrentUser === 'function' && getCurrentUser()?.uid) || '';
  const userEmail = () => (typeof getCurrentUser === 'function' && getCurrentUser()?.email) || '';
  const claimsRef = () => db.collection('mileageClaims');
  let claims = [];
  let selectedJob = '';
  let editingId = '';
  const el = id => document.getElementById(id);
  const jobs = () => typeof currentJobs !== 'undefined' ? currentJobs : [];
  const quoteJobs = () => jobs().filter(j=>j && j.id);
  const defaults = job => ({
    jobId:job?.id||'', jobRef:job?.quoteRef||'', customer:job?.customerName||'',
    employee:job?.assignedPerson==='shelley'?'shelley':'owner',
    from:job?.travelOriginPostcode||'', to:job?.destinationPostcode||'',
    miles:number(job?.costs?.mileageMiles || job?.quotedAssumptions?.totalTripMiles),
    date:'', purpose:job?'Customer calibration visit':'',
    driver:'', carShare:false, passengers:'', notes:''
  });
  const canApprove = () => false; // fail closed until server-enforced owner role is configured
  const total = c => number(c.miles)*RATE;
  function mount() {
    const nav=document.querySelector('.tab-nav'), main=el('appMain');
    if(!nav||!main||el('mileagePanel'))return;
    const button=document.createElement('button');
    button.className='tab-btn';button.dataset.tab='mileagePanel';button.textContent='Mileage Claims';
    nav.appendChild(button);
    const section=document.createElement('section');
    section.id='mileagePanel';section.className='tab-panel';
    section.innerHTML='<div class="card"><h2>Mileage Claims</h2><p>Job journeys can be prefilled from existing job sheets. Confirm actual miles, driver and travel date. Only the person using their own car should claim mileage.</p><div id="mileageMessage" role="status"></div><div class="form-row"><div class="form-group"><label>Existing job (optional)</label><select id="mcJob"></select></div><div class="form-group"><label>Employee</label><select id="mcEmployee"><option value="owner">Dan</option><option value="shelley">Shelley</option></select></div></div><div class="form-row"><div class="form-group"><label>Journey date</label><input id="mcDate" type="date"></div><div class="form-group"><label>Actual business miles</label><input id="mcMiles" type="number" min="0" step="0.1"></div></div><div class="form-row"><div class="form-group"><label>From</label><input id="mcFrom"></div><div class="form-group"><label>To</label><input id="mcTo"></div></div><div class="form-row"><div class="form-group"><label>Driver / car owner</label><select id="mcDriver"><option value="">Select</option><option value="owner">Dan</option><option value="shelley">Shelley</option><option value="other">Other</option></select></div><div class="form-group"><label>Purpose</label><input id="mcPurpose"></div></div><div class="checkbox-group"><input id="mcShare" type="checkbox"><label for="mcShare">Car shared</label></div><div class="form-group"><label>Passengers / car-sharing details</label><input id="mcPassengers"></div><div class="form-group"><label>Notes / reason for mileage override</label><textarea id="mcNotes"></textarea></div><p id="mcTotal"></p><button class="btn btn-primary" id="mcSubmit" type="button">Submit claim</button><button class="btn btn-secondary" id="mcClear" type="button">Clear</button><h3>Submitted claims</h3><div id="mcList"></div><button class="btn btn-secondary" id="mcCsv" type="button">Export claims CSV</button></div>';
    main.appendChild(section);
    button.addEventListener('click',()=>{document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));button.classList.add('active');section.classList.add('active');load();});
    el('mcJob').addEventListener('change',()=>fill(defaults(quoteJobs().find(j=>j.id===el('mcJob').value))));
    ['mcMiles','mcEmployee','mcDriver'].forEach(id=>el(id).addEventListener('input',preview));
    el('mcSubmit').addEventListener('click',submit);
    el('mcClear').addEventListener('click',()=>fill(defaults(null)));
    el('mcCsv').addEventListener('click',exportCsv);
    fill(defaults(null));load();
  }
  function fill(c){
    editingId='';
    el('mcJob').innerHTML='<option value="">Other business journey</option>'+quoteJobs().map(j=>'<option value="'+escape(j.id)+'">'+escape((j.quoteRef||'Job')+' — '+(j.customerName||''))+'</option>').join('');
    const map={mcJob:c.jobId,mcEmployee:c.employee,mcDate:c.date,mcMiles:c.miles,mcFrom:c.from,mcTo:c.to,mcDriver:c.driver,mcPurpose:c.purpose,mcPassengers:c.passengers,mcNotes:c.notes};
    Object.entries(map).forEach(([id,value])=>{el(id).value=value??'';});
    el('mcShare').checked=!!c.carShare;preview();
  }
  function preview(){el('mcTotal').textContent='Mileage reimbursement: '+money(number(el('mcMiles').value)*RATE);}
  function read(){
    const job=quoteJobs().find(j=>j.id===el('mcJob').value);
    return {jobId:job?.id||null,jobRef:job?.quoteRef||'',customer:job?.customerName||'',employee:el('mcEmployee').value,
      date:el('mcDate').value,from:el('mcFrom').value.trim(),to:el('mcTo').value.trim(),
      miles:number(el('mcMiles').value),rate:RATE,driver:el('mcDriver').value,carShare:el('mcShare').checked,
      passengers:el('mcPassengers').value.trim(),purpose:el('mcPurpose').value.trim(),notes:el('mcNotes').value.trim()};
  }
  function message(t){el('mileageMessage').textContent=t;}
  async function submit(){
    const c=read();
    if(!c.date||!c.from||!c.to||!c.purpose||!c.driver||!(c.miles>0)){message('Complete date, route, miles, purpose and driver.');return;}
    if(c.driver!==c.employee){message('Only the employee using their own vehicle can claim. Select the driver as employee, or record the journey under the actual driver.');return;}
    if(!db||!userId()){message('Sign in to Firebase before submitting mileage.');return;}
    const duplicate=claims.some(x=>x.status!=='rejected'&&x.employee===c.employee&&x.date===c.date&&x.jobId===c.jobId&&x.from.toLowerCase()===c.from.toLowerCase()&&x.to.toLowerCase()===c.to.toLowerCase());
    if(duplicate&&!window.confirm('A similar claim already exists. Submit another journey anyway?'))return;
    try {
      await claimsRef().add({...c,status:'submitted',submittedByUid:userId(),submittedByEmail:userEmail(),submittedAt:new Date().toISOString(),approvedBy:null,approvedAt:null});
      message('Claim submitted for Dan’s approval.');fill(defaults(null));await load();
    }catch(e){message('Could not save claim: '+e.message);}
  }
  async function load(){
    if(!db||!userId())return;
    try{const snap=await claimsRef().orderBy('submittedAt','desc').limit(250).get();claims=snap.docs.map(d=>({id:d.id,...d.data()}));render();}
    catch(e){message('Cannot load claims: '+e.message);}
  }
  function render(){
    el('mcList').innerHTML=claims.length?'<table><thead><tr><th>Date</th><th>Employee</th><th>Job</th><th>Route</th><th>Miles</th><th>Amount</th><th>Status</th></tr></thead><tbody>'+
      claims.map(c=>'<tr><td>'+escape(c.date)+'</td><td>'+escape(PEOPLE[c.employee]||c.employee)+'</td><td>'+escape(c.jobRef||'Other')+'</td><td>'+escape(c.from+' → '+c.to)+'</td><td>'+escape(c.miles)+'</td><td>'+money(total(c))+'</td><td>'+escape(c.status)+'</td></tr>').join('')+'</tbody></table>':'<p>No mileage claims yet.</p>';
    // Approval deliberately disabled until authenticated owner authorization and Firestore rules are deployed.
  }
  function exportCsv(){
    const fields=['date','employee','jobRef','customer','from','to','miles','rate','driver','carShare','passengers','purpose','notes','status','submittedAt','approvedAt'];
    const csv=[fields.join(','),...claims.map(c=>fields.map(k=>'"'+String(c[k]??'').replace(/"/g,'""')+'"').join(','))].join('\r\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='kirkstone-mileage-claims.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
  window.KirkstoneMileageClaims={mount,load};
})();
