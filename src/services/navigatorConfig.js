import {
  createDefaultNavigatorConfig,
  defaultFloors,
  defaultModelPaths,
  DEFAULT_NAVIGATION_START_NODE_ID,
} from "../data/navigatorDefaults.js";

export const NAVIGATOR_CONFIG_STORAGE_KEY = "olongapo.navigator.config.v1";
export const NAVIGATOR_CONFIG_UPDATED_EVENT = "navigator-config-updated";

const MODEL_DB_NAME = "olongapo-navigator-assets";
const MODEL_DB_VERSION = 1;
const MODEL_STORE_NAME = "model-files";

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function getStorage(storageType) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window[storageType] ?? null;
  } catch {
    return null;
  }
}

function safeReadStorage(key, storageType = "localStorage") {
  const storage = getStorage(storageType);

  if (!storage) {
    return null;
  }

  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeWriteStorage(key, value, storageType = "localStorage") {
  const storage = getStorage(storageType);

  if (!storage) {
    return false;
  }

  try {
    storage.setItem(key, String(value));
    return true;
  } catch {
    return false;
  }
}

function safeRemoveStorage(key, storageType = "localStorage") {
  const storage = getStorage(storageType);

  if (!storage) {
    return false;
  }

  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function sanitizeAssetPath(value, fallback = "/TEST.glb") {
  if (typeof value !== "string") {
    return fallback;
  }

  const cleanedValue = value.trim();
  const normalizedValue = cleanedValue.toLowerCase();

  if (!cleanedValue || cleanedValue.includes("\u0000")) {
    return fallback;
  }

  if (
    normalizedValue.startsWith("javascript:") ||
    normalizedValue.startsWith("data:") ||
    normalizedValue.startsWith("vbscript:")
  ) {
    return fallback;
  }

  return cleanedValue;
}

function normalizeAdminPin(pin) {
  return String(pin ?? "").trim().replace(/\s+/g, "");
}

const ADMIN_PIN_SALT = "olongapo.navigator.admin.pin.v1";

async function hashAdminPin(pin) {
  const normalizedPin = normalizeAdminPin(pin);

  if (!normalizedPin) {
    return "";
  }

  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`${ADMIN_PIN_SALT}:${normalizedPin}`),
  );

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getOrdinalFloorLabel(number) {
  const normalizedNumber = Number(number) || 1;
  const suffix =
    normalizedNumber % 100 >= 11 && normalizedNumber % 100 <= 13
      ? "th"
      : normalizedNumber % 10 === 1
        ? "st"
        : normalizedNumber % 10 === 2
          ? "nd"
          : normalizedNumber % 10 === 3
            ? "rd"
            : "th";

  return `${normalizedNumber}${suffix} Floor`;
}

export function createSlug(value, fallback = "item") {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || fallback;
}

function clampPercent(value, fallback = 50) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.min(Math.max(numberValue, 0), 100);
}

function normalizeMapPosition(mapPosition = {}) {
  return {
    x: clampPercent(mapPosition.x),
    y: clampPercent(mapPosition.y),
  };
}

function normalizeFloor(floor, index) {
  const requestedFloorNumber = Number(floor?.number);
  const floorNumber =
    Number.isInteger(requestedFloorNumber) && requestedFloorNumber > 0
      ? requestedFloorNumber
      : index + 1;
  const requestedOrder = Number(floor?.order);
  const order =
    Number.isInteger(requestedOrder) && requestedOrder > 0
      ? requestedOrder
      : floorNumber;
  const label = floor?.label?.trim() || getOrdinalFloorLabel(floorNumber);

  return {
    id: floor?.id || `floor-${floorNumber}`,
    label,
    number: floorNumber,
    modelPath: floor?.modelPath || defaultModelPaths[index] || "",
    modelGroupName: String(floor?.modelGroupName || "").trim(),
    order,
    enabled: floor?.enabled !== false,
    description: String(floor?.description || "").trim(),
  };
}

