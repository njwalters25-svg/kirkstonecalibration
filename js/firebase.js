// ============================================================
// firebase.js — Firebase init, auth, Firestore CRUD
// Uses compat libraries (no bundler needed)
// ============================================================

const isLocalPreviewMode = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  && new URLSearchParams(window.location.search).has('preview');

const firebaseConfig = {
  apiKey: "AIzaSyBDo3aMzfa1amZ95xnd3wmRPoWSXIPmQK8",
  authDomain: "kirkstone-calibration.firebaseapp.com",
  projectId: "kirkstone-calibration",
  storageBucket: "kirkstone-calibration.firebasestorage.app",
  messagingSenderId: "556297442382",
  appId: "1:556297442382:web:37cf1dab88dfeefcc61f1f"
};

const firebaseLoadError = (!window.firebase && !isLocalPreviewMode)
  ? new Error('Firebase SDK failed to load.')
  : null;

if (window.firebase) {
  firebase.initializeApp(firebaseConfig);
}

const auth = window.firebase && firebase.auth ? firebase.auth() : null;
const db = window.firebase && firebase.firestore ? firebase.firestore() : null;
const googleProvider = window.firebase && firebase.auth ? new firebase.auth.GoogleAuthProvider() : null;

const localPreviewUser = {
  displayName: 'Local preview',
  email: 'preview@kirkstone.local',
};

function requireFirebase(service) {
  if (firebaseLoadError) throw firebaseLoadError;
  if (!service) throw new Error('Firebase is not available.');
  return service;
}

// --- Allowed users (stored in Firestore > config/allowedUsers) ---

async function isUserAllowed(user) {
  if (isLocalPreviewMode) return true;
  try {
    const doc = await requireFirebase(db).collection('config').doc('allowedusers').get();
    if (!doc.exists) return false;
    const data = doc.data();
    const emails = (data.emails || []).map(e => e.toLowerCase());
    return emails.includes(user.email.toLowerCase());
  } catch {
    return false;
  }
}

// --- Auth ---

function isMobile() {
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Apache performs the visible login. Only the server can assert the owner role.
let hostingSignInPending = null;
async function signInWithHostingAccount() {
  if (isLocalPreviewMode) return localPreviewUser;
  if (hostingSignInPending) return hostingSignInPending;
  hostingSignInPending = (async () => {
    const endpoint = 'api/owner-token.php';
    const options = { credentials: 'same-origin', cache: 'no-store' };
    const session = await fetch(endpoint, options);
    if (!session.ok) throw new Error('Your hosting account could not be verified.');
    const { csrf } = await session.json();
    const response = await fetch(endpoint, { ...options, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: '{}' });
    if (!response.ok) throw new Error('Your hosting account could not be verified.');
    const { token } = await response.json();
    await requireFirebase(auth).setPersistence(firebase.auth.Auth.Persistence.NONE);
    return auth.signInWithCustomToken(token);
  })();
  try { return await hostingSignInPending; } finally { hostingSignInPending = null; }
}

if (!isLocalPreviewMode) {
  // Rules bound each bridge authentication to an hour; refresh only through Apache.
  setInterval(() => signInWithHostingAccount().catch(() => {
    auth?.signOut();
    if (typeof setCloudStatus === 'function') setCloudStatus('error', 'Login could not be refreshed. Reload to reconnect.');
  }), 40 * 60 * 1000);
}

function signInWithGoogle() {
  if (isLocalPreviewMode) {
    return Promise.resolve(localPreviewUser);
  }
  if (isMobile()) {
    return auth.signInWithRedirect(googleProvider);
  }
  return auth.signInWithPopup(googleProvider);
}

// Handle redirect result on page load (for mobile sign-in)
if (!isLocalPreviewMode && auth) {
  auth.getRedirectResult().catch(() => {
    // Silently ignore — redirect result errors are non-critical
  });
}

function signOut() {
  if (isLocalPreviewMode) return Promise.resolve();
  requireFirebase(auth);
  return auth.signOut();
}

function onAuthStateChanged(callback) {
  if (isLocalPreviewMode) {
    setTimeout(() => callback(localPreviewUser), 0);
    return () => {};
  }
  requireFirebase(auth);
  return auth.onAuthStateChanged(callback);
}

function getCurrentUser() {
  if (isLocalPreviewMode) return localPreviewUser;
  return auth ? auth.currentUser : null;
}

// --- Firestore: Quotes (shared between all users) ---

function getQuotesRef() {
  return requireFirebase(db).collection('quotes');
}

async function saveQuoteToFirestore(quote) {
  if (isLocalPreviewMode) return;
  const user = getCurrentUser();
  // Tag with who saved it
  quote.savedBy = user ? (user.displayName || user.email) : (quote.savedBy || 'Kirkstone app');
  await getQuotesRef().doc(quote.id).set(quote);
}

async function updateQuoteInFirestore(quote) {
  if (isLocalPreviewMode || !quote.id) return;
  await getQuotesRef().doc(quote.id).set(quote, { merge: true });
}

async function loadQuotesFromFirestore() {
  if (isLocalPreviewMode) return StorageManager.loadQuoteHistory();
  const snapshot = await getQuotesRef().orderBy('createdAt', 'desc').get();
  return snapshot.docs.map(doc => doc.data());
}

async function deleteQuoteFromFirestore(id) {
  if (isLocalPreviewMode) return;
  await getQuotesRef().doc(id).delete();
}

async function updateQuoteSettingsSnapshotInFirestore(id, settingsSnapshot) {
  if (isLocalPreviewMode || !id) return;
  await getQuotesRef().doc(id).set({ settingsSnapshot }, { merge: true });
}

// --- Firestore: Jobs ---

function getJobsRef() {
  return requireFirebase(db).collection('jobs');
}

async function saveJobToFirestore(job) {
  if (isLocalPreviewMode || !job.id) return;
  const ref = getJobsRef().doc(job.id);
  await requireFirebase(db).runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (snapshot.exists && ((snapshot.data().employeeRevision || '') !== (job.employeeRevision || '')
      || (snapshot.data().employeeUpdatedAt || '') !== (job.employeeUpdatedAt || ''))) {
      throw new Error('Shelley has updated this job. Refresh the job sheets before saving your changes.');
    }
    transaction.set(ref, job, { merge: true });
  });
}

async function loadJobsFromFirestore() {
  if (isLocalPreviewMode) return StorageManager.loadJobs();
  const snapshot = await getJobsRef().orderBy('updatedAt', 'desc').get();
  return snapshot.docs.map(doc => doc.data());
}

async function deleteJobFromFirestore(id) {
  if (isLocalPreviewMode || !id) return;
  await getJobsRef().doc(id).delete();
}

// --- Firestore: Customers ---

function getCustomersRef() {
  return requireFirebase(db).collection('customers');
}

async function saveCustomerToFirestore(customer) {
  if (isLocalPreviewMode) return;
  await getCustomersRef().doc(customer.id).set(customer);
}

async function loadCustomersFromFirestore() {
  if (isLocalPreviewMode) return StorageManager.loadCustomers();
  const snapshot = await getCustomersRef().orderBy('name').get();
  return snapshot.docs.map(doc => doc.data());
}

// --- Firestore: Settings (shared) ---

async function saveSettingsToFirestore(settings) {
  if (isLocalPreviewMode) return;
  await requireFirebase(db).collection('config').doc('settings').set(settings);
}

async function loadSettingsFromFirestore() {
  if (isLocalPreviewMode) return null;
  const doc = await requireFirebase(db).collection('config').doc('settings').get();
  if (doc.exists) {
    return doc.data();
  }
  return null;
}

