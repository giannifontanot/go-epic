import { FirebaseApp, initializeApp } from 'firebase/app';
import { Auth, connectAuthEmulator, getAuth } from 'firebase/auth';
import {
  Firestore, connectFirestoreEmulator, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
} from 'firebase/firestore';
import { firebaseConfig, firebaseConfigured } from '../firebase.config';

/**
 * Local development without a real project: on localhost, `localStorage['go-epic-emulators'] = '1'` uses the
 * Firebase emulators (`npm run emulators`) with a demo project, so nothing touches real data.
 */
function useEmulators(): boolean {
  try {
    return ['localhost', '127.0.0.1'].includes(location.hostname) && localStorage.getItem('go-epic-emulators') === '1';
  } catch {
    return false;
  }
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

/** The Firebase app, created once. Firestore keeps a copy on the device (shared by every tab), so the week works offline. */
export function firebase(): { auth: Auth; db: Firestore } | null {
  const emulators = useEmulators();
  if (!firebaseConfigured && !emulators) return null;
  if (!app) {
    app = initializeApp(emulators ? { apiKey: 'demo-key', authDomain: 'localhost', projectId: 'demo-go-epic', appId: 'demo-app' } : firebaseConfig);
    auth = getAuth(app);
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
    if (emulators) {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectFirestoreEmulator(db, '127.0.0.1', 8085);
    }
  }
  return { auth: auth as Auth, db: db as Firestore };
}
