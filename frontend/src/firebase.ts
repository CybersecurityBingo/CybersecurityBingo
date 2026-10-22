import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBeirHO3QVGX7_AP79uUh3NplfF0QEYvis",
  authDomain: "bingo-7280b.firebaseapp.com",
  projectId: "bingo-7280b",
  storageBucket: "bingo-7280b.firebasestorage.app",
  messagingSenderId: "783519997523",
  appId: "1:783519997523:web:46ae7c82a393e271a370a6",
  measurementId: "G-MJVHBVJ38P",
};

// getApps()/getApp() reuse the existing app when Vite hot-reloads this file.
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);

// Only a hint for the Google popup; the backend enforces case.edu.
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ hd: "case.edu" });
