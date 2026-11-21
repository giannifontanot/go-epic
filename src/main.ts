import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// index.html sets goEpicLeaving when it sends a first-time visitor from "/" to the Get Go Epic page.
if (!(window as { goEpicLeaving?: boolean }).goEpicLeaving) {
  bootstrapApplication(App, appConfig).catch((err) => console.error(err));
}
