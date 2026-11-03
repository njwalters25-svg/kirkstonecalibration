// Targeted reference-only repair. Never recalculate or replace financial snapshots.
(function () {
  if (window.__fibrofindNov2026Repair) return;
  window.__fibrofindNov2026Repair = true;
  const norm = value => String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  const oldRef = 'KCGBOF100Q', newRef = 'KCGBOF101Q', invoice = 'KCGBOF101';
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);
  function refs(record) {
    if (!record) return [];
    return [record.quoteRef, record.reference, record.invoiceNumber,
      norm(record.refPrefix) === 'GBOF' ? `KCGBOF${record.refNumber}Q` : '']
      .map(norm);
  }
  function target(record) {
    return /^greiner bio-one ltd\s*[-–—]\s*fibrofind$/i.test(String(record?.customerName || '').trim())
      && record.proposedDate === '2026-11'
      && refs(record).some(ref => ref === oldRef || ref === newRef)
      && (record.totalPipettes == null || Number(record.totalPipettes) === 54)
      && (record.totalQuotePrice == null || Number(record.totalQuotePrice) === 1047);
  }
  function plan(quotes, jobs) {
    const targets = quotes.filter(target);
    if (!targets.length) return [];
    if (targets.length !== 1) throw new Error('Ambiguous November Fibrofind quote');
    const quote = targets[0];
    const linked = jobs.filter(job => {
      const direct = job.quoteId === quote.id || job.quoteSnapshot?.id === quote.id;
      if (direct && (job.quoteSnapshot?.proposedDate && job.quoteSnapshot.proposedDate !== '2026-11'
        || job.proposedDate && job.proposedDate !== '2026-11'
        || job.quoteId && job.quoteId !== quote.id)) {
        throw new Error('Conflicting Fibrofind job identity');
      }
      // Never link by the duplicated 100Q reference alone.
      return direct || (!job.quoteId && target(job.quoteSnapshot));
    });
    if (!linked.length) throw new Error('No unambiguous linked November Fibrofind job');
    const uses101 = record => refs(record).some(ref => /^KCGBOF0*101(?:Q|A)?$/.test(ref));
    if (quotes.some(q => q !== quote && uses101(q))
      || jobs.some(j => !linked.includes(j) && [j, j.quoteSnapshot, j.invoiceSpreadsheetSnapshot].some(uses101))) {
      throw new Error('GBOF 101 is already used by another quote/job; no records changed');
    }
    const changes = [];
    function add(collection, record, patch) {
      const changed = Object.fromEntries(Object.entries(patch).filter(([key, value]) => {
        const current = key.split('.').reduce((obj, part) => obj?.[part], record);
        return current !== value;
      }));
      if (Object.keys(changed).length) changes.push({ collection, id: record.id, patch: changed });
    }
    const quotePatch = { refPrefix: 'GBOF', refNumber: 101, quoteRef: newRef };
    if (own(quote, 'reference')) quotePatch.reference = newRef;
    add('quotes', quote, quotePatch);
    linked.forEach(job => {
      const patch = { quoteRef: newRef, invoiceNumber: invoice };
      if (own(job, 'reference')) patch.reference = newRef;
      if (job.quoteSnapshot) {
        Object.assign(patch, { 'quoteSnapshot.refPrefix': 'GBOF', 'quoteSnapshot.refNumber': 101,
          'quoteSnapshot.quoteRef': newRef });
        if (own(job.quoteSnapshot, 'reference')) patch['quoteSnapshot.reference'] = newRef;
      }
      if (job.invoiceSpreadsheetSnapshot) {
        patch['invoiceSpreadsheetSnapshot.invoiceNumber'] = invoice;
        if (own(job.invoiceSpreadsheetSnapshot, 'quoteRef')) patch['invoiceSpreadsheetSnapshot.quoteRef'] = newRef;
      }
      add('jobs', job, patch);
    });
    if (changes.some(change => !change.id)) throw new Error('Missing record ID');
    return changes;
  }
  // Pure planner is also used by the regression tests.
  window.planFibrofindNov2026Repair = plan;
  let running = false, completed = false;
  async function reconcile() {
    if (running || completed || typeof isLocalPreviewMode === 'undefined' || isLocalPreviewMode) return;
    const status = document.getElementById('cloudStatus');
    if (!status?.classList.contains('cloud-status-ready') || typeof db === 'undefined' || !db) return;
    running = true;
    try {
      // Unfiltered server reads include legacy records without createdAt/updatedAt.
      const [quoteDocs, jobDocs] = await Promise.all([
        db.collection('quotes').get({ source: 'server' }), db.collection('jobs').get({ source: 'server' })
      ]);
      const entries = snapshot => snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      const quotes = entries(quoteDocs), jobs = entries(jobDocs);
      const changes = plan(quotes, jobs);
      if (changes.length) {
        // Re-read every inspected document in a transaction: concurrent edits cause a retry/abort.
        await db.runTransaction(async transaction => {
          const docs = [...quoteDocs.docs.map(doc => ({ collection: 'quotes', doc })),
            ...jobDocs.docs.map(doc => ({ collection: 'jobs', doc }))];
          const fresh = await Promise.all(docs.map(({ doc }) => transaction.get(doc.ref)));
          if (fresh.some(doc => !doc.exists)) throw new Error('Records changed during repair; reload to retry');
          const latest = collection => fresh.filter((_, i) => docs[i].collection === collection)
            .map(doc => ({ ...doc.data(), id: doc.id }));
          const checked = plan(latest('quotes'), latest('jobs'));
          checked.forEach(change => transaction.update(db.collection(change.collection).doc(change.id), change.patch));
        });
        await refreshQuoteHistory();
        await refreshJobSheets();
        if (typeof renderInvoiceSpreadsheet === 'function') renderInvoiceSpreadsheet();
        if (typeof loadedQuoteId !== 'undefined' && quotes.some(q => q.id === loadedQuoteId && target(q))
          && typeof restoreRefFields === 'function') restoreRefFields('GBOF', 101);
        if (typeof showToast === 'function') showToast('November Fibrofind quote and invoice changed to GBOF101');
      }
      completed = true;
    } catch (error) {
      completed = true;
      console.error('November Fibrofind reference repair stopped safely', error);
      if (typeof showToast === 'function') showToast(`Fibrofind reference repair stopped: ${error.message}`);
    } finally { running = false; }
  }
  const status = document.getElementById('cloudStatus');
  if (status) new MutationObserver(reconcile).observe(status, { attributes: true, childList: true, subtree: true });
  if (document.readyState === 'complete') reconcile();
  else window.addEventListener('load', reconcile, { once: true });
})();
