import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "***REMOVED***",
  authDomain: "fort-knox-6978d.firebaseapp.com",
  projectId: "fort-knox-6978d",
  storageBucket: "fort-knox-6978d.firebasestorage.app",
  messagingSenderId: "781820801322",
  appId: "1:781820801322:web:5ce5d8ac0c877886626e53",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
