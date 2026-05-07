import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const DEFAULT_MODEL_PATH = "/experiment/OCH GF (1).glb";
const UPPER_FLOOR_TRANSFER_POSITION = { x: 58, y: 76 };
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
    [`node_corridor_${floorNumber}F_back`, `node_stairs_${floorNumber}F`],
    [`node_corridor_${floorNumber}F_back`, `node_elevator_${floorNumber}F`],
  );

  for (const side of ["left", "right"]) {
    fallbackRouteEdges.push(
      [`node_corridor_${floorNumber}F_front`, `node_floor${floorNumber}_${side}_1`],
      [`node_corridor_${floorNumber}F_mid`, `node_floor${floorNumber}_${side}_2`],
      [`node_corridor_${floorNumber}F_back`, `node_floor${floorNumber}_${side}_3`],
    );
  }
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

  return getMapFocusPosition(office.mapPosition, bounds, getFloorRatio(office.floor));
}

function getMapFocusPosition(mapPosition, bounds, floorRatio = 0.18) {
  const size = bounds.getSize(new THREE.Vector3());
  const selectedMapPosition = mapPosition ?? { x: 50, y: 50 };
  const xRatio = clampPercent(selectedMapPosition.x);
  const zRatio = clampPercent(selectedMapPosition.y);

  return new THREE.Vector3(
    bounds.min.x + size.x * xRatio,
    bounds.min.y + size.y * floorRatio,
    bounds.max.z - size.z * zRatio,
  );
}

