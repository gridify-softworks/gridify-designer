// The files of a project in Gridify Designer: the choice in the header (Files: off, a folder of this computer, a server), the place it gives the editors (`GrdEditorFiles`, their input `files`), and
// what is remembered of it in this browser: the choice and the address of the server in localStorage, the folder (its handle) in IndexedDB. It is off until the user turns it on; off, the editors are
// as they always were (they open a file of the computer and offer the document for download). The places come from the package of the editors, which is loaded after the page as the editors are
// (`editorsApi`): a static import would put all the editors into the first file of the page.

import {Injectable, computed, signal} from '@angular/core';
import type {GrdEditorFiles} from '@gridify/editors';

/** The package of the editors, loaded when it is first needed: the file of the editors, which the designer loads for the first editor anyway. */
export const editorsApi = () => import('@gridify/editors');
type EditorsApi = Awaited<ReturnType<typeof editorsApi>>;

export type DesignerFilesMode = 'off' | 'folder' | 'server';

/** The choice that is remembered: the mode, and the address of the server (kept when another mode is chosen, so the dialog offers it again). */
interface KeptChoice {
    readonly mode: DesignerFilesMode;
    readonly url?: string;
}

const CHOICE_KEY = 'gridify-designer:files';
/** The database and the store of the handle of the folder (a handle is kept only in IndexedDB: it cannot be written as text). */
const DATABASE = 'gridify-designer';
const STORE = 'files';
const FOLDER = 'folder';

/**
 * A folder of this computer that was chosen: its handle, and an id of its own. The browser does not say where a folder is, so two folders of the same name would be one place for the editors (a document
 * opened from one would be saved into the other); the id that the folder gets when it is chosen tells them apart, and is kept with the handle.
 */
interface ChosenFolder {
    readonly handle: FileSystemDirectoryHandle;
    readonly id: string;
}

@Injectable({providedIn: 'root'})
export class DesignerFiles {
    /** What the user chose. */
    readonly mode = signal<DesignerFilesMode>('off');
    /** The address of the server (the last one typed, also while another mode is chosen). */
    readonly url = signal('');
    /** The folder of this computer that was chosen. It stays here (and in the IndexedDB) while another mode is chosen, but only the mode `folder` reads it: `useFolder()` always asks for a folder again. */
    private readonly folder = signal<ChosenFolder | null>(null);
    /** The functions of the places, once the package of the editors is loaded. */
    private readonly api = signal<EditorsApi | null>(null);
    /** Can this browser open a folder of the computer (Chrome, Edge and the other browsers of Chromium, on HTTPS or localhost)? */
    readonly folderSupported = computed(() => this.api()?.grdLocalFolderSupported() ?? false);

    /** The place the editors get: `null` while the files are off (or the package, or the folder that was remembered, has not come yet). */
    readonly files = computed<GrdEditorFiles | null>(() => {
        const api = this.api();
        if (api === null) return null;
        switch (this.mode()) {
            case 'folder': {
                const folder = this.folder();
                return folder && api.grdLocalFolderSupported() ? api.grdLocalFolderFiles(folder.handle, {id: folder.id}) : null;
            }
            case 'server':
                return this.url() ? api.grdHttpFiles({url: this.url()}) : null;
            default:
                return null;
        }
    });

    /** What the header says: off, the name of the folder, the host of the server. */
    readonly label = computed(() => {
        const files = this.files();
        if (files === null) return this.mode() === 'off' ? 'Files: off' : 'Files: …';
        return `Files: ${this.mode() === 'server' ? hostOf(files.label) : files.label}`;
    });

    constructor() {
        void editorsApi().then(
            api => this.api.set(api),
            () => undefined
        );
        const kept = readChoice();
        this.url.set(kept.url ?? '');
        if (kept.mode === 'server' && kept.url) this.mode.set('server');
        if (kept.mode === 'folder') {
            this.mode.set('folder');
            void readFolder().then(folder => {
                if (folder) this.folder.set(folder);
                else if (this.mode() === 'folder') this.off();
            });
        }
    }

    /** The files are off: the editors open a file of the computer and offer the document for download. */
    off(): void {
        this.mode.set('off');
        this.keep();
    }

    /** Asks for a folder of this computer (call it from a click) and gives it to the editors. `false` when the user closed the dialog of the browser. */
    async useFolder(): Promise<boolean> {
        const handle = await (this.api() ?? (await editorsApi())).grdPickLocalFolder('gridify-designer');
        if (handle === null) return false;
        const folder: ChosenFolder = {handle, id: `folder:${crypto.randomUUID()}`};
        this.folder.set(folder);
        this.mode.set('folder');
        this.keep();
        await writeFolder(folder);
        return true;
    }

    /** Gives the editors the files of the server at this address. */
    useServer(url: string): void {
        this.url.set(url.trim());
        this.mode.set('server');
        this.keep();
    }

    private keep(): void {
        try {
            localStorage.setItem(CHOICE_KEY, JSON.stringify({mode: this.mode(), ...(this.url() ? {url: this.url()} : {})} satisfies KeptChoice));
        } catch {
            // no storage (a private window): the choice holds for this visit only
        }
    }
}

/** The host of an address (`localhost:4300`), or the address itself when it is not one. */
export function hostOf(url: string): string {
    try {
        return new URL(url).host || url;
    } catch {
        return url;
    }
}

function readChoice(): KeptChoice {
    try {
        const kept: unknown = JSON.parse(localStorage.getItem(CHOICE_KEY) ?? 'null');
        if (typeof kept !== 'object' || kept === null) return {mode: 'off'};
        const {mode, url} = kept as Record<string, unknown>;
        return {mode: mode === 'folder' || mode === 'server' ? mode : 'off', ...(typeof url === 'string' ? {url} : {})};
    } catch {
        return {mode: 'off'};
    }
}

/** The database of the designer, `null` where there is none (a private window of some browsers, a test without IndexedDB). */
function database(): Promise<IDBDatabase | null> {
    return new Promise(resolve => {
        try {
            const request = indexedDB.open(DATABASE, 1);
            request.onupgradeneeded = () => request.result.createObjectStore(STORE);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
}

async function readFolder(): Promise<ChosenFolder | null> {
    const db = await database();
    if (db === null) return null;
    return new Promise(resolve => {
        try {
            const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(FOLDER);
            request.onsuccess = () => {
                const kept = request.result as Partial<ChosenFolder> | undefined;
                resolve(kept?.handle && typeof kept.id === 'string' ? {handle: kept.handle, id: kept.id} : null);
            };
            request.onerror = () => resolve(null);
        } catch {
            resolve(null);
        } finally {
            db.close();
        }
    });
}

async function writeFolder(folder: ChosenFolder): Promise<void> {
    const db = await database();
    if (db === null) return;
    await new Promise<void>(resolve => {
        try {
            const transaction = db.transaction(STORE, 'readwrite');
            transaction.objectStore(STORE).put(folder, FOLDER);
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => resolve();
            transaction.onabort = () => resolve();
        } catch {
            resolve();
        }
    });
    db.close();
}
