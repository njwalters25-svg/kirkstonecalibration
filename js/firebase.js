// ============================================================
// firebase.js — Firebase init, auth, Firestore CRUD
// Uses compat libraries (no bundler needed)
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyBDo3aMzfa1amZ95xnd3wmRPoWSXIPmQK8",
  authDomain: "kirkstone-calibration.firebaseapp.com",
  projectId: "kirkstone-calibration",
  storageBucket: "kirkstone-calibration.firebasestorage.app",
  messagingSenderId: "556297442382",
  appId: "1:556297442382:web:37cf1dab88dfeefcc61f1f"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
const googleProvider = new firebase.auth.GoogleAuthProvider();

// --- Allowed users (stored in Firestore > config/allowedUsers) ---

async function isUserAllowed(user) {
  try {
    const doc = await db.collection('config').doc('allowedusers').get();
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

function signInAnonymously() {
  return auth.signInAnonymously();
}

// Handle redirect result on page load (for mobile sign-in)
auth.getRedirectResult().catch(() => {
  // Silently ignore — redirect result errors are non-critical
});

function signOut() {
  return auth.signOut();
}

function onAuthStateChanged(callback) {
  return auth.onAuthStateChanged(callback);
}

function getCurrentUser() {
  return auth.currentUser;
}

// --- Firestore: Quotes (shared between all users) ---

function getQuotesRef() {
  return db.collection('quotes');
}

async function saveQuoteToFirestore(quote) {
  const user = getCurrentUser();
  if (!user) return;
  // Tag with who saved it
  quote.savedBy = user.displayName || user.email;
  await getQuotesRef().doc(quote.id).set(quote);
}

async function loadQuotesFromFirestore() {
  const snapshot = await getQuotesRef().orderBy('createdAt', 'desc').get();
  return snapshot.docs.map(doc => doc.data());
}

async function deleteQuoteFromFirestore(id) {
  await getQuotesRef().doc(id).delete();
}

// --- Firestore: Customers ---

function getCustomersRef() {
  return db.collection('customers');
}

async function saveCustomerToFirestore(customer) {
  const user = getCurrentUser();
  if (!user) return;
  await getCustomersRef().doc(customer.id).set(customer);
}

async function loadCustomersFromFirestore() {
  const snapshot = await getCustomersRef().orderBy('name').get();
  return snapshot.docs.map(doc => doc.data());
}

// --- Firestore: Settings (shared) ---

async function saveSettingsToFirestore(settings) {
  await db.collection('config').doc('settings').set(settings);
}

async function loadSettingsFromFirestore() {
  const doc = await db.collection('config').doc('settings').get();
  if (doc.exists) {
    return doc.data();
  }
  return null;
}
