import type {Type} from '@angular/core';

/** An editor that the application can show. */
export interface EditorEntry {
    /** What the address holds after `#editor=` (`http://localhost:4202/#editor=ribbon`): short, lower case, never changed once it is in use. */
    readonly id: string;
    /** English; the name in the choice of the editor and in the header. */
    readonly title: string;
    /**
     * Loads the component of the editor when it is first shown, so an editor that is not open is not in the first download. The component takes the inputs `hosted` (the application brings the header), `files` and `sample`,
     * provides its own state and imports the library from `@gridify/studio` only. The editors are taken from `@gridify/editors` (in this repository the alias of `src/editors/public-api.ts`, in an
     * application that installed the package the package), never by a path into their folders.
     */
    readonly load: () => Promise<Type<unknown>>;
    /** The sample of its File > Samples that the editor starts with (its input `sample`), so the Designer opens with something to look at and try; a document that came back stays. */
    readonly sample: string;
}

/** The editors, in the order of the choice; the first one is shown when the address names none. A new editor is one more line here. */
export const EDITORS: readonly EditorEntry[] = [
    {id: 'ribbon', title: 'Ribbon editor', load: () => import('@gridify/editors').then(api => api.RibbonEditor), sample: 'showcase'},
    {id: 'layout', title: 'Layout editor', load: () => import('@gridify/editors').then(api => api.LayoutEditor), sample: 'ide'},
    {id: 'form', title: 'Form editor', load: () => import('@gridify/editors').then(api => api.FormEditor), sample: 'contact'},
];

/** The editor with an id, or `undefined` (an address with an editor that does not exist). */
export const editorById = (id: string | null | undefined): EditorEntry | undefined => EDITORS.find(entry => entry.id === id);
