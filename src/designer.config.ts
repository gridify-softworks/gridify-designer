import {ApplicationConfig, provideBrowserGlobalErrorListeners} from '@angular/core';
import {provideGrdBrowserMenu} from '@gridify/studio';

/** The providers of the application of the editors. Everything of the library is `providedIn: 'root'`, so only the setting of the menu of the browser is listed here, and an editor provides its own state itself. */
export const designerConfig: ApplicationConfig = {
    // a tool that looks like a desktop application: a right click opens the menu of the browser only in the texts and over the links (Shift and the right button: anywhere)
    providers: [provideBrowserGlobalErrorListeners(), provideGrdBrowserMenu()],
};