function resolveFloorReference(value, floorId, floors, fallbackIndex) {
  const byId = floors.find((floor) => floor.id === floorId);
  const byLabel = floors.find((floor) => floor.label === value);
  const byNumber = floors.find((floor) => String(floor.number) === String(value));
  return byId || byLabel || byNumber || floors[fallbackIndex % floors.length] || floors[0];
}

function normalizeOffice(office, index, floors) {
  const name = office?.name?.trim() || `Office ${index + 1}`;
  const floor = resolveFloorReference(
    office?.floor,
    office?.floorId,
    floors,
    index,
  );
  const floorLabel = floor?.label || defaultFloors[0].label;
  const modelObjects = Array.isArray(office?.modelObjects)
    ? office.modelObjects.filter(Boolean)
    : [];
  const keywords = Array.isArray(office?.keywords)
    ? office.keywords.filter(Boolean)
    : [];

  return {
    id: office?.id || createSlug(name, `office-${index + 1}`),
    name,
    category: office?.category?.trim() || "Public Service",
    floorId: floor?.id || defaultFloors[0].id,
    floor: floorLabel,
    room: office?.room?.trim() || name,
    hours: office?.hours || "8:00 AM - 5:00 PM",
    description:
      office?.description?.trim() ||
      `${name} is assigned to ${floorLabel}.`,
    keywords: [...new Set([name, floorLabel, ...modelObjects, ...keywords])],
    mapPosition: normalizeMapPosition(office?.mapPosition),
    modelObjects,
    routeNode: office?.routeNode || "",
    showLabel: office?.showLabel !== false,
  };
}

function normalizePathNode(node, index, floors) {
  const floor = resolveFloorReference(node?.floor, node?.floorId, floors, index);
  const floorLabel = floor?.label || defaultFloors[0].label;
  const name = node?.name?.trim() || `Path Node ${index + 1}`;

  const position =
    node?.position &&
    ["x", "y", "z"].every((axis) => Number.isFinite(node.position[axis]))
      ? {
          x: Number(node.position.x),
          y: Number(node.position.y),
          z: Number(node.position.z),
        }
      : null;
  const nodeType = String(node?.type || "").toLowerCase();
  const type =
    nodeType === "stair" || nodeType === "stairs"
      ? "stairs"
      : ["office", "entrance", "kiosk", "elevator"].includes(nodeType)
        ? nodeType
        : "waypoint";

  return {
    id: node?.id || createSlug(name, `path-node-${index + 1}`),
    name,
    type,
    floorId: floor?.id || defaultFloors[0].id,
    floor: floorLabel,
    mapPosition: normalizeMapPosition(node?.mapPosition),
    position,
    officeId: typeof node?.officeId === "string" ? node.officeId : "",
  };
}

function getPathFloorNumber(floor) {
  const match = String(floor ?? "").match(/\d+/);
  return match ? Number(match[0]) : null;
}

function inferPathEdgeType(edge, nodesById, floors) {
  const from = nodesById.get(edge?.from);
  const to = nodesById.get(edge?.to);
  if (!from || !to) return "walk";

  const fromFloor =
    floors.find((floor) => floor.id === from.floorId)?.order ??
    getPathFloorNumber(from.floor);
  const toFloor =
    floors.find((floor) => floor.id === to.floorId)?.order ??
    getPathFloorNumber(to.floor);
  if (fromFloor === null || toFloor === null || fromFloor === toFloor) {
    return "walk";
  }

  if (from.type === "elevator" && to.type === "elevator") {
    return "elevator";
  }
  if (
    Math.abs(fromFloor - toFloor) === 1 &&
    ["stair", "stairs"].includes(from.type) &&
    ["stair", "stairs"].includes(to.type)
  ) {
    return "stairs";
  }
  return "walk";
}

