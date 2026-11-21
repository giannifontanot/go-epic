import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// At "/", index.html may first look for a saved sign-in (goEpicGate): with none it sends the visitor to the Get Go Epic
// page and the app does not start.
const gate = (window as { goEpicGate?: Promise<boolean> }).goEpicGate ?? Promise.resolve(true);
gate.then((start) => {
  if (start) bootstrapApplication(App, appConfig).catch((err) => console.error(err));
});
