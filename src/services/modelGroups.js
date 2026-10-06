export async function inspectGlbFloorGroups(file) {
  if (!file || !file.name.toLowerCase().endsWith(".glb")) {
    throw new Error("Choose a binary .glb building model.");
  }

  if (file.size < 20 || file.size > 100 * 1024 * 1024) {
    throw new Error("The GLB file must be between 20 bytes and 100 MB.");
  }

  const buffer = await file.arrayBuffer();
  const header = new DataView(buffer);
  if (header.getUint32(0, true) !== 0x46546c67) {
    throw new Error("This file is not a valid binary glTF (GLB) model.");
  }
  if (header.getUint32(4, true) !== 2 || header.getUint32(8, true) !== buffer.byteLength) {
    throw new Error("The GLB header or declared file length is invalid.");
  }

  const jsonChunkLength = header.getUint32(12, true);
  const jsonChunkType = header.getUint32(16, true);
  if (
    jsonChunkType !== 0x4e4f534a ||
    jsonChunkLength > buffer.byteLength - 20
  ) {
    throw new Error("The GLB file is missing a valid JSON scene chunk.");
  }
  const jsonBytes = new Uint8Array(buffer, 20, jsonChunkLength);
  const jsonText = new TextDecoder()
    .decode(jsonBytes)
    .replace(/[\u0000\u0020]+$/g, "");
  const gltfDocument = JSON.parse(jsonText);
  const safeUri = (uri, kind) =>
    kind === "image"
      ? /^data:image\/(?:png|jpeg|webp);base64,/i.test(uri)
      : /^data:application\/(?:octet-stream|gltf-buffer);base64,/i.test(uri);
  const externalBuffer = gltfDocument.buffers?.find(
    (resource) => resource.uri && !safeUri(resource.uri, "buffer"),
  );
  const externalImage = gltfDocument.images?.find(
    (resource) => resource.uri && !safeUri(resource.uri, "image"),
  );
  const unsupportedImage = gltfDocument.images?.find(
    (resource) =>
      resource.mimeType &&
      !/^image\/(?:png|jpeg|webp)$/i.test(resource.mimeType),
  );
  if (externalBuffer || externalImage || unsupportedImage) {
    throw new Error(
      "External model resources are not allowed. Embed model data and PNG, JPEG, or WebP textures in the GLB.",
    );
  }

  const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
  const loader = new GLTFLoader();
  const gltf = await new Promise((resolve, reject) => {
    loader.parse(buffer, "", resolve, reject);
  });

  const groups = [];
  gltf.scene.traverse((object) => {
    if (object !== gltf.scene && object.children.length > 0 && object.name.trim()) {
      groups.push({
        name: object.name.trim(),
        isRootGroup: object.parent === gltf.scene,
      });
    }
  });

  gltf.scene.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry?.dispose();
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    materials.forEach((material) => {
      if (!material) return;
      Object.values(material).forEach((value) => {
        if (value?.isTexture) value.dispose();
      });
      material.dispose();
    });
  });

  const groupNameCounts = new Map();
  groups.forEach(({ name }) => {
    groupNameCounts.set(name, (groupNameCounts.get(name) || 0) + 1);
  });
  const uniqueGroups = groups.filter(
    ({ name }) => groupNameCounts.get(name) === 1,
  );
  const floorLikeGroups = uniqueGroups
    .filter(({ name }) =>
      /(?:^|[^a-z])(?:floor|level|storey|story|basement|ground|roof|mezzanine)(?:$|[^a-z])/i.test(
        name,
      ),
    )
    .map(({ name }) => name);
  const candidates = floorLikeGroups.length
    ? floorLikeGroups
    : uniqueGroups.filter((group) => group.isRootGroup).map((group) => group.name);

  return [...new Set(candidates)];
}
