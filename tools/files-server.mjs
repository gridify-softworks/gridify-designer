// A small server of the files of a project for Gridify Designer (Files > A server…, address http://localhost:4300/files): it lists, reads and writes the JSON files of one folder of this computer
// for the editors, as the HTTP contract of `grdHttpFiles` of `@gridify/editors` says. A tool for development, on this computer only:
//
//   npm run files -- ../my-app/public            the folder (the assets of your application), on http://localhost:4300/files, for the designer on http://localhost:4202
//   npm run files -- ../my-app/public --port 4400                   another port
//   npm run files -- ../my-app/public --origin https://<user>.github.io   the designer from another address too (repeat it for more)
//
// What it allows: only this folder and what is under it (no `..`, no link that leads out of it, no name starting with a dot, no node_modules), only files that end with .json, and only JSON is written. It
// listens on 127.0.0.1 only, answers only a request for localhost or 127.0.0.1 (a page of another site cannot reach it by a name of its own), and only the pages of the allowed origins (CORS). A write
// says which version of the file it expects (If-Match, If-None-Match: *); a file that is not that version any more is not overwritten (412), and the editor asks the user.

import {createHash} from 'node:crypto';
import {existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {join, relative, resolve, sep} from 'node:path';

const args = process.argv.slice(2).filter(arg => arg !== '--');
const option = (name, fallback) => {
    const at = args.indexOf(name);
    return at >= 0 && at + 1 < args.length ? args.splice(at, 2)[1] : fallback;
};
const port = Number(option('--port', '4300'));
const origins = new Set(['http://localhost:4202', 'http://127.0.0.1:4202']);
for (let origin = option('--origin'); origin !== undefined; origin = option('--origin')) origins.add(origin.replace(/\/+$/, ''));
const folder = args[0];
if (!folder || args.length > 1 || !Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('Usage: node tools/files-server.mjs <folder> [--port 4300] [--origin <origin of the designer>]...');
    process.exit(1);
}
if (!existsSync(folder) || !statSync(folder).isDirectory()) {
    console.error(`files-server: ${folder} is not a folder.`);
    process.exit(1);
}
const root = realpathSync(resolve(folder));
const BASE = '/files';
const MAX_BODY = 5 * 1024 * 1024;

class Refusal extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

/** The names of a path of the project; a path that would leave the folder, or has a name the server does not show, is refused. */
function namesOf(path) {
    if (typeof path !== 'string') throw new Refusal(400, 'The path is missing.');
    if (path === '') return [];
    const names = path.split('/');
    for (const name of names) {
        if (name === '' || name === '.' || name === '..' || /[\\\u0000-\u001f]/.test(name)) throw new Refusal(400, `"${path}" is not a path of the project.`);
        if (name.startsWith('.') || name === 'node_modules') throw new Refusal(403, `${path} is not shown.`);
    }
    return names;
}

const isJsonFile = name => name.toLowerCase().endsWith('.json') && name.length > 5;

/** May the real place (links followed) be shown? It is inside the folder, and none of its names is one the server does not show (a link inside the folder to `.env` or into node_modules is not). */
function shown(real) {
    if (real !== root && !real.startsWith(root + sep)) return false;
    return relative(root, real)
        .split(sep)
        .filter(Boolean)
        .every(name => !name.startsWith('.') && name !== 'node_modules');
}

/** The real place of an existing folder or file (links followed), checked: inside the folder, shown, and a file only when it is a .json file. */
function realOf(path, what) {
    const place = join(root, ...namesOf(path));
    let real;
    try {
        // a link that leads nowhere is not there either
        real = realpathSync(place);
    } catch {
        throw new Refusal(404, `${path || '/'} is not there.`);
    }
    if (!shown(real)) throw new Refusal(403, `${path} leads out of the folder, or to a place that is not shown.`);
    const stat = statSync(real);
    if (what === 'folder' ? !stat.isDirectory() : !stat.isFile() || !isJsonFile(real)) throw new Refusal(404, `${path} is not a ${what === 'folder' ? 'folder' : '.json file'}.`);
    return real;
}
const etagOf = text => `"${createHash('sha256').update(text).digest('base64url').slice(0, 27)}"`;

function list(path) {
    const real = realOf(path, 'folder');
    return readdirSync(real, {withFileTypes: true})
        .filter(entry => !entry.name.startsWith('.') && entry.name !== 'node_modules')
        .map(entry => {
            // a link counts as what it leads to, when that may be shown (a .json file, or a folder)
            let kind = entry.isDirectory() ? 'folder' : entry.isFile() ? 'file' : null;
            if (entry.isSymbolicLink()) {
                try {
                    const target = realpathSync(join(real, entry.name));
                    kind = !shown(target) ? null : statSync(target).isDirectory() ? 'folder' : isJsonFile(target) ? 'file' : null;
                } catch {
                    kind = null;
                }
            }
            return kind === null || (kind === 'file' && !isJsonFile(entry.name)) ? null : {name: entry.name, kind};
        })
        .filter(entry => entry !== null);
}

function read(path) {
    namesOf(path);
    if (!isJsonFile(path)) throw new Refusal(403, 'Only .json files are read.');
    return readFileSync(realOf(path, 'file'), 'utf8');
}

function write(path, text, ifMatch, ifNoneMatch) {
    const names = namesOf(path);
    const name = names.pop();
    if (name === undefined || !isJsonFile(name)) throw new Refusal(403, 'Only .json files are written.');
    try {
        JSON.parse(text);
    } catch {
        throw new Refusal(400, 'The text is not JSON: only JSON is written.');
    }
    const parent = realOf(names.join('/'), 'folder');
    const place = join(parent, name);
    // what is at the place, links not followed: a link (also one that leads nowhere) is written only where it leads to a .json file that may be shown
    let entry = null;
    try {
        entry = lstatSync(place);
    } catch {
        entry = null;
    }
    let target = place;
    if (entry?.isSymbolicLink()) {
        try {
            target = realpathSync(place);
        } catch {
            throw new Refusal(403, `${path} is a link that leads nowhere.`);
        }
        if (!shown(target) || !isJsonFile(target)) throw new Refusal(403, `${path} leads out of the folder, or to a file that is not written.`);
    }
    if (entry !== null && !statSync(target).isFile()) throw new Refusal(409, `${path} is not a file.`);
    const there = entry !== null;
    if (ifNoneMatch === '*' && there) throw new Refusal(412, `${path} is there already.`);
    if (ifMatch !== undefined && (!there || etagOf(readFileSync(target, 'utf8')) !== ifMatch)) throw new Refusal(412, `${path} is not the version that was read.`);
    // a new file is made only where nothing is (not even a link that appeared in the meantime)
    writeFileSync(target, text, {encoding: 'utf8', flag: there ? 'w' : 'wx'});
    return etagOf(text);
}

/** The body of a request; one that is too big is read to its end and refused then (so the client gets the answer), and one that goes on far beyond that is cut. */
function body(request) {
    return new Promise((done, fail) => {
        const parts = [];
        let size = 0;
        request.on('data', part => {
            size += part.length;
            if (size <= MAX_BODY) parts.push(part);
            else if (size > 4 * MAX_BODY) request.destroy();
        });
        request.on('end', () => (size > MAX_BODY ? fail(new Refusal(413, 'The file is too big (5 MB at most).')) : done(Buffer.concat(parts).toString('utf8'))));
        request.on('error', fail);
    });
}

const server = createServer(async (request, response) => {
    const origin = request.headers.origin;
    const answer = (status, text, headers = {}) => {
        response.writeHead(status, {'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers});
        response.end(text);
    };
    // only a request for this computer by its own name: a site that points a name of its own at 127.0.0.1 is not answered
    const host = (request.headers.host ?? '').toLowerCase();
    if (host !== `localhost:${port}` && host !== `127.0.0.1:${port}`) return answer(421, 'Ask for localhost.');
    if (origin !== undefined) {
        if (!origins.has(origin)) return answer(403, `The page of ${origin} is not allowed: start the server with --origin ${origin}.`);
        response.setHeader('Access-Control-Allow-Origin', origin);
        response.setHeader('Vary', 'Origin');
        response.setHeader('Access-Control-Expose-Headers', 'ETag');
    }
    const url = new URL(request.url ?? '/', `http://${host}`);
    if (request.method === 'OPTIONS') {
        return answer(204, '', {'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, If-Match, If-None-Match', 'Access-Control-Max-Age': '600'});
    }
    const path = url.searchParams.get('path');
    try {
        if (request.method === 'GET' && url.pathname === `${BASE}/list`) return answer(200, JSON.stringify(list(path ?? '')), {'Content-Type': 'application/json; charset=utf-8'});
        if (request.method === 'GET' && url.pathname === `${BASE}/file`) {
            const text = read(path);
            return answer(200, text, {'Content-Type': 'application/json; charset=utf-8', ETag: etagOf(text)});
        }
        if (request.method === 'PUT' && url.pathname === `${BASE}/file`) {
            const text = await body(request);
            const ifMatch = request.headers['if-match'];
            const etag = write(path, text, typeof ifMatch === 'string' ? ifMatch : undefined, request.headers['if-none-match']);
            console.log(`files-server: wrote ${path} (${Buffer.byteLength(text)} bytes)`);
            return answer(200, '', {ETag: etag});
        }
        return answer(404, `Nothing at ${request.method} ${url.pathname}: the API is ${BASE}/list and ${BASE}/file.`);
    } catch (error) {
        if (error instanceof Refusal) return answer(error.status, error.message);
        console.error('files-server:', error);
        return answer(500, 'The server failed: see its console.');
    }
});

server.listen(port, '127.0.0.1', () => {
    console.log(`files-server: ${root}`);
    console.log(`  the address for Gridify Designer (Files > A server…): http://localhost:${port}${BASE}`);
    console.log(`  allowed pages: ${[...origins].join(', ')}`);
    console.log('  only .json files; Ctrl+C stops the server');
});
