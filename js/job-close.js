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

  function findJob(jobId) {
    if (typeof currentJobs === 'undefined' || !Array.isArray(currentJobs)) return null;
    return currentJobs.find(job => String(job.id) === String(jobId)) || null;
  }

  window.completeAndArchiveJob = async function (jobId, button) {
    const job = findJob(jobId);
    if (!job) return;
    if (!window.confirm(`Complete and archive ${job.customerName || job.invoiceNumber || 'this job'}?\n\nIt will stay connected to the Invoice Spreadsheet and Annual Summary.`)) return;

    const originalText = button?.textContent;
    if (button) {
      button.disabled = true;
      button.textContent = 'Archiving...';
    }

    try {
      job.status = 'completed';
      job.completedAt = job.completedAt || new Date().toISOString();
      job.updatedAt = new Date().toISOString();

      if (typeof StorageManager !== 'undefined' && typeof StorageManager.saveJob === 'function') {
        StorageManager.saveJob(job);
      }
      if (typeof saveJobToFirestore === 'function' && !(typeof isLocalPreviewMode !== 'undefined' && isLocalPreviewMode)) {
        await saveJobToFirestore(job);
      }

      if (typeof expandedJobIds !== 'undefined' && expandedJobIds?.delete) expandedJobIds.delete(jobId);
      if (typeof renderJobSheets === 'function') renderJobSheets(currentJobs);
      if (typeof renderInvoiceSpreadsheet === 'function') renderInvoiceSpreadsheet();
      if (typeof renderAnnualSummary === 'function') renderAnnualSummary();
      if (typeof showToast === 'function') showToast('Job completed and moved to Job Archive.');
    } catch (error) {
      console.error('Could not archive job', error);
      if (button) {
        button.disabled = false;
        button.textContent = originalText || 'Complete Job & Archive';
      }
      if (typeof showToast === 'function') showToast('Could not archive job. Please try again.');
      else window.alert('Could not archive job. Please try again.');
    }
  };

  function installJobButtons(rootSelector = '#jobSheets') {
    document.querySelectorAll(`${rootSelector} .job-card`).forEach(card => {
      const jobId = card.dataset.id;
      const editor = card.querySelector('.job-editor');
      if (!jobId || !editor) return;

      const actions = editor.querySelector('.job-actions, .job-editor-actions, .settings-actions');
      let fallbackRow = editor.querySelector('.job-close-row');
      if (!actions && !fallbackRow) {
        fallbackRow = document.createElement('div');
        fallbackRow.className = 'job-close-row';
        editor.appendChild(fallbackRow);
      }
      const target = actions || fallbackRow;

      if (!editor.querySelector('.close-job-sheet-btn')) {
        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'btn btn-secondary close-job-sheet-btn';
        closeButton.textContent = 'Close Job Sheet';
        closeButton.addEventListener('click', () => window.closeJobSheet(jobId));
        target.appendChild(closeButton);
      }

      const job = findJob(jobId);
      if (rootSelector === '#jobSheets' && job && !isCompletedJob(job) && !editor.querySelector('.complete-archive-job-btn')) {
        const completeButton = document.createElement('button');
        completeButton.type = 'button';
        completeButton.className = 'btn btn-primary complete-archive-job-btn';
        completeButton.textContent = 'Complete Job & Archive';
        completeButton.addEventListener('click', () => window.completeAndArchiveJob(jobId, completeButton));
        target.appendChild(completeButton);
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
      .job-close-row{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:1rem}.close-job-sheet-btn,.complete-archive-job-btn{white-space:nowrap}
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

      originalRenderJobSheets(liveJobs);
      installJobButtons('#jobSheets');

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
        installJobButtons('#archiveJobSheets');
      }

      const count = document.getElementById('jobArchiveCount');
      if (count) count.textContent = `${completedJobs.length} completed job${completedJobs.length === 1 ? '' : 's'}`;
    };

    if (typeof currentJobs !== 'undefined' && Array.isArray(currentJobs)) window.renderJobSheets(currentJobs);
  }

  installArchiveStyles();
  ensureArchiveUi();
  installArchiveFiltering();
  installJobButtons('#jobSheets');

  const jobsContainer = document.getElementById('jobSheets');
  if (jobsContainer) {
    const observer = new MutationObserver(() => installJobButtons('#jobSheets'));
    observer.observe(jobsContainer, { childList: true, subtree: true });
  }

  const archiveContainer = document.getElementById('archiveJobSheets');
  if (archiveContainer) {
    const observer = new MutationObserver(() => installJobButtons('#archiveJobSheets'));
    observer.observe(archiveContainer, { childList: true, subtree: true });
  }
})();
