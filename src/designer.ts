import {NgComponentOutlet} from '@angular/common';
import {ChangeDetectionStrategy, Component, DestroyRef, Type, computed, effect, inject, signal} from '@angular/core';
import {GrdAppHeader, GrdDialog, GrdDropdownButton, GrdIcons, GrdMessageBox, GrdToggleGroup} from '@gridify/studio';
import type {GrdMenuItem, GrdToggleOption} from '@gridify/studio';
import {DesignerFiles} from './designer-files';
import {DesignerServerDialog} from './designer-server-dialog';
import {EDITORS, editorById} from './editors-registry';

/** The part of the address that names the editor: `#editor=ribbon`. */
const ADDRESS_KEY = 'editor';

/** The editor that the address names (`undefined`: none, or one that does not exist). */
const editorOfAddress = () => editorById(new URLSearchParams(window.location.hash.slice(1)).get(ADDRESS_KEY));

/** The icon of the choice of the files (a folder), in the manner of the icons of the library: a 16 x 16 outline in `currentColor`. */
const FILES_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M1.75 4h4.5l1.5 1.5h6.5v7.5H1.75z"/></svg>';

/**
 * The application of the editors, Gridify Designer: its header (the name, the theme and the density), the choice of the editor and the choice of the files of a project in it, and under it the editor
 * that is chosen. It knows the editors only from the list in `editors-registry.ts`, loads the one that is shown, and keeps its id in the address (`#editor=ribbon`), so a reload, a link and the Back button
 * lead to the same editor. It is the only application that takes an editor (through `@gridify/editors`); an editor knows nothing of it but the inputs `hosted`, `files` (the place of the files that
 * `DesignerFiles` gives: off, a folder of this computer, a server) and `sample` (the sample it starts with, `editors-registry.ts`).
 */
@Component({
    selector: 'app-designer',
    standalone: true,
    imports: [GrdAppHeader, GrdDropdownButton, GrdToggleGroup, NgComponentOutlet],
    changeDetection: ChangeDetectionStrategy.OnPush,
    styles: [
        `
            :host {
                display: flex;
                flex-direction: column;
                height: 100vh;
                background: var(--grd-bg-main);
            }
            .stage {
                flex: 1 1 0;
                min-height: 0;
                position: relative;
            }
            .message {
                padding: 24px;
                color: var(--grd-text-muted, inherit);
            }
            .message.failed {
                color: var(--grd-danger, #e51400);
            }
        `,
    ],
    template: `
        <grd-app-header productName="Gridify Designer" icon="grd:logo" preferences="theme density">
            <grd-toggle-group grdAppHeaderStart ariaLabel="Editors" [options]="options" [value]="activeId()" (toggled)="choose($event.value)" />
            <grd-dropdown-button grdAppHeaderEnd appearance="flat" icon="designer:files" [label]="files.label()" tooltip="Where the editors open and save the files of a project" [items]="filesItems()" />
        </grd-app-header>
        <div class="stage">
            @if (editor(); as component) {
                <ng-container *ngComponentOutlet="component; inputs: {hosted: true, files: files.files(), sample: active().sample}" />
            } @else if (failed()) {
                <div class="message failed" role="alert">The {{ active().title }} could not be loaded. Reload the page.</div>
            } @else {
                <div class="message" role="status">Loading the {{ active().title }}…</div>
            }
        </div>
    `,
})
export class Designer {
    protected readonly options: GrdToggleOption<string>[] = EDITORS.map(entry => ({value: entry.id, label: entry.title}));
    protected readonly activeId = signal((editorOfAddress() ?? EDITORS[0]).id);
    protected readonly active = computed(() => editorById(this.activeId()) ?? EDITORS[0]);
    /** The component of the chosen editor, `null` until it is loaded. */
    protected readonly editor = signal<Type<unknown> | null>(null);
    /** The chosen editor could not be loaded (the network is gone, or a new version of the application took its file away). */
    protected readonly failed = signal(false);
    /** The files of a project that the editors open and save (off until the user chooses a folder or a server). */
    protected readonly files = inject(DesignerFiles);
    private readonly dialogs = inject(GrdDialog);
    private readonly box = inject(GrdMessageBox);

    /** The choice of the files: off, a folder of this computer (only where the browser can open one), a server. */
    protected readonly filesItems = computed<GrdMenuItem[]>(() => {
        const files = this.files;
        const mode = files.mode();
        return [
            {label: 'Where the editors open and save files', header: true},
            {label: '&Off: files of the computer, downloads', checked: mode === 'off', run: () => files.off()},
            {
                label: files.folderSupported() ? 'A &folder of this computer…' : 'A &folder of this computer (Chrome, Edge)',
                checked: mode === 'folder',
                enabled: files.folderSupported(),
                run: () => void this.chooseFolder(),
            },
            {label: 'A &server…', checked: mode === 'server', run: () => void this.chooseServer()},
        ];
    });

    constructor() {
        inject(GrdIcons).set('designer:files', FILES_ICON);
        // The address was changed by hand, or by the Back button: an address without an editor (or with one that does not exist) shows the first one, as at the start.
        const follow = (): void => this.activeId.set((editorOfAddress() ?? EDITORS[0]).id);
        window.addEventListener('hashchange', follow);
        inject(DestroyRef).onDestroy(() => window.removeEventListener('hashchange', follow));

        effect(() => {
            const entry = this.active();
            this.editor.set(null);
            this.failed.set(false);
            // A slow editor that is not wanted any more (the choice was changed before it came) is not shown.
            entry.load().then(
                component => {
                    if (this.active() === entry) this.editor.set(component);
                },
                () => {
                    if (this.active() === entry) this.failed.set(true);
                }
            );
        });
    }

    protected choose(id: string): void {
        this.activeId.set(id);
        window.location.hash = `${ADDRESS_KEY}=${id}`;
    }

    /** The browser asks for a folder; the editors open and save its files from then on. */
    private async chooseFolder(): Promise<void> {
        try {
            await this.files.useFolder();
        } catch (error) {
            this.box.error(error, {title: 'A folder of this computer'});
        }
    }

    /** The dialog asks for the address of the server (and tries it); the editors open and save its files from then on. */
    private async chooseServer(): Promise<void> {
        const ref = this.dialogs.open<string | null, DesignerServerDialog>({
            id: 'designer:server',
            title: 'The files of a server',
            component: DesignerServerDialog,
            inputs: {url: this.files.url()},
            buttons: [
                // without a result of its own the button would close the dialog with its id, a text like an address
                {id: 'cancel', label: 'Cancel', cancel: true, result: null},
                {id: 'connect', label: 'Connect', variant: 'primary', default: true, closes: false, run: dialog => dialog.instance?.connect() ?? false},
            ],
            width: 520,
            autoFocus: 'input',
        });
        const url = await ref.closed;
        if (typeof url === 'string') this.files.useServer(url);
    }
}
