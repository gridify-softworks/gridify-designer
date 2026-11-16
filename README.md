# Gridify Designer

The Ribbon editor, the Layout editor and the Form editor of Gridify in one application. The editors come from the package `@gridify/editors`, the library from `@gridify/studio` (both from npm).

```
npm install
npm start          # http://localhost:4202
npm run build      # dist/designer/browser
```

The chosen editor is in the address (`#editor=ribbon`, `#editor=layout`, `#editor=form`), so a reload, a link and the Back button lead to the same editor. The application needs no server of its own:
`dist/designer/browser` is a static site.

## The files of a project

Off at the start, the editors open a file of the computer and offer the document for download. **Files** in the header gives them the files of a project instead, and their File menu gets
Open from the project… (Ctrl+O), Save (Ctrl+S) and Save as… (Ctrl+Shift+S); the choice is remembered in the browser.

- **A folder of this computer**: the browser asks for a folder (the assets of your application) and for the permission to read and write it, again after a reload. Chrome, Edge and the other browsers of
  Chromium can (on HTTPS or localhost); Firefox and Safari cannot.
- **A server**: the address of an API that keeps the files (`GET <url>/list?path=`, `GET <url>/file?path=`, `PUT <url>/file?path=` with `If-Match` / `If-None-Match: *`, the versions as `ETag`;
  the README of `@gridify/editors` has the contract). `npm run files -- <folder>` starts a small one for a folder of this computer on `http://localhost:4300/files`: JSON files only, nothing outside
  the folder, on this computer only, for the pages of `http://localhost:4202` (`--origin <address>` allows another one, the page of GitHub Pages for instance: `--origin https://<user>.github.io`; the browser asks then for the
  access to the local network).

Save writes only into the file that the document was opened from or saved to, and only while that file is the version that was read: a file that was changed in the meantime is asked about. The
title in the middle of the menu bar of an editor names the document: its file of the project, or where it came from (a new one, a sample, a file of the computer, the clipboard).

**Help > Files…** of every editor says how the files work, in which browsers, and how to write a server of your own (its requests, what it has to allow, a whole server in Node.js to copy) and
connect it.

## GitHub

`.github/workflows/build.yml` builds the application on every push to a branch and every pull request, and publishes it with GitHub Pages from the default branch (a tag alone
builds nothing). Turn the pages on once: Settings > Pages >
Build and deployment > Source: **GitHub Actions**. The page of a repository is `https://<user>.github.io/<repository>/`, and the build takes that path by itself (`/` for the repository
`<user>.github.io`). A page on a domain of your own is served under `/` too: set the variable `BASE_HREF` of the repository to `/` then (Settings > Secrets and variables > Actions > Variables).

When the packages `@gridify/*` come from a registry of your own (GitHub Packages, for instance), add an `.npmrc` with `@gridify:registry=<the address of the registry>` and
`//<host>/:_authToken=${NPM_TOKEN}`, and the secret `NPM_TOKEN` of the repository (Settings > Secrets and variables > Actions > Secrets): the workflow gives it to `npm install`.

## A new version of the editors

Change the versions of `@gridify/studio` and `@gridify/editors` in `package.json` (they go together: the editors ask for the library of their version), `npm install`, and push.
