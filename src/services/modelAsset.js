const modelAssets = new Map();
const MAX_CACHED_MODELS = 8;

export function loadModelAsset(sourcePath) {
  const cachedAsset = modelAssets.get(sourcePath);
  if (cachedAsset) {
    return cachedAsset;
  }

  const assetPromise = import("three/addons/loaders/GLTFLoader.js")
    .then(
      ({ GLTFLoader }) =>
        new Promise((resolve, reject) => {
          new GLTFLoader().load(sourcePath, resolve, undefined, reject);
        }),
    )
    .catch((error) => {
      if (modelAssets.get(sourcePath) === assetPromise) {
        modelAssets.delete(sourcePath);
      }
      throw error;
    });

  modelAssets.set(sourcePath, assetPromise);
  while (modelAssets.size > MAX_CACHED_MODELS) {
    modelAssets.delete(modelAssets.keys().next().value);
  }
  return assetPromise;
}

export function preloadModelAssets(sourcePaths) {
  return Promise.allSettled(
    [...new Set(sourcePaths)].map((sourcePath) => loadModelAsset(sourcePath)),
  );
}

export function cloneModelScene(sourceScene) {
  const scene = sourceScene.clone(true);

  scene.traverse((object) => {
    if (!object.isMesh) {
      return;
    }

    if (object.material) {
      const cloneMaterial = (material) => {
        const clonedMaterial = material.clone();
        Object.keys(clonedMaterial).forEach((key) => {
          const value = clonedMaterial[key];
          if (value?.isTexture) {
            clonedMaterial[key] = value.clone();
          }
        });
        return clonedMaterial;
      };

      object.material = Array.isArray(object.material)
        ? object.material.map(cloneMaterial)
        : cloneMaterial(object.material);
    }
  });

  return scene;
}
