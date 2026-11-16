// The body of the dialog that asks for the address of the server of the files (Files > A server… in the header): the address is tried (the root folder is listed) before the dialog closes with it,
// so a server that does not answer, or does not allow this page, is told here and not at the first Open of an editor.

import {ChangeDetectionStrategy, Component, model, signal} from '@angular/core';
import {GrdInput, injectGrdDialogRef} from '@gridify/studio';
import {editorsApi} from './designer-files';

/** How long the server may take to answer the try, in milliseconds. */
const ANSWER_TIMEOUT = 10000;

@Component({
    selector: 'app-designer-server',
    standalone: true,
    imports: [GrdInput],
    changeDetection: ChangeDetectionStrategy.OnPush,
    styles: `
        :host {
            display: grid;
            gap: 8px;
            font: 13px/1.45 var(--grd-font-main, system-ui, sans-serif);
            color: var(--grd-text-main);
        }
        p {
            margin: 0;
        }
        code {
            font-family: var(--grd-font-mono, ui-monospace, monospace);
        }
        .line {
            min-height: 1.45em;
            font-size: 12px;
            color: var(--grd-text-muted, inherit);
            overflow-wrap: anywhere;
        }
        .line.problem {
            color: var(--grd-warning-text, var(--grd-warning, #b45309));
        }
    `,
    template: `
        <p>
            The address of the API of a server that keeps the files of your project. The editors list a folder (<code>GET …/list</code>), read a file (<code>GET …/file</code>) and write it (<code>PUT …/file</code>); the README of Gridify Designer has the
            contract and a small server for a folder of your computer.
        </p>
        <grd-input label="Address" type="url" placeholder="http://localhost:4300/files" [(value)]="url" [spellcheck]="false" autocomplete="off" />
        <p class="line" [class.problem]="failed()" role="status">{{ state() }}</p>
    `,
})
export class DesignerServerDialog {
    /** The address that is typed. */
    readonly url = model('');
    private readonly ref = injectGrdDialogRef<string, DesignerServerDialog>();
    protected readonly state = signal('');
    protected readonly failed = signal(false);

    /** Tries the address and closes the dialog with it when the server answers. `false` keeps the dialog open (the line says why). */
    async connect(): Promise<boolean> {
        const url = this.url().trim();
        if (!/^https?:\/\/\S+$/i.test(url)) {
            this.say('Type an address that starts with http:// or https://.', true);
            return false;
        }
        this.say(`Connecting to ${url}…`, false);
        // The dialog waits for the answer, and its buttons, the cross and Esc wait with it: without an end of its own, a machine that does not answer would hold the dialog for as long as the browser waits.
        const waiting = new AbortController();
        const timer = setTimeout(() => waiting.abort(), ANSWER_TIMEOUT);
        try {
            const {grdHttpFiles} = await editorsApi();
            await grdHttpFiles({url, fetch: (input, init) => fetch(input, {...init, signal: waiting.signal})}).list('');
        } catch (error) {
            this.say(waiting.signal.aborted ? `The server ${url} did not answer in ${ANSWER_TIMEOUT / 1000} seconds: is it running?` : error instanceof Error ? error.message : String(error), true);
            return false;
        } finally {
            clearTimeout(timer);
        }
        this.ref.close(url);
        return true;
    }

    private say(text: string, failed: boolean): void {
        this.state.set(text);
        this.failed.set(failed);
    }
}
