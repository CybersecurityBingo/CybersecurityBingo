import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Without a .env.local holding the VITE_FIREBASE_* values, Firebase throws on
// startup and the whole page goes blank. Skip it instead so the game still runs;
// the login buttons show "Login not set up" until the values are added.
export const firebaseConfigured = Boolean(firebaseConfig.apiKey);

if (!firebaseConfigured) {
  console.warn("Firebase is not configured: add VITE_FIREBASE_* values to frontend/.env.local");
}

// getApps()/getApp() reuse the existing app when Vite hot-reloads this file.
const app: FirebaseApp | null = firebaseConfigured
  ? getApps().length
    ? getApp()
    : initializeApp(firebaseConfig)
  : null;

export const auth: Auth | null = app ? getAuth(app) : null;

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ hd: "case.edu" });

export default app;