function normalizePathEdge(edge, index, nodesById, floors) {
  return {
    id: edge?.id || `edge-${index + 1}`,
    from: edge?.from || "",
    to: edge?.to || "",
    bidirectional: edge?.bidirectional !== false,
    type: ["walk", "stairs", "elevator"].includes(edge?.type)
      ? edge.type
      : inferPathEdgeType(edge, nodesById, floors),
  };
}

export function normalizeNavigatorConfig(config = {}) {
  const defaults = createDefaultNavigatorConfig();
  const rawFloors = Array.isArray(config.floors) && config.floors.length > 0
    ? config.floors
    : defaults.floors;
  const floors = rawFloors
    .map(normalizeFloor)
    .sort((first, second) => first.order - second.order);
  if (!floors.some((floor) => floor.enabled)) {
    floors[0].enabled = true;
  }
  const rawOffices = Array.isArray(config.offices) && config.offices.length > 0
    ? config.offices
    : defaults.offices;
  const rawPathNodes = Array.isArray(config.pathNodes)
    ? config.pathNodes
    : defaults.pathNodes;
  const rawPathEdges = Array.isArray(config.pathEdges)
    ? config.pathEdges
    : defaults.pathEdges;
  const pathNodes = rawPathNodes.map((node, index) =>
    normalizePathNode(node, index, floors),
  );
  if (!pathNodes.some((node) => node.id === DEFAULT_NAVIGATION_START_NODE_ID)) {
    pathNodes.unshift(defaults.pathNodes[0]);
  }
  const pathNodesById = new Map(pathNodes.map((node) => [node.id, node]));
  const sanitizedModelPaths = Array.isArray(config.modelPaths) && config.modelPaths.length > 0
    ? config.modelPaths
        .map((path) => sanitizeAssetPath(path, "/TEST.glb"))
        .filter(Boolean)
    : defaults.modelPaths;

  return {
    ...defaults,
    ...config,
    cityName: config.cityName?.trim() || defaults.cityName,
    organizationType:
      config.organizationType?.trim() || defaults.organizationType,
    organizationName:
      config.organizationName?.trim() ||
      config.cityName?.trim() ||
      defaults.organizationName,
    address: String(config.address || "").trim(),
    city: String(config.city || config.cityName || defaults.city).trim(),
    province: String(config.province || "").trim(),
    country: String(config.country || defaults.country).trim(),
    phone: String(config.phone || "").trim(),
    email: String(config.email || "").trim(),
    website: String(config.website || "").trim(),
    logoFileId: String(config.logoFileId || ""),
    navigatorTitle: config.navigatorTitle?.trim() || defaults.navigatorTitle,
    landingKicker: config.landingKicker?.trim() || defaults.landingKicker,
    landingTagline: config.landingTagline?.trim() || defaults.landingTagline,
    modelPaths: sanitizedModelPaths,
    modelFiles: Array.isArray(config.modelFiles) ? config.modelFiles : [],
    buildingModelFileId: String(config.buildingModelFileId || ""),
    modelGroupNames: Array.isArray(config.modelGroupNames)
      ? [...new Set(config.modelGroupNames.filter((name) => typeof name === "string").map((name) => name.trim()).filter(Boolean))]
      : [],
    floors: floors.map((f) => ({
      ...f,
      modelPath: sanitizeAssetPath(f.modelPath, "/TEST.glb"),
    })),
    offices: rawOffices.map((office, index) => normalizeOffice(office, index, floors)),
    pathNodes,
    pathEdges: rawPathEdges
      .map((edge, index) => normalizePathEdge(edge, index, pathNodesById))
      .filter((edge) => edge.from && edge.to && edge.from !== edge.to),
    startNodeId:
      typeof config.startNodeId === "string" && config.startNodeId
        ? config.startNodeId
        : DEFAULT_NAVIGATION_START_NODE_ID,
  };
}

