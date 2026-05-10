import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { offices as municipalOffices } from "../data/offices.js";

const DEFAULT_MODEL_PATH = "/models/OCH AF.glb";
const DEFAULT_MAP_POSITION = { x: 50, y: 50 };
const FLOOR_NUMBERS = [1, 2, 3];
const START_FLOOR_NUMBER = 1;
const FLOOR_PREFIXES = {
  1: "G",
  2: "2",
  3: "3",
};
const FLOOR_CORRIDOR_POSITIONS = {
  front: { x: 50, y: 30 },
  mid: { x: 50, y: 48 },
  back: { x: 50, y: 76 },
};
const FLOOR_VERTICAL_POSITIONS = {
  elevator: { x: 42, y: 74 },
  stairs: { x: 36, y: 82 },
};
const FLOOR_SIDE_NODE_POSITIONS = {
  left: [
    { x: 38, y: 35 },
    { x: 31, y: 58 },
    { x: 42, y: 74 },
  ],
  right: [
    { x: 62, y: 36 },
    { x: 68, y: 58 },
    { x: 68, y: 74 },
  ],
};
const FLOOR_MODEL_STYLES = {
  1: {
    floor: 0xd8f3ff,
    wall: 0xfafafa,
  },
  2: {
    floor: 0xe0f2fe,
    wall: 0xffffff,
  },
  3: {
    floor: 0xe5f4ff,
    wall: 0xf8fafc,
  },
};
const DEFAULT_MODEL_STYLE = {
  floor: 0xe0f2fe,
  wall: 0xffffff,
};
const ROUTE_COLOR = 0xf97316;
const ROUTE_EMISSIVE_COLOR = 0x7c2d12;
const ROUTE_FLOOR_LIFT = 0.08;
const ROUTE_CORNER_MIN_DISTANCE = 0.08;
const ROUTE_ANIMATION_MS_PER_UNIT = 760;
const ROUTE_ANIMATION_MIN_MS = 1800;
const ROUTE_ANIMATION_MAX_MS = 6200;
const OFFICE_LABEL_COLOR = "#0f766e";
const ROUTE_START_NODES = [
  "G_ENTRY_WALK",
  "G_MAIN_ENTRANCE_DOOR",
  "G_ENTRY",
  "node_kiosk",
];
const OFFICE_ROUTE_NODES = {
  "mayors-office": "2_MAYOR_DOOR",
  "treasurers-office": "G_CITY_TREASURER_DOOR",
  "civil-registrar": "G_CIVIL_REGISTRY_DOOR",
  "assessors-office": "G_ASSESSOR_DOOR",
  "engineering-office": "3_BUILDING_ADMIN_DOOR",
  "health-office": "G_CITY_HEALTH_DOOR",
  "social-welfare": "2_CSWDO_DOOR",
  "business-permits": "G_BUSINESS_PERMIT_DOOR",
};
const ROUTE_NODE_ALIASES = {
  G_LOBBY_DOOR: "G_MAIN_LOBBY_DOOR",
  G_CIVIL_REGISTRY_DOOR: "G_LOCAL_CIVIL_REGISTRY_DOOR",
  "3_WOMEN_COUNCIL_DOOR": "3_CHILDREN_WOMEN_COUNCIL_DOOR",
};
const FLOOR_ROUTE_NODES = {
  "Ground Floor": [
    "G_CENTER_SPINE_HALL",
    "G_MAIN_LOBBY_HALL",
    "G_CENTER",
    "node_corridor_1F_mid",
  ],
  "1st Floor": [
    "G_CENTER_SPINE_HALL",
    "G_MAIN_LOBBY_HALL",
    "G_CENTER",
    "node_corridor_1F_mid",
  ],
  "2nd Floor": [
    "2_CENTER_LOBBY_HALL",
    "2_VERTICAL_SPINE_HALL",
    "2_CENTER",
    "node_corridor_2F_mid",
  ],
  "3rd Floor": [
    "3_CENTER_LOBBY_HALL",
    "3_VERTICAL_SPINE_HALL",
    "3_CENTER",
    "node_corridor_3F_mid",
  ],
};
const FLOOR_ENTRY_NODES = {
  1: [
    "G_ENTRY_WALK",
    "G_MAIN_ENTRANCE_DOOR",
    "G_ENTRY",
    "node_corridor_1F_front",
  ],
  2: [
    "2_MAIN_STAIR_DOOR",
    "2_ELEVATOR_DOOR",
    "2_FRONT",
    "node_corridor_2F_front",
  ],
  3: [
    "3_MAIN_STAIR_DOOR",
    "3_ELEVATOR_DOOR",
    "3_FRONT",
    "node_corridor_3F_front",
  ],
};

const fallbackRouteEdges = [];

for (const floorNumber of [1, 2, 3]) {
  fallbackRouteEdges.push(
    [`node_corridor_${floorNumber}F_front`, `node_corridor_${floorNumber}F_mid`],
    [`node_corridor_${floorNumber}F_mid`, `node_corridor_${floorNumber}F_back`],
  );

  for (const side of ["left", "right"]) {
    fallbackRouteEdges.push(
      [`node_corridor_${floorNumber}F_front`, `node_floor${floorNumber}_${side}_1`],
      [`node_corridor_${floorNumber}F_mid`, `node_floor${floorNumber}_${side}_2`],
      [`node_corridor_${floorNumber}F_back`, `node_floor${floorNumber}_${side}_3`],
      [`node_floor${floorNumber}_${side}_1`, `node_floor${floorNumber}_${side}_2`],
      [`node_floor${floorNumber}_${side}_2`, `node_floor${floorNumber}_${side}_3`],
    );
  }

  fallbackRouteEdges.push(
    [`node_stairs_${floorNumber}F`, `node_floor${floorNumber}_left_3`],
    [`node_elevator_${floorNumber}F`, `node_floor${floorNumber}_left_3`],
  );
}

fallbackRouteEdges.push(
  ["node_kiosk", "node_corridor_1F_front"],
  ["node_stairs_1F", "node_stairs_2F"],
  ["node_stairs_2F", "node_stairs_3F"],
  ["node_elevator_1F", "node_elevator_2F"],
  ["node_elevator_2F", "node_elevator_3F"],
);

function clampPercent(value) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return 0.5;
  }

  return THREE.MathUtils.clamp(numberValue, 0, 100) / 100;
}

function buildRouteGraph(nodePositions, routeEdges) {
  const graph = new Map();

  function addEdge(from, to) {
    if (!nodePositions.has(from) || !nodePositions.has(to)) {
      return;
    }

    if (!graph.has(from)) {
      graph.set(from, []);
    }

    if (!graph.has(to)) {
      graph.set(to, []);
    }

    const weight =
      nodePositions.get(from).distanceTo(nodePositions.get(to)) || 0.001;

    graph.get(from).push({ node: to, weight });
    graph.get(to).push({ node: from, weight });
  }

  routeEdges.forEach(([from, to]) => addEdge(from, to));
  return graph;
}

function findNodeRoute(startNode, endNode, nodePositions, routeEdges) {
  if (!nodePositions.has(startNode) || !nodePositions.has(endNode)) {
    return [];
  }

  const graph = buildRouteGraph(nodePositions, routeEdges);
  const distances = new Map([[startNode, 0]]);
  const previousNodes = new Map();
  const unvisited = new Set(graph.keys());

  while (unvisited.size > 0) {
    let currentNode = null;
    let currentDistance = Infinity;

    for (const nodeName of unvisited) {
      const nodeDistance = distances.get(nodeName) ?? Infinity;

      if (nodeDistance < currentDistance) {
        currentNode = nodeName;
        currentDistance = nodeDistance;
      }
    }

    if (!currentNode || currentDistance === Infinity) {
      break;
    }

    unvisited.delete(currentNode);

    if (currentNode === endNode) {
      break;
    }

    for (const neighbor of graph.get(currentNode) ?? []) {
      if (!unvisited.has(neighbor.node)) {
        continue;
      }

      const nextDistance = currentDistance + neighbor.weight;

      if (nextDistance < (distances.get(neighbor.node) ?? Infinity)) {
        distances.set(neighbor.node, nextDistance);
        previousNodes.set(neighbor.node, currentNode);
      }
    }
  }

  if (!distances.has(endNode)) {
    return [];
  }

  const path = [];
  let currentNode = endNode;

  while (currentNode) {
    path.push(currentNode);

    if (currentNode === startNode) {
      return path.reverse();
    }

    currentNode = previousNodes.get(currentNode);
  }

  return [];
}

function normalizeRouteNodeName(routeNode) {
  if (!routeNode) {
    return null;
  }

  return ROUTE_NODE_ALIASES[routeNode] ?? routeNode;
}

function getOfficeRouteNode(office) {
  return normalizeRouteNodeName(
    office?.routeNode ?? OFFICE_ROUTE_NODES[office?.id],
  );
}

function getRouteStartNode(nodePositions) {
  return ROUTE_START_NODES.find((nodeName) => nodePositions.has(nodeName));
}

