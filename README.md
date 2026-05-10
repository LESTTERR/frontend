# MuniciMap Frontend

This is the first front-end version for a municipal 3D map and office pathfinding system.

## What is inside

- React front end using Vite
- Landing screen with "touch anywhere to proceed"
- Header with municipal office name, live time, and live date
- Office finder sidebar with search
- Main map area ready for a future Blender/Three.js model
- Olongapo City Hall `.glb` model loaded with Three.js
- Simple office data file
- Firebase setup file for later Firestore data

## File structure

```text
frontend/
  index.html
  package.json
  vite.config.js
  .env.example
  src/
    App.jsx
    main.jsx
    styles.css
    components/
      Header.jsx
      LandingScreen.jsx
      MapPreview.jsx
      OfficeDetails.jsx
      OfficeSidebar.jsx
    data/
      offices.js
    hooks/
      useClock.js
    services/
      firebase.js
  public/
    models/
      OCH AF.glb
      reference/
        OCH AF only.glb
        OCH AF NAVMESH.glb
        OCH GF (2).glb
        OCH GF only (1).glb
        OCH GF NAVMESH (1).glb
        OCH 2F.glb
        OCH 2F only.glb
        OCH 2F NAVMESH.glb
        OCH 3F.glb
        OCH 3F only.glb
        OCH 3F NAVMESH.glb
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

- Change the municipality name in `src/App.jsx`.
- Add or update offices in `src/data/offices.js`.
- The current 3D model is the all-floor combined model in `public/models/OCH AF.glb`.
- The Three.js viewer code is in `src/components/ThreeMapViewer.jsx`.
- Keep only the active whole-building GLB at the top level of `public/models/`. Put split floor, navmesh-only, or reference exports in `public/models/reference/` so they do not get confused with the active model.
- If you export a newer whole-building Blender model, place that combined file in `public/models/` and update the `DEFAULT_MODEL_PATH` value in `src/components/ThreeMapViewer.jsx` if the main combined file name changes.
- Pathfinding can read `Marker_*` route points and `Path_*_to_*` links, build routes from `*_DOOR_MARK`, `*_HALL`, and `*_WALK` objects, and hide navmesh objects named `Navmesh`, `1F_Navmesh`, `2F_Navmesh`, or `3F_Navmesh`.
- The current `models` GLBs contain floor meshes and navmesh meshes, but not individual office marker objects. Office destinations use the `routeNode` and `mapPosition` anchors in `src/data/offices.js`, with generated corridor, stair, and elevator connection points for all floors.
- Add Firebase keys by copying `.env.example` to `.env` and filling in your Firebase project values.

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