export function loadNavigatorConfig() {
  try {
    const savedConfig = safeReadStorage(NAVIGATOR_CONFIG_STORAGE_KEY, "localStorage");

    if (savedConfig) {
      const parsedConfig = JSON.parse(savedConfig);

      if (parsedConfig && typeof parsedConfig === "object") {
        return normalizeNavigatorConfig(parsedConfig);
      }
    }
  } catch {
    return createDefaultNavigatorConfig();
  }

  return createDefaultNavigatorConfig();
}

export function saveNavigatorConfig(config) {
  const normalizedConfig = normalizeNavigatorConfig({
    ...config,
    updatedAt: new Date().toISOString(),
  });

  const written = safeWriteStorage(
    NAVIGATOR_CONFIG_STORAGE_KEY,
    JSON.stringify(normalizedConfig),
    "localStorage",
  );

  if (!written) {
    return false;
  }

  window.dispatchEvent(
    new CustomEvent(NAVIGATOR_CONFIG_UPDATED_EVENT, {
      detail: normalizedConfig,
    }),
  );
  return normalizedConfig;
}

export function resetNavigatorConfig() {
  const defaultConfig = createDefaultNavigatorConfig();

  safeRemoveStorage(NAVIGATOR_CONFIG_STORAGE_KEY, "localStorage");
  window.dispatchEvent(
    new CustomEvent(NAVIGATOR_CONFIG_UPDATED_EVENT, {
      detail: defaultConfig,
    }),
  );
  return defaultConfig;
}

