import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBzlMdu5SOkx-m4iD4NlAq_tjvGKpMpg4A",
  authDomain: "city-contacts-app.firebaseapp.com",
  databaseURL: "https://city-contacts-app-default-rtdb.firebaseio.com",
  projectId: "city-contacts-app",
  storageBucket: "city-contacts-app.firebasestorage.app",
  messagingSenderId: "543341321882",
  appId: "1:543341321882:web:37698af956fa0962f08923"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
