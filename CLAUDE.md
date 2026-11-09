# Go Epic - Project Guide

## PR Traceability
Every pull request:
1. ends its title with the **branch session ID** as `- [SessionID]` (the trailing characters of the branch name, e.g. `ofxb07` from `claude/charming-planck-ofxb07`);
2. shows it in the body (`Session: ofxb07`);
3. carries the PR Checklist below.

## Overview
Go Epic is the Week board, Focus mode and Floating Canvas of Epic Manager (`giannifontanot/epic-manager`), rebuilt on Firebase with no server of its own. Only those three screens exist on purpose: no seed editor, no variants, no sync queue. The owner is Gianni.

- **Stack:** Angular 22 (standalone components, signals, new control flow, zoneless), TypeScript strict, Firebase JS SDK 13 (Auth + Firestore), Firebase Hosting, Vitest.
- **Cost:** must stay on the free **Spark** plan: no Cloud Functions, no Cloud Run, nothing that needs the Blaze plan.
- **Offline:** Firestore's persistent multi-tab cache is the offline layer; writes show at once and sync when the network is back. Never add a hand-made sync queue.
- **PWA:** installable app (`public/manifest.webmanifest`, icons in `public/icons/` drawn from `public/icons/icon.svg`, `apple-touch-icon.png` and iOS meta tags in `src/index.html`). The Angular service worker (`ngsw-config.json`, production builds only) caches the app shell so it opens offline; it never caches Firestore/Auth traffic, and navigations to `/__/**` (Firebase's reserved paths) bypass it. `firebase.json` serves `ngsw-worker.js`, `ngsw.json`, the other worker scripts and the manifest with `no-cache` (that rule must stay after the immutable `**/*.@(js|css)` rule: Hosting applies matching header rules in order, the last one wins). When a new version has downloaded, `App` shows an update bar (`SwUpdate` VERSION_READY → "Update" reloads; checks every 30 min; an unrecoverable state reloads).

## Data (Firestore)
```
users/{uid}/week/{DAY}         { blocks: Block[] }                 DAY = MONDAY…SUNDAY
users/{uid}/days/{YYYY-MM-DD}  { done: { [taskId]: millis },       the day's task states (local date), status.model:
                                 status: { [taskId]: state } }     done/late keep `done`; late/progress/skipped in `status`
users/{uid}/library/tree       { nodes: LibNode[] }                the task library (Floating Canvas)
```
- **Names (Gianni, as in Epic Manager's nomenclature):** the five levels are shown as **Area → Epic → Feature → Story → Beat** in both languages ("Beat" replaces Task, "Story" replaces User story; a Story is shaped by its Beats, step by step). In Spanish, Beat is masculine (el Beat, "hecho") and Story feminine (la Story). The code keeps `kind: 'story' | 'task'`.
- `LibNode { id, kind: 'area'|'epic'|'feature'|'story'|'task', title, parentId: string|null, color }`: five levels, Area → Epic → Feature → Story → Beat (task), each parent of the kind above (`PARENT_KIND`). `parentId` null = an area (the top) or an object waiting in **Free Space** (never an epic). Every task exists once in the library; a container can be deleted only when empty, a task always (its week places go on Save).
- `Block { id, name, start: 'HH:mm'|null, end: 'HH:mm'|null, tasks: Task[] }`: the start anchors the first task, later starts cascade by minutes; the end is a hard limit (the tasks' minutes never pass `end - start`).
- `Task { id, title, minutes, color: string|null, active, ref: string|null }`: `color` null = automatic pastel (`blockColors`: FNV-1a of the title, never like the card above). `ref` = the library task this card schedules (one library task can sit in many blocks); the library is the truth for its title and colour (`followLibrary`).
- `firestore.rules`: each user reads/writes only `users/{uid}/**` (week, days and library). Update the rules with any new collection.
- Firestore refuses `undefined`: `WeekStore` sanitizes every block on the way in and out.
- `WeekStore.setBlocks` writes a whole day; an echo of an older local write must not undo a newer one (`pending` queue per day). Keep that when touching the store.

## Code map
- `src/app/core/week.model.ts`: types and **pure** rules (clock parsing 24h `HH:mm`, cascade, windows, free time, colours, now-line, timeline). Put new rules here with specs.
- `src/app/core/week.store.ts`: the signed-in user's week + today's states (`marks`, `status(id)`, `setStatus`), the day history for Progress (`watchHistory`), clock signal (15s).
- `src/app/core/status.model.ts` (pure, with specs): **States** as in Epic Manager: To do, Done, Late (done, not on time), In progress, Skipped. Old documents with only `done` still read as Done. **Progress**: every active task of the week is a habit (grouped by its library `ref`, else its title) with its last 14 days drawn and its **streak** (counted over the last 90 days read; "n+ days" when it may go back further): finished days (done/late) count, skipped and unplanned days pause it, a missed day ends it; today still open never breaks it; a habit's history starts the first day it was ever marked (no misses before). Uses the current week plan for past days.
- `src/app/core/dialog.ts`: **every window opens growing out of the point the user pressed and closes shrinking back into it** (Gianni's rule): `openDialog(dialog)` / `closeDialog(dialog)` (scale + fade + backdrop fade, 300/220 ms, nothing under reduced motion; Esc closes the same way unless the dialog handles it, `escape: false`). Never call `showModal()`/`close()` directly; components removed by `@if` animate out first, then emit.
- `src/app/core/tilt.ts` (`tiltOf` pure, with specs): **weighted buttons**, a visual detail only: when the phone leans (`deviceorientation` gamma, portrait only, 4° dead zone, full at 60°) every button leans up to 5° and 2px towards the lower side; upright they stand straight. The root's registered `--tilt-r`/`--tilt-x` glide and buttons follow through `rotate`/`translate` (styles.css). Menu switch "Weighted buttons" (`go-epic-tilt`, on by default); iPhone/Chrome ask for motion permission on the first tap (a refusal turns it off). Nothing under reduced motion.
- `src/app/core/auth.service.ts`: Google sign-in (popup, redirect fallback).
- `src/app/core/firebase.ts` + `src/app/firebase.config.ts`: Firebase init; config values are public (not secrets). On localhost, `localStorage['go-epic-emulators']='1'` uses the emulators with project `demo-go-epic`.
- `src/app/core/i18n.ts`: EN/ES labels (`I18n.t`); every key needs both languages (a spec checks it).
- `src/app/pages/week-board/`: Week board, `TaskDialog` (Floating Canvas look: Delete top, Cancel/Done bottom, edits a draft), `TransferDialog` (white Copy/Move card).
- `src/app/pages/focus/focus.ts`: today's tasks, the running/next one large; a tap toggles done, a **long press** (500 ms, or right click / the state chip) opens the state menu.
- `src/app/pages/progress/progress.ts` (`/progress`): habits with 🔥 streaks and 14 day dots.
- `src/app/pages/capture/capture-panel.ts` (+ `capture-ui.ts`, the open flag): **Capture = the quick way into Free Space** (GTD: one inbox, no separate notes). The floating ✎ (bottom right) or the menu's Capture opens the panel near the top of the screen (it follows `visualViewport`: never taller than what the keyboard leaves visible) with the cursor in the box: type, Enter, again. Every idea is a library task with no parent (Free Space, `inboxTasks`); the panel lists them newest first: edit (tap the text; its week cards follow), **Where →** files it in a user story (`storyOptions`; it leaves the inbox), delete (asks when planned; its cards leave the week). The Week's "Existing task" picker already offers them. Library changes made here go through `LibraryStore.updateWithWeek` (week follows, one batch; `followDay` is shared with the Canvas Save).
- `src/app/core/library.model.ts` (pure rules, with specs) + `library.store.ts` (the library document, same pending-echo and `ready` rules as `WeekStore`).
- `src/app/pages/canvas/`: **Floating Canvas** (`/canvas`), as in Epic Manager: Epic tabs filtered by area (+ Area, Edit area; a fixed yellow "EPICS:" box as tall as the tabs starts the row, each tab has its ✎ edit at the top right, "+ Epic" ends the row), the Epic workspace (Feature jelly boxes → cream Story containers → pastel Task capsules, ± fold, ••• actions), Free Space (search, + Feature/Story/Task) behind a resizable divider and a Free Space switch (`go-epic-canvas-free-space`). **✨ Starter template** (`STARTER_TEMPLATE` + `planTemplate` in library.model: El Templo, El Castillo, La Torre, La Arena with 8 Epics, 13 Features, and in each Feature a first Story with one small Beat, Gianni's names in Spanish; each level answers one question: Area = where (a place of legend), **Epic = who I am** (identity, present tense, short enough for a tab: "Administro con sabiduría"), **Feature = what I live** (an outcome already lived: present tense, positive, first person and believable: "Manejo un presupuesto y tengo ahorros"), Story = the road, Beat = today's step; `was` keeps an Epic's or Feature's earlier names, so applying the template again renames them (`planTemplateChanges`: renames, then what is missing) instead of adding twins) from the empty-state button or the panel's Template chip: a preview (✓ = already there) adds only what is missing to the draft, in one undo step, never duplicating (planned when applied; Add is locked until the window closes). Every change is a draft (`CanvasState`, undo/redo up to 80 steps) until **Save**; Discard returns to the saved library; leaving with a draft asks (`canDeactivate` + `beforeunload`). Drag by the grip (`CanvasMotion` ghost, landing and FLIP; drops only on the right parent kind, `data-drop-kind`); positions/order are this device's view preference (`go-epic-canvas-layout`), never hierarchy. The ••• dialog renames, moves (Move to cascade Area → Epic → Feature → Story, a single choice filled in, Free Space + "Inside"), arranges ↑/↓, colours tasks and deletes. Save writes the library, then the week follows: renamed/recoloured tasks change in every block, deleted ones leave it (an emptied block goes).
- Week task details: **Where** (Area → Epic → Feature → Story, empty = Free Space) and **Existing task** (the library tasks under the chosen level, "title · story"); picking one links the card (pastel chip with ×, name read-only). Done files the card: the linked task, the same-titled task of that story (or Free Space, "Already exists. Linked to it."), else a new library task there; a colour picked here is the library task's colour everywhere. Quick-add files under the story of the block's previous linked task.
- `src/app/app.ts`: the shell. No top bar: a floating ☰ (`.nav-toggle`, top-left beside each page title, which is indented 52px) opens a drawer from the left (native `<dialog class="app-drawer">`; Esc, backdrop or any link closes it) with the brand, the user, Week board / Focus / Canvas / Progress / Capture, the language switch and Sign out, as in Epic Manager.
- `src/styles.css`: all styles (global, Epic Manager palette: navy `#101b42`, cream `#fff4e9`, plum days, yellow jelly blocks, pastel cards, pink `#f4a8b7` primary, teal `#76e0d0` focus).

## Conventions
- Standalone components, signals (`signal`, `computed`, `input`, `output`), `@if/@for`; no NgModules, no RxJS state.
- Phones first: tap targets ≥ 40px, inputs 16px (no iOS zoom), safe-area insets, one day at a time ≤ 820px.
- Dialogs are native `<dialog>` with `showModal()`; backdrop clicks via `isBackdropClick`.
- Respect `prefers-reduced-motion`.

## PR Workflow (AI Assistant)
The AI assistant **never runs the test suite** itself (typecheck, builds and emulator checks are fine). **GitHub Actions runs it**: `.github/workflows/ci.yml` (Node 22, `npm ci`, `npm test -- --watch=false`, `npm run build`) on every pull request and on main. After pushing: open the PR and comment `@codex review`; fix every Codex finding and ask Codex again; **do not ask Gianni to run tests** (a manual check on his phone only when one is really needed, asked once Codex is clean). Merge only when Codex has no open findings and the **CI check is green on the exact current HEAD**. Angular 22 needs Node ^22.22.3 || ^24.15.0 locally.

## PR Checklist
```markdown
### PR Checklist
- [ ] **Session ID in PR title** — `- [SessionID]`
- [ ] **Session ID in PR body** — `Session: SessionID`
- [ ] **CI green** — the CI check (tests + build) passed on the exact HEAD; Codex has no open findings
- [ ] **i18n** — new strings in `src/app/core/i18n.ts` (EN and ES)
- [ ] **CLAUDE.md / AGENTS.md updated** — when data, rules, structure or conventions change (keep both identical)
- [ ] **Firestore rules** — new collections covered by `firestore.rules`
- [ ] **Free plan** — nothing that needs Blaze
```
Items that do not apply are marked `N/A`, never removed.

## Commands
```bash
npm start             # dev server http://localhost:4200
npm test              # Vitest unit tests
npm run build         # production build → dist/go-epic/browser
npm run emulators     # Firebase Auth + Firestore emulators (Java)
npm run deploy        # build + firebase deploy (hosting, firestore rules)
```
