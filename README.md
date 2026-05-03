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
