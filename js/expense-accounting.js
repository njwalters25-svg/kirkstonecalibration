/* Pure, testable mileage accounting helpers. No Firebase or DOM dependencies. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.KirkstoneExpenseAccounting=api;
})(typeof globalThis!=='undefined'?globalThis:null,function(){
  'use strict';
  const round=v=>Math.round((Number(v)+Number.EPSILON)*100)/100;
  function normalizeClaim(raw){
    if(!raw||!raw.id)throw Error('Claim ID required');
    if(!['owner','shelley'].includes(raw.employee))throw Error('Unknown employee');
    const miles=Number(raw.approvedMiles??raw.miles),rate=Number(raw.approvedRate??raw.rate??0.55);
    if(!Number.isFinite(miles)||miles<0||!Number.isFinite(rate)||rate<0)throw Error('Invalid miles or rate');
    return {...raw,miles,rate,amount:round(miles*rate)};
  }
  function approvedJobExpenses(claims,jobId){
    const seen=new Set();const selected=[];
    for(const claim of claims||[]){
      if(claim.jobId!==jobId||claim.status!=='approved'&&claim.status!=='paid')continue;
      if(seen.has(claim.id))continue;
      seen.add(claim.id);selected.push(normalizeClaim(claim));
    }
    return {claims:selected,total:round(selected.reduce((sum,c)=>sum+c.amount,0))};
  }
  function reconcileActualCosts({baseCosts=0,estimatedEmployeeMileage=0,claims=[],jobId}){
    const actual=approvedJobExpenses(claims,jobId);
    const base=Number(baseCosts),estimate=Number(estimatedEmployeeMileage);
    if(!Number.isFinite(base)||!Number.isFinite(estimate)||estimate<0)throw Error('Invalid baseline costs');
    // Estimated employee mileage is removed once and replaced by approved actual claims.
    return {baseCosts:round(base),estimatedEmployeeMileage:round(estimate),approvedExpenses:actual.total,
      actualCosts:round(base-estimate+actual.total),claimIds:actual.claims.map(c=>c.id)};
  }
  function reimbursementOutstanding(claims,employee){
    const seen=new Set();let total=0;
    for(const c of claims||[]){
      if(c.employee!==employee||c.status!=='approved'||seen.has(c.id))continue;
      seen.add(c.id);total+=normalizeClaim(c).amount;
    }
    return round(total);
  }
  function canTransition(from,to,actor){
    if(actor!=='owner')return false;
    return (from==='submitted'&&['approved','rejected'].includes(to))||(from==='approved'&&to==='paid');
  }
  return {round,normalizeClaim,approvedJobExpenses,reconcileActualCosts,reimbursementOutstanding,canTransition};
});