function getFloorRatio(floor = "") {
  const normalizedFloor = floor.toLowerCase();

  if (normalizedFloor.includes("ground") || normalizedFloor.includes("1")) {
    return 0.18;
  }

  if (normalizedFloor.includes("3")) {
    return 0.78;
  }

  if (normalizedFloor.includes("2")) {
    return 0.52;
  }

  return 0.5;
}

function getFloorNumber(floor = "") {
  const normalizedFloor = floor.toLowerCase();

  if (normalizedFloor.includes("3")) {
    return 3;
  }

  if (normalizedFloor.includes("2")) {
    return 2;
  }

  return 1;
}

function getOfficeFocusPosition(office, bounds) {
  if (!office || !bounds) {
    return null;
  }

  return getMapFocusPosition(
    office.mapPosition,
    bounds,
    getFloorRatio(office.floor),
  );
}

function getMapFocusPosition(mapPosition, bounds, floorRatio = 0.18) {
  const size = bounds.getSize(new THREE.Vector3());
  const selectedMapPosition = mapPosition ?? DEFAULT_MAP_POSITION;
  const xRatio = clampPercent(selectedMapPosition.x);
  const zRatio = clampPercent(selectedMapPosition.y);

  return new THREE.Vector3(
    bounds.min.x + size.x * xRatio,
    bounds.min.y + size.y * floorRatio,
    bounds.max.z - size.z * zRatio,
  );
}

function getMapPositionAtY(mapPosition, bounds, y) {
  const size = bounds.getSize(new THREE.Vector3());
  const selectedMapPosition = mapPosition ?? DEFAULT_MAP_POSITION;
  const xRatio = clampPercent(selectedMapPosition.x);
  const zRatio = clampPercent(selectedMapPosition.y);

  return new THREE.Vector3(
    bounds.min.x + size.x * xRatio,
    y,
    bounds.max.z - size.z * zRatio,
  );
}

function getFallbackFloorY(floorNumber, bounds) {
  const size = bounds.getSize(new THREE.Vector3());
  const floorLabel =
    floorNumber === 1 ? "1st Floor" : floorNumber === 2 ? "2nd Floor" : "3rd Floor";

  return bounds.min.y + size.y * getFloorRatio(floorLabel);
}

function getFloorRouteY(floorNumber, bounds, floorMetadata) {
  return (
    floorMetadata?.get(floorNumber)?.routeY ??
    getFallbackFloorY(floorNumber, bounds)
  );
}

function getMapRoutePosition(mapPosition, bounds, floorNumber, floorMetadata) {
  return getMapPositionAtY(
    mapPosition,
    bounds,
    getFloorRouteY(floorNumber, bounds, floorMetadata),
  );
}

function getNavmeshDestinationPosition(office, bounds, floorMetadata) {
  if (!office || !bounds) {
    return null;
  }

  const floorNumber = getFloorNumber(office.floor);

  return getMapRoutePosition(
    office.mapPosition,
    bounds,
    floorNumber,
    floorMetadata,
  );
}

function getFloorFocusPosition(floor, bounds) {
  if (!bounds) {
    return null;
  }

  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const floorRatio = getFloorRatio(floor);

  return new THREE.Vector3(
    center.x,
    bounds.min.y + size.y * floorRatio,
    center.z,
  );
}

function normalizeObjectName(name) {
  return (name ?? "").replace(/\.\d+$/, "").replace(/\s+/g, "_");
}

function getObjectSearchNames(objectOrName) {
  if (typeof objectOrName === "string") {
    return [objectOrName];
  }

  return [
    objectOrName?.name,
    objectOrName?.geometry?.name,
    objectOrName?.parent?.name,
  ].filter(Boolean);
}

function isNavmeshObject(objectOrName) {
  return getObjectSearchNames(objectOrName).some((name) => {
    const normalizedName = normalizeObjectName(name).toLowerCase();

    return (
      normalizedName === "navmesh" ||
      normalizedName.endsWith("_navmesh") ||
      normalizedName.includes("navmesh")
    );
  });
}

function getRoutePointName(name) {
  const normalizedName = normalizeObjectName(name);

  if (normalizedName.startsWith("Marker_")) {
    return normalizedName.slice("Marker_".length);
  }

  if (normalizedName.startsWith("node_")) {
    return normalizedName;
  }

  if (normalizedName.endsWith("_DOOR_MARK")) {
    return normalizedName.slice(0, -"_MARK".length);
  }

  if (
    normalizedName.endsWith("_HALL") ||
    normalizedName.endsWith("_WALK")
  ) {
    return normalizedName;
  }

  return null;
}

function getRouteEdge(name) {
  const normalizedName = normalizeObjectName(name);

  if (!normalizedName.startsWith("Path_")) {
    return null;
  }

  const routeBody = normalizedName.slice("Path_".length);
  const separatorIndex = routeBody.indexOf("_to_");

  if (separatorIndex === -1) {
    return null;
  }

  return [
    routeBody.slice(0, separatorIndex),
    routeBody.slice(separatorIndex + "_to_".length),
  ];
}

function shouldHideRouteHelper(objectOrName) {
  const normalizedName = normalizeObjectName(
    typeof objectOrName === "string" ? objectOrName : objectOrName?.name,
  );

  return (
    isNavmeshObject(objectOrName) ||
    normalizedName.startsWith("Marker_") ||
    normalizedName.startsWith("node_") ||
    normalizedName.startsWith("Path_")
  );
}

function getNavmeshStartPosition(bounds, floorMetadata) {
  return getMapRoutePosition({ x: 50, y: 7 }, bounds, 1, floorMetadata);
}

function getNearestNodeName(position, nodePositions) {
  let nearestNodeName = null;
  let nearestDistance = Infinity;

  for (const [nodeName, nodePosition] of nodePositions.entries()) {
    const distance = position.distanceTo(nodePosition);

    if (distance < nearestDistance) {
      nearestNodeName = nodeName;
      nearestDistance = distance;
    }
  }

  return nearestNodeName;
}

function getVectorKey(position) {
  return [position.x, position.y, position.z]
    .map((value) => value.toFixed(4))
    .join("|");
}

function getNavmeshEdgeKey(firstPosition, secondPosition) {
  return [getVectorKey(firstPosition), getVectorKey(secondPosition)]
    .sort()
    .join("::");
}

function getTriangleCenter(firstPosition, secondPosition, thirdPosition) {
  return firstPosition
    .clone()
    .add(secondPosition)
    .add(thirdPosition)
    .multiplyScalar(1 / 3);
}

function getRouteComponentCount(nodePositions, routeEdges) {
  const graph = buildRouteGraph(nodePositions, routeEdges);
  const visited = new Set();
  let componentCount = 0;

  for (const nodeName of nodePositions.keys()) {
    if (visited.has(nodeName)) {
      continue;
    }

    const stack = [nodeName];
    visited.add(nodeName);
    componentCount += 1;

    while (stack.length > 0) {
      const currentNode = stack.pop();

      for (const neighbor of graph.get(currentNode) ?? []) {
        if (visited.has(neighbor.node)) {
          continue;
        }

        visited.add(neighbor.node);
        stack.push(neighbor.node);
      }
    }
  }

  return componentCount;
}

function buildNavmeshRouteData(root) {
  const nodePositions = new Map();
  const routeEdges = [];
  const edgeOwners = new Map();
  const seenEdges = new Set();
  let triangleIndex = 0;

  function addEdge(from, to) {
    if (!from || !to || from === to) {
      return;
    }

    const edgeKey = [from, to].sort().join("|");

    if (seenEdges.has(edgeKey)) {
      return;
    }

    seenEdges.add(edgeKey);
    routeEdges.push([from, to]);
  }

  function addTriangle(firstPosition, secondPosition, thirdPosition) {
    const area = new THREE.Triangle(
      firstPosition,
      secondPosition,
      thirdPosition,
    ).getArea();

    if (area < 0.0001) {
      return;
    }

    const nodeName = `navmesh_tri_${triangleIndex}`;
    triangleIndex += 1;
    nodePositions.set(
      nodeName,
      getTriangleCenter(firstPosition, secondPosition, thirdPosition),
    );

    for (const [first, second] of [
      [firstPosition, secondPosition],
      [secondPosition, thirdPosition],
      [thirdPosition, firstPosition],
    ]) {
      const edgeKey = getNavmeshEdgeKey(first, second);
      const owners = edgeOwners.get(edgeKey) ?? [];

      owners.forEach((ownerNode) => addEdge(ownerNode, nodeName));
      owners.push(nodeName);
      edgeOwners.set(edgeKey, owners);
    }
  }

  root.traverse((child) => {
    if (!child.isMesh || !isNavmeshObject(child)) {
      return;
    }

    const geometry = child.geometry;
    const positionAttribute = geometry.getAttribute("position");

    if (!positionAttribute) {
      return;
    }

    function getWorldPosition(index) {
      return new THREE.Vector3()
        .fromBufferAttribute(positionAttribute, index)
        .applyMatrix4(child.matrixWorld);
    }

    if (geometry.index) {
      for (let index = 0; index < geometry.index.count; index += 3) {
        addTriangle(
          getWorldPosition(geometry.index.getX(index)),
          getWorldPosition(geometry.index.getX(index + 1)),
          getWorldPosition(geometry.index.getX(index + 2)),
        );
      }
      return;
    }

    for (let index = 0; index < positionAttribute.count; index += 3) {
      addTriangle(
        getWorldPosition(index),
        getWorldPosition(index + 1),
        getWorldPosition(index + 2),
      );
    }
  });

  if (nodePositions.size === 0 || routeEdges.length === 0) {
    return null;
  }

  return {
    nodePositions,
    routeEdges,
    componentCount: getRouteComponentCount(nodePositions, routeEdges),
  };
}

