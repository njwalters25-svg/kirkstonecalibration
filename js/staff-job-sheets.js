// This module has no dependency on owner UI, settings, jobs, quotes or localStorage.
const staffCountFields = ['singleChannelCount', 'multiChannel6Count', 'multiChannel8Count',
  'multiChannel12Count', 'multiChannel16Count'];
const staffCountLabels = ['Single', '6-channel', '8-channel', '12-channel', '16-channel'];
const staffEscape = value => String(value ?? '').replace(/[&<>"']/g,
  char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
let staffUnsubscribe = null;
async function startStaffJobSheets() {
  if (currentAccessRole !== 'staff') throw new Error('Staff access required.');
  const main = document.createElement('main');
  main.className = 'main';
  main.innerHTML = '<style>#staffSheets label{display:flex;flex-direction:column;gap:.35rem;font-weight:600}#staffSheets input,#staffSheets select{width:100%;min-width:0;box-sizing:border-box;padding:.5rem;border:1px solid #cbd5e1;border-radius:6px}#staffSheets .job-cost-grid{margin:.75rem 0}#staffSheets form{margin-top:1rem}</style><header id="staffHeader"><h1>Job Sheets</h1></header><p id="staffStatus" role="status"></p><div id="staffSheets"></div>';
  document.body.appendChild(main);
  const status = document.getElementById('staffStatus');
  staffUnsubscribe = db.collection('staffJobSheets').onSnapshot(async snapshot => {
    try {
      const cards = await Promise.all(snapshot.docs.map(async doc => {
        const job = doc.data();
        const [progress, reports] = await Promise.all([
          doc.ref.collection('progress').get(),
          doc.ref.collection('reports').where('uid', '==', getCurrentUser().uid).get(),
        ]);
        const actual = Object.fromEntries(staffCountFields.map(field => [field,
          (job.ownerActual[field] || 0) + progress.docs.reduce((sum, row) => sum + row.data()[field], 0)]));
        return { id: doc.id, job, actual, reports: reports.docs.map(row => ({ id: row.id, ...row.data() })) };
      }));
      renderStaffSheets(cards);
      status.textContent = 'Firebase connected. Save each daily record when complete.';
    } catch (error) { status.textContent = 'Could not load job sheets: ' + error.message; }
  }, error => { status.textContent = 'Access unavailable: ' + error.message; });
}
function renderStaffSheets(cards) {
  const container = document.getElementById('staffSheets');
  container.replaceChildren();
  if (!cards.length) { container.textContent = 'No job sheets have been shared yet.'; return; }
  for (const card of cards) {
    const {id, job, actual, reports} = card;
    const section = document.createElement('section');
    section.className = 'card';
    const totals = (title, values) => '<div class="job-mini-table"><strong>' + title + '</strong>'
      + staffCountFields.map((field, i) => '<span>' + staffCountLabels[i] + ': ' + values[field] + '</span>').join('') + '</div>';
    const remaining = Object.fromEntries(staffCountFields.map(field => [field, job.expected[field] - actual[field]]));
    section.innerHTML = '<h2>' + staffEscape(job.customerName) + '</h2><p>Quote reference: '
      + staffEscape(job.quoteRef) + '</p><div class="job-summary-grid">'
      + totals('Expected', job.expected) + totals('Actual', actual) + totals('Remaining', remaining) + '</div>';
    for (const report of reports) section.appendChild(staffReportForm(id, job, report));
    const add = document.createElement('button');
    add.className = 'btn-small'; add.textContent = 'Add daily record';
    add.disabled = job.status !== 'open';
    add.onclick = () => {
      section.insertBefore(staffReportForm(id, job, {
        id: crypto.randomUUID(), date: new Date().toLocaleDateString('en-CA'),
        serviceLevelId: job.serviceLevels[0]?.id || '', expense: 0,
        expenseDescription: '', partsUsed: '', partsQuantity: 0,
      }), add);
    };
    section.appendChild(add); container.appendChild(section);
  }
}
function staffReportForm(jobId, job, report) {
  const form = document.createElement('form');
  form.className = 'settings-card';
  const input = (name, label, type, value, extra = '') => '<label>' + label + '<input name="'
    + name + '" type="' + type + '" value="' + staffEscape(value ?? 0) + '" ' + extra + ' required></label>';
  form.innerHTML = '<h3>Your daily record</h3><div class="job-cost-grid">'
    + input('date', 'Date', 'date', report.date)
    + '<label>Service level<select name="serviceLevelId" required>' + job.serviceLevels.map(sl =>
      '<option value="' + staffEscape(sl.id) + '" ' + (sl.id === report.serviceLevelId ? 'selected' : '') + '>'
      + staffEscape(sl.name) + '</option>').join('') + '</select></label>'
    + staffCountFields.map((field, i) => input(field, staffCountLabels[i], 'number', report[field], 'min="0" max="100000" step="1"')).join('')
    + input('expense', 'Your expense / cost (£)', 'number', report.expense, 'min="0" max="100000" step="0.01"')
    + '<label>Expense description<input name="expenseDescription" maxlength="500" value="' + staffEscape(report.expenseDescription) + '"></label>'
    + '<label>Parts used<input name="partsUsed" maxlength="500" value="' + staffEscape(report.partsUsed) + '"></label>'
    + input('partsQuantity', 'Parts quantity', 'number', report.partsQuantity, 'min="0" max="100000" step="1"')
    + '</div><button class="btn-small" type="submit">Save daily record</button><span role="status"></span>';
  form.querySelectorAll('input,select,button').forEach(el => { el.disabled = job.status !== 'open'; });
  form.onsubmit = async event => {
    event.preventDefault();
    const button = form.querySelector('button'); const status = form.querySelector('[role="status"]');
    button.disabled = true; status.textContent = ' Saving…';
    try {
      const values = new FormData(form);
      const data = { uid: getCurrentUser().uid, date: values.get('date'), serviceLevelId: values.get('serviceLevelId'),
        expense: Number(values.get('expense')), expenseDescription: values.get('expenseDescription'),
        partsUsed: values.get('partsUsed'), partsQuantity: Number(values.get('partsQuantity')) };
      const progress = { uid: data.uid };
      for (const field of staffCountFields) { data[field] = Number(values.get(field)); progress[field] = data[field]; }
      const ref = db.collection('staffJobSheets').doc(jobId);
      const batch = db.batch();
      batch.set(ref.collection('reports').doc(report.id), data);
      batch.set(ref.collection('progress').doc(report.id), progress);
      await batch.commit();
      status.textContent = ' Saved';
      // Refresh totals after a successful save without replacing other unsaved forms.
      const rows = await ref.collection('progress').get();
      const actual = Object.fromEntries(staffCountFields.map(field => [field,
        (job.ownerActual[field] || 0) + rows.docs.reduce((sum, row) => sum + row.data()[field], 0)]));
      const tables = form.parentElement.querySelectorAll('.job-mini-table');
      [actual, Object.fromEntries(staffCountFields.map(field => [field, job.expected[field] - actual[field]]))]
        .forEach((totals, index) => tables[index + 1].querySelectorAll('span').forEach((span, i) =>
          { span.textContent = staffCountLabels[i] + ': ' + totals[staffCountFields[i]]; }));
    } catch (error) { status.textContent = ' Save failed: ' + error.message; }
    finally { button.disabled = false; }
  };
  return form;
}

