// Exact employee attendance dates, separate from the whole-job date range.
(() => {
  const P=KirkstonePlanning;let quoteDates=[];
  const esc=value=>escapeHtml(String(value));
  function editor(id,dates){
    return '<div class="joining-dates" data-joining-job="'+esc(id)+'"><h3>Shelley’s joining dates</h3>'
      +'<div class="planner-actions"><label>Add a joining date<input class="joining-date-input" type="date"></label>'
      +'<button type="button" class="btn-small" data-joining-action="add">Add date</button></div>'
      +'<div class="planner-actions">'+dates.map(date=>'<button type="button" class="btn-small" data-joining-action="remove" data-joining-date="'+date+'">'+date+' ×</button>').join('')+'</div>'
      +'<p class="field-hint">Pick each day Shelley will attend, including separate days. Selected dates set her available-day count. '
      +(id==='quote'?'Clear all dates to enter a day count without exact dates.':'Save Job Sheet to keep changes. Editing attendance here does not rewrite the quote or recorded expenses.')+'</p></div>';
  }
  window.renderShelleyJoiningDates=job=>P.participants(job).includes('shelley')?editor(job.id,P.joiningDates(job)):'';
  function renderQuote(){
    const current=document.getElementById('quoteShelleyJoiningDates');if(!current)return;
    current.innerHTML=editor('quote',quoteDates);
    const field=document.getElementById('shelleyAvailableDays');field.readOnly=quoteDates.length>0;
    if(quoteDates.length)field.value=quoteDates.length;
  }
  const restore=window.restoreQuotePlanning;
  window.restoreQuotePlanning=function(quote={}){restore(quote);quoteDates=P.joiningDates(quote);renderQuote();};
  const collect=window.collectQuoteInputFromForm;
  window.collectQuoteInputFromForm=function(){
    const input=collect();return {...input,shelleyJoiningDates:[...quoteDates],
      ...(quoteDates.length?{shelleyAvailableDays:quoteDates.length}:{})};
  };
  document.addEventListener('DOMContentLoaded',()=>{
    const block=document.createElement('div');block.id='quoteShelleyJoiningDates';
    document.getElementById('shelleyQuoteCosts').appendChild(block);renderQuote();
    document.addEventListener('click',event=>{
      const button=event.target.closest('[data-joining-action]');if(!button)return;
      const root=button.closest('[data-joining-job]'),id=root.dataset.joiningJob;
      const job=id==='quote'?null:getJobById(id);if(id!=='quote'&&!job)return;
      let dates=id==='quote'?[...quoteDates]:P.joiningDates(job);
      if(button.dataset.joiningAction==='add'){
        const date=root.querySelector('.joining-date-input').value;
        if(!P.validDate(date)){showToast('Choose a valid joining date.');return;}
        const range=job&&P.schedule(job);
        if(range&&(date<range.start||date>range.end)){showToast('Choose a date within this job’s start and end dates.');return;}
        dates=[...new Set([...dates,date])].sort();
      }else dates=dates.filter(date=>date!==button.dataset.joiningDate);
      if(id==='quote'){
        quoteDates=dates;renderQuote();
        const field=document.getElementById('shelleyAvailableDays');field.value=dates.length||'';
        field.dispatchEvent(new Event('input',{bubbles:true}));
      }else{
        job.shelleyJoiningDates=dates;job.shelleyAvailableDays=dates.length||null;
        renderJobSheets(currentJobs);
      }
    });
  });
})();