function createNavmeshRoutePoints(startPosition, endPosition, navmeshRouteData) {
  if (!startPosition || !endPosition || !navmeshRouteData) {
    return [];
  }

  const startNode = getNearestNodeName(
    startPosition,
    navmeshRouteData.nodePositions,
  );
  const endNode = getNearestNodeName(endPosition, navmeshRouteData.nodePositions);
  const routeNodeNames = findNodeRoute(
    startNode,
    endNode,
    navmeshRouteData.nodePositions,
    navmeshRouteData.routeEdges,
  );

  if (routeNodeNames.length === 0) {
    return [];
  }

  if (routeNodeNames.length === 1) {
    const point = navmeshRouteData.nodePositions.get(routeNodeNames[0])?.clone();

    return point ? [point.clone().add(new THREE.Vector3(-0.12, 0, 0)), point] : [];
  }

  return routeNodeNames
    .map((nodeName) => navmeshRouteData.nodePositions.get(nodeName))
    .filter(Boolean)
    .map((position) => position.clone());
}

function getObjectCenter(object) {
  const bounds = new THREE.Box3().setFromObject(object);

  if (!bounds.isEmpty()) {
    return bounds.getCenter(new THREE.Vector3());
  }

  const position = new THREE.Vector3();
  object.getWorldPosition(position);
  return position;
}

function mergeBounds(currentBounds, nextBounds) {
  if (!nextBounds) {
    return currentBounds?.clone?.() ?? null;
  }

  if (!currentBounds) {
    return nextBounds.clone();
  }

  return currentBounds.union(nextBounds);
}

function getModelFloorNumber(objectOrName) {
  const names = getObjectSearchNames(objectOrName).map((name) =>
    normalizeObjectName(name).toLowerCase(),
  );

  if (
    names.some((name) =>
      name.startsWith("1f") ||
      name.startsWith("gf") ||
      name.includes("ground"),
    )
  ) {
    return 1;
  }

  if (names.some((name) => name.startsWith("2f") || name.startsWith("2_"))) {
    return 2;
  }

  if (names.some((name) => name.startsWith("3f") || name.startsWith("3_"))) {
    return 3;
  }

  if (names.some((name) => name === "navmesh" || name === "cube005")) {
    return 1;
  }

  return null;
}

function getFloorMetadata(root, bounds) {
  const floorMetadata = new Map();

  for (const floorNumber of FLOOR_NUMBERS) {
    floorMetadata.set(floorNumber, {
      navmeshBounds: null,
      visualBounds: null,
      routeY: getFallbackFloorY(floorNumber, bounds),
    });
  }

  root.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    const floorNumber = getModelFloorNumber(child);

    if (!floorNumber || !floorMetadata.has(floorNumber)) {
      return;
    }

    const floorData = floorMetadata.get(floorNumber);
    const childBounds = new THREE.Box3().setFromObject(child);

    if (childBounds.isEmpty()) {
      return;
    }

    if (isNavmeshObject(child)) {
      floorData.navmeshBounds = mergeBounds(
        floorData.navmeshBounds,
        childBounds,
      );
      floorData.routeY = floorData.navmeshBounds.min.y;
      return;
    }

    floorData.visualBounds = mergeBounds(floorData.visualBounds, childBounds);
  });

  return floorMetadata;
}

function addUniqueRouteEdge(routeEdges, seenEdges, from, to) {
  if (!from || !to || from === to) {
    return;
  }

  const edgeKey = [from, to].sort().join("|");

  if (seenEdges.has(edgeKey)) {
    return;
  }

  seenEdges.add(edgeKey);
  routeEdges.push([from, to]);
}

function getFloorConnectionNodes(floorNumber) {
  const nodes = [
    `node_corridor_${floorNumber}F_front`,
    `node_corridor_${floorNumber}F_mid`,
    `node_corridor_${floorNumber}F_back`,
    `node_stairs_${floorNumber}F`,
    `node_elevator_${floorNumber}F`,
  ];

  for (const side of ["left", "right"]) {
    for (const index of [1, 2, 3]) {
      nodes.push(`node_floor${floorNumber}_${side}_${index}`);
    }
  }

  return nodes;
}

function getRouteNodeCandidates(routeNode) {
  const normalizedRouteNode = normalizeRouteNodeName(routeNode);
  const candidates = [routeNode, normalizedRouteNode].filter(Boolean);

  for (const [alias, target] of Object.entries(ROUTE_NODE_ALIASES)) {
    if (target === normalizedRouteNode) {
      candidates.push(alias);
    }
  }

  return [...new Set(candidates)];
}

function getOfficeDoorMapPosition(mapPosition = DEFAULT_MAP_POSITION) {
  const x = mapPosition.x ?? DEFAULT_MAP_POSITION.x;
  const y = mapPosition.y ?? DEFAULT_MAP_POSITION.y;

  if (x < 42) {
    return { x: 42, y };
  }

  if (x > 58) {
    return { x: 58, y };
  }

  return { x, y };
}

function getMapPositionSide(mapPosition = DEFAULT_MAP_POSITION) {
  const x = mapPosition.x ?? DEFAULT_MAP_POSITION.x;

  if (x < 42) {
    return "left";
  }

  if (x > 58) {
    return "right";
  }

  return "center";
}

function getMapPositionDepthIndex(mapPosition = DEFAULT_MAP_POSITION) {
  const y = mapPosition.y ?? DEFAULT_MAP_POSITION.y;

  if (y < 42) {
    return 1;
  }

  if (y < 64) {
    return 2;
  }

  return 3;
}

function getNearestCorridorName(floorNumber, mapPosition = DEFAULT_MAP_POSITION) {
  const y = mapPosition.y ?? DEFAULT_MAP_POSITION.y;

  if (y < 42) {
    return `node_corridor_${floorNumber}F_front`;
  }

  if (y < 64) {
    return `node_corridor_${floorNumber}F_mid`;
  }

  return `node_corridor_${floorNumber}F_back`;
}

