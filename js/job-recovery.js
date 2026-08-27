// ============================================================
// job-recovery.js — Safe job deletion, restore, and one-off Glasgow cleanup
// ============================================================

(function () {
  const TRASH_COLLECTION = 'jobTrash';
  const GLASGOW_INVOICE = 'KCSYGDC100';
  const GLASGOW_REF = 'KCSYGDC100Q';
  let cleanupRunning = false;

  function getTrashRef() {
    if (typeof isLocalPreviewMode !== 'undefined' && isLocalPreviewMode) return null;
    if (typeof db === 'undefined' || !db) throw new Error('Firebase is not available.');
    return db.collection(TRASH_COLLECTION);
  }

  async function archiveJob(job, reason) {
    if (!job || !job.id) return;
    const archived = {
      ...JSON.parse(JSON.stringify(job)),
      deletedAt: new Date().toISOString(),
      deletedReason: reason || 'Deleted by user',
      originalJobId: job.id,
    };

    if (typeof isLocalPreviewMode !== 'undefined' && isLocalPreviewMode) {
      const key = 'kirkstone_deleted_jobs';
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      const filtered = existing.filter(item => item.id !== archived.id);
      filtered.unshift(archived);
      localStorage.setItem(key, JSON.stringify(filtered));
      StorageManager.deleteJob(job.id);
      return;
    }

    await getTrashRef().doc(job.id).set(archived);
    await deleteJobFromFirestore(job.id);
  }

  async function loadDeletedJobs() {
    if (typeof isLocalPreviewMode !== 'undefined' && isLocalPreviewMode) {
      return JSON.parse(localStorage.getItem('kirkstone_deleted_jobs') || '[]');
    }
    const snapshot = await getTrashRef().orderBy('deletedAt', 'desc').limit(100).get();
    return snapshot.docs.map(doc => doc.data());
  }

  async function restoreDeletedJob(id) {
    const deletedJobs = await loadDeletedJobs();
    const job = deletedJobs.find(item => item.id === id || item.originalJobId === id);
    if (!job) {
      if (typeof showToast === 'function') showToast('Deleted job could not be found');
      return;
    }

    const restored = { ...job };
    delete restored.deletedAt;
    delete restored.deletedReason;
    delete restored.originalJobId;
    restored.updatedAt = new Date().toISOString();

    if (typeof isLocalPreviewMode !== 'undefined' && isLocalPreviewMode) {
      StorageManager.saveJob(restored);
      const remaining = deletedJobs.filter(item => item.id !== id && item.originalJobId !== id);
      localStorage.setItem('kirkstone_deleted_jobs', JSON.stringify(remaining));
    } else {
      await saveJobToFirestore(restored);
      await getTrashRef().doc(id).delete();
    }

    if (typeof refreshJobSheets === 'function') await refreshJobSheets();
    if (typeof showToast === 'function') showToast('Job sheet restored');
    await renderDeletedJobsPanel();
  }

  async function permanentlyDeleteArchivedJob(id) {
    if (!confirm('Permanently delete this archived job sheet? This cannot be undone.')) return;
    if (typeof isLocalPreviewMode !== 'undefined' && isLocalPreviewMode) {
      const deletedJobs = await loadDeletedJobs();
      const remaining = deletedJobs.filter(item => item.id !== id && item.originalJobId !== id);
      localStorage.setItem('kirkstone_deleted_jobs', JSON.stringify(remaining));
    } else {
      await getTrashRef().doc(id).delete();
    }
    if (typeof showToast === 'function') showToast('Archived job permanently deleted');
    await renderDeletedJobsPanel();
  }

  window.restoreDeletedJob = restoreDeletedJob;
  window.permanentlyDeleteArchivedJob = permanentlyDeleteArchivedJob;

  // Replace hard-delete with a recycle-bin action.
  window.deleteJobSheet = async function deleteJobSheetSafe(jobId) {
    const job = typeof getJobById === 'function' ? getJobById(jobId) : null;
    if (!job) return;
    if (!confirm('Move this job sheet to Recently Deleted? You can restore it later if needed.')) return;

    await archiveJob(job, 'Deleted by user');
    StorageManager.deleteJob(jobId);
    if (typeof refreshJobSheets === 'function') await refreshJobSheets();
    if (typeof renderQuoteHistory === 'function') renderQuoteHistory(currentQuotes, currentSettings);
    if (typeof showToast === 'function') showToast('Job sheet moved to Recently Deleted');
  };

  function formatDeletedDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  async function renderDeletedJobsPanel() {
    const panel = document.getElementById('recentlyDeletedJobsPanel');
    if (!panel || panel.style.display === 'none') return;

    panel.innerHTML = '<div class="empty-state compact">Loading recently deleted job sheets...</div>';
    try {
      const jobs = await loadDeletedJobs();
      if (!jobs.length) {
        panel.innerHTML = '<div class="empty-state compact">No deleted job sheets.</div>';
        return;
      }
      panel.innerHTML = jobs.map(job => `
        <div style="display:flex;justify-content:space-between;gap:1rem;align-items:center;border:1px solid #e2e8f0;border-radius:8px;padding:0.75rem;margin-top:0.5rem;flex-wrap:wrap;">
          <div>
            <strong>${escapeHtml(job.customerName || 'Unnamed job')}</strong>
            <div style="font-size:0.8rem;color:#718096;">
              ${job.quoteRef ? `Ref ${escapeHtml(job.quoteRef)} · ` : ''}${job.invoiceNumber ? `Invoice ${escapeHtml(job.invoiceNumber)} · ` : ''}Deleted ${escapeHtml(formatDeletedDate(job.deletedAt))}
            </div>
            ${job.deletedReason ? `<div style="font-size:0.75rem;color:#718096;">${escapeHtml(job.deletedReason)}</div>` : ''}
          </div>
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
            <button type="button" class="btn-small btn-quote" onclick="restoreDeletedJob('${escapeJsString(job.id)}')">Restore</button>
            <button type="button" class="btn-small btn-delete" onclick="permanentlyDeleteArchivedJob('${escapeJsString(job.id)}')">Delete permanently</button>
          </div>
        </div>`).join('');
    } catch (error) {
      console.error('Could not load deleted jobs', error);
      panel.innerHTML = '<div class="empty-state compact">Could not load recently deleted job sheets.</div>';
    }
  }

  function installRecoveryUi() {
    const jobsPanelCard = document.querySelector('#jobsPanel .card');
    const heading = jobsPanelCard?.querySelector('h2');
    if (!jobsPanelCard || !heading || document.getElementById('recentlyDeletedJobsToggle')) return;

    const toggle = document.createElement('button');
    toggle.id = 'recentlyDeletedJobsToggle';
    toggle.type = 'button';
    toggle.className = 'btn btn-secondary';
    toggle.style.marginBottom = '1rem';
    toggle.textContent = 'Recently Deleted Jobs';

    const panel = document.createElement('div');
    panel.id = 'recentlyDeletedJobsPanel';
    panel.style.display = 'none';
    panel.style.marginBottom = '1rem';

    toggle.addEventListener('click', async () => {
      const opening = panel.style.display === 'none';
      panel.style.display = opening ? 'block' : 'none';
      toggle.textContent = opening ? 'Hide Recently Deleted Jobs' : 'Recently Deleted Jobs';
      if (opening) await renderDeletedJobsPanel();
    });

    heading.insertAdjacentElement('afterend', toggle);
    toggle.insertAdjacentElement('afterend', panel);
  }

  function isTargetGlasgowJob(job) {
    if (!job) return false;
    const invoice = String(job.invoiceNumber || '').trim().toUpperCase();
    const ref = String(job.quoteRef || '').trim().toUpperCase();
    const snapPrefix = String(job.quoteSnapshot?.refPrefix || '').trim().toUpperCase();
    const snapNumber = Number(job.quoteSnapshot?.refNumber);
    return invoice === GLASGOW_INVOICE
      || ref === GLASGOW_REF
      || (snapPrefix === 'SYGDC' && snapNumber === 100);
  }

  async function cleanupGlasgowDuplicates() {
    if (cleanupRunning || typeof currentJobs === 'undefined' || !Array.isArray(currentJobs)) return;
    const matches = currentJobs.filter(isTargetGlasgowJob);
    if (matches.length <= 1) return;

    cleanupRunning = true;
    try {
      const aug27 = matches.filter(job => String(job.updatedAt || '').startsWith('2026-08-27'));
      const candidates = aug27.length ? aug27 : matches;
      const keep = [...candidates].sort((a, b) =>
        new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime()
      )[0];

      const duplicates = matches.filter(job => job.id !== keep.id);
      for (const job of duplicates) {
        await archiveJob(job, `Duplicate Sygnature Glasgow recovery record; kept ${keep.id} updated ${keep.updatedAt || '27 Aug 2026'}`);
        StorageManager.deleteJob(job.id);
      }

      if (typeof refreshJobSheets === 'function') await refreshJobSheets();
      if (typeof showToast === 'function') showToast(`Removed ${duplicates.length} duplicate Glasgow job sheet${duplicates.length === 1 ? '' : 's'} to Recently Deleted`);
    } catch (error) {
      console.error('Glasgow duplicate cleanup failed', error);
    } finally {
      cleanupRunning = false;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    installRecoveryUi();

    const jobsContainer = document.getElementById('jobSheets');
    if (jobsContainer) {
      const observer = new MutationObserver(() => installRecoveryUi());
      observer.observe(jobsContainer, { childList: true, subtree: true });
    }

    // Run only as a cleanup. It never creates records; it only archives exact KCSYGDC100 duplicates.
    let attempts = 0;
    const timer = setInterval(async () => {
      attempts += 1;
      try {
        if (typeof currentJobs !== 'undefined' && Array.isArray(currentJobs) && currentJobs.length) {
          await cleanupGlasgowDuplicates();
          const remaining = currentJobs.filter(isTargetGlasgowJob);
          if (remaining.length <= 1) clearInterval(timer);
        }
        if (attempts >= 30) clearInterval(timer);
      } catch (error) {
        console.error('Job recovery startup check failed', error);
        if (attempts >= 30) clearInterval(timer);
      }
    }, 1000);
  });
})();