function openModelDatabase() {
  if (!window.indexedDB) {
    return Promise.reject(new Error("IndexedDB is not available."));
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(MODEL_DB_NAME, MODEL_DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(MODEL_STORE_NAME)) {
        database.createObjectStore(MODEL_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function runModelStoreTransaction(mode, callback) {
  return openModelDatabase().then(
    (database) =>
      new Promise((resolve, reject) => {
        const transaction = database.transaction(MODEL_STORE_NAME, mode);
        const store = transaction.objectStore(MODEL_STORE_NAME);
        const request = callback(store);

        transaction.oncomplete = () => {
          database.close();
          resolve(request?.result);
        };
        transaction.onerror = () => {
          const error = transaction.error || request?.error;
          database.close();
          reject(error);
        };
      }),
  );
}

export async function saveModelFile(file) {
  const uniqueId =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const id = `asset-${uniqueId}-${createSlug(file.name, "uploaded-file")}`;
  const modelRecord = {
    id,
    name: file.name,
    type: file.type || "model/gltf-binary",
    size: file.size,
    lastModified: file.lastModified,
    createdAt: new Date().toISOString(),
    file,
  };

  await runModelStoreTransaction("readwrite", (store) => store.put(modelRecord));
  const { file: _file, ...metadata } = modelRecord;

  return metadata;
}

export async function deleteModelFile(fileId) {
  await runModelStoreTransaction("readwrite", (store) => store.delete(fileId));
}

export async function createModelObjectUrls(modelFiles = []) {
  const urls = [];

  for (const modelFile of modelFiles) {
    try {
      const record = await runModelStoreTransaction("readonly", (store) =>
        store.get(modelFile.id),
      );

      if (record?.file) {
        urls.push({
          id: modelFile.id,
          name: modelFile.name,
          url: URL.createObjectURL(record.file),
        });
      }
    } catch {
      // A missing local model should not stop the public navigator from loading.
    }
  }

  return urls;
}

export function exportNavigatorConfig(config) {
  return cloneJson(normalizeNavigatorConfig(config));
}

const ADMIN_PIN_CODE_KEY = "olongapo.admin.pin";
const LEGACY_ADMIN_PIN = "CityHall2026";
const DEFAULT_ADMIN_PIN = "admin123";

export function getAdminPinCode() {
  return DEFAULT_ADMIN_PIN;
}

export async function setAdminPinCode(pin) {
  const normalizedPin = normalizeAdminPin(pin);

  if (!normalizedPin) {
    return false;
  }

  const hashedPin = await hashAdminPin(normalizedPin);
  return safeWriteStorage(ADMIN_PIN_CODE_KEY, hashedPin, "localStorage");
}

export function isAdminUnlocked() {
  return safeReadStorage("olongapo.admin.unlocked", "sessionStorage") === "true";
}

export async function unlockAdmin(pin) {
  const normalizedPin = normalizeAdminPin(pin);

  if (!normalizedPin) {
    return false;
  }

  const storedHash = safeReadStorage(ADMIN_PIN_CODE_KEY, "localStorage") || "";
  const candidateHash = await hashAdminPin(normalizedPin);
  const legacyHash = await hashAdminPin(LEGACY_ADMIN_PIN);
  const expectedHash = storedHash || (await hashAdminPin(DEFAULT_ADMIN_PIN));

  if (candidateHash !== expectedHash && candidateHash !== legacyHash) {
    return false;
  }

  if (storedHash && candidateHash === legacyHash) {
    await setAdminPinCode(DEFAULT_ADMIN_PIN);
  }

  safeWriteStorage("olongapo.admin.unlocked", "true", "sessionStorage");
  return true;
}

export function lockAdmin() {
  safeRemoveStorage("olongapo.admin.unlocked", "sessionStorage");
}

export function updateOffice(offices, officeId, changes) {
  return offices.map((office) =>
    office.id === officeId ? { ...office, ...changes } : office,
  );
}

export function addOffice(offices, office) {
  return [...offices, { ...office, id: office.id || createSlug(office.name, `office-${Date.now()}`) }];
}

export function removeOffice(offices, officeId) {
  return offices.filter((office) => office.id !== officeId);
}

export function updateFloor(floors, floorId, changes) {
  return floors.map((floor) =>
    floor.id === floorId ? { ...floor, ...changes } : floor,
  );
}

export function addFloor(floors, floor) {
  return [...floors, { ...floor, id: floor.id || `floor-${floors.length + 1}` }];
}

export function removeFloor(floors, floorId) {
  return floors.filter((floor) => floor.id !== floorId);
}

export function updatePathNode(pathNodes, nodeId, changes) {
  return pathNodes.map((node) =>
    node.id === nodeId ? { ...node, ...changes } : node,
  );
}

export function addPathNode(pathNodes, node) {
  return [...pathNodes, { ...node, id: node.id || createSlug(node.name, `path-node-${Date.now()}`) }];
}

export function removePathNode(pathNodes, nodeId) {
  return pathNodes.filter((node) => node.id !== nodeId);
}

export function updatePathEdge(pathEdges, edgeId, changes) {
  return pathEdges.map((edge) =>
    edge.id === edgeId ? { ...edge, ...changes } : edge,
  );
}

export function addPathEdge(pathEdges, edge) {
  return [...pathEdges, { ...edge, id: edge.id || `edge-${Date.now()}` }];
}

export function removePathEdge(pathEdges, edgeId) {
  return pathEdges.filter((edge) => edge.id !== edgeId);
}

export function updateMunicipalityConfig(config, changes) {
  return {
    ...config,
    cityName: changes.cityName ?? config.cityName,
    organizationType: changes.organizationType ?? config.organizationType,
    organizationName: changes.organizationName ?? config.organizationName,
    address: changes.address ?? config.address,
    city: changes.city ?? config.city,
    province: changes.province ?? config.province,
    country: changes.country ?? config.country,
    phone: changes.phone ?? config.phone,
    email: changes.email ?? config.email,
    website: changes.website ?? config.website,
    logoFileId: changes.logoFileId ?? config.logoFileId,
    navigatorTitle: changes.navigatorTitle ?? config.navigatorTitle,
    landingKicker: changes.landingKicker ?? config.landingKicker,
    landingTagline: changes.landingTagline ?? config.landingTagline,
    brandColor: changes.brandColor ?? config.brandColor,
  };
}
