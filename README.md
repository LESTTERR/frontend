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
      och-building.glb
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
- The current 3D model is in `public/models/och-building.glb`.
- The Three.js viewer code is in `src/components/ThreeMapViewer.jsx`.
- If you export a newer Blender model, replace `public/models/och-building.glb` with the new `.glb` file.
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
