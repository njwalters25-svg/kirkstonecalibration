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

if (!window.firebase && !isLocalPreviewMode) {
  throw new Error('Firebase SDK failed to load.');
}

if (window.firebase) {
  firebase.initializeApp(firebaseConfig);
}

const auth = window.firebase ? firebase.auth() : null;
const db = window.firebase ? firebase.firestore() : null;
const googleProvider = window.firebase ? new firebase.auth.GoogleAuthProvider() : null;

const localPreviewUser = {
  displayName: 'Local preview',
  email: 'preview@kirkstone.local',
};

// --- Allowed users (stored in Firestore > config/allowedUsers) ---

async function isUserAllowed(user) {
  if (isLocalPreviewMode) return true;
  try {
    const doc = await db.collection('config').doc('allowedUsers').get();
    if (!doc.exists) return true; // No restrictions set yet — allow everyone
    const data = doc.data();
    const emails = (data.emails || []).map(e => e.toLowerCase());
    return emails.includes(user.email.toLowerCase());
  } catch {
    // If we can't read the config, allow (first-time setup)
    return true;
  }
}

// --- Auth ---

function isMobile() {
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
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
if (!isLocalPreviewMode) {
  auth.getRedirectResult().catch(() => {
    // Silently ignore — redirect result errors are non-critical
  });
}

function signOut() {
  if (isLocalPreviewMode) return Promise.resolve();
  return auth.signOut();
}

function onAuthStateChanged(callback) {
  if (isLocalPreviewMode) {
    setTimeout(() => callback(localPreviewUser), 0);
    return () => {};
  }
  return auth.onAuthStateChanged(callback);
}

function getCurrentUser() {
  if (isLocalPreviewMode) return localPreviewUser;
  return auth.currentUser;
}

// --- Firestore: Quotes (shared between all users) ---

function getQuotesRef() {
  return db.collection('quotes');
}

async function saveQuoteToFirestore(quote) {
  if (isLocalPreviewMode) return;
  const user = getCurrentUser();
  if (!user) return;
  // Tag with who saved it
  quote.savedBy = user.displayName || user.email;
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

// --- Firestore: Settings (shared) ---

async function saveSettingsToFirestore(settings) {
  if (isLocalPreviewMode) return;
  await db.collection('config').doc('settings').set(settings);
}

async function loadSettingsFromFirestore() {
  if (isLocalPreviewMode) return null;
  const doc = await db.collection('config').doc('settings').get();
  if (doc.exists) {
    return doc.data();
  }
  return null;
}