function createSyntheticRouteData(bounds, floorMetadata) {
  const nodePositions = new Map();
  const routeEdges = [];
  const seenEdges = new Set();

  function addNode(name, floorNumber, mapPosition) {
    if (!name) {
      return;
    }

    nodePositions.set(
      name,
      getMapRoutePosition(mapPosition, bounds, floorNumber, floorMetadata),
    );
  }

  function addEdge(from, to) {
    addUniqueRouteEdge(routeEdges, seenEdges, from, to);
  }

  for (const floorNumber of FLOOR_NUMBERS) {
    const prefix = FLOOR_PREFIXES[floorNumber];

    for (const [corridorName, mapPosition] of Object.entries(
      FLOOR_CORRIDOR_POSITIONS,
    )) {
      addNode(`node_corridor_${floorNumber}F_${corridorName}`, floorNumber, mapPosition);
    }

    for (const [side, mapPositions] of Object.entries(FLOOR_SIDE_NODE_POSITIONS)) {
      mapPositions.forEach((mapPosition, index) => {
        addNode(`node_floor${floorNumber}_${side}_${index + 1}`, floorNumber, mapPosition);
      });
    }

    addNode(
      `node_stairs_${floorNumber}F`,
      floorNumber,
      FLOOR_VERTICAL_POSITIONS.stairs,
    );
    addNode(
      `node_elevator_${floorNumber}F`,
      floorNumber,
      FLOOR_VERTICAL_POSITIONS.elevator,
    );

    addNode(`${prefix}_MAIN_STAIR_DOOR`, floorNumber, FLOOR_VERTICAL_POSITIONS.stairs);
    addNode(`${prefix}_ELEVATOR_DOOR`, floorNumber, FLOOR_VERTICAL_POSITIONS.elevator);
    addEdge(`${prefix}_MAIN_STAIR_DOOR`, `node_stairs_${floorNumber}F`);
    addEdge(`${prefix}_ELEVATOR_DOOR`, `node_elevator_${floorNumber}F`);

    if (floorNumber === 1) {
      addNode("node_kiosk", 1, { x: 50, y: 7 });
      addNode("G_ENTRY_WALK", 1, { x: 50, y: 7 });
      addNode("G_MAIN_ENTRANCE_DOOR", 1, { x: 50, y: 10 });
      addNode("G_ENTRY", 1, { x: 50, y: 13 });
      addNode("G_MAIN_LOBBY_DOOR", 1, { x: 50, y: 24 });
      addNode("G_MAIN_LOBBY_HALL", 1, { x: 50, y: 28 });
      addNode("G_CENTER_SPINE_HALL", 1, FLOOR_CORRIDOR_POSITIONS.mid);
      addNode("G_CENTER", 1, { x: 50, y: 50 });

      addEdge("G_ENTRY_WALK", "G_MAIN_ENTRANCE_DOOR");
      addEdge("G_MAIN_ENTRANCE_DOOR", "G_ENTRY");
      addEdge("G_ENTRY", "node_corridor_1F_front");
      addEdge("G_MAIN_LOBBY_DOOR", "G_MAIN_LOBBY_HALL");
      addEdge("G_MAIN_LOBBY_HALL", "node_corridor_1F_mid");
      addEdge("G_CENTER_SPINE_HALL", "node_corridor_1F_mid");
      addEdge("G_CENTER", "node_corridor_1F_mid");
    } else {
      addNode(`${prefix}_FRONT`, floorNumber, FLOOR_CORRIDOR_POSITIONS.front);
      addNode(`${prefix}_CENTER`, floorNumber, { x: 50, y: 50 });
      addNode(`${prefix}_CENTER_LOBBY_HALL`, floorNumber, FLOOR_CORRIDOR_POSITIONS.mid);
      addNode(`${prefix}_VERTICAL_SPINE_HALL`, floorNumber, {
        x: 50,
        y: 62,
      });

      addEdge(`${prefix}_FRONT`, `node_corridor_${floorNumber}F_front`);
      addEdge(`${prefix}_CENTER`, `node_corridor_${floorNumber}F_mid`);
      addEdge(`${prefix}_CENTER_LOBBY_HALL`, `node_corridor_${floorNumber}F_mid`);
      addEdge(`${prefix}_VERTICAL_SPINE_HALL`, `node_corridor_${floorNumber}F_back`);
    }
  }

  fallbackRouteEdges.forEach(([from, to]) => addEdge(from, to));
  addEdge("G_MAIN_STAIR_DOOR", "2_MAIN_STAIR_DOOR");
  addEdge("2_MAIN_STAIR_DOOR", "3_MAIN_STAIR_DOOR");
  addEdge("G_ELEVATOR_DOOR", "2_ELEVATOR_DOOR");
  addEdge("2_ELEVATOR_DOOR", "3_ELEVATOR_DOOR");

  for (const office of municipalOffices) {
    const floorNumber = getFloorNumber(office.floor);
    const routeNodeNames = getRouteNodeCandidates(
      office.routeNode ?? OFFICE_ROUTE_NODES[office.id],
    );

    const mainRouteNode = normalizeRouteNodeName(
      office.routeNode ?? OFFICE_ROUTE_NODES[office.id],
    );

    if (!mainRouteNode) {
      continue;
    }

    const normalizedText = `${office.name} ${office.room} ${office.category}`.toLowerCase();
    const isStairOffice = normalizedText.includes("stair");
    const isElevatorOffice =
      normalizedText.includes("elevator") || normalizedText.includes("lift");
    const doorMapPosition = isStairOffice
      ? FLOOR_VERTICAL_POSITIONS.stairs
      : isElevatorOffice
        ? FLOOR_VERTICAL_POSITIONS.elevator
        : getOfficeDoorMapPosition(office.mapPosition);

    routeNodeNames.forEach((routeNodeName) => {
      addNode(routeNodeName, floorNumber, doorMapPosition);

      if (routeNodeName !== mainRouteNode) {
        addEdge(routeNodeName, mainRouteNode);
      }
    });

    if (isStairOffice) {
      addEdge(mainRouteNode, `node_stairs_${floorNumber}F`);
      continue;
    }

    if (isElevatorOffice) {
      addEdge(mainRouteNode, `node_elevator_${floorNumber}F`);
      continue;
    }

    const hallwayNode = `node_${office.id}_hallway`;
    const officeSide = getMapPositionSide(office.mapPosition);
    const depthIndex = getMapPositionDepthIndex(doorMapPosition);

    if (officeSide !== "center") {
      addNode(hallwayNode, floorNumber, doorMapPosition);
      addEdge(mainRouteNode, hallwayNode);
      addEdge(hallwayNode, `node_floor${floorNumber}_${officeSide}_${depthIndex}`);
      continue;
    }

    const hallwayMapPosition = {
      x: 50,
      y: doorMapPosition.y,
    };
    addNode(hallwayNode, floorNumber, hallwayMapPosition);
    addEdge(mainRouteNode, hallwayNode);
    addEdge(hallwayNode, getNearestCorridorName(floorNumber, doorMapPosition));
  }

  return { nodePositions, routeEdges };
}

function mergeRouteEdges(routeEdges) {
  const mergedRouteEdges = [];
  const seenEdges = new Set();

  routeEdges.forEach(([from, to]) => {
    addUniqueRouteEdge(mergedRouteEdges, seenEdges, from, to);
  });

  return mergedRouteEdges;
}

function getCameraOffset(bounds) {
  const size = bounds.getSize(new THREE.Vector3());
  const largestSide = Math.max(size.x, size.y, size.z) || 7;

  return new THREE.Vector3(
    largestSide * 0.42,
    largestSide * 0.28,
    largestSide * 0.46,
  );
}

function getFrontDirection(bounds, nodePositions) {
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const entryPosition =
    nodePositions.get("G_ENTRY") ??
    nodePositions.get("G_MAIN_ENTRANCE_DOOR") ??
    center.clone().add(new THREE.Vector3(0, 0, size.z * 0.5));
  const lobbyPosition =
    nodePositions.get("G_CENTER") ??
    nodePositions.get("G_LOBBY_CENTER") ??
    center;
  const frontDirection = entryPosition.clone().sub(lobbyPosition);
  frontDirection.y = 0;

  if (frontDirection.lengthSq() < 0.001) {
    frontDirection.set(0, 0, 1);
  }

  frontDirection.normalize();
  return frontDirection;
}

function getFrontOverviewView(bounds, nodePositions) {
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const largestSide = Math.max(size.x, size.y, size.z) || 7;
  const entryPosition =
    nodePositions.get("G_ENTRY") ??
    nodePositions.get("G_MAIN_ENTRANCE_DOOR") ??
    center.clone().add(new THREE.Vector3(0, 0, size.z * 0.5));
  const frontDirection = getFrontDirection(bounds, nodePositions);

  const target = center.clone();
  target.y = bounds.min.y + size.y * 0.48;

  const cameraPosition = entryPosition
    .clone()
    .add(frontDirection.multiplyScalar(largestSide * 0.62));
  cameraPosition.y = bounds.min.y + size.y * 0.56;

  return { target, cameraPosition };
}

function getFloorModelBounds(floorNumber, floorMetadata, fallbackBounds) {
  const floorData = floorMetadata?.get(floorNumber);

  if (!floorData) {
    return fallbackBounds;
  }

  return (
    mergeBounds(floorData.visualBounds, floorData.navmeshBounds) ??
    floorData.visualBounds ??
    floorData.navmeshBounds ??
    fallbackBounds
  );
}

function getFloorOverviewView(floorNumber, bounds, floorMetadata) {
  const floorBounds = getFloorModelBounds(floorNumber, floorMetadata, bounds);
  const floorCenter = floorBounds.getCenter(new THREE.Vector3());
  const floorSize = floorBounds.getSize(new THREE.Vector3());
  const floorLargest = Math.max(floorSize.x, floorSize.z, floorSize.y * 2.6) || 7;

  const target = floorCenter.clone();
  target.y = getFloorRouteY(floorNumber, bounds, floorMetadata) + floorLargest * 0.025;

  const cameraPosition = floorCenter.clone().add(
    new THREE.Vector3(
      floorLargest * 0.22,
      floorLargest * 0.26,
      floorLargest * 0.28,
    ),
  );

  return { target, cameraPosition };
}

function getFocusedRoutePoints(points, floorNumber, bounds, floorMetadata) {
  if (!points || points.length < 2 || !bounds) {
    return [];
  }

  const floorY = getFloorRouteY(floorNumber, bounds, floorMetadata);
  const tolerance = Math.max(bounds.getSize(new THREE.Vector3()).y * 0.05, 0.24);
  const focusedPoints = points.filter(
    (point) => Math.abs(point.y - floorY) <= tolerance,
  );

  return focusedPoints.length >= 2 ? focusedPoints : [];
}

function areRoutePointsClose(firstPoint, secondPoint, tolerance = 0.025) {
  return firstPoint.distanceToSquared(secondPoint) <= tolerance * tolerance;
}

function addRoutePoint(routePoints, point) {
  if (
    routePoints.length > 0 &&
    areRoutePointsClose(routePoints[routePoints.length - 1], point)
  ) {
    return;
  }

  routePoints.push(point.clone());
}

function getHallwayCornerPoint(start, end, previousPoint) {
  const continueXFirst =
    previousPoint &&
    Math.abs(start.x - previousPoint.x) > Math.abs(start.z - previousPoint.z);

  return continueXFirst
    ? new THREE.Vector3(end.x, start.y, start.z)
    : new THREE.Vector3(start.x, start.y, end.z);
}

