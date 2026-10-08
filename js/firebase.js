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

let currentAccessRole = null;
async function resolveUserAccess(user) {
  currentAccessRole = null;
  if (isLocalPreviewMode) return (currentAccessRole = 'owner');
  if (!user?.email || !user.emailVerified || user.isAnonymous) return null;
  const doc = await requireFirebase(db).collection('config').doc('allowedusers').get();
  if (!doc.exists) return null;
  const data = doc.data();
  const email = user.email.toLowerCase();
  const explicit = data.roles?.[email];
  // Explicit roles override the legacy owner allow-list, including removal.
  const role = explicit !== undefined ? explicit
    : ((data.emails || []).some(e => e.toLowerCase() === email) ? 'owner' : null);
  if (role === 'staff' && data.staffAccessReady !== true) {
    throw new Error('Staff access is awaiting Firebase security setup.');
  }
  return (currentAccessRole = ['owner', 'staff'].includes(role) ? role : null);
}
async function isUserAllowed(user) { return Boolean(await resolveUserAccess(user)); }
function requireOwnerAccess() {
  if (currentAccessRole !== 'owner') throw new Error('Owner access required.');
}

// --- Auth ---

function isMobile() {
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function signInAnonymously() {
  if (isLocalPreviewMode) return Promise.resolve(localPreviewUser);
  requireFirebase(auth);
  return auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
    .catch(() => null)
    .then(() => auth.signInAnonymously());
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
  requireOwnerAccess();
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
  requireOwnerAccess();
  return requireFirebase(db).collection('jobs');
}

async function saveJobToFirestore(job) {
  if (isLocalPreviewMode || !job.id) return;
  requireOwnerAccess();
  const { staffReports, ...ownerJob } = job;
  const batch = db.batch();
  batch.set(getJobsRef().doc(job.id), ownerJob, { merge: true });
  batch.set(db.collection('staffJobSheets').doc(job.id), buildStaffJobSheet(ownerJob));
  await batch.commit();
}

async function loadJobsFromFirestore() {
  if (isLocalPreviewMode) return StorageManager.loadJobs();
  const snapshot = await getJobsRef().orderBy('updatedAt', 'desc').get();
  const jobs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
  for (const job of jobs) {
    const reports = await db.collection('staffJobSheets').doc(job.id).collection('reports').get();
    job.staffReports = reports.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    // Replace, never merge: projections must contain only the safe allow-list.
    await db.collection('staffJobSheets').doc(job.id).set(buildStaffJobSheet(job));
  }
  return jobs;
}

async function deleteJobFromFirestore(id) {
  requireOwnerAccess();
  if (isLocalPreviewMode || !id) return;
  await db.collection('staffJobSheets').doc(id).delete();
  await getJobsRef().doc(id).delete();
}

// --- Firestore: Customers ---

function getCustomersRef() {
  requireOwnerAccess();
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
  requireOwnerAccess();
  if (isLocalPreviewMode) return;
  await requireFirebase(db).collection('config').doc('settings').set(settings);
}

async function loadSettingsFromFirestore() {
  requireOwnerAccess();
  if (isLocalPreviewMode) return null;
  const doc = await requireFirebase(db).collection('config').doc('settings').get();
  if (doc.exists) {
    return doc.data();
  }
  return null;
}

function buildStaffJobSheet(job) {
  const fields = ['singleChannelCount', 'multiChannel6Count', 'multiChannel8Count',
    'multiChannel12Count', 'multiChannel16Count'];
  const total = lines => Object.fromEntries(fields.map(field => [field,
    (lines || []).reduce((sum, line) => sum + (Number(line[field]) || 0), 0)]));
  return {
    customerName: job.customerName || '', quoteRef: job.quoteRef || '',
    proposedDate: job.proposedDate || '', status: !job.historicalJob && ['open', 'active'].includes(job.status || 'open') ? 'open' : 'closed',
    expected: total(job.plannedLines), ownerActual: total(job.actualEntries),
    serviceLevelIds: (job.settingsSnapshot?.serviceLevels || []).map(sl => sl.id),
    serviceLevels: (job.settingsSnapshot?.serviceLevels || []).map(sl => ({ id: sl.id, name: sl.name })),
  };
}

