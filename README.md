# Go Epic

The two screens that mattered most in Epic Manager, rebuilt on Firebase with no server of its own:

- **Week board** — seven days of blocks (a named time window) holding task cards. Locked by default; *Arrange the week* unlocks editing: block name and start/end window (the end is a hard limit), ▲▼ order, ⇄ copy or move a block to other days, + and quick-add, and each card's ••• details (name, minutes, day, block, colour, active) with Delete on top and Cancel / Done below.
- **Floating Canvas** — the task library in five levels (Area → Epic → Feature → User story → Task) with Free Space for what is not filed yet: drag objects between Epics, Features, Stories and Free Space, or move them from their ••• menu; undo/redo, and nothing is written until Save. Week tasks are picked from (or added to) the library, so renaming or recolouring a task here changes it in every block.
- **Progress** — every task of your week as a habit, with its 🔥 streak and the last 14 days.
- **Capture** — a floating ✎ for quick notes; any note can become a task in the Canvas's Free Space.
- **Focus** — today, one task at a time: the running task with its time left, then the rest of the day. A tap marks a task done for today.

It is an installable app (PWA): on iPhone open it in Safari → Share → **Add to Home Screen**; on Android/desktop Chrome use **Install app**. It opens offline, and shows an *Update* bar when a new version is published.

Built with Angular 22 (standalone components, signals), Firebase Auth (Google sign-in), Cloud Firestore (with the device cache, so it works offline) and Firebase Hosting. Everything fits the free **Spark** plan: no credit card.

## Data

```
users/{uid}/week/{MONDAY…SUNDAY}  { blocks: [{ id, name, start, end, tasks: [{ id, title, minutes, color, active }] }] }
users/{uid}/days/{YYYY-MM-DD}     { done: { [taskId]: millis } }
```

`firestore.rules` lets each person read and write only their own documents.

## Set up Firebase (once)

1. In the [Firebase console](https://console.firebase.google.com) create a project (the free Spark plan is enough).
2. **Build → Authentication → Get started → Sign-in method → Google → Enable.**
3. **Build → Firestore Database → Create database** (production mode, a region near you).
4. **Project settings → Your apps → Web (</>)**: register an app and copy its `firebaseConfig` into `src/app/firebase.config.ts`. These values are not secrets. (Done: the project is `go-epic`.)
5. Put the project id in `.firebaserc` (done: `go-epic`).
6. Deploy: `npx firebase login`, then `npm run deploy` (builds, publishes the site and the rules). Or let GitHub do it: add the repository secret `FIREBASE_SERVICE_ACCOUNT` and every push to `main` deploys (`.github/workflows/deploy.yml`).

The app is then at `https://go-epic.web.app`.

## Develop

```bash
npm ci
npm start                 # http://localhost:4200
npm test                  # unit tests (Vitest)
npm run build             # production build → dist/go-epic/browser
```

To try it without touching real data, run the Firebase emulators (`npm run emulators`, needs Java) and, in the browser console on localhost, `localStorage.setItem('go-epic-emulators', '1')`, then reload: the app uses a demo project on the emulators, with a fake Google sign-in.
