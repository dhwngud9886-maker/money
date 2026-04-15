import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyASCCei71izm2P7czo4OmsQeyDfJp4DM1Q",
  authDomain: "money-4cf36.firebaseapp.com",
  projectId: "money-4cf36",
  storageBucket: "money-4cf36.firebasestorage.app",
  messagingSenderId: "719825730717",
  appId: "1:719825730717:web:dd7152a65acfd35e306874"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);