function createHallwayRoutePoints(points) {
  if (!points || points.length < 2) {
    return points ?? [];
  }

  const hallwayPoints = [];

  points.forEach((point, index) => {
    if (index === 0) {
      addRoutePoint(hallwayPoints, point);
      return;
    }

    const start = hallwayPoints[hallwayPoints.length - 1];
    const end = point;
    const isSameFloor = Math.abs(start.y - end.y) < 0.12;
    const xDistance = Math.abs(start.x - end.x);
    const zDistance = Math.abs(start.z - end.z);

    if (
      isSameFloor &&
      xDistance > ROUTE_CORNER_MIN_DISTANCE &&
      zDistance > ROUTE_CORNER_MIN_DISTANCE
    ) {
      const previousPoint = hallwayPoints[hallwayPoints.length - 2];
      const cornerPoint = getHallwayCornerPoint(start, end, previousPoint);

      if (
        !areRoutePointsClose(start, cornerPoint) &&
        !areRoutePointsClose(end, cornerPoint)
      ) {
        addRoutePoint(hallwayPoints, cornerPoint);
      }
    }

    addRoutePoint(hallwayPoints, end);
  });

  return hallwayPoints;
}

function getRouteDistance(points) {
  if (!points || points.length < 2) {
    return 0;
  }

  let distance = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    distance += points[index].distanceTo(points[index + 1]);
  }

  return distance;
}

function getRoutePointDistances(points) {
  const distances = [0];
  let totalDistance = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    totalDistance += points[index].distanceTo(points[index + 1]);
    distances.push(totalDistance);
  }

  return distances;
}

function getRoutePointAtDistance(points, targetDistance) {
  if (!points || points.length === 0) {
    return null;
  }

  if (points.length === 1 || targetDistance <= 0) {
    return points[0].clone();
  }

  let traveledDistance = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const segmentDistance = start.distanceTo(end);

    if (segmentDistance < 0.001) {
      continue;
    }

    if (traveledDistance + segmentDistance >= targetDistance) {
      const segmentProgress =
        (targetDistance - traveledDistance) / segmentDistance;
      return start.clone().lerp(end, THREE.MathUtils.clamp(segmentProgress, 0, 1));
    }

    traveledDistance += segmentDistance;
  }

  return points[points.length - 1].clone();
}

function getKioskRouteView(points, bounds, floorNumber, floorMetadata) {
  const routeBounds = new THREE.Box3().setFromPoints(points);
  const routeCenter = routeBounds.getCenter(new THREE.Vector3());
  const routeSize = routeBounds.getSize(new THREE.Vector3());
  const modelSize = bounds.getSize(new THREE.Vector3());
  const modelLargest = Math.max(modelSize.x, modelSize.y, modelSize.z) || 7;
  const routeEnd = points[points.length - 1];
  const floorBounds = getFloorModelBounds(floorNumber, floorMetadata, bounds);
  const floorSize = floorBounds.getSize(new THREE.Vector3());
  const floorLargest = Math.max(floorSize.x, floorSize.z, floorSize.y * 2.6) || modelLargest;
  const routeLargest =
    Math.max(routeSize.x, routeSize.y * 1.8, routeSize.z) || floorLargest * 0.2;
  const target = routeCenter.clone().lerp(routeEnd, 0.26);
  const cameraDistance = THREE.MathUtils.clamp(
    routeLargest * 1,
    floorLargest * 0.36,
    floorLargest * 0.68,
  );

  target.y = THREE.MathUtils.clamp(
    routeCenter.y + floorLargest * 0.035,
    bounds.min.y + modelSize.y * 0.08,
    bounds.max.y - modelSize.y * 0.08,
  );

  const cameraPosition = target.clone().add(
    new THREE.Vector3(
      cameraDistance * 0.12,
      cameraDistance * 1.7,
      cameraDistance * 0.16,
    ),
  );
  cameraPosition.y = THREE.MathUtils.clamp(
    routeCenter.y + floorLargest * 0.82,
    bounds.min.y + modelLargest * 0.1,
    bounds.max.y + modelLargest * 0.36,
  );

  return { target, cameraPosition };
}

function easeInOutCubic(progress) {
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) {
      child.geometry.dispose();
    }

    if (child.material) {
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      materials.forEach((material) => material.dispose());
    }
  });
}

function createSurfaceClassifiedGeometry(sourceGeometry, object) {
  const geometry = sourceGeometry.index
    ? sourceGeometry.toNonIndexed()
    : sourceGeometry.clone();
  const positionAttribute = geometry.getAttribute("position");

  if (!positionAttribute) {
    return geometry;
  }

  geometry.clearGroups();

  const firstPosition = new THREE.Vector3();
  const secondPosition = new THREE.Vector3();
  const thirdPosition = new THREE.Vector3();
  const worldFirstPosition = new THREE.Vector3();
  const worldSecondPosition = new THREE.Vector3();
  const worldThirdPosition = new THREE.Vector3();
  const firstEdge = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();
  const faceCenter = new THREE.Vector3();
  const worldMatrix = object?.matrixWorld ?? new THREE.Matrix4();
  const floorYBuckets = new Map();
  const floorBucketSize = 0.05;
  let floorSurfaceY = null;
  let currentFloorBucketCount = 0;
  let currentMaterialIndex = null;
  let currentStart = 0;
  let currentCount = 0;

  function getFaceWorldData(index) {
    firstPosition.fromBufferAttribute(positionAttribute, index);
    secondPosition.fromBufferAttribute(positionAttribute, index + 1);
    thirdPosition.fromBufferAttribute(positionAttribute, index + 2);
    worldFirstPosition.copy(firstPosition).applyMatrix4(worldMatrix);
    worldSecondPosition.copy(secondPosition).applyMatrix4(worldMatrix);
    worldThirdPosition.copy(thirdPosition).applyMatrix4(worldMatrix);

    faceNormal
      .copy(worldSecondPosition)
      .sub(worldFirstPosition)
      .cross(firstEdge.copy(worldThirdPosition).sub(worldFirstPosition))
      .normalize();

    faceCenter
      .copy(worldFirstPosition)
      .add(worldSecondPosition)
      .add(worldThirdPosition)
      .multiplyScalar(1 / 3);
  }

  function finishGroup() {
    if (currentMaterialIndex === null || currentCount === 0) {
      return;
    }

    geometry.addGroup(currentStart, currentCount, currentMaterialIndex);
  }

  for (let index = 0; index < positionAttribute.count; index += 3) {
    getFaceWorldData(index);

    if (faceNormal.y <= 0.58) {
      continue;
    }

    const floorBucket =
      Math.round(faceCenter.y / floorBucketSize) * floorBucketSize;
    const nextBucketCount = (floorYBuckets.get(floorBucket) ?? 0) + 1;
    floorYBuckets.set(floorBucket, nextBucketCount);

    if (nextBucketCount > currentFloorBucketCount) {
      currentFloorBucketCount = nextBucketCount;
      floorSurfaceY = floorBucket;
    }
  }

  for (let index = 0; index < positionAttribute.count; index += 3) {
    getFaceWorldData(index);

    const isFloorSurface =
      faceNormal.y > 0.58 &&
      (floorSurfaceY === null ||
        Math.abs(faceCenter.y - floorSurfaceY) <= floorBucketSize * 1.6);
    const materialIndex = isFloorSurface ? 0 : 1;

    if (currentMaterialIndex === null) {
      currentMaterialIndex = materialIndex;
      currentStart = index;
      currentCount = 3;
      continue;
    }

    if (materialIndex === currentMaterialIndex) {
      currentCount += 3;
      continue;
    }

    finishGroup();
    currentMaterialIndex = materialIndex;
    currentStart = index;
    currentCount = 3;
  }

  finishGroup();
  geometry.computeVertexNormals();
  return geometry;
}

function createBuildingMaterials(modelStyle) {
  return [
    new THREE.MeshStandardMaterial({
      name: "generated_sky_blue_floor",
      color: modelStyle.floor,
      emissive: modelStyle.floor,
      emissiveIntensity: 0.08,
      roughness: 0.72,
      metalness: 0.03,
      side: THREE.DoubleSide,
    }),
    new THREE.MeshStandardMaterial({
      name: "generated_white_wall",
      color: modelStyle.wall,
      emissive: modelStyle.wall,
      emissiveIntensity: 0.12,
      transparent: true,
      opacity: 0.94,
      roughness: 0.68,
      metalness: 0.02,
      side: THREE.DoubleSide,
      depthWrite: true,
    }),
  ];
}

function styleNavmeshFloorMesh(child) {
  const floorNumber = getModelFloorNumber(child) ?? 1;

  child.userData.floorNumber = floorNumber;
  child.userData.isPathfindingHelper = true;
  child.visible = false;
  child.castShadow = false;
  child.receiveShadow = false;
}

function styleBuildingMesh(child) {
  if (
    !child.isMesh ||
    isNavmeshObject(child) ||
    getRoutePointName(child.name) ||
    getRouteEdge(child.name)
  ) {
    return;
  }

  const floorNumber = getModelFloorNumber(child) ?? 1;
  const modelStyle = FLOOR_MODEL_STYLES[floorNumber] ?? DEFAULT_MODEL_STYLE;

  child.userData.floorNumber = floorNumber;
  const originalGeometry = child.geometry;
  child.geometry = createSurfaceClassifiedGeometry(originalGeometry, child);
  originalGeometry.dispose();
  child.material = createBuildingMaterials(modelStyle);
}

