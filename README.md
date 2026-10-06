# Olongapo City Hall Navigator Frontend

This is the React/Vite frontend for the Olongapo City Hall 3D indoor wayfinding and office pathfinding system.

For GitHub/Vercel setup, outstanding deployment risks, and a pre-launch checklist, see
[DEPLOYMENT-CHECKLIST.md](./DEPLOYMENT-CHECKLIST.md).

## What is inside

- React front end using Vite
- Landing screen with "touch anywhere to proceed"
- Header with city hall name, live time, and live date
- Office finder sidebar with search
- Lazy-loaded Three.js building viewer and floor controls
- Office search and manually configured, waypoint-graph routes
- Browser-local admin tools for organization, floors, offices, pins, and paths
- Browser-local settings in localStorage and uploaded GLB/logo files in IndexedDB (one browser per deployed municipality; no Firebase required)

## File structure

```text
frontend/
  index.html
  package.json
  vite.config.js
  src/
    App.jsx
    AdminApp.jsx
    main.jsx
    styles.css
    components/
      Header.jsx
      LandingScreen.jsx
      MapPreview.jsx
      OfficeSidebar.jsx
      admin/
    data/
      navigatorDefaults.js
      offices.js
    hooks/
    services/
      modelGroups.js
      navigatorConfig.js
      pathfinding.js
  public/
    TEST.glb
    model2/
    pic/
```

## How to run

Install dependencies:

```bash
npm install
```

Start the website:

```bash
npm run dev
```

Then open the local URL shown by Vite, usually:

```text
http://localhost:5173
```

## Where to edit

- Manage organization identity and contact information in the admin **Settings** section.
- Add or update offices in `src/data/offices.js`.
- Upload one complete binary GLB in **Settings**; floor-specific files are no longer required.
- Assign detected GLB hierarchy groups to floors in the admin **Floors** section.
- The Three.js viewer code is in `src/components/ThreeMapViewer.jsx`.
- Floor configuration stores a stable floor ID, display order, enabled state, description, and optional model-group name. Existing label-based office and route data is normalized to floor IDs when loaded.
- Organization logos accept PNG, JPG, and WebP files only; SVG uploads are intentionally rejected.
- The deployment uses no Firebase environment variables. Each municipality should have its own Vercel project and a dedicated kiosk/browser for its local settings.

## Configuring safe indoor routes

Routes use an explicit waypoint graph. The default `entrance-kiosk` start has no surveyed position and there are no default edges, so an office is intentionally reported as unavailable until its route is configured. The viewer does not guess a straight-line route.

1. In **Map Pins**, select a floor, edit **Entrance Kiosk**, then click its actual position on the model. Use **Add Pin** for office entrances, corridor points, and each stair/elevator landing. Link office pins to their office records.
2. In **Paths**, choose **Create Route**, select the kiosk and linked office entrance, then click points along each walkable corridor. For a floor transition, add a stair pin on the departure floor, select the adjacent floor and add a matching stair pin; elevators may connect their configured floors directly.
3. Select **Finish at office** to validate the complete chain, then **Save Route**. Incomplete drafts are discarded with **Cancel**. Saved route edges stay explicit; clicking an office does not create a shortcut.
4. Check graph validation messages and verify the route visually on each floor. The map playback animates along the stored 3D points and changes floors at configured transitions.

Waypoint coordinates are stored in model-local units and the current admin config is saved in the browser's local storage. Uploaded GLB and logo binaries are stored in IndexedDB on that browser. This is a per-browser configuration, not an authoritative shared or secured backend; the client-side admin PIN is not access control. Do not use client-side waypoint data to enforce access control or other security decisions; publish/validate shared configuration through an authorized backend if multiple kiosks must use the same graph. Public GLB assets and browser-stored map data must be treated as public.

## GitHub group collaboration guide

Use branches so each group member can work without changing the main project right away.

### 1. Get the latest project files

Before starting your task, make sure your local `main` branch is updated:

```bash
git switch main
git pull origin main
```

### 2. Create your own branch

Use a branch name that includes your name and task:

```bash
git switch -c feature/your-name-task
```

Example:

```bash
git switch -c feature/john-office-sidebar
```

Good branch name examples:

```text
feature/john-navbar
feature/maria-login-page
feature/kevin-map-viewer
fix/anna-sidebar-search
```

### 3. Make your changes

Edit the files assigned to you. After editing, check what changed:

```bash
git status
```

### 4. Save your work with a commit

Add and commit your changes:

```bash
git add .
git commit -m "Add office sidebar updates"
```

Use a short message that explains what you changed.

### 5. Upload your branch to GitHub

Push your branch:

```bash
git push -u origin feature/your-name-task
```

Example:

```bash
git push -u origin feature/john-office-sidebar
```

### 6. Create a pull request

On GitHub:

1. Open the repository.
2. Click **Compare & pull request**.
3. Make sure the base branch is `main`.
4. Add a short title and description.
5. Click **Create pull request**.

Your group can review the pull request before merging it into `main`.

### 7. After your work is merged

Update your local project again before starting a new task:

```bash
git switch main
git pull origin main
```

Then create a new branch for the next task.

### Important rules for the group

- Do not push directly to `main`.
- Create one branch per task.
- Pull the latest `main` before starting new work.
- Commit small changes with clear messages.
- If two members edit the same file, talk first to avoid conflicts.
