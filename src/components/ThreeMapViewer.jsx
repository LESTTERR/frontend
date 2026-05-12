import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { offices as cityHallOffices } from "../data/offices.js";

const DEFAULT_MODEL_PATHS = [
  "/model2/OCH GFWL.glb",
  "/model2/OCH 2FWL.glb",
  "/model2/OCH 3FWL.glb",
];
const DEFAULT_MAP_POSITION = { x: 50, y: 50 };
const FLOOR_NUMBERS = [1, 2, 3];
const START_FLOOR_NUMBER = 1;
const FLOOR_MODEL_STYLES = {
  1: {
    floor: 0xd8f3ff,
    wall: 0xfafafa,
  },
  2: {
    floor: 0xdcfce7,
    wall: 0xffffff,
  },
  3: {
    floor: 0xfed7aa,
    wall: 0xf8fafc,
  },
};
const DEFAULT_MODEL_STYLE = {
  floor: 0xe0f2fe,
  wall: 0xffffff,
};
const ROUTE_COLOR = 0xf97316;
const ROUTE_EMISSIVE_COLOR = 0x7c2d12;
const ROUTE_FLOOR_LIFT = 0.035;
const ROUTE_ANIMATION_MS_PER_UNIT = 760;
const ROUTE_ANIMATION_MIN_MS = 1800;
const ROUTE_ANIMATION_MAX_MS = 6200;
const MODEL_OFFICE_OBJECT_IDS = Object.fromEntries(
  cityHallOffices.flatMap((office) =>
    (office.modelObjects ?? []).map((modelObjectName) => [
      modelObjectName.replace(/_+$/, "").toUpperCase(),
      office.id,
    ]),
  ),
);
const OFFICES_BY_ID = new Map(
  cityHallOffices.map((office) => [office.id, office]),
);
const MODEL_ROUTE_LANDMARK_IDS = {
  LOBBY_F: "route-start",
  MAIN_STAIRS: "stairs-1",
  MAIN_STAIRS001: "stairs-2",
  ELEVATOR: "elevator-1",
  ELEVATOR001: "elevator-2",
  ELEV: "elevator-3",
};
const NAVMESH_LINE_SAMPLE_DISTANCE = 0.11;
const NAVMESH_CONNECT_DISTANCE = 0.7;
const NAVMESH_BLOCK_RADIUS = 0.34;
const NAVMESH_ENDPOINT_CLEARANCE = 0.42;
const WALL_BLOCKER_MIN_HEIGHT = 0.06;
const WALL_BLOCKER_MIN_LENGTH = 0.08;
const WALL_BLOCKER_Y_TOLERANCE = 0.08;
const WALL_INTERSECTION_TOLERANCE = 0.018;

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

function findNodeRoute(
  startNode,
  endNode,
  nodePositions,
  routeEdges,
  blockedNodeNames = new Set(),
) {
  if (
    !nodePositions.has(startNode) ||
    !nodePositions.has(endNode) ||
    blockedNodeNames.has(startNode) ||
    blockedNodeNames.has(endNode)
  ) {
    return [];
  }

  const graph = buildRouteGraph(nodePositions, routeEdges);
  const distances = new Map([[startNode, 0]]);
  const previousNodes = new Map();
  const unvisited = new Set(
    [...graph.keys()].filter((nodeName) => !blockedNodeNames.has(nodeName)),
  );

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

  return routeNode;
}

