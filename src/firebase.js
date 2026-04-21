// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";


import { getStorage } from "firebase/storage";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAuwCEuwtmQywC_W6xzlEM8F1VgcBvisPY",
  authDomain: "crisissenseai.firebaseapp.com",
  projectId: "crisissenseai",
  storageBucket: "crisissenseai.firebasestorage.app",
  messagingSenderId: "10031778201",
  appId: "1:10031778201:web:db240dd3e7e4c62b076b08",
  measurementId: "G-93ZLMV51PB"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
//const analytics = getAnalytics(app); 
export const db = getFirestore(app);
export const storage = getStorage(app);

// 🔐 AUTH
export const auth = getAuth();
export const provider = new GoogleAuthProvider();