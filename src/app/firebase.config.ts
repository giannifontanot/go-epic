/**
 * The Firebase web app's config (Firebase console → Project settings → Your apps → SDK setup and configuration).
 * These values are not secrets: they only name the project. Access is protected by sign-in and firestore.rules.
 * Until they are filled in, the app shows a setup screen instead of failing.
 */
export const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT',
  storageBucket: 'YOUR_PROJECT.firebasestorage.app',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
};

export const firebaseConfigured = !firebaseConfig.apiKey.startsWith('YOUR_');
