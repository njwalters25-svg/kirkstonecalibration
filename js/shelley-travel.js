// Independent employee route; saved quotes retain their manual fuel until edited.
(() => {
  let route=null,version=1,generation=0,timer;
  const el=id=>document.getElementById(id),clean=value=>String(value||'').replace(/\s/g,'').toUpperCase();
  const origin=()=>KirkstonePlanning.defaultOrigin('shelley',currentSettings);
  const destination=()=>el('destinationPostcode').value.trim();
  const hasShelley=()=>el('quoteAssignee').value==='shelley'||(el('secondPerson').checked&&el('secondPersonKind').value==='shelley');
  const separate=()=>el('shelleyTravelsSeparately').checked;
  const valid=()=>validShelleyRoute({shelleyRoute:route,shelleyHomePostcode:origin(),destinationPostcode:destination()});
  function status(message){el('shelleyRouteStatus').textContent=message;}
  function refreshStatus(){
    if(!separate()){status('Travelling together: no automatic extra fuel.');return;}
    if(valid())status(origin()+' → '+destination()+': '+route.distanceMiles+' miles one way, about '+route.durationMinutes+' minutes. Fuel uses the saved mileage cost rate.');
    else status('Enter the job postcode to calculate Shelley’s own route, or enter a fuel override.');
  }
  const collect=window.collectQuoteInputFromForm;
  window.collectQuoteInputFromForm=()=>({...collect(),shelleyTravelVersion:version,
    shelleyTravelsSeparately:separate(),shelleyHomePostcode:origin(),shelleyRoute:valid()?route:null,
    shelleyFuelCost:el('shelleyFuelCost').value===''?null:Math.max(0,Number(el('shelleyFuelCost').value)||0)});
  const restore=window.restoreQuotePlanning;
  window.restoreQuotePlanning=function(quote={}){
    generation++;clearTimeout(timer);restore(quote);
    version=quote.shelleyTravelVersion===1?1:(quote.id||quote.pipetteLines?0:1);
    route=quote.shelleyRoute||null;el('shelleyTravelsSeparately').checked=quote.shelleyTravelsSeparately!==false;
    refreshStatus();
  };
  async function calculate(){
    const current=++generation;
    if(!hasShelley()||!separate()){refreshStatus();return false;}
    if(!destination()){route=null;refreshStatus();return false;}
    const from=origin(),to=destination();status('Calculating Shelley’s route…');
    try{
      const result=await calculateRoute(from,to);
      if(current!==generation||clean(from)!==clean(origin())||clean(to)!==clean(destination()))return false;
      route={origin:from,destination:to,distanceMiles:result.distanceMiles,durationMinutes:result.durationMinutes};
      if(!valid())throw new Error('The route service returned an invalid route.');
      version=1;refreshStatus();recalculate();autoSaveForm();return true;
    }catch(error){
      if(current===generation){route=null;status('Shelley’s route could not be calculated: '+error.message+'. Retry or enter a fuel override.');recalculate();autoSaveForm();}
      return false;
    }
  }
  function schedule(){clearTimeout(timer);if(version===1&&hasShelley()&&separate())timer=setTimeout(calculate,350);}
  document.addEventListener('DOMContentLoaded',()=>{
    // Main form restoration may already have run through our restore hook.
    refreshStatus();
    el('calcShelleyRoute').addEventListener('click',()=>{version=1;calculate();});
    el('calcRoute').addEventListener('click',()=>{if(version===1)schedule();});
    el('quoteForm').addEventListener('input',event=>{
      if(event.target.id==='destinationPostcode'){
        generation++;route=null;refreshStatus();
      }
      if(event.target.closest('#shelleyQuoteCosts'))version=1;
    },true);
    el('quoteForm').addEventListener('change',event=>{
      const id=event.target.id;
      if(['quoteAssignee','secondPerson','secondPersonKind','shelleyTravelsSeparately','shelleyFuelCost','shelleyAvailableDays'].includes(id))version=1;
      if(['destinationPostcode','quoteAssignee','secondPerson','secondPersonKind','shelleyTravelsSeparately','shelleyFuelCost'].includes(id))schedule();
      if(id==='shelleyTravelsSeparately')refreshStatus();
    },true);
    // Never silently save a zero estimate after a failed or unfinished lookup.
    for(const id of ['saveQuote','updateSavedQuote'])el(id)?.addEventListener('click',event=>{
      const input=collectQuoteInputFromForm(),result=calculateQuote(input,getCalculationSettings());
      if(!result.shelleyFuelPending)return;
      event.preventDefault();event.stopImmediatePropagation();
      showToast('Calculate Shelley’s route or enter a fuel override before saving.');version=1;calculate();
    },true);
    window.refreshShelleyRoute=calculate;
  });
})();
