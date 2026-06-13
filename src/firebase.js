import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const parseFirebaseConfig = (rawStr) => {
  if (!rawStr) {
    throw new Error("VITE_FIREBASE_CONFIG environment variable is not defined.");
  }
  let str = rawStr.trim();
  if (str.includes("{")) {
    str = str.substring(str.indexOf("{"));
  }
  if (str.endsWith(";")) {
    str = str.slice(0, -1);
  }
  str = str.trim();

  try {
    return JSON.parse(str);
  } catch (e) {
    try {
      // Fallback for JS object literal snippets (e.g., from copy-pasting the Firebase Console)
      return (new Function(`return (${str})`))();
    } catch (err) {
      console.error("Failed to parse VITE_FIREBASE_CONFIG:", rawStr);
      throw new Error(`Invalid VITE_FIREBASE_CONFIG format: ${err.message}`);
    }
  }
};

const firebaseConfig = parseFirebaseConfig(import.meta.env.VITE_FIREBASE_CONFIG);

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
