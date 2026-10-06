# GitHub and Vercel Deployment Checklist

This checklist reflects the current frontend as inspected on 2026-10-07. The production build currently succeeds. The selected deployment approach is one separate Vercel site per municipality, with each municipality's configuration stored locally in its kiosk browser. This avoids requiring Firebase, but means the local configuration is not shared across browsers or devices.

## Current deployment status

- [x] Vite production build works with `npm run build`.
- [x] Local `.env` and `.env.*` files are ignored by Git; this frontend currently needs no environment variables.
- [x] Use browser-local storage for a single dedicated kiosk/browser; Firebase is not required for this setup.
- [x] Removed the unused Firebase client package and initializer; local settings do not use a backend.
- [x] `npm audit` and `npm audit --omit=dev` report zero vulnerabilities after compatible dependency updates.
- [x] Admin logout now clears its browser-session unlock flag.
- [x] Added a Vercel SPA rewrite so client-side routes resolve to the React app on direct requests.
- [ ] Create a separate Vercel project/domain for each municipality; do not treat browser storage as shared tenant storage.
- [ ] Confirm whether each municipality will use the same physical browser for setup/admin and public kiosk use.
- [ ] Survey and configure actual kiosk/office waypoint routes for the production building.
- [ ] Reduce or deliberately accept the large public video/model download sizes.
- [ ] Deploy and smoke-test Vercel routing, including a direct visit to `/admin`.

## 1. Before pushing to GitHub

- [ ] Inspect `git status` and `git diff`; stage only intended application files.
- [ ] Never stage or commit `.env`, credentials, private contact data, or private building information. `.env` is currently ignored, but verify it is not already tracked with `git ls-files -- .env`.
- [ ] Search commit history as well as the current files for secrets if any real credentials have ever been used. Removing a secret from the latest commit does not remove it from Git history; rotate it.
- [ ] Review public asset rights and privacy: the city seal, the drone video, building model, office data, and route/pin locations should all be approved for public access.
- [ ] Decide what to do with large assets before pushing. `public/pic/DJI_0147.mp4` is about **83.83 MB** and is already tracked. `public/TEST.glb` is about **48.91 MB** and is currently untracked, but the default app model points to `/TEST.glb`. GitHub warns on individual files over 50 MB and blocks files over 100 MB. Compress/transcode or replace oversized assets where practical; use Git LFS only if its storage/bandwidth limits and Vercel delivery behavior are acceptable.
- [ ] Review whether the older `public/model2/` and `public/models/reference/` files still need to be published. Files under `public/` are deployed as public static assets.
- [ ] Commit `package-lock.json` with dependency changes and use `npm ci` for reproducible installs.

## 2. Security and administration

- [ ] **Do not rely on the current admin PIN for security.** The app contains the default PIN `CityHall2026` in client-side code. The browser-side SHA-256 check and sessionStorage unlock can be inspected or bypassed; they are not authentication or authorization. Separate municipality domains isolate browser storage from each other, but do not secure `/admin` from visitors to that domain.
- [ ] For a dedicated kiosk, physically secure the device and browser, prevent public access to admin mode, and avoid storing sensitive information. If staff need remote admin or the public can reach admin functions, add trusted server-side authentication and authorization before launch.
- [ ] No Firebase data backend is used for the chosen single-kiosk/local-storage setup. If shared remote administration is added later, use a trusted identity provider and server-enforced data rules; do not put service-account credentials or private keys in `VITE_*` variables.
- [ ] Protect reads and writes on the server, not just the React route. Hiding `/admin`, hashing a client PIN, or Vercel's client-side UI is not a substitute for data authorization. Vercel Deployment Protection can protect an entire deployment where available, but would also block public kiosk visitors to that deployment.
- [ ] Keep only information intended for the public in the browser bundle and public assets.
- [ ] If a remote backend is added later, configure provider restrictions and server-enforced authorization rules before publishing. Do not put service-account credentials or private keys in client-side environment variables.

## 3. Configuration, files, and pathfinding