function getNavmeshDestinationPosition(office, bounds) {
  if (!office || !bounds) {
    return null;
  }

  const floorNumber = getFloorNumber(office.floor);
  const mapPosition =
    floorNumber > 1 ? UPPER_FLOOR_TRANSFER_POSITION : office.mapPosition;

  return getMapFocusPosition(mapPosition, bounds, 0.18);
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

function getFirstNodePosition(nodePositions, nodeNames = []) {
  for (const nodeName of nodeNames) {
    const nodePosition = nodePositions.get(nodeName);

    if (nodePosition) {
      return nodePosition;
    }
  }

  return null;
}

function normalizeObjectName(name) {
  return name?.replace(/\.\d+$/, "") ?? "";
}

function isNavmeshObject(name) {
  return normalizeObjectName(name).toLowerCase() === "navmesh";
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

function shouldHideRouteHelper(name) {
  const normalizedName = normalizeObjectName(name);

  return (
    isNavmeshObject(normalizedName) ||
    normalizedName.startsWith("Marker_") ||
    normalizedName.startsWith("node_") ||
    normalizedName.startsWith("Path_")
  );
}

function getNavmeshStartPosition(bounds) {
  const size = bounds.getSize(new THREE.Vector3());

  return new THREE.Vector3(
    bounds.min.x + size.x * 0.5,
    bounds.min.y + size.y * 0.18,
    bounds.max.z - size.z * 0.08,
  );
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

function getLargestConnectedRouteData(nodePositions, routeEdges) {
  const graph = buildRouteGraph(nodePositions, routeEdges);
  const visited = new Set();
  let largestComponent = [];

  for (const nodeName of nodePositions.keys()) {
    if (visited.has(nodeName)) {
      continue;
    }

    const component = [];
    const stack = [nodeName];
    visited.add(nodeName);

    while (stack.length > 0) {
      const currentNode = stack.pop();
      component.push(currentNode);

      for (const neighbor of graph.get(currentNode) ?? []) {
        if (visited.has(neighbor.node)) {
          continue;
        }

        visited.add(neighbor.node);
        stack.push(neighbor.node);
      }
    }

    if (component.length > largestComponent.length) {
      largestComponent = component;
    }
  }

  const componentNodes = new Set(largestComponent);
  const nextNodePositions = new Map(
    [...nodePositions.entries()].filter(([nodeName]) =>
      componentNodes.has(nodeName),
    ),
  );
  const nextRouteEdges = routeEdges.filter(
    ([from, to]) => componentNodes.has(from) && componentNodes.has(to),
  );

  return {
    nodePositions: nextNodePositions,
    routeEdges: nextRouteEdges,
    componentCount: largestComponent.length,
  };
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
    if (!child.isMesh || !isNavmeshObject(child.name)) {
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

  return getLargestConnectedRouteData(nodePositions, routeEdges);
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

function getRouteNodeFloor(nodeName) {
  if (nodeName.startsWith("G_")) {
    return "G";
  }

  return nodeName.match(/^(\d)_/)?.[1] ?? "";
}

function isHallRouteNode(nodeName) {
  return nodeName.endsWith("_HALL") || nodeName.endsWith("_WALK");
}

function isDoorRouteNode(nodeName) {
  return nodeName.endsWith("_DOOR");
}

function getNearestRouteNodes(sourceNode, candidateNodes, nodePositions, limit) {
  const sourcePosition = nodePositions.get(sourceNode);

  if (!sourcePosition) {
    return [];
  }

  return candidateNodes
    .filter((candidateNode) => candidateNode !== sourceNode)
    .sort(
      (firstNode, secondNode) =>
        sourcePosition.distanceTo(nodePositions.get(firstNode)) -
        sourcePosition.distanceTo(nodePositions.get(secondNode)),
    )
    .slice(0, limit);
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

function createGeneratedRouteEdges(nodePositions) {
  const routeEdges = [];
  const seenEdges = new Set();
  const nodeNames = [...nodePositions.keys()];

  function addEdge(from, to) {
    if (
      !from ||
      !to ||
      from === to ||
      !nodePositions.has(from) ||
      !nodePositions.has(to)
    ) {
      return;
    }

    const edgeKey = [from, to].sort().join("|");

    if (seenEdges.has(edgeKey)) {
      return;
    }

    seenEdges.add(edgeKey);
    routeEdges.push([from, to]);
  }

  for (const floor of ["G", "2", "3"]) {
    const floorNodes = nodeNames.filter(
      (nodeName) => getRouteNodeFloor(nodeName) === floor,
    );
    const hallNodes = floorNodes.filter(isHallRouteNode);
    const doorNodes = floorNodes.filter(isDoorRouteNode);

    for (const hallNode of hallNodes) {
      getNearestRouteNodes(hallNode, hallNodes, nodePositions, 4).forEach(
        (neighborNode) => addEdge(hallNode, neighborNode),
      );
    }

    for (const doorNode of doorNodes) {
      getNearestRouteNodes(doorNode, hallNodes, nodePositions, 2).forEach(
        (hallNode) => addEdge(doorNode, hallNode),
      );
    }
  }

  addEdge("G_ENTRY_WALK", "G_MAIN_ENTRANCE_DOOR");
  addEdge("G_MAIN_ENTRANCE_DOOR", "G_MAIN_LOBBY_HALL");
  addEdge("G_MAIN_STAIR_DOOR", "2_MAIN_STAIR_DOOR");
  addEdge("2_MAIN_STAIR_DOOR", "3_MAIN_STAIR_DOOR");
  addEdge("G_ELEVATOR_DOOR", "2_ELEVATOR_DOOR");
  addEdge("2_ELEVATOR_DOOR", "3_ELEVATOR_DOOR");

  return routeEdges;
}

function getCameraOffset(bounds) {
  const size = bounds.getSize(new THREE.Vector3());
  const largestSide = Math.max(size.x, size.y, size.z) || 7;

  return new THREE.Vector3(
    largestSide * 0.82,
    largestSide * 0.54,
    largestSide * 0.9,
  );
}

function getFloorCameraOffset(bounds) {
  const size = bounds.getSize(new THREE.Vector3());
  const largestSide = Math.max(size.x, size.y, size.z) || 7;

  return new THREE.Vector3(
    largestSide * 0.38,
    largestSide * 0.24,
    largestSide * 0.42,
  );
}

function getRouteSideOffset(start, end, amount) {
  const direction = end.clone().sub(start);
  direction.y = 0;

  if (direction.lengthSq() < 0.001) {
    return new THREE.Vector3(amount, 0, 0);
  }

  direction.normalize();
  return new THREE.Vector3(-direction.z, 0, direction.x).multiplyScalar(amount);
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

function getEntranceDirection(bounds, routeStart) {
  const center = bounds.getCenter(new THREE.Vector3());
  const frontDirection = routeStart.clone().sub(center);
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
    .add(frontDirection.multiplyScalar(largestSide * 0.82));
  cameraPosition.y = bounds.min.y + size.y * 0.64;

  return { target, cameraPosition };
}

function getKioskRouteView(points, bounds) {
  const routeBounds = new THREE.Box3().setFromPoints(points);
  const routeCenter = routeBounds.getCenter(new THREE.Vector3());
  const routeSize = routeBounds.getSize(new THREE.Vector3());
  const modelSize = bounds.getSize(new THREE.Vector3());
  const modelLargest = Math.max(modelSize.x, modelSize.y, modelSize.z) || 7;
  const routeStart = points[0];
  const routeEnd = points[points.length - 1];
  const routeLargest =
    Math.max(routeSize.x, routeSize.y * 1.8, routeSize.z) || modelLargest * 0.22;
  const frontDirection = getEntranceDirection(bounds, routeStart);
  const sideDirection = new THREE.Vector3(-frontDirection.z, 0, frontDirection.x);
  const target = routeCenter.clone().lerp(routeEnd, 0.18);
  const distance = THREE.MathUtils.clamp(
    routeLargest * 0.58,
    modelLargest * 0.22,
    modelLargest * 0.52,
  );
  const sideAmount = THREE.MathUtils.clamp(
    routeEnd.clone().sub(routeStart).dot(sideDirection) * 0.12,
    -modelLargest * 0.14,
    modelLargest * 0.14,
  );

  target.y = THREE.MathUtils.clamp(
    routeCenter.y,
    bounds.min.y + modelSize.y * 0.08,
    bounds.min.y + modelSize.y * 0.18,
  );

  const cameraPosition = routeStart
    .clone()
    .add(frontDirection.multiplyScalar(distance))
    .add(sideDirection.multiplyScalar(sideAmount));
  cameraPosition.y = Math.max(
    bounds.min.y + modelLargest * 0.5,
    routeBounds.max.y + modelLargest * 0.36,
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

function createRouteSegment(start, end, radius, material, renderOrder) {
  const direction = end.clone().sub(start);
  const length = direction.length();

  if (length < 0.001) {
    return null;
  }

  const geometry = new THREE.CylinderGeometry(radius, radius, length, 14);
  const mesh = new THREE.Mesh(geometry, material);

  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize(),
  );
  mesh.renderOrder = renderOrder;
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

  function createRouteGroup(points) {
    const scene = sceneRef.current;

    if (!scene || points.length < 2) {
      return null;
    }

    disposeRouteGroup();

    const group = new THREE.Group();
    group.name = "generated_3d_route";

    const routePoints = points.map((point) =>
      point.clone().add(new THREE.Vector3(0, 0.18, 0)),
    );
    const baseMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      depthWrite: false,
    });
    const pathMaterial = new THREE.MeshBasicMaterial({
      color: 0x0f7a55,
      transparent: true,
      opacity: 0.96,
      depthTest: false,
      depthWrite: false,
    });

    for (let index = 0; index < routePoints.length - 1; index += 1) {
      const start = routePoints[index];
      const end = routePoints[index + 1];
      const baseSegment = createRouteSegment(start, end, 0.046, baseMaterial, 30);
      const pathSegment = createRouteSegment(start, end, 0.028, pathMaterial, 31);

      if (baseSegment) {
        group.add(baseSegment);
      }

      if (pathSegment) {
        group.add(pathSegment);
      }
    }

    const markerMaterial = new THREE.MeshBasicMaterial({
      color: 0x0f7a55,
      depthTest: false,
      depthWrite: false,
    });
    routePoints.forEach((point, index) => {
      if (index === 0) {
        return;
      }

      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(index === routePoints.length - 1 ? 0.042 : 0.018, 18, 12),
        markerMaterial,
      );
      sphere.position.copy(point);
      sphere.renderOrder = 32;
      group.add(sphere);
    });

    scene.add(group);
    routeGroupRef.current = group;
    return { group, routePoints };
  }

  function createRouteForOffice(office) {
    const routeNode = getOfficeRouteNode(office);
    const nodePositions = nodePositionsRef.current;
    const startNode = getRouteStartNode(nodePositions);
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
      const bounds = modelBoundsRef.current;
      const targetPosition = getNavmeshDestinationPosition(office, bounds);

      if (navmeshRouteData && bounds && targetPosition) {
        routePoints = createNavmeshRoutePoints(
          getNavmeshStartPosition(bounds),
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

    createRouteGroup(routePoints);
    if (mountRef.current) {
      mountRef.current.dataset.routeStatus = routeStatus;
    }
    return routePoints;
  }

  function enterRouteForOffice(office, instant = false) {
    const points = createRouteForOffice(office);
    const bounds = modelBoundsRef.current;

    if (points.length < 2 || !bounds) {
      focusOffice(office, instant);
      return;
    }

    const { target, cameraPosition } = getKioskRouteView(points, bounds);

    setFocusMarker(points[points.length - 1]);
    animateView(target, cameraPosition, instant);
  }

  function focusFloor(floor, instant = false) {
    const bounds = modelBoundsRef.current;
    const floorNumber = getFloorNumber(floor);
    const floorNodes = FLOOR_ROUTE_NODES[floor] ?? FLOOR_ROUTE_NODES["1st Floor"];
    const floorEntryNodes = FLOOR_ENTRY_NODES[floorNumber] ?? FLOOR_ENTRY_NODES[1];
    const nodePositions = nodePositionsRef.current;
    const corridorStart = getFirstNodePosition(nodePositions, floorEntryNodes);
    const corridorTarget = getFirstNodePosition(nodePositions, floorNodes);

    if (bounds && corridorStart && corridorTarget) {
      const eyeHeight = Math.max(bounds.getSize(new THREE.Vector3()).y * 0.055, 0.34);
      const sideOffset = getRouteSideOffset(corridorStart, corridorTarget, 0.48);

      animateView(
        corridorTarget
          .clone()
          .add(sideOffset.clone().multiplyScalar(0.2))
          .add(new THREE.Vector3(0, eyeHeight * 0.72, 0)),
        corridorStart
          .clone()
          .add(sideOffset)
          .add(new THREE.Vector3(0, eyeHeight, 0)),
        instant,
      );
      return;
    }

    const focusPosition =
      getFirstNodePosition(nodePositions, floorNodes)?.clone() ??
      getFloorFocusPosition(floor, bounds);

    if (!focusPosition || !bounds) {
      return;
    }

    animateView(
      focusPosition,
      focusPosition.clone().add(getFloorCameraOffset(bounds)),
      instant,
    );
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
    controls.minDistance = 2;
    controls.maxDistance = 40;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    const focusMarker = new THREE.Group();
    focusMarker.visible = false;

    const markerMaterial = new THREE.MeshStandardMaterial({
      color: 0x0f7a55,
      emissive: 0x064e3b,
      emissiveIntensity: 0.22,
      metalness: 0.08,
      roughness: 0.35,
    });
    const markerRingMaterial = new THREE.MeshBasicMaterial({
      color: 0x0f7a55,
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

        loadedModel.traverse((child) => {
          if (shouldHideRouteHelper(child.name)) {
            child.visible = false;
          }

          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        const bounds = new THREE.Box3().setFromObject(loadedModel);
        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        const largestSide = Math.max(size.x, size.y, size.z) || 1;
        const scale = 7 / largestSide;

        loadedModel.scale.setScalar(scale);
        loadedModel.position.sub(center.multiplyScalar(scale));
        scene.add(loadedModel);

        loadedModel.updateMatrixWorld(true);
        modelBoundsRef.current = new THREE.Box3().setFromObject(loadedModel);

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
        nodePositionsRef.current = nodePositions;
        const generatedRouteEdges = createGeneratedRouteEdges(nodePositions);
        const nextRouteEdges = [...modelRouteEdges, ...generatedRouteEdges];
        routeEdgesRef.current =
          nextRouteEdges.length > 0 ? nextRouteEdges : fallbackRouteEdges;
        navmeshRouteDataRef.current = buildNavmeshRouteData(loadedModel);

        mountElement.dataset.routeNodes = String(nodePositions.size);
        mountElement.dataset.routeEdges = String(routeEdgesRef.current.length);
        mountElement.dataset.navmeshNodes = String(
          navmeshRouteDataRef.current?.nodePositions.size ?? 0,
        );
        mountElement.dataset.navmeshEdges = String(
          navmeshRouteDataRef.current?.routeEdges.length ?? 0,
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

    function animate() {
      frameId = window.requestAnimationFrame(animate);
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
      disposeObject(focusMarker);
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      focusMarkerRef.current = null;
      modelBoundsRef.current = null;
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