function getOfficeRouteNode(office) {
  return normalizeRouteNodeName(office?.routeNode);
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

function getFloorLabel(floorNumber) {
  if (floorNumber === 3) {
    return "3rd Floor";
  }

  if (floorNumber === 2) {
    return "2nd Floor";
  }

  return "1st Floor";
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

function getMarkerRoutePosition(markerPosition, floorNumber, bounds, floorMetadata) {
  if (!markerPosition || !bounds || !floorNumber) {
    return null;
  }

  return new THREE.Vector3(
    markerPosition.x,
    getFloorRouteY(floorNumber, bounds, floorMetadata),
    markerPosition.z,
  );
}

function getOfficeMarkerRoutePosition(office, markerPosition, bounds, floorMetadata) {
  if (!office || !markerPosition || !bounds) {
    return null;
  }

  return getMarkerRoutePosition(
    markerPosition,
    getFloorNumber(office.floor),
    bounds,
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

  const names = [
    objectOrName?.name,
    objectOrName?.geometry?.name,
  ].filter(Boolean);

  let parent = objectOrName?.parent;
  while (parent) {
    if (parent.name) {
      names.push(parent.name);
    }
    parent = parent.parent;
  }

  return names;
}

function getModelOfficeKey(name) {
  return normalizeObjectName(name).replace(/_+$/, "").toUpperCase();
}

function getModelOfficeId(objectOrName) {
  for (const name of getObjectSearchNames(objectOrName)) {
    const officeId = MODEL_OFFICE_OBJECT_IDS[getModelOfficeKey(name)];

    if (officeId) {
      return officeId;
    }
  }

  return null;
}

function getModelRouteLandmarkId(objectOrName) {
  for (const name of getObjectSearchNames(objectOrName)) {
    const landmarkId = MODEL_ROUTE_LANDMARK_IDS[getModelOfficeKey(name)];

    if (landmarkId) {
      return landmarkId;
    }
  }

  return null;
}

function getVerticalAccessType(objectOrName) {
  for (const name of getObjectSearchNames(objectOrName)) {
    const normalizedName = normalizeObjectName(name).toLowerCase();

    if (normalizedName.includes("elev")) {
      return "elevator";
    }

    if (normalizedName.includes("stairs")) {
      return "stairs";
    }
  }

  return null;
}

function getClickableOfficeId(object) {
  let currentObject = object;

  while (currentObject) {
    if (currentObject.userData?.officeId) {
      return currentObject.userData.officeId;
    }

    const officeId = getModelOfficeId(currentObject);

    if (officeId) {
      return officeId;
    }

    currentObject = currentObject.parent;
  }

  return null;
}

function isObjectVisibleInScene(object) {
  let currentObject = object;

  while (currentObject) {
    if (!currentObject.visible) {
      return false;
    }

    currentObject = currentObject.parent;
  }

  return true;
}

function isRenderableObject(object) {
  return Boolean(
    object?.isMesh ||
      object?.isLine ||
      object?.isLineSegments ||
      object?.isPoints ||
      object?.isSprite,
  );
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

function getNearestNodeName(position, nodePositions, allowedNodeNames = null) {
  return getNearestNodeNames(position, nodePositions, allowedNodeNames, 1)[0] ?? null;
}

function getNearestNodeNames(
  position,
  nodePositions,
  allowedNodeNames = null,
  limit = 12,
) {
  const nearestNodes = [];

  for (const [nodeName, nodePosition] of nodePositions.entries()) {
    if (allowedNodeNames && !allowedNodeNames.has(nodeName)) {
      continue;
    }

    nearestNodes.push({
      nodeName,
      distance: position.distanceTo(nodePosition),
    });
  }

  return nearestNodes
    .sort((first, second) => first.distance - second.distance)
    .slice(0, limit)
    .map(({ nodeName }) => nodeName);
}

function getNavmeshNodeNamesForFloor(navmeshRouteData, floorNumber) {
  if (!floorNumber) {
    return null;
  }

  const nodeNames = new Set(
    navmeshRouteData.triangles
      .filter((triangle) => triangle.floorNumber === floorNumber)
      .map((triangle) => triangle.nodeName),
  );

  return nodeNames.size > 0 ? nodeNames : null;
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

function getXZDistance(firstPosition, secondPosition) {
  return Math.hypot(
    firstPosition.x - secondPosition.x,
    firstPosition.z - secondPosition.z,
  );
}

function cross2D(ax, az, bx, bz) {
  return ax * bz - az * bx;
}

function getSegmentIntersectionRatio(start, end, blocker) {
  const routeX = end.x - start.x;
  const routeZ = end.z - start.z;
  const wallX = blocker.end.x - blocker.start.x;
  const wallZ = blocker.end.z - blocker.start.z;
  const denominator = cross2D(routeX, routeZ, wallX, wallZ);

  if (Math.abs(denominator) < 0.000001) {
    return null;
  }

  const offsetX = blocker.start.x - start.x;
  const offsetZ = blocker.start.z - start.z;
  const routeRatio = cross2D(offsetX, offsetZ, wallX, wallZ) / denominator;
  const wallRatio = cross2D(offsetX, offsetZ, routeX, routeZ) / denominator;

  if (
    routeRatio <= WALL_INTERSECTION_TOLERANCE ||
    routeRatio >= 1 - WALL_INTERSECTION_TOLERANCE ||
    wallRatio < -WALL_INTERSECTION_TOLERANCE ||
    wallRatio > 1 + WALL_INTERSECTION_TOLERANCE
  ) {
    return null;
  }

  return routeRatio;
}

function getWallBlockerFromTriangle(firstPosition, secondPosition, thirdPosition, floorNumber) {
  const triangle = new THREE.Triangle(
    firstPosition,
    secondPosition,
    thirdPosition,
  );
  const normal = triangle.getNormal(new THREE.Vector3());
  const yValues = [firstPosition.y, secondPosition.y, thirdPosition.y];
  const yMin = Math.min(...yValues);
  const yMax = Math.max(...yValues);

  if (
    !floorNumber ||
    yMax - yMin < WALL_BLOCKER_MIN_HEIGHT ||
    Math.abs(normal.y) > 0.28
  ) {
    return null;
  }

  const positions = [firstPosition, secondPosition, thirdPosition];
  let longestPair = null;
  let longestDistance = 0;

  for (const [firstIndex, secondIndex] of [
    [0, 1],
    [1, 2],
    [2, 0],
  ]) {
    const distance = getXZDistance(
      positions[firstIndex],
      positions[secondIndex],
    );

    if (distance > longestDistance) {
      longestDistance = distance;
      longestPair = [positions[firstIndex], positions[secondIndex]];
    }
  }

  if (!longestPair || longestDistance < WALL_BLOCKER_MIN_LENGTH) {
    return null;
  }

  return {
    floorNumber,
    yMin,
    yMax,
    start: longestPair[0].clone(),
    end: longestPair[1].clone(),
  };
}

function getWallBlockerKey(blocker) {
  const endpoints = [blocker.start, blocker.end]
    .map((position) => `${position.x.toFixed(3)},${position.z.toFixed(3)}`)
    .sort()
    .join("|");

  return [
    blocker.floorNumber,
    endpoints,
    blocker.yMin.toFixed(2),
    blocker.yMax.toFixed(2),
  ].join("|");
}

function addWallBlockersFromMesh(object, wallBlockers, floorNumber) {
  const geometry = object.geometry;
  const positionAttribute = geometry?.getAttribute("position");
  const seenBlockers = new Set();

  if (!positionAttribute || !floorNumber) {
    return;
  }

  function getWorldPosition(index) {
    return new THREE.Vector3()
      .fromBufferAttribute(positionAttribute, index)
      .applyMatrix4(object.matrixWorld);
  }

  function addTriangle(firstIndex, secondIndex, thirdIndex) {
    const blocker = getWallBlockerFromTriangle(
      getWorldPosition(firstIndex),
      getWorldPosition(secondIndex),
      getWorldPosition(thirdIndex),
      floorNumber,
    );

    if (blocker) {
      const blockerKey = getWallBlockerKey(blocker);

      if (seenBlockers.has(blockerKey)) {
        return;
      }

      seenBlockers.add(blockerKey);
      wallBlockers.push(blocker);
    }
  }

  if (geometry.index) {
    for (let index = 0; index < geometry.index.count; index += 3) {
      addTriangle(
        geometry.index.getX(index),
        geometry.index.getX(index + 1),
        geometry.index.getX(index + 2),
      );
    }
    return;
  }

  for (let index = 0; index < positionAttribute.count; index += 3) {
    addTriangle(index, index + 1, index + 2);
  }
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

function groupByFloor(items) {
  const groupedItems = new Map();

  items.forEach((item) => {
    const floorItems = groupedItems.get(item.floorNumber) ?? [];
    floorItems.push(item);
    groupedItems.set(item.floorNumber, floorItems);
  });

  return groupedItems;
}

function buildNavmeshRouteData(root) {
  const nodePositions = new Map();
  const routeEdges = [];
  const triangles = [];
  const wallBlockers = [];
  const edgeOwners = new Map();
  const seenEdges = new Set();
  const nodeFloors = new Map();
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

  function addTriangle(firstPosition, secondPosition, thirdPosition, floorNumber) {
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
    nodeFloors.set(nodeName, floorNumber);
    triangles.push({
      nodeName,
      floorNumber,
      center: nodePositions.get(nodeName).clone(),
      a: firstPosition.clone(),
      b: secondPosition.clone(),
      c: thirdPosition.clone(),
    });

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
    if (!child.isMesh) {
      return;
    }

    const floorNumber = getModelFloorNumber(child);

    if (!isNavmeshObject(child)) {
      if (isFloorShellObject(child)) {
        addWallBlockersFromMesh(child, wallBlockers, floorNumber);
      }
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
          floorNumber,
        );
      }
      return;
    }

    for (let index = 0; index < positionAttribute.count; index += 3) {
      addTriangle(
        getWorldPosition(index),
        getWorldPosition(index + 1),
        getWorldPosition(index + 2),
        floorNumber,
      );
    }
  });

  const navmeshLookupData = {
    triangles,
    trianglesByFloor: groupByFloor(triangles),
    wallBlockers,
    wallBlockersByFloor: groupByFloor(wallBlockers),
  };

  for (let firstIndex = 0; firstIndex < triangles.length; firstIndex += 1) {
    const firstTriangle = triangles[firstIndex];

    for (let secondIndex = firstIndex + 1; secondIndex < triangles.length; secondIndex += 1) {
      const secondTriangle = triangles[secondIndex];

      if (
        firstTriangle.floorNumber !== secondTriangle.floorNumber ||
        firstTriangle.center.distanceTo(secondTriangle.center) > NAVMESH_CONNECT_DISTANCE ||
        !hasNavmeshLineOfSight(
          firstTriangle.center,
          secondTriangle.center,
          navmeshLookupData,
          firstTriangle.floorNumber,
        )
      ) {
        continue;
      }

      addEdge(firstTriangle.nodeName, secondTriangle.nodeName);
    }
  }

  const wallSafeRouteEdges = routeEdges.filter(([from, to]) => {
    const startPosition = nodePositions.get(from);
    const endPosition = nodePositions.get(to);
    const floorNumber = nodeFloors.get(from) ?? nodeFloors.get(to) ?? null;

    return hasNavmeshLineOfSight(
      startPosition,
      endPosition,
      navmeshLookupData,
      floorNumber,
    );
  });
  routeEdges.length = 0;
  routeEdges.push(...wallSafeRouteEdges);

  if (nodePositions.size === 0 || routeEdges.length === 0) {
    return null;
  }

  return {
    nodePositions,
    routeEdges,
    triangles,
    trianglesByFloor: navmeshLookupData.trianglesByFloor,
    wallBlockers,
    wallBlockersByFloor: navmeshLookupData.wallBlockersByFloor,
    componentCount: getRouteComponentCount(nodePositions, routeEdges),
  };
}

function getBlockedNavmeshNodeNames(
  startPosition,
  endPosition,
  navmeshRouteData,
  blockedPositions = [],
) {
  const blockedNodeNames = new Set();

  if (blockedPositions.length === 0) {
    return blockedNodeNames;
  }

  for (const [nodeName, nodePosition] of navmeshRouteData.nodePositions.entries()) {
    const isEndpoint =
      nodePosition.distanceTo(startPosition) <= NAVMESH_ENDPOINT_CLEARANCE ||
      nodePosition.distanceTo(endPosition) <= NAVMESH_ENDPOINT_CLEARANCE;

    if (isEndpoint) {
      continue;
    }

    if (
      blockedPositions.some(
        (blockedPosition) =>
          Math.abs(blockedPosition.y - nodePosition.y) < 0.25 &&
          blockedPosition.distanceTo(nodePosition) <= NAVMESH_BLOCK_RADIUS,
      )
    ) {
      blockedNodeNames.add(nodeName);
    }
  }

  return blockedNodeNames;
}

function pointInTriangle2D(point, triangle) {
  const denominator =
    (triangle.b.z - triangle.c.z) * (triangle.a.x - triangle.c.x) +
    (triangle.c.x - triangle.b.x) * (triangle.a.z - triangle.c.z);

  if (Math.abs(denominator) < 0.000001) {
    return false;
  }

  const firstWeight =
    ((triangle.b.z - triangle.c.z) * (point.x - triangle.c.x) +
      (triangle.c.x - triangle.b.x) * (point.z - triangle.c.z)) /
    denominator;
  const secondWeight =
    ((triangle.c.z - triangle.a.z) * (point.x - triangle.c.x) +
      (triangle.a.x - triangle.c.x) * (point.z - triangle.c.z)) /
    denominator;
  const thirdWeight = 1 - firstWeight - secondWeight;
  const tolerance = -0.0001;

  return (
    firstWeight >= tolerance &&
    secondWeight >= tolerance &&
    thirdWeight >= tolerance
  );
}

function isPointOnNavmesh(point, navmeshRouteData, floorNumber = null) {
  const triangles =
    floorNumber && navmeshRouteData.trianglesByFloor
      ? navmeshRouteData.trianglesByFloor.get(floorNumber) ?? []
      : navmeshRouteData.triangles;

  return triangles.some(
    (triangle) =>
      (!floorNumber || triangle.floorNumber === floorNumber) &&
      Math.abs(triangle.center.y - point.y) < 0.3 &&
      pointInTriangle2D(point, triangle),
  );
}

function isLineBlockedByWall(start, end, navmeshRouteData, floorNumber = null) {
  const wallBlockers =
    floorNumber && navmeshRouteData.wallBlockersByFloor
      ? navmeshRouteData.wallBlockersByFloor.get(floorNumber) ?? []
      : navmeshRouteData.wallBlockers ?? [];

  if (wallBlockers.length === 0) {
    return false;
  }

  return wallBlockers.some((blocker) => {
    if (
      (floorNumber && blocker.floorNumber !== floorNumber) ||
      start.y < blocker.yMin - WALL_BLOCKER_Y_TOLERANCE ||
      start.y > blocker.yMax + WALL_BLOCKER_Y_TOLERANCE
    ) {
      return false;
    }

    return getSegmentIntersectionRatio(start, end, blocker) !== null;
  });
}

function hasNavmeshLineOfSight(start, end, navmeshRouteData, floorNumber = null) {
  if (!start || !end || !navmeshRouteData) {
    return false;
  }

  if (isLineBlockedByWall(start, end, navmeshRouteData, floorNumber)) {
    return false;
  }

  const distance = start.distanceTo(end);
  const sampleCount = Math.max(
    2,
    Math.ceil(distance / NAVMESH_LINE_SAMPLE_DISTANCE),
  );

  for (let index = 0; index <= sampleCount; index += 1) {
    const sample = start.clone().lerp(end, index / sampleCount);

    if (!isPointOnNavmesh(sample, navmeshRouteData, floorNumber)) {
      return false;
    }
  }

  return true;
}

function simplifyNavmeshRoutePoints(points, navmeshRouteData, floorNumber = null) {
  if (!points || points.length <= 2) {
    return points ?? [];
  }

  const simplifiedPoints = [points[0].clone()];
  let currentIndex = 0;

  while (currentIndex < points.length - 1) {
    let nextIndex = points.length - 1;

    while (
      nextIndex > currentIndex + 1 &&
      !hasNavmeshLineOfSight(
        points[currentIndex],
        points[nextIndex],
        navmeshRouteData,
        floorNumber,
      )
    ) {
      nextIndex -= 1;
    }

    simplifiedPoints.push(points[nextIndex].clone());
    currentIndex = nextIndex;
  }

  return simplifiedPoints;
}

function removeCollinearRoutePoints(points) {
  if (!points || points.length <= 2) {
    return points ?? [];
  }

  const cleanedPoints = [points[0].clone()];

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = cleanedPoints[cleanedPoints.length - 1];
    const current = points[index];
    const next = points[index + 1];
    const sameX =
      Math.abs(previous.x - current.x) < 0.02 &&
      Math.abs(current.x - next.x) < 0.02;
    const sameZ =
      Math.abs(previous.z - current.z) < 0.02 &&
      Math.abs(current.z - next.z) < 0.02;

    if (!sameX && !sameZ) {
      cleanedPoints.push(current.clone());
    }
  }

  cleanedPoints.push(points[points.length - 1].clone());
  return cleanedPoints;
}

function createOrthogonalRoutePoints(points, navmeshRouteData, floorNumber = null) {
  if (!points || points.length <= 1) {
    return points ?? [];
  }

  const orthogonalPoints = [points[0].clone()];

  for (let index = 1; index < points.length; index += 1) {
    const start = orthogonalPoints[orthogonalPoints.length - 1];
    const end = points[index];
    const xDistance = Math.abs(start.x - end.x);
    const zDistance = Math.abs(start.z - end.z);

    if (xDistance > 0.08 && zDistance > 0.08) {
      const cornerOptions = [
        new THREE.Vector3(end.x, start.y, start.z),
        new THREE.Vector3(start.x, start.y, end.z),
      ];
      const validCorner = cornerOptions.find(
        (corner) =>
          hasNavmeshLineOfSight(start, corner, navmeshRouteData, floorNumber) &&
          hasNavmeshLineOfSight(corner, end, navmeshRouteData, floorNumber),
      );

      if (validCorner) {
        orthogonalPoints.push(validCorner);
      }
    }

    orthogonalPoints.push(end.clone());
  }

  return removeCollinearRoutePoints(orthogonalPoints);
}

function findReachableRoutesFromStart(startNode, graph, blockedNodeNames) {
  if (!graph.has(startNode) || blockedNodeNames.has(startNode)) {
    return null;
  }

  const distances = new Map([[startNode, 0]]);
  const previousNodes = new Map();
  const unvisited = new Set(
    [...graph.keys()].filter((nodeName) => !blockedNodeNames.has(nodeName)),
  );

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

  return { distances, previousNodes };
}

function buildNodeRouteFromPrevious(startNode, endNode, previousNodes) {
  const routeNodeNames = [];
  let currentNode = endNode;

  while (currentNode) {
    routeNodeNames.push(currentNode);

    if (currentNode === startNode) {
      return routeNodeNames.reverse();
    }

    currentNode = previousNodes.get(currentNode);
  }

  return [];
}

function createNavmeshRoutePoints(
  startPosition,
  endPosition,
  navmeshRouteData,
  blockedPositions = [],
  floorNumber = null,
) {
  if (!startPosition || !endPosition || !navmeshRouteData) {
    return [];
  }

  const allowedNodeNames = getNavmeshNodeNamesForFloor(
    navmeshRouteData,
    floorNumber,
  );
  const blockedNodeNames = getBlockedNavmeshNodeNames(
    startPosition,
    endPosition,
    navmeshRouteData,
    blockedPositions,
  );
  const startCandidates = getNearestNodeNames(
    startPosition,
    navmeshRouteData.nodePositions,
    allowedNodeNames,
    12,
  );
  const endCandidates = getNearestNodeNames(
    endPosition,
    navmeshRouteData.nodePositions,
    allowedNodeNames,
    allowedNodeNames?.size ?? navmeshRouteData.nodePositions.size,
  );
  const routeGraph = buildRouteGraph(
    navmeshRouteData.nodePositions,
    navmeshRouteData.routeEdges,
  );
  let bestRoute = null;

  for (const startCandidate of startCandidates) {
    const reachableRoutes = findReachableRoutesFromStart(
      startCandidate,
      routeGraph,
      blockedNodeNames,
    );

    if (!reachableRoutes) {
      continue;
    }

    for (const endCandidate of endCandidates) {
      const routeDistance = reachableRoutes.distances.get(endCandidate);

      if (routeDistance === undefined) {
        continue;
      }

      const startNodePosition =
        navmeshRouteData.nodePositions.get(startCandidate);
      const endNodePosition = navmeshRouteData.nodePositions.get(endCandidate);
      const score =
        startPosition.distanceTo(startNodePosition) * 8 +
        routeDistance +
        endPosition.distanceTo(endNodePosition) * 8;

      if (!bestRoute || score < bestRoute.score) {
        bestRoute = {
          score,
          routeNodeNames: buildNodeRouteFromPrevious(
            startCandidate,
            endCandidate,
            reachableRoutes.previousNodes,
          ),
          startNode: startCandidate,
          endNode: endCandidate,
        };
      }
    }
  }

  const routeNodeNames = bestRoute?.routeNodeNames ?? [];
  const startNode = bestRoute?.startNode ?? null;
  const endNode = bestRoute?.endNode ?? null;

  if (routeNodeNames.length === 0) {
    return [];
  }

  const startNodePosition = navmeshRouteData.nodePositions.get(startNode)?.clone();
  const endNodePosition = navmeshRouteData.nodePositions.get(endNode)?.clone();
  const canUseExactStart =
    startNodePosition &&
    isPointOnNavmesh(startPosition, navmeshRouteData, floorNumber) &&
    hasNavmeshLineOfSight(
      startNodePosition,
      startPosition,
      navmeshRouteData,
      floorNumber,
    );
  const canUseExactEnd =
    endNodePosition &&
    isPointOnNavmesh(endPosition, navmeshRouteData, floorNumber) &&
    hasNavmeshLineOfSight(
      endNodePosition,
      endPosition,
      navmeshRouteData,
      floorNumber,
    );
  const startWalkablePosition = canUseExactStart
    ? startPosition.clone()
    : startNodePosition;
  const endWalkablePosition = canUseExactEnd
    ? endPosition.clone()
    : endNodePosition;

  if (!startWalkablePosition || !endWalkablePosition) {
    return [];
  }

  if (routeNodeNames.length === 1) {
    const point = navmeshRouteData.nodePositions.get(routeNodeNames[0])?.clone();

    return point
      ? createOrthogonalRoutePoints(
          simplifyNavmeshRoutePoints(
            [startWalkablePosition, point, endWalkablePosition],
            navmeshRouteData,
            floorNumber,
          ),
          navmeshRouteData,
          floorNumber,
        )
      : [];
  }

  const routePoints = routeNodeNames
    .map((nodeName) => navmeshRouteData.nodePositions.get(nodeName))
    .filter(Boolean)
    .map((position) => position.clone());

  routePoints.unshift(startWalkablePosition);
  routePoints.push(endWalkablePosition);

  return createOrthogonalRoutePoints(
    simplifyNavmeshRoutePoints(routePoints, navmeshRouteData, floorNumber),
    navmeshRouteData,
    floorNumber,
  );
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
      name.includes("_1f") ||
      name.includes("_gf") ||
      name.includes("gfwl") ||
      name.includes("ground"),
    )
  ) {
    return 1;
  }

  if (
    names.some((name) =>
      name.startsWith("2f") ||
      name.startsWith("2_") ||
      name.includes("_2f") ||
      name.includes("2fwl"),
    )
  ) {
    return 2;
  }

  if (
    names.some((name) =>
      name.startsWith("3f") ||
      name.startsWith("3_") ||
      name.includes("_3f") ||
      name.includes("3fwl"),
    )
  ) {
    return 3;
  }

  if (names.some((name) => name === "navmesh" || name === "cube005")) {
    return 1;
  }

  return null;
}