- [x] Product mode selected: one separate Vercel site per municipality; one dedicated kiosk/browser stores that municipality's edits locally.
- [ ] Keep each municipality's kiosk on the same browser profile and domain used to configure it. Different browsers/devices—even at the same municipality—will start with their own data and will not receive those edits.
- [ ] Remember that organization settings and uploaded GLB/logo files are currently stored only in the browser that made the edits (localStorage/IndexedDB). They are **not committed to Git, included in a Vercel deployment, or synchronized to another kiosk**. Clearing browser data also removes those local edits/files.
- [ ] Plan a safe way to back up or recreate each kiosk's configuration and uploaded files. The current UI does not provide an export/import and restore workflow.
- [ ] The checked-in defaults have an unplaced kiosk start waypoint and no route edges. Configure and validate real pins and edges on the kiosk browser. Otherwise destinations will correctly show that no route is available.
- [ ] Re-upload the building model and logo on any browser that uses the current local-only admin flow. For a deployed app, preferably serve approved, optimized model/logo assets from a managed shared source rather than relying on one browser's IndexedDB.
- [ ] Assign each floor's GLB hierarchy group and verify floor visibility, disabled-floor behavior, office assignments, and stair/elevator transitions against the actual building.
- [ ] Test an office route from the kiosk to its destination on the deployed build; confirm there are no wall-crossing shortcuts and that unavailable routes are clearly reported.

## 4. Vercel project setup

- [ ] Import the correct GitHub repository and set the **Root Directory** to the frontend project directory (the repository root for this repository).
- [ ] Select the Vite framework preset, or set **Build Command** to `npm run build` and **Output Directory** to `dist`.
- [ ] Create one Vercel project per municipality. Projects may build from the same repository/branch, but each municipality uses its own deployed domain and browser-local configuration.
- [ ] Use a supported Node.js LTS version (for example, Node 20) in Vercel and in local checks.
- [x] No environment variables are currently required for this frontend's runtime.
- [ ] Verify the configured SPA fallback by opening and refreshing the production URL `/admin` directly after deployment.
- [ ] Confirm HTTPS is active for the production domain and set the desired production branch/preview deployment behavior.
- [ ] Inspect the first Vercel build logs for missing files, failed asset requests, and bundle-size warnings.

## 5. Build and live-site smoke test

- [ ] From a clean checkout, run `npm ci`.
- [ ] Run `npm run build`; current build works, but Vite warns that the GLTFLoader chunk is about 569 kB minified. Check real load time on the target kiosk/network and optimize further if needed.
- [ ] Run `npm run preview` and test the production build locally before pushing.
- [ ] Confirm the landing page, logo/video fallback, office search, floor selector, reset/recenter, and 3D model on desktop and touchscreen/mobile sizes.
- [ ] Confirm GLB and video requests work over HTTPS. The 83.83 MB background video and 48.91 MB default model can significantly slow first use, particularly on municipal Wi-Fi.
- [ ] Verify `/admin` is protected by the actual production authorization design; do not consider the existing PIN screen sufficient.
- [ ] Verify organization changes, uploaded files, office edits, and route graph behavior after a refresh and from a second browser/device. The current local-only implementation will not pass the cross-device persistence test by design.
- [ ] Check browser console/network errors, keyboard focus, touch targets, and that all displayed contact links are valid.

## 6. Project maintenance gaps

- [ ] `package.json` currently has no test or lint scripts. Add those as a separate engineering task before relying on automated regression checks; until then, record and perform manual route/admin smoke tests for releases.
- [ ] Update the older project/file-structure description in `README.md` when convenient; it does not fully reflect the current admin components, pathfinding services, or local-only asset storage.

## Recommended order

1. Create a separate Vercel project/domain per municipality and plan for one persistent kiosk browser per site.
2. Secure the kiosk device and avoid storing sensitive information; the current client-side admin PIN does not protect a public admin URL.
3. Survey/configure and verify real floor groups and waypoint routes in each kiosk's browser.
4. Optimize/approve the 84 MB video and 49 MB model; ensure the required model asset is deliberately included in Git.
5. Push the reviewed source to GitHub, configure Vercel, deploy a preview, and complete the smoke test before assigning public domains.
