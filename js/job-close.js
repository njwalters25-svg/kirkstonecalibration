// ============================================================
// job-close.js — Add an explicit Close Job Sheet control
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

  function installCloseButtons() {
    document.querySelectorAll('#jobSheets .job-card').forEach(card => {
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

  function installStyles() {
    if (document.getElementById('jobCloseStyles')) return;
    const style = document.createElement('style');
    style.id = 'jobCloseStyles';
    style.textContent = '.job-close-row{display:flex;justify-content:flex-end;margin-top:1rem}.close-job-sheet-btn{white-space:nowrap}';
    document.head.appendChild(style);
  }

  installStyles();
  installCloseButtons();

  const jobsContainer = document.getElementById('jobSheets');
  if (jobsContainer) {
    const observer = new MutationObserver(() => installCloseButtons());
    observer.observe(jobsContainer, { childList: true, subtree: true });
  }
})();
