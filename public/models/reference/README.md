# Reference Model Exports

These GLB files are source/reference exports only. The application loads the active whole-building model from:

```text
public/models/OCH AF.glb
```

Keep split floor files, navmesh-only files, and duplicate combined exports in this folder so they do not get confused with the active model.

## File Notes

- `OCH AF only.glb`: all floor visual meshes without navmeshes.
- `OCH AF NAVMESH.glb`: all floor navmeshes without visual meshes.
- `OCH GF (2).glb`, `OCH 2F.glb`, `OCH 3F.glb`: separate floor exports with their own navmesh.
- `OCH GF only (1).glb`, `OCH 2F only.glb`, `OCH 3F only.glb`: separate visual floor meshes only.
- `OCH GF NAVMESH (1).glb`, `OCH 2F NAVMESH.glb`, `OCH 3F NAVMESH.glb`: separate navmesh-only exports.