function isFloorShellObject(objectOrName) {
  return getObjectSearchNames(objectOrName).some((name) => {
    const normalizedName = normalizeObjectName(name).toLowerCase();

    return normalizedName === "1f" || normalizedName === "2f" || normalizedName === "3f";
  });
}

function isModelLabelObject(objectOrName) {
  return (
    !isFloorShellObject(objectOrName) &&
    !isNavmeshObject(objectOrName) &&
    !getRoutePointName(typeof objectOrName === "string" ? objectOrName : objectOrName?.name) &&
    !getRouteEdge(typeof objectOrName === "string" ? objectOrName : objectOrName?.name)
  );
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

function getRouteNodeCandidates(routeNode) {
  const normalizedRouteNode = normalizeRouteNodeName(routeNode);
  const candidates = [routeNode, normalizedRouteNode].filter(Boolean);

  return [...new Set(candidates)];
}

function mergeRouteEdges(routeEdges) {
  const mergedRouteEdges = [];
  const seenEdges = new Set();

  routeEdges.forEach(([from, to]) => {
    addUniqueRouteEdge(mergedRouteEdges, seenEdges, from, to);
  });

  return mergedRouteEdges;
}

function normalizeModelPaths(modelPaths, modelPath) {
  const sourcePaths = modelPath ? [modelPath] : modelPaths;
  const normalizedPaths = (Array.isArray(sourcePaths) ? sourcePaths : [sourcePaths])
    .filter(Boolean);

  return normalizedPaths.length > 0 ? normalizedPaths : DEFAULT_MODEL_PATHS;
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
    nodePositions.get("route-start") ??
    center.clone().add(new THREE.Vector3(0, 0, size.z * 0.5));
  const lobbyPosition =
    nodePositions.get("route-start") ??
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
    nodePositions.get("route-start") ??
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
      materials.forEach((material) => {
        if (material.map) {
          material.map.dispose();
        }
        if (material.alphaMap) {
          material.alphaMap.dispose();
        }
        material.dispose();
      });
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

    faceNormal.copy(worldSecondPosition).sub(worldFirstPosition);
    firstEdge.copy(worldThirdPosition).sub(worldFirstPosition);
    faceNormal.cross(firstEdge);
    faceNormal.normalize();

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

    const isFloorSurface = Math.abs(faceNormal.y) > 0.58;
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
    getRouteEdge(child.name) ||
    !isFloorShellObject(child)
  ) {
    return;
  }

  const floorNumber = getModelFloorNumber(child);

  if (!floorNumber) {
    return;
  }

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
  modelPath,
  modelPaths = DEFAULT_MODEL_PATHS,
  selectedOffice,
  viewCommand,
  onSelectOffice,
  onRouteFloorChange,
}) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const focusAnimationRef = useRef(null);
  const focusMarkerRef = useRef(null);
  const modelBoundsRef = useRef(null);
  const modelRootRef = useRef(null);
  const floorMetadataRef = useRef(new Map());
  const nodePositionsRef = useRef(new Map());
  const officeMarkerPositionsRef = useRef(new Map());
  const routeLandmarkPositionsRef = useRef(new Map());
  const verticalAccessPositionsRef = useRef(new Map());
  const navmeshRouteDataRef = useRef(null);
  const routeEdgesRef = useRef([]);
  const routeGroupRef = useRef(null);
  const routeSequenceTimersRef = useRef([]);
  const routeSequenceRunRef = useRef(0);
  const onRouteFloorChangeRef = useRef(onRouteFloorChange);
  const onSelectOfficeRef = useRef(onSelectOffice);
  const selectedOfficeRef = useRef(selectedOffice);
  const activeModelPaths = useMemo(
    () => normalizeModelPaths(modelPaths, modelPath),
    [modelPath, modelPaths],
  );
  const modelSourceKey = activeModelPaths.join("|");
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
      const childFloorNumber =
        child.userData?.floorNumber ?? getModelFloorNumber(child);
      const isRouteHelper =
        shouldHideRouteHelper(child) ||
        getRoutePointName(child.name) ||
        getRouteEdge(child.name);

      if (isNavmeshObject(child) || isRouteHelper) {
        child.visible = false;
        return;
      }

      if (!isRenderableObject(child) && !childFloorNumber) {
        return;
      }

      child.visible = !floorNumber || childFloorNumber === floorNumber;
    });

    if (mountRef.current) {
      mountRef.current.dataset.visibleFloor = floorNumber
        ? String(floorNumber)
        : "all";
    }
  }

  function getOfficeNodePosition(office) {
    const routeNode = getOfficeRouteNode(office);

    if (!routeNode) {
      return officeMarkerPositionsRef.current.get(office?.id)?.clone() ?? null;
    }

    return (
      nodePositionsRef.current.get(routeNode)?.clone() ??
      officeMarkerPositionsRef.current.get(office?.id)?.clone() ??
      null
    );
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

  function clearRouteSequenceTimers() {
    routeSequenceTimersRef.current.forEach((timerId) => {
      window.clearTimeout(timerId);
    });
    routeSequenceTimersRef.current = [];
    routeSequenceRunRef.current += 1;
  }

  function notifyRouteFloorChange(floorNumber) {
    onRouteFloorChangeRef.current?.(getFloorLabel(floorNumber));
  }

  function getRouteOverlayY(points, floorNumber) {
    const floorData = floorMetadataRef.current.get(floorNumber);
    const floorRouteY = floorData?.routeY;

    if (Number.isFinite(floorRouteY)) {
      return floorRouteY + ROUTE_FLOOR_LIFT;
    }

    const routeFloorY = points.reduce(
      (minY, point) => Math.min(minY, point.y),
      points[0]?.y ?? 0,
    );

    return routeFloorY + ROUTE_FLOOR_LIFT;
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
      color: ROUTE_COLOR,
      transparent: true,
      opacity: 0.16,
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
      const baseSegment = createRouteSegment(start, end, 0.021, baseMaterial, 30);
      const pathSegment = createRouteSegment(
        start,
        end,
        0.019,
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

  function getRouteStartPosition() {
    return routeLandmarkPositionsRef.current.get("route-start")?.clone() ?? null;
  }

  function getVerticalRoutePosition(type, floorNumber) {
    return (
      routeLandmarkPositionsRef.current.get(`${type}-${floorNumber}`)?.clone() ??
      null
    );
  }

  function getOfficeDestinationPosition(office) {
    return officeMarkerPositionsRef.current.get(office?.id)?.clone() ?? null;
  }

  function getVerticalTravelType(destinationFloor) {
    if (destinationFloor === 2) {
      return "stairs";
    }

    if (destinationFloor === 3) {
      return "elevator";
    }

    return null;
  }

  function createRoutePlanForOffice(office) {
    const startPosition = getRouteStartPosition();
    const destinationPosition = getOfficeDestinationPosition(office);

    if (!office || !startPosition || !destinationPosition) {
      return [];
    }

    const destinationFloor = getFloorNumber(office.floor);
    const verticalType = getVerticalTravelType(destinationFloor);

    if (!verticalType) {
      return [
        {
          floorNumber: START_FLOOR_NUMBER,
          startPosition,
          endPosition: destinationPosition,
          label: "same-floor",
        },
      ];
    }

    const lowerVerticalPosition = getVerticalRoutePosition(
      verticalType,
      START_FLOOR_NUMBER,
    );
    const upperVerticalPosition = getVerticalRoutePosition(
      verticalType,
      destinationFloor,
    );

    if (!lowerVerticalPosition || !upperVerticalPosition) {
      return [];
    }

    return [
      {
        floorNumber: START_FLOOR_NUMBER,
        startPosition,
        endPosition: lowerVerticalPosition,
        label: `${verticalType}-approach`,
      },
      {
        floorNumber: destinationFloor,
        startPosition: upperVerticalPosition,
        endPosition: destinationPosition,
        label: `${verticalType}-destination`,
      },
    ];
  }

  function getBlockedVerticalAccessPositions(floorNumber, startPosition, endPosition) {
    return (verticalAccessPositionsRef.current.get(floorNumber) ?? [])
      .filter(({ position }) => {
        const isEndpoint =
          position.distanceTo(startPosition) <= NAVMESH_ENDPOINT_CLEARANCE ||
          position.distanceTo(endPosition) <= NAVMESH_ENDPOINT_CLEARANCE;

        return !isEndpoint;
      })
      .map(({ position }) => position.clone());
  }

  function createRouteForOffice(office, displayFloorNumber = getRouteStartFloorNumber()) {
    const navmeshRouteData = navmeshRouteDataRef.current;
    const routeSegment = createRoutePlanForOffice(office).find(
      (segment) => segment.floorNumber === displayFloorNumber,
    );

    if (!navmeshRouteData || !routeSegment) {
      disposeRouteGroup();
      if (mountRef.current) {
        mountRef.current.dataset.routeStatus = `missing-floor-${displayFloorNumber}`;
      }
      return [];
    }

    const blockedPositions = getBlockedVerticalAccessPositions(
      displayFloorNumber,
      routeSegment.startPosition,
      routeSegment.endPosition,
    );
    const routePoints = createNavmeshRoutePoints(
      routeSegment.startPosition,
      routeSegment.endPosition,
      navmeshRouteData,
      blockedPositions,
      displayFloorNumber,
    );

    if (routePoints.length < 2) {
      disposeRouteGroup();
      if (mountRef.current) {
        mountRef.current.dataset.routeStatus = `missing-navmesh-floor-${displayFloorNumber}`;
      }
      return [];
    }

    createRouteGroup(routePoints, displayFloorNumber);
    if (mountRef.current) {
      mountRef.current.dataset.routeStatus = `ready-navmesh-${routeSegment.label}-floor-${displayFloorNumber}-points-${routePoints.length}`;
      mountRef.current.dataset.routeEndDistance = routePoints[
        routePoints.length - 1
      ]
        .distanceTo(routeSegment.endPosition)
        .toFixed(3);
      mountRef.current.dataset.routePoints = routePoints
        .map((point) =>
          [point.x, point.y, point.z]
            .map((value) => value.toFixed(3))
            .join(","),
        )
        .join(";");
    }
    return routePoints;
  }

  function renderRouteFloorForOffice(
    office,
    instant = false,
    displayFloorNumber = getRouteStartFloorNumber(),
    { focusWhenMissing = true } = {},
  ) {
    const points = createRouteForOffice(office, displayFloorNumber);
    const bounds = modelBoundsRef.current;
    const floorMetadata = floorMetadataRef.current;
    setVisibleFloor(displayFloorNumber);
    notifyRouteFloorChange(displayFloorNumber);

    if (points.length < 2 || !bounds) {
      if (focusWhenMissing) {
        focusOffice(office, instant);
      }
      return points;
    }

    const { target, cameraPosition } = getKioskRouteView(
      points,
      bounds,
      displayFloorNumber,
      floorMetadata,
    );

    setFocusMarker(points[points.length - 1]);
    animateView(target, cameraPosition, instant);
    return points;
  }

  function enterRouteForOffice(
    office,
    instant = false,
    displayFloorNumber = getRouteStartFloorNumber(),
  ) {
    clearRouteSequenceTimers();
    return renderRouteFloorForOffice(office, instant, displayFloorNumber);
  }

  function startRouteSequenceForOffice(office, instant = false) {
    clearRouteSequenceTimers();

    if (!office) {
      return [];
    }

    const routePlan = createRoutePlanForOffice(office);
    if (routePlan.length === 0) {
      disposeRouteGroup();
      if (mountRef.current) {
        mountRef.current.dataset.routeStatus = "missing-plan";
      }
      focusOffice(office, instant);
      return [];
    }

    const runId = routeSequenceRunRef.current;
    let segmentIndex = 0;
    let lastPoints = [];

    function renderNextFloor(stepInstant = false) {
      if (
        routeSequenceRunRef.current !== runId ||
        segmentIndex >= routePlan.length
      ) {
        return;
      }

      const floorNumber = routePlan[segmentIndex].floorNumber;
      const isLastFloor = segmentIndex === routePlan.length - 1;
      const points = renderRouteFloorForOffice(
        office,
        stepInstant,
        floorNumber,
        { focusWhenMissing: isLastFloor },
      );

      if (points.length >= 2) {
        lastPoints = points;
      }

      segmentIndex += 1;

      if (segmentIndex >= routePlan.length) {
        return;
      }

      const animationDuration =
        points.length >= 2
          ? routeGroupRef.current?.userData.animationDuration ?? 0
          : 0;
      const transitionDelay = animationDuration > 0 ? animationDuration + 650 : 250;
      const timerId = window.setTimeout(() => renderNextFloor(false), transitionDelay);
      routeSequenceTimersRef.current.push(timerId);
    }

    renderNextFloor(instant);
    return lastPoints;
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
    onSelectOfficeRef.current = onSelectOffice;
  }, [onSelectOffice]);

  useEffect(() => {
    onRouteFloorChangeRef.current = onRouteFloorChange;
  }, [onRouteFloorChange]);

  useEffect(() => {
    selectedOfficeRef.current = selectedOffice;
  }, [selectedOffice?.id]);

  useEffect(() => {
    if (!viewCommand) {
      return;
    }

    if (viewCommand.type === "reset-view") {
      clearRouteSequenceTimers();
      resetModelView();
      return;
    }

    if (viewCommand.type === "focus-office") {
      enterRouteForOffice(selectedOfficeRef.current);
      return;
    }

    if (viewCommand.type === "enter-route") {
      if (viewCommand.payload?.autoFloors) {
        startRouteSequenceForOffice(selectedOfficeRef.current);
        return;
      }

      enterRouteForOffice(
        selectedOfficeRef.current,
        false,
        viewCommand.payload?.floor
          ? getFloorNumber(viewCommand.payload.floor)
          : getRouteStartFloorNumber(),
      );
      return;
    }

    if (viewCommand.type === "focus-floor") {
      clearRouteSequenceTimers();
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
    let pointerStart = null;
    const clickableOfficeMeshes = [];
    const pointer = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();

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

    function getOfficeIdAtPointer(event) {
      const rect = renderer.domElement.getBoundingClientRect();

      if (!rect.width || !rect.height || clickableOfficeMeshes.length === 0) {
        return null;
      }

      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      const intersections = raycaster.intersectObjects(clickableOfficeMeshes, true);
      const matchingIntersection = intersections.find((intersection) =>
        isObjectVisibleInScene(intersection.object),
      );

      return matchingIntersection
        ? getClickableOfficeId(matchingIntersection.object)
        : null;
    }

    function handlePointerDown(event) {
      pointerStart = { x: event.clientX, y: event.clientY };
    }

    function handlePointerMove(event) {
      const officeId = getOfficeIdAtPointer(event);
      renderer.domElement.style.cursor = officeId ? "pointer" : "grab";
    }

    function handlePointerUp(event) {
      if (!pointerStart) {
        return;
      }

      const movement = Math.hypot(
        event.clientX - pointerStart.x,
        event.clientY - pointerStart.y,
      );
      pointerStart = null;

      if (movement > 8) {
        return;
      }

      const officeId = getOfficeIdAtPointer(event);
      const office = OFFICES_BY_ID.get(officeId);

      if (!office) {
        return;
      }

      event.preventDefault();
      onSelectOfficeRef.current?.(office.id, { focusDestinationFloor: true });
      enterRouteForOffice(office, false, getFloorNumber(office.floor));

      if (mountRef.current) {
        mountRef.current.dataset.clickedOffice = office.id;
      }
    }

    const resizeObserver = new ResizeObserver(resizeRenderer);
    resizeObserver.observe(mountElement);
    resizeRenderer();
    renderer.domElement.style.cursor = "grab";
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);

    const loader = new GLTFLoader();
    const loadModel = (sourcePath) =>
      new Promise((resolve, reject) => {
        loader.load(
          sourcePath,
          (gltf) => resolve({ sourcePath, scene: gltf.scene }),
          undefined,
          reject,
        );
      });

    Promise.all(activeModelPaths.map(loadModel)).then(
      (loadedScenes) => {
        if (isDisposed) {
          return;
        }

        loadedModel = new THREE.Group();
        loadedModel.name = "Olongapo_City_Hall_Model";
        loadedModel.userData.modelSources = activeModelPaths;

        loadedScenes.forEach(({ sourcePath, scene: sourceScene }) => {
          sourceScene.name = sourcePath
            .split("/")
            .pop()
            ?.replace(/\.[^.]+$/, "")
            ?.replace(/[^A-Za-z0-9]+/g, "_") ?? "model_part";
          sourceScene.userData.sourcePath = sourcePath;
          sourceScene.userData.floorNumber = getModelFloorNumber(sourceScene);
          loadedModel.add(sourceScene);
        });

        modelRootRef.current = loadedModel;
        loadedModel.updateMatrixWorld(true);

        loadedModel.traverse((child) => {
          const inferredFloorNumber = getModelFloorNumber(child);

          if (inferredFloorNumber) {
            child.userData = {
              ...child.userData,
              floorNumber: child.userData?.floorNumber ?? inferredFloorNumber,
            };
          }

          if (child.isMesh && isNavmeshObject(child)) {
            styleNavmeshFloorMesh(child);
            return;
          }

          const officeId = getModelOfficeId(child);
          const office = OFFICES_BY_ID.get(officeId);
          if (child.isMesh && office) {
            child.userData = {
              ...child.userData,
              officeId,
              isClickableOfficeMarker: true,
              floorNumber: getFloorNumber(office.floor),
            };
            child.castShadow = false;
            child.receiveShadow = false;
            child.renderOrder = 50;
            clickableOfficeMeshes.push(child);
            return;
          }

          if (isRenderableObject(child) && isModelLabelObject(child)) {
            child.userData = {
              ...child.userData,
              floorNumber:
                child.userData?.floorNumber ??
                inferredFloorNumber ??
                START_FLOOR_NUMBER,
              isModelLabel: true,
            };
            child.castShadow = false;
            child.receiveShadow = false;
            child.renderOrder = 50;
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
        const officeMarkerPositions = new Map();
        const routeLandmarkPositions = new Map();
        const verticalAccessPositions = new Map();
        const modelRouteEdges = [];

        loadedModel.traverse((child) => {
          const routePointName = getRoutePointName(child.name);
          const routeEdge = getRouteEdge(child.name);
          const office = OFFICES_BY_ID.get(child.userData?.officeId);
          const floorNumber =
            child.userData?.floorNumber ??
            getModelFloorNumber(child) ??
            (office ? getFloorNumber(office.floor) : null);
          const markerCenter = child.isMesh ? getObjectCenter(child) : null;

          if (routeEdge) {
            modelRouteEdges.push(routeEdge);
          }

          if (office && child.isMesh) {
            const markerRoutePosition = getOfficeMarkerRoutePosition(
              office,
              markerCenter,
              modelBoundsRef.current,
              floorMetadata,
            );

            if (markerRoutePosition) {
              officeMarkerPositions.set(office.id, markerRoutePosition);
              getRouteNodeCandidates(
                office.routeNode,
              ).forEach((routeNodeName) => {
                nodePositions.set(routeNodeName, markerRoutePosition.clone());
              });
            }
          }

          if (child.isMesh && floorNumber) {
            const landmarkId = getModelRouteLandmarkId(child);
            const markerRoutePosition = getMarkerRoutePosition(
              markerCenter,
              floorNumber,
              modelBoundsRef.current,
              floorMetadata,
            );

            if (landmarkId && markerRoutePosition) {
              routeLandmarkPositions.set(landmarkId, markerRoutePosition);
              nodePositions.set(landmarkId, markerRoutePosition.clone());
            }

            const verticalAccessType = getVerticalAccessType(child);
            if (verticalAccessType && markerRoutePosition) {
              const floorAccessPositions =
                verticalAccessPositions.get(floorNumber) ?? [];
              floorAccessPositions.push({
                type: verticalAccessType,
                name: normalizeObjectName(child.name),
                position: markerRoutePosition,
              });
              verticalAccessPositions.set(floorNumber, floorAccessPositions);
            }
          }

          if (!routePointName) {
            return;
          }

          nodePositions.set(routePointName, markerCenter ?? getObjectCenter(child));
        });
        nodePositionsRef.current = nodePositions;
        officeMarkerPositionsRef.current = officeMarkerPositions;
        routeLandmarkPositionsRef.current = routeLandmarkPositions;
        verticalAccessPositionsRef.current = verticalAccessPositions;
        routeEdgesRef.current = mergeRouteEdges(modelRouteEdges);
        navmeshRouteDataRef.current = buildNavmeshRouteData(loadedModel);

        mountElement.dataset.routeNodes = String(nodePositions.size);
        mountElement.dataset.routeEdges = String(routeEdgesRef.current.length);
        mountElement.dataset.routeLandmarks = String(routeLandmarkPositions.size);
        mountElement.dataset.verticalAccess = String(
          [...verticalAccessPositions.values()].reduce(
            (total, items) => total + items.length,
            0,
          ),
        );
        mountElement.dataset.modelSources = String(activeModelPaths.length);
        mountElement.dataset.navmeshNodes = String(
          navmeshRouteDataRef.current?.nodePositions.size ?? 0,
        );
        mountElement.dataset.navmeshEdges = String(
          navmeshRouteDataRef.current?.routeEdges.length ?? 0,
        );
        mountElement.dataset.wallBlockers = String(
          navmeshRouteDataRef.current?.wallBlockers.length ?? 0,
        );
        mountElement.dataset.navmeshComponents = String(
          navmeshRouteDataRef.current?.componentCount ?? 0,
        );

        setStatus("ready");
        resetModelView(true);

        if (selectedOfficeRef.current) {
          startRouteSequenceForOffice(selectedOfficeRef.current, true);
        }
      },
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
      clearRouteSequenceTimers();
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
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
      modelRootRef.current = null;
      floorMetadataRef.current = new Map();
      nodePositionsRef.current = new Map();
      officeMarkerPositionsRef.current = new Map();
      routeLandmarkPositionsRef.current = new Map();
      verticalAccessPositionsRef.current = new Map();
      navmeshRouteDataRef.current = null;
      routeEdgesRef.current = [];
      focusAnimationRef.current = null;
    };
  }, [modelSourceKey]);

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
