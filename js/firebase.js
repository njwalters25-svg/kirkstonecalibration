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

// --- Auth ---

function signInWithGoogle() {
  return auth.signInWithPopup(googleProvider);
}

function signOut() {
  return auth.signOut();
}

function onAuthStateChanged(callback) {
  return auth.onAuthStateChanged(callback);
}

function getCurrentUser() {
  return auth.currentUser;
}

// --- Firestore: Quotes ---

function getUserQuotesRef() {
  const user = getCurrentUser();
  if (!user) return null;
  return db.collection('users').doc(user.uid).collection('quotes');
}

async function saveQuoteToFirestore(quote) {
  const ref = getUserQuotesRef();
  if (!ref) return;
  await ref.doc(quote.id).set(quote);
}

async function loadQuotesFromFirestore() {
  const ref = getUserQuotesRef();
  if (!ref) return [];
  const snapshot = await ref.orderBy('createdAt', 'desc').get();
  return snapshot.docs.map(doc => doc.data());
}

async function deleteQuoteFromFirestore(id) {
  const ref = getUserQuotesRef();
  if (!ref) return;
  await ref.doc(id).delete();
}

// --- Firestore: Settings ---

function getUserSettingsRef() {
  const user = getCurrentUser();
  if (!user) return null;
  return db.collection('users').doc(user.uid);
}

async function saveSettingsToFirestore(settings) {
  const ref = getUserSettingsRef();
  if (!ref) return;
  await ref.set({ settings }, { merge: true });
}

async function loadSettingsFromFirestore() {
  const ref = getUserSettingsRef();
  if (!ref) return null;
  const doc = await ref.get();
  if (doc.exists && doc.data().settings) {
    return doc.data().settings;
  }
  return null;
}
