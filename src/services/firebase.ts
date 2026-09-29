import { initializeApp } from "firebase/app";
import * as FirebaseAuth from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
    apiKey: "AIzaSyB-VwrH0vcMpZW_ekM_uaBboslI9PK87dM",
    authDomain: "my-mandal-e98cb.firebaseapp.com",
    projectId: "my-mandal-e98cb",
    storageBucket: "my-mandal-e98cb.firebasestorage.app",
    messagingSenderId: "554707933345",
    appId: "1:554707933345:web:cdd0eb47e9a06240e2b8e0",
    measurementId: "G-EX60KWXVSL",
};

const app = initializeApp(firebaseConfig);

/*
 * Firebase 12.x does not expose
 * getReactNativePersistence in its TypeScript
 * declarations, although the React Native runtime
 * export is available.
 */
const getReactNativePersistence =
    (FirebaseAuth as any).getReactNativePersistence;

if (typeof getReactNativePersistence !== "function") {
    throw new Error(
        "Firebase React Native persistence is unavailable."
    );
}

export const auth = FirebaseAuth.initializeAuth(app, {
    persistence:
        getReactNativePersistence(AsyncStorage),
});

export const db = getFirestore(app);

export default app;