function getRouteStartFloorNumber() {
  return START_FLOOR_NUMBER;
}

function getOfficeLabelPosition(office, bounds, floorMetadata, nodePositions) {
  const floorNumber = getFloorNumber(office.floor);
  const routeNode = getOfficeRouteNode(office);
  const routePosition = routeNode ? nodePositions.get(routeNode) : null;

  if (routePosition) {
    return routePosition.clone();
  }

  return getMapRoutePosition(
    getOfficeDoorMapPosition(office.mapPosition),
    bounds,
    floorNumber,
    floorMetadata,
  );
}

function drawRoundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function fitOfficeLabelText(context, text, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let currentLine = "";

  words.forEach((word) => {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (context.measureText(nextLine).width <= maxWidth || !currentLine) {
      currentLine = nextLine;
      return;
    }

    lines.push(currentLine);
    currentLine = word;
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.slice(0, 2);
}

function createOfficeLabelSprite(office, position, bounds) {
  const canvas = document.createElement("canvas");
  const scale = 2;
  canvas.width = 360 * scale;
  canvas.height = 108 * scale;

  const context = canvas.getContext("2d");
  context.scale(scale, scale);
  context.clearRect(0, 0, 360, 108);

  drawRoundedRect(context, 10, 10, 340, 88, 18);
  context.fillStyle = "rgba(255, 255, 255, 0.94)";
  context.fill();
  context.lineWidth = 3;
  context.strokeStyle = "rgba(15, 118, 110, 0.38)";
  context.stroke();

  context.fillStyle = OFFICE_LABEL_COLOR;
  context.font = "700 24px Arial";
  context.textAlign = "center";
  context.textBaseline = "middle";

  const lines = fitOfficeLabelText(context, office.name, 284);
  const firstLineY = lines.length === 1 ? 54 : 42;
  lines.forEach((line, index) => {
    context.fillText(line, 180, firstLineY + index * 28);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0.72,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  const modelSize = bounds.getSize(new THREE.Vector3());
  const labelWidth = Math.max(Math.max(modelSize.x, modelSize.z) * 0.088, 0.52);
  const labelHeight = labelWidth * 0.3;

  sprite.name = `office_label_${office.id}`;
  sprite.position.copy(position);
  sprite.position.y += Math.max(modelSize.y * 0.035, 0.22);
  sprite.scale.set(labelWidth, labelHeight, 1);
  sprite.renderOrder = 60;
  sprite.userData = {
    isOfficeLabel: true,
    officeId: office.id,
    floorNumber: getFloorNumber(office.floor),
    baseScale: sprite.scale.clone(),
  };

  return sprite;
}

function createOfficeLabels(bounds, floorMetadata, nodePositions) {
  const group = new THREE.Group();
  group.name = "generated_office_labels";

  municipalOffices.forEach((office) => {
    const position = getOfficeLabelPosition(
      office,
      bounds,
      floorMetadata,
      nodePositions,
    );
    const label = createOfficeLabelSprite(office, position, bounds);
    label.visible = false;
    group.add(label);
  });

  return group;
}

function createRouteSegment(
  start,
  end,
  radius,
  material,
  renderOrder,
  anchorAtStart = false,
) {
  const direction = end.clone().sub(start);
  const length = direction.length();

  if (length < 0.001) {
    return null;
  }

  const geometry = new THREE.CylinderGeometry(
    radius,
    radius,
    anchorAtStart ? 1 : length,
    14,
  );

  if (anchorAtStart) {
    geometry.translate(0, 0.5, 0);
  }

  const mesh = new THREE.Mesh(geometry, material);

  if (anchorAtStart) {
    mesh.position.copy(start);
    mesh.scale.y = length;
  } else {
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
  }

  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize(),
  );
  mesh.renderOrder = renderOrder;
  mesh.userData.segmentLength = length;
  return mesh;
}

export default function ThreeMapViewer({
  modelPath = DEFAULT_MODEL_PATH,
  selectedOffice,
  viewCommand,
}) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const focusAnimationRef = useRef(null);
  const focusMarkerRef = useRef(null);
  const modelBoundsRef = useRef(null);
  const modelRootRef = useRef(null);
  const officeLabelsGroupRef = useRef(null);
  const floorMetadataRef = useRef(new Map());
  const nodePositionsRef = useRef(new Map());
  const navmeshRouteDataRef = useRef(null);
  const routeEdgesRef = useRef(fallbackRouteEdges);
  const routeGroupRef = useRef(null);
  const selectedOfficeRef = useRef(selectedOffice);
  const [status, setStatus] = useState("loading");

  function animateView(target, cameraPosition, instant = false) {
    const camera = cameraRef.current;
    const controls = controlsRef.current;

    if (!camera || !controls) {
      return;
    }

    if (focusAnimationRef.current) {
      window.cancelAnimationFrame(focusAnimationRef.current);
      focusAnimationRef.current = null;
    }

    if (instant) {
      camera.position.copy(cameraPosition);
      controls.target.copy(target);
      controls.update();
      return;
    }

    const startPosition = camera.position.clone();
    const startTarget = controls.target.clone();
    const startedAt = window.performance.now();
    const duration = 850;

    function step(now) {
      const progress = Math.min((now - startedAt) / duration, 1);
      const easedProgress = easeInOutCubic(progress);

      camera.position.lerpVectors(startPosition, cameraPosition, easedProgress);
      controls.target.lerpVectors(startTarget, target, easedProgress);
      controls.update();

      if (progress < 1) {
        focusAnimationRef.current = window.requestAnimationFrame(step);
      } else {
        focusAnimationRef.current = null;
      }
    }

    focusAnimationRef.current = window.requestAnimationFrame(step);
  }

  function setFocusMarker(position) {
    const marker = focusMarkerRef.current;

    if (!marker) {
      return;
    }

    marker.position.copy(position);
    marker.visible = true;
  }

  function setVisibleFloor(floorNumber = null) {
    const modelRoot = modelRootRef.current;

    if (!modelRoot) {
      return;
    }

    modelRoot.traverse((child) => {
      if (child.isMesh && isNavmeshObject(child)) {
        child.visible = false;
        return;
      }

      if (
        !child.isMesh ||
        getRoutePointName(child.name) ||
        getRouteEdge(child.name)
      ) {
        return;
      }

      child.visible =
        !floorNumber || child.userData.floorNumber === floorNumber;
    });

    officeLabelsGroupRef.current?.children.forEach((label) => {
      label.visible =
        Boolean(floorNumber) && label.userData.floorNumber === floorNumber;
    });
    updateOfficeLabelHighlight();

    if (mountRef.current) {
      mountRef.current.dataset.visibleFloor = floorNumber
        ? String(floorNumber)
        : "all";
    }
  }

  function updateOfficeLabelHighlight() {
    const labelsGroup = officeLabelsGroupRef.current;
    const selectedOfficeId = selectedOfficeRef.current?.id;

    if (!labelsGroup) {
      return;
    }

    labelsGroup.children.forEach((label) => {
      const isSelected = label.userData.officeId === selectedOfficeId;
      const baseScale = label.userData.baseScale;

      if (baseScale) {
        label.scale.copy(baseScale).multiplyScalar(isSelected ? 1.12 : 1);
      }

      if (label.material) {
        label.material.opacity = isSelected ? 0.98 : 0.7;
        label.material.color.set(isSelected ? 0xfff7ed : 0xffffff);
      }
    });
  }

  function disposeOfficeLabels() {
    const labelsGroup = officeLabelsGroupRef.current;

    if (!labelsGroup) {
      return;
    }

    labelsGroup.parent?.remove(labelsGroup);
    labelsGroup.traverse((child) => {
      if (child.material?.map) {
        child.material.map.dispose();
      }
    });
    disposeObject(labelsGroup);
    officeLabelsGroupRef.current = null;
  }

  function getOfficeNodePosition(office) {
    const routeNode = getOfficeRouteNode(office);

    if (!routeNode) {
      return null;
    }

    return nodePositionsRef.current.get(routeNode)?.clone() ?? null;
  }

  function focusOffice(office, instant = false) {
    const bounds = modelBoundsRef.current;
    const focusPosition =
      getOfficeNodePosition(office) ?? getOfficeFocusPosition(office, bounds);

    if (!focusPosition || !bounds) {
      return;
    }

    setFocusMarker(focusPosition);
    animateView(focusPosition, focusPosition.clone().add(getCameraOffset(bounds)), instant);
  }

  function resetModelView(instant = false) {
    const bounds = modelBoundsRef.current;

    if (!bounds) {
      return;
    }

    const { target, cameraPosition } = getFrontOverviewView(
      bounds,
      nodePositionsRef.current,
    );

    disposeRouteGroup();
    setVisibleFloor(null);
    if (focusMarkerRef.current) {
      focusMarkerRef.current.visible = false;
    }
    if (mountRef.current) {
      mountRef.current.dataset.routeStatus = "overview";
    }
    animateView(target, cameraPosition, instant);
  }

  function disposeRouteGroup() {
    const routeGroup = routeGroupRef.current;

    if (!routeGroup) {
      return;
    }

    routeGroup.parent?.remove(routeGroup);
    disposeObject(routeGroup);
    routeGroupRef.current = null;
  }

  function getRouteOverlayY(points, floorNumber) {
    const floorData = floorMetadataRef.current.get(floorNumber);
    const floorBounds = floorData?.visualBounds ?? floorData?.navmeshBounds;

    if (floorBounds && !floorBounds.isEmpty()) {
      return floorBounds.max.y + ROUTE_FLOOR_LIFT;
    }

    const routeTopY = points.reduce(
      (maxY, point) => Math.max(maxY, point.y),
      points[0]?.y ?? 0,
    );

    return routeTopY + ROUTE_FLOOR_LIFT;
  }

  function createRouteGroup(points, floorNumber) {
    const scene = sceneRef.current;

    if (!scene || points.length < 2) {
      return null;
    }

    disposeRouteGroup();

    const group = new THREE.Group();
    group.name = "generated_3d_route";

    const routeY = getRouteOverlayY(points, floorNumber);
    const routePoints = points.map(
      (point) => new THREE.Vector3(point.x, routeY, point.z),
    );
    const routePointDistances = getRoutePointDistances(routePoints);
    const totalDistance = getRouteDistance(routePoints);
    const animationDuration = THREE.MathUtils.clamp(
      totalDistance * ROUTE_ANIMATION_MS_PER_UNIT,
      ROUTE_ANIMATION_MIN_MS,
      ROUTE_ANIMATION_MAX_MS,
    );
    const baseMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.68,
      depthTest: true,
      depthWrite: false,
    });
    const pathMaterial = new THREE.MeshBasicMaterial({
      color: ROUTE_COLOR,
      transparent: true,
      opacity: 0.96,
      depthTest: true,
      depthWrite: false,
    });
    let traveledDistance = 0;

    for (let index = 0; index < routePoints.length - 1; index += 1) {
      const start = routePoints[index];
      const end = routePoints[index + 1];
      const segmentDistance = start.distanceTo(end);
      const baseSegment = createRouteSegment(start, end, 0.028, baseMaterial, 30);
      const pathSegment = createRouteSegment(
        start,
        end,
        0.017,
        pathMaterial,
        31,
        true,
      );

      if (baseSegment) {
        group.add(baseSegment);
      }

      if (pathSegment) {
        pathSegment.visible = false;
        pathSegment.scale.y = 0.001;
        pathSegment.userData = {
          ...pathSegment.userData,
          isAnimatedRouteSegment: true,
          routeStartDistance: traveledDistance,
          routeEndDistance: traveledDistance + segmentDistance,
          segmentLength: segmentDistance,
        };
        group.add(pathSegment);
      }

      traveledDistance += segmentDistance;
    }

    const markerMaterial = new THREE.MeshBasicMaterial({
      color: ROUTE_COLOR,
      depthTest: true,
      depthWrite: false,
    });
    routePoints.forEach((point, index) => {
      if (index === 0) {
        return;
      }

      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(index === routePoints.length - 1 ? 0.038 : 0.014, 18, 12),
        markerMaterial,
      );
      sphere.position.copy(point);
      sphere.renderOrder = 32;
      sphere.visible = false;
      sphere.userData = {
        isRouteMarker: true,
        revealDistance: routePointDistances[index],
      };
      group.add(sphere);
    });

    const routeHead = new THREE.Mesh(
      new THREE.SphereGeometry(0.048, 24, 16),
      new THREE.MeshBasicMaterial({
        color: ROUTE_COLOR,
        transparent: true,
        opacity: 0.98,
        depthTest: true,
        depthWrite: false,
      }),
    );
    routeHead.visible = false;
    routeHead.renderOrder = 33;
    routeHead.userData = { isRouteHead: true };
    group.add(routeHead);

    group.userData = {
      routePoints,
      totalDistance,
      startedAt: window.performance.now(),
      animationDuration,
    };

    scene.add(group);
    routeGroupRef.current = group;
    return { group, routePoints };
  }

  function updateRouteAnimation(now) {
    const routeGroup = routeGroupRef.current;
    const routePoints = routeGroup?.userData.routePoints;
    const totalDistance = routeGroup?.userData.totalDistance ?? 0;
    const animationDuration = routeGroup?.userData.animationDuration ?? 0;
    const startedAt = routeGroup?.userData.startedAt ?? now;

    if (!routeGroup || !routePoints || totalDistance <= 0 || animationDuration <= 0) {
      return;
    }

    const progress = THREE.MathUtils.clamp(
      (now - startedAt) / animationDuration,
      0,
      1,
    );
    const easedProgress = easeInOutCubic(progress);
    const visibleDistance = totalDistance * easedProgress;
    const routeHeadPosition = getRoutePointAtDistance(
      routePoints,
      visibleDistance,
    );

    routeGroup.children.forEach((child) => {
      if (child.userData.isAnimatedRouteSegment) {
        const segmentStart = child.userData.routeStartDistance ?? 0;
        const segmentEnd = child.userData.routeEndDistance ?? segmentStart;
        const segmentLength = child.userData.segmentLength ?? 0;
        const segmentProgress = THREE.MathUtils.clamp(
          (visibleDistance - segmentStart) / Math.max(segmentEnd - segmentStart, 0.001),
          0,
          1,
        );

        child.visible = segmentProgress > 0;
        child.scale.y = Math.max(segmentLength * segmentProgress, 0.001);
        return;
      }

      if (child.userData.isRouteMarker) {
        child.visible = visibleDistance >= (child.userData.revealDistance ?? 0);
        return;
      }

      if (child.userData.isRouteHead && routeHeadPosition) {
        child.visible = true;
        child.position.copy(routeHeadPosition);
        child.position.y += Math.sin(now * 0.012) * 0.012;
      }
    });
  }

  function createRouteForOffice(office, displayFloorNumber = getRouteStartFloorNumber()) {
    const routeNode = getOfficeRouteNode(office);
    const nodePositions = nodePositionsRef.current;
    const startNode = getRouteStartNode(nodePositions);
    const bounds = modelBoundsRef.current;
    const floorMetadata = floorMetadataRef.current;
    let routePoints = [];
    let routeStatus = "ready";

    if (startNode && routeNode) {
      const routeNodeNames = findNodeRoute(
        startNode,
        routeNode,
        nodePositions,
        routeEdgesRef.current,
      );

      if (routeNodeNames.length >= 2) {
        routePoints = routeNodeNames
          .map((nodeName) => nodePositions.get(nodeName))
          .filter(Boolean)
          .map((position) => position.clone());
        routeStatus = `ready-named-${routeNodeNames.length}`;
      }
    }

    if (routePoints.length < 2) {
      const navmeshRouteData = navmeshRouteDataRef.current;
      const targetPosition = getNavmeshDestinationPosition(
        office,
        bounds,
        floorMetadata,
      );

      if (navmeshRouteData && bounds && targetPosition) {
        routePoints = createNavmeshRoutePoints(
          getNavmeshStartPosition(bounds, floorMetadata),
          targetPosition,
          navmeshRouteData,
        );
        routeStatus = `ready-navmesh-${routePoints.length}`;
      }
    }

    if (routePoints.length < 2) {
      disposeRouteGroup();
      if (mountRef.current) {
        mountRef.current.dataset.routeStatus = "missing";
      }
      return [];
    }

    const focusedRoutePoints = getFocusedRoutePoints(
      routePoints,
      displayFloorNumber,
      bounds,
      floorMetadata,
    );
    if (focusedRoutePoints.length < 2) {
      disposeRouteGroup();
      if (mountRef.current) {
        mountRef.current.dataset.routeStatus = `no-route-floor-${displayFloorNumber}`;
      }
      return [];
    }

    const hallwayRoutePoints = createHallwayRoutePoints(focusedRoutePoints);

    createRouteGroup(hallwayRoutePoints, displayFloorNumber);
    if (mountRef.current) {
      mountRef.current.dataset.routeStatus = `${routeStatus}-floor-${displayFloorNumber}-points-${hallwayRoutePoints.length}`;
    }
    return hallwayRoutePoints;
  }

  function enterRouteForOffice(
    office,
    instant = false,
    displayFloorNumber = getRouteStartFloorNumber(),
  ) {
    const points = createRouteForOffice(office, displayFloorNumber);
    const bounds = modelBoundsRef.current;
    const floorMetadata = floorMetadataRef.current;
    setVisibleFloor(displayFloorNumber);

    if (points.length < 2 || !bounds) {
      focusOffice(office, instant);
      return;
    }

    const { target, cameraPosition } = getKioskRouteView(
      points,
      bounds,
      displayFloorNumber,
      floorMetadata,
    );

    setFocusMarker(points[points.length - 1]);
    animateView(target, cameraPosition, instant);
  }

  function focusFloor(floor, instant = false) {
    const bounds = modelBoundsRef.current;
    const floorNumber = getFloorNumber(floor);
    const floorMetadata = floorMetadataRef.current;

    setVisibleFloor(floorNumber);

    if (!bounds) {
      return;
    }

    const selectedOffice = selectedOfficeRef.current;
    if (selectedOffice) {
      const routePoints = createRouteForOffice(selectedOffice, floorNumber);

      if (routePoints.length >= 2) {
        const { target, cameraPosition } = getKioskRouteView(
          routePoints,
          bounds,
          floorNumber,
          floorMetadata,
        );
        setFocusMarker(routePoints[routePoints.length - 1]);
        animateView(target, cameraPosition, instant);
        return;
      }
    }

    disposeRouteGroup();
    if (focusMarkerRef.current) {
      focusMarkerRef.current.visible = false;
    }
    if (mountRef.current) {
      mountRef.current.dataset.routeStatus = `floor-${floorNumber}`;
    }

    const { target, cameraPosition } = getFloorOverviewView(
      floorNumber,
      bounds,
      floorMetadata,
    );

    animateView(target, cameraPosition, instant);
  }

  function zoomModel(direction) {
    const camera = cameraRef.current;
    const controls = controlsRef.current;

    if (!camera || !controls) {
      return;
    }

    const target = controls.target.clone();
    const cameraVector = camera.position.clone().sub(target);
    const nextDistance = THREE.MathUtils.clamp(
      cameraVector.length() * (direction === "in" ? 0.78 : 1.22),
      controls.minDistance,
      controls.maxDistance,
    );
    const nextPosition = target
      .clone()
      .add(cameraVector.normalize().multiplyScalar(nextDistance));

    animateView(target, nextPosition);
  }

  useEffect(() => {
    selectedOfficeRef.current = selectedOffice;

    if (selectedOffice) {
      enterRouteForOffice(selectedOffice);
    }
  }, [selectedOffice?.id]);

  useEffect(() => {
    if (!viewCommand) {
      return;
    }

    if (viewCommand.type === "reset-view") {
      resetModelView();
      return;
    }

    if (viewCommand.type === "focus-office") {
      enterRouteForOffice(selectedOfficeRef.current);
      return;
    }

    if (viewCommand.type === "enter-route") {
      enterRouteForOffice(selectedOfficeRef.current);
      return;
    }

    if (viewCommand.type === "focus-floor") {
      focusFloor(viewCommand.payload?.floor ?? selectedOfficeRef.current?.floor);
      return;
    }

    if (viewCommand.type === "zoom-in") {
      zoomModel("in");
      return;
    }

    if (viewCommand.type === "zoom-out") {
      zoomModel("out");
    }
  }, [viewCommand?.sequence]);

  useEffect(() => {
    const mountElement = mountRef.current;

    if (!mountElement) {
      return undefined;
    }

    let frameId = 0;
    let loadedModel = null;
    let isDisposed = false;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xe8edf5);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    camera.position.set(7, 5, 7);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mountElement.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 0.75;
    controls.maxDistance = 55;
    controls.panSpeed = 0.75;
    controls.rotateSpeed = 0.7;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    const focusMarker = new THREE.Group();
    focusMarker.visible = false;

    const markerMaterial = new THREE.MeshStandardMaterial({
      color: ROUTE_COLOR,
      emissive: ROUTE_EMISSIVE_COLOR,
      emissiveIntensity: 0.22,
      metalness: 0.08,
      roughness: 0.35,
    });
    const markerRingMaterial = new THREE.MeshBasicMaterial({
      color: ROUTE_COLOR,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
    });

    const markerRing = new THREE.Mesh(
      new THREE.RingGeometry(0.12, 0.16, 48),
      markerRingMaterial,
    );
    markerRing.rotation.x = -Math.PI / 2;

    const markerStem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.016, 0.16, 16),
      markerMaterial,
    );
    markerStem.position.y = 0.08;

    const markerDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 24, 16),
      markerMaterial,
    );
    markerDot.position.y = 0.18;

    focusMarker.add(markerRing, markerStem, markerDot);
    scene.add(focusMarker);
    focusMarkerRef.current = focusMarker;

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.6);
    keyLight.position.set(8, 12, 8);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.9);
    fillLight.position.set(-7, 6, -6);
    scene.add(fillLight);

    function resizeRenderer() {
      const width = mountElement.clientWidth || 1;
      const height = mountElement.clientHeight || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    }

    const resizeObserver = new ResizeObserver(resizeRenderer);
    resizeObserver.observe(mountElement);
    resizeRenderer();

    const loader = new GLTFLoader();
    loader.load(
      modelPath,
      (gltf) => {
        if (isDisposed) {
          return;
        }

        loadedModel = gltf.scene;
        modelRootRef.current = loadedModel;
        loadedModel.updateMatrixWorld(true);

        loadedModel.traverse((child) => {
          if (child.isMesh && isNavmeshObject(child)) {
            styleNavmeshFloorMesh(child);
            return;
          }

          if (shouldHideRouteHelper(child)) {
            child.visible = false;
          }

          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            styleBuildingMesh(child);
          }
        });

        const bounds = new THREE.Box3().setFromObject(loadedModel);
        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        const largestSide = Math.max(size.x, size.y, size.z) || 1;
        const scale = 9 / largestSide;

        loadedModel.scale.setScalar(scale);
        loadedModel.position.sub(center.multiplyScalar(scale));
        scene.add(loadedModel);

        loadedModel.updateMatrixWorld(true);
        modelBoundsRef.current = new THREE.Box3().setFromObject(loadedModel);
        const floorMetadata = getFloorMetadata(
          loadedModel,
          modelBoundsRef.current,
        );
        floorMetadataRef.current = floorMetadata;

        const nodePositions = new Map();
        const modelRouteEdges = [];

        loadedModel.traverse((child) => {
          const routePointName = getRoutePointName(child.name);
          const routeEdge = getRouteEdge(child.name);

          if (routeEdge) {
            modelRouteEdges.push(routeEdge);
          }

          if (!routePointName) {
            return;
          }

          nodePositions.set(routePointName, getObjectCenter(child));
        });
        const syntheticRouteData = createSyntheticRouteData(
          modelBoundsRef.current,
          floorMetadata,
        );
        syntheticRouteData.nodePositions.forEach((position, nodeName) => {
          if (!nodePositions.has(nodeName)) {
            nodePositions.set(nodeName, position);
          }
        });
        nodePositionsRef.current = nodePositions;
        routeEdgesRef.current = mergeRouteEdges([
          ...fallbackRouteEdges,
          ...syntheticRouteData.routeEdges,
          ...modelRouteEdges,
        ]);
        disposeOfficeLabels();
        const officeLabelsGroup = createOfficeLabels(
          modelBoundsRef.current,
          floorMetadata,
          nodePositions,
        );
        scene.add(officeLabelsGroup);
        officeLabelsGroupRef.current = officeLabelsGroup;
        navmeshRouteDataRef.current = buildNavmeshRouteData(loadedModel);

        mountElement.dataset.routeNodes = String(nodePositions.size);
        mountElement.dataset.routeEdges = String(routeEdgesRef.current.length);
        mountElement.dataset.navmeshNodes = String(
          navmeshRouteDataRef.current?.nodePositions.size ?? 0,
        );
        mountElement.dataset.navmeshEdges = String(
          navmeshRouteDataRef.current?.routeEdges.length ?? 0,
        );
        mountElement.dataset.navmeshComponents = String(
          navmeshRouteDataRef.current?.componentCount ?? 0,
        );

        setStatus("ready");
        resetModelView(true);

        if (selectedOfficeRef.current) {
          enterRouteForOffice(selectedOfficeRef.current, true);
        }
      },
      undefined,
      () => {
        if (isDisposed) {
          return;
        }

        setStatus("error");
      }
    );

    function animate(now = window.performance.now()) {
      frameId = window.requestAnimationFrame(animate);
      updateRouteAnimation(now);
      controls.update();
      renderer.render(scene, camera);
    }

    animate();

    return () => {
      isDisposed = true;
      window.cancelAnimationFrame(frameId);
      if (focusAnimationRef.current) {
        window.cancelAnimationFrame(focusAnimationRef.current);
      }
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();

      if (loadedModel) {
        disposeObject(loadedModel);
      }

      disposeRouteGroup();
      disposeOfficeLabels();
      disposeObject(focusMarker);
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      focusMarkerRef.current = null;
      modelBoundsRef.current = null;
      modelRootRef.current = null;
      officeLabelsGroupRef.current = null;
      floorMetadataRef.current = new Map();
      nodePositionsRef.current = new Map();
      navmeshRouteDataRef.current = null;
      routeEdgesRef.current = fallbackRouteEdges;
      focusAnimationRef.current = null;
    };
  }, [modelPath]);

  return (
    <div className="three-viewer" ref={mountRef}>
      {status === "loading" ? (
        <div className="viewer-status">Loading Olongapo City Hall model...</div>
      ) : null}
      {status === "error" ? (
        <div className="viewer-status error">Unable to load 3D model.</div>
      ) : null}
    </div>
  );
}
