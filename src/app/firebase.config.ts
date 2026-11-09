/**
 * The Firebase web app's config (Firebase console → Project settings → Your apps → SDK setup and configuration).
 * These values are not secrets: they only name the project. Access is protected by sign-in and firestore.rules.
 * Without them (placeholder values starting with YOUR_), the app shows a setup screen instead of failing.
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyDR_jmo81PaItuWcSZwSl6GmnIupeCCUFo',
  authDomain: 'go-epic.firebaseapp.com',
  projectId: 'go-epic',
  storageBucket: 'go-epic.firebasestorage.app',
  messagingSenderId: '886316991932',
  appId: '1:886316991932:web:555140a11efb142fe597b9',
};

export const firebaseConfigured = !firebaseConfig.apiKey.startsWith('YOUR_');
