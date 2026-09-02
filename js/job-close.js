// ============================================================
// job-close.js — Close Job Sheet control + completed jobs archive
// ============================================================

(function () {
  window.closeJobSheet = function (jobId) {
    if (typeof expandedJobIds !== 'undefined' && expandedJobIds?.delete) {
      expandedJobIds.delete(jobId);
      if (typeof renderJobSheets === 'function') renderJobSheets(currentJobs);
      return;
    }
    if (typeof toggleJobDetail === 'function') toggleJobDetail(jobId);
  };

  function installCloseButtons(rootSelector = '#jobSheets') {
    document.querySelectorAll(`${rootSelector} .job-card`).forEach(card => {
      const jobId = card.dataset.id;
      const editor = card.querySelector('.job-editor');
      if (!jobId || !editor || editor.querySelector('.close-job-sheet-btn')) return;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-secondary close-job-sheet-btn';
      button.textContent = 'Close Job Sheet';
      button.addEventListener('click', () => window.closeJobSheet(jobId));

      const actions = editor.querySelector('.job-actions, .job-editor-actions, .settings-actions');
      if (actions) actions.appendChild(button);
      else {
        const row = document.createElement('div');
        row.className = 'job-close-row';
        row.appendChild(button);
        editor.appendChild(row);
      }
    });
  }

  function isCompletedJob(job) {
    return String(job?.status || '').toLowerCase() === 'completed';
  }

  function ensureArchiveUi() {
    const nav = document.querySelector('.tab-nav');
    if (nav && !nav.querySelector('[data-tab="jobArchivePanel"]')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tab-btn';
      button.dataset.tab = 'jobArchivePanel';
      button.textContent = 'Job Archive';
      nav.appendChild(button);
      button.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        button.classList.add('active');
        document.getElementById('jobArchivePanel')?.classList.add('active');
        if (typeof currentJobs !== 'undefined' && Array.isArray(currentJobs)) renderJobSheets(currentJobs);
      });
    }

    const main = document.getElementById('appMain');
    if (main && !document.getElementById('jobArchivePanel')) {
      const section = document.createElement('section');
      section.id = 'jobArchivePanel';
      section.className = 'tab-panel';
      section.innerHTML = `
        <div class="card">
          <div class="job-archive-heading">
            <div><h2>Completed Job Archive</h2><p>Completed jobs stay fully connected to the Invoice Spreadsheet and Firebase, but are kept out of the live Jobs list.</p></div>
            <span id="jobArchiveCount" class="job-archive-count"></span>
          </div>
          <div id="archiveJobSheets"></div>
        </div>`;
      main.appendChild(section);
    }
  }

  function installArchiveStyles() {
    if (document.getElementById('jobArchiveStyles')) return;
    const style = document.createElement('style');
    style.id = 'jobArchiveStyles';
    style.textContent = `
      .job-close-row{display:flex;justify-content:flex-end;margin-top:1rem}.close-job-sheet-btn{white-space:nowrap}
      .job-archive-heading{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:14px}.job-archive-heading h2{margin:0}.job-archive-heading p{margin:.35rem 0 0;color:var(--text-light);font-size:13px}.job-archive-count{background:#edf2f7;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:700;white-space:nowrap}
      @media(max-width:650px){.job-archive-heading{flex-direction:column}.job-archive-count{align-self:flex-start}}
    `;
    document.head.appendChild(style);
  }

  function installArchiveFiltering() {
    if (window.__kirkstoneJobArchiveInstalled || typeof renderJobSheets !== 'function') return;
    window.__kirkstoneJobArchiveInstalled = true;

    const originalRenderJobSheets = renderJobSheets;

    window.renderJobSheets = function archivedAwareRenderJobSheets(jobs) {
      ensureArchiveUi();
      const allJobs = Array.isArray(jobs) ? jobs : [];
      const liveJobs = allJobs.filter(job => !isCompletedJob(job));
      const completedJobs = allJobs.filter(isCompletedJob);

      // Normal Jobs page: only live / in-progress jobs.
      originalRenderJobSheets(liveJobs);
      installCloseButtons('#jobSheets');

      // Archive page: render the same real job cards, without duplicating or changing data.
      const liveContainer = document.getElementById('jobSheets');
      const archiveContainer = document.getElementById('archiveJobSheets');
      if (liveContainer && archiveContainer) {
        liveContainer.id = 'jobSheetsLive';
        archiveContainer.id = 'jobSheets';
        try {
          originalRenderJobSheets(completedJobs);
        } finally {
          archiveContainer.id = 'archiveJobSheets';
          liveContainer.id = 'jobSheets';
        }
        installCloseButtons('#archiveJobSheets');
      }

      const count = document.getElementById('jobArchiveCount');
      if (count) count.textContent = `${completedJobs.length} completed job${completedJobs.length === 1 ? '' : 's'}`;
    };

    if (typeof currentJobs !== 'undefined' && Array.isArray(currentJobs)) {
      window.renderJobSheets(currentJobs);
    }
  }

  installArchiveStyles();
  ensureArchiveUi();
  installArchiveFiltering();
  installCloseButtons('#jobSheets');

  const jobsContainer = document.getElementById('jobSheets');
  if (jobsContainer) {
    const observer = new MutationObserver(() => installCloseButtons('#jobSheets'));
    observer.observe(jobsContainer, { childList: true, subtree: true });
  }

  const archiveContainer = document.getElementById('archiveJobSheets');
  if (archiveContainer) {
    const observer = new MutationObserver(() => installCloseButtons('#archiveJobSheets'));
    observer.observe(archiveContainer, { childList: true, subtree: true });
  }
})();
