import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  defaultFloors,
  defaultModelPaths,
  defaultOffices,
} from "../data/navigatorDefaults.js";
import { findWaypointRoute } from "../services/pathfinding.js";
import { cloneModelScene, loadModelAsset } from "../services/modelAsset.js";

const DEFAULT_MODEL_PATHS = defaultModelPaths;
const DEFAULT_MAP_POSITION = { x: 50, y: 50 };
const FLOOR_NUMBERS = defaultFloors.map((floor) => floor.number);
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
const ROUTE_SPEED_UNITS_PER_SECOND = 0.5;
const NAVMESH_LINE_SAMPLE_DISTANCE = 0.11;
const NAVMESH_CONNECT_DISTANCE = 0.7;
const NAVMESH_BLOCK_RADIUS = 0.34;
const NAVMESH_ENDPOINT_CLEARANCE = 0.42;
const WALL_BLOCKER_MIN_HEIGHT = 0.06;
const WALL_BLOCKER_MIN_LENGTH = 0.08;
const WALL_BLOCKER_Y_TOLERANCE = 0.08;
const WALL_INTERSECTION_TOLERANCE = 0.018;
const MODEL_ROUTE_LANDMARK_IDS = {
  LOBBY_F: "route-start",
  MAIN_STAIRS: "stairs-1",
  MAIN_STAIRS001: "stairs-2",
  ELEVATOR: "elevator-1",
  ELEVATOR001: "elevator-2",
  ELEV: "elevator-3",
};

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

function getFloorNumber(floor = "", floors = [], floorId = "") {
  const configuredFloor =
    floors.find((entry) => entry.id === floorId) ||
    floors.find((entry) => entry.id === floor) ||
    floors.find((entry) => entry.label === floor) ||
    floors.find((entry) => String(entry.number) === String(floor));
  if (configuredFloor) {
    return Number(configuredFloor.order ?? configuredFloor.number);
  }

  const match = String(floor ?? "").match(/\d+/);
  return match ? Number(match[0]) : START_FLOOR_NUMBER;
}

function getFloorLabel(floorNumber, floors = []) {
  return (
    floors.find(
      (floor) => Number(floor.order ?? floor.number) === floorNumber,
    )?.label || `${floorNumber} Floor`
  );
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

function getOfficeMarkerRoutePosition(
  office,
  markerPosition,
  bounds,
  floorMetadata,
  floorNumber = getFloorNumber(office?.floor),
) {
  if (!office || !markerPosition || !bounds) {
    return null;
  }

  return getMarkerRoutePosition(
    markerPosition,
    floorNumber,
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

function buildModelOfficeObjectIds(offices = []) {
  return Object.fromEntries(
    offices.flatMap((office) =>
      (office.modelObjects ?? []).map((modelObjectName) => [
        getModelOfficeKey(modelObjectName),
        office.id,
      ]),
    ),
  );
}

function getModelOfficeId(objectOrName, modelOfficeObjectIds) {
  for (const name of getObjectSearchNames(objectOrName)) {
    const officeId = modelOfficeObjectIds[getModelOfficeKey(name)];

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

function getClickableOfficeId(object, modelOfficeObjectIds) {
  let currentObject = object;

  while (currentObject) {
    if (currentObject.userData?.officeId) {
      return currentObject.userData.officeId;
    }

    const officeId = getModelOfficeId(currentObject, modelOfficeObjectIds);

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
      name.startsWith("1_") ||
      name.includes("1_floor") ||
      name.includes("1f_") ||
      name.startsWith("gf") ||
      name.includes("_1f") ||
      name.includes("_gf") ||
      name.includes("gfwl") ||
      name.includes("ground") ||
      name.includes("1st"),
    )
  ) {
    return 1;
  }

  if (
    names.some((name) =>
      name.startsWith("2f") ||
      name.startsWith("2_") ||
      name.includes("2_floor") ||
      name.includes("2f_") ||
      name.includes("_2f") ||
      name.includes("2fwl") ||
      name.includes("2nd"),
    )
  ) {
    return 2;
  }

  if (
    names.some((name) =>
      name.startsWith("3f") ||
      name.startsWith("3_") ||
      name.includes("3_floor") ||
      name.includes("3f_") ||
      name.includes("_3f") ||
      name.includes("3fwl") ||
      name.includes("3rd"),
    )
  ) {
    return 3;
  }

  if (
    names.some((name) =>
      name.startsWith("roof") ||
      name.includes("roof") ||
      name.startsWith("4f") ||
      name.startsWith("4_"),
    )
  ) {
    return 4;
  }

  if (names.some((name) => name === "navmesh" || name === "cube005")) {
    return 1;
  }

  return null;
}

function isFloorShellObject(objectOrName) {
  return getObjectSearchNames(objectOrName).some((name) => {
    const normalizedName = normalizeObjectName(name).toLowerCase();

    return (
      normalizedName === "1f" ||
      normalizedName === "2f" ||
      normalizedName === "3f" ||
      normalizedName.startsWith("1_floor") ||
      normalizedName.startsWith("2_floor") ||
      normalizedName.startsWith("3_floor")
    );
  });
}

function isModelLabelObject(objectOrName) {
  const name = typeof objectOrName === "string" ? objectOrName : objectOrName?.name;
  if (!name) return false;
  const lower = name.toLowerCase();
  return (
    lower.includes("label") ||
    lower.includes("text") ||
    lower.includes("sign") ||
    lower.includes("marker")
  );
}

function getFloorMetadata(root, bounds, configuredFloorNumbers = []) {
  const floorMetadata = new Map();

  for (const floorNumber of new Set([1, 2, 3, 4, ...configuredFloorNumbers])) {
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
    if (!floorData.navmeshBounds && floorData.visualBounds) {
      floorData.routeY = floorData.visualBounds.min.y + 0.05;
    }
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

  return normalizedPaths;
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

function getFrontOverviewView(bounds, nodePositions, aspect = 1) {
  const center = bounds.getCenter(new THREE.Vector3());
  const boundingSphere = bounds.getBoundingSphere(new THREE.Sphere());
  const frontDirection = getFrontDirection(bounds, nodePositions);
  const verticalFov = THREE.MathUtils.degToRad(50);
  const horizontalFov =
    2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(aspect, 0.1));
  const limitingFov = Math.min(verticalFov, horizontalFov);
  const distance =
    (boundingSphere.radius / Math.sin(limitingFov / 2)) * 0.58;
  const elevation = THREE.MathUtils.degToRad(28);
  const cameraDirection = frontDirection
    .multiplyScalar(Math.cos(elevation))
    .setY(Math.sin(elevation))
    .normalize();
  const cameraPosition = center
    .clone()
    .add(cameraDirection.multiplyScalar(distance));

  return { target: center, cameraPosition };
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

function getRouteFollowOffset(floorNumber, bounds, floorMetadata) {
  const floorBounds = getFloorModelBounds(floorNumber, floorMetadata, bounds);
  const floorSize = floorBounds.getSize(new THREE.Vector3());
  const floorLargest = Math.max(floorSize.x, floorSize.z, floorSize.y * 2.6) || 7;

  return new THREE.Vector3(0, floorLargest * 0.62, floorLargest * 0.22);
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

function lockCameraAzimuth(camera, controls) {
  const offset = camera.position.clone().sub(controls.target);
  const azimuth = Math.atan2(offset.x, offset.z);
  controls.minAzimuthAngle = azimuth;
  controls.maxAzimuthAngle = azimuth;
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
    getRouteEdge(child.name)
  ) {
    return;
  }

  const floorNumber = getModelFloorNumber(child);

  if (floorNumber) {
    child.userData.floorNumber = floorNumber;
  }

  child.castShadow = true;
  child.receiveShadow = true;

  if (child.material) {
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((mat) => {
      mat.side = THREE.DoubleSide;
    });
  }
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
  offices = defaultOffices,
  floors = defaultFloors,
  modelPath,
  modelPaths = DEFAULT_MODEL_PATHS,
  pathNodes = [],
  pathEdges = [],
  startNodeId = "entrance-kiosk",
  selectedOffice,
  viewCommand,
  onSelectOffice,
  onRouteFloorChange,
  onNavigationStatus,
  waypointEditMode = false,
  isDrawingRoute = false,
  onRoutePointPlace,
  editFloor,
  isolatedFloorView = false,
  selectedWaypointId = null,
  isPlacingWaypoint = false,
  onWaypointPlace,
  onWaypointPositionChange,
  showNavigationDebug = false,
  showOfficeLabels = true,
  accessibilityMode = false,
  lockCameraRotation = !waypointEditMode,
  optimizeForKiosk = false,
  t = (key) => key,
}) {
  const mountRef = useRef(null);
  const renderSceneRef = useRef(null);
  const scheduleViewerFrameRef = useRef(null);
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
  const routeFollowOffsetRef = useRef(null);
  const isRouteFollowingRef = useRef(false);
  const accessibilityModeRef = useRef(accessibilityMode);
  const lockCameraRotationRef = useRef(lockCameraRotation);
  const waypointMarkerGroupRef = useRef(null);
  const waypointMarkersRef = useRef(new Map());
  const pathNodesRef = useRef(pathNodes);
  const pathEdgesRef = useRef(pathEdges);
  const startNodeIdRef = useRef(startNodeId);
  const visibleFloorRef = useRef(null);
  const floorsRef = useRef(floors);
  floorsRef.current = floors;
  const currentRouteFloorRef = useRef(null);
  const waypointEditModeRef = useRef(waypointEditMode);
  const selectedWaypointIdRef = useRef(selectedWaypointId);
  const editFloorRef = useRef(editFloor);
  const isolatedFloorViewRef = useRef(isolatedFloorView);
  editFloorRef.current = editFloor;
  isolatedFloorViewRef.current = isolatedFloorView;
  const isPlacingWaypointRef = useRef(isPlacingWaypoint);
  const isDrawingRouteRef = useRef(isDrawingRoute);
  const onWaypointPlaceRef = useRef(onWaypointPlace);
  const onRoutePointPlaceRef = useRef(onRoutePointPlace);
  const onWaypointPositionChangeRef = useRef(onWaypointPositionChange);
  const onNavigationStatusRef = useRef(onNavigationStatus);
  const onRouteFloorChangeRef = useRef(onRouteFloorChange);
  const onSelectOfficeRef = useRef(onSelectOffice);
  const selectedOfficeRef = useRef(selectedOffice);
  accessibilityModeRef.current = accessibilityMode;
  lockCameraRotationRef.current = lockCameraRotation;
  const viewCommandRef = useRef(viewCommand);
  viewCommandRef.current = viewCommand;
  const nodeFloorsRef = useRef(new Map());
  const officesById = useMemo(
    () => new Map(offices.map((office) => [office.id, office])),
    [offices],
  );
  const modelOfficeObjectIds = useMemo(
    () => buildModelOfficeObjectIds(offices),
    [offices],
  );
  const floorNumbers = useMemo(
    () =>
      [...new Set(
        floors
          .map((floor) => Number(floor.order ?? floor.number))
          .filter((number) => Number.isFinite(number) && number > 0),
      )]
        .sort((first, second) => first - second),
    [floors],
  );
  const officeSourceKey = useMemo(
    () =>
      JSON.stringify(
        offices.map((office) => ({
          id: office.id,
          name: office.name,
          floor: office.floor,
          room: office.room,
          mapPosition: office.mapPosition,
          modelObjects: office.modelObjects,
          routeNode: office.routeNode,
          showLabel: office.showLabel,
        })),
      ),
    [offices],
  );
  const pathSourceKey = useMemo(
    () => JSON.stringify({ pathNodes, pathEdges, floors }),
    [pathNodes, pathEdges, floors],
  );
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
      if (lockCameraRotationRef.current) {
        lockCameraAzimuth(camera, controls);
      }
      controls.update();
      renderSceneRef.current?.();
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
      if (lockCameraRotationRef.current) {
        lockCameraAzimuth(camera, controls);
      }
      controls.update();
      renderSceneRef.current?.();

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

  function applyConfiguredFloorGroups() {
    const modelRoot = modelRootRef.current;
    if (!modelRoot) return;

    floorsRef.current.forEach((floor) => {
      if (!floor.modelGroupName) return;
      const group = modelRoot.getObjectByName(floor.modelGroupName);
      if (!group) return;
      group.traverse((child) => {
        child.userData = {
          ...child.userData,
          floorNumber: Number(floor.order ?? floor.number),
          floorId: floor.id,
        };
      });
    });
  }

  function setVisibleFloor(floorNumber = null) {
    const modelRoot = modelRootRef.current;

    if (!modelRoot) {
      return;
    }

    visibleFloorRef.current = floorNumber;
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

      if (child.isMesh) {
        if (!floorNumber) {
          // Overview: show EVERYTHING including the roof
          child.visible = true;
        } else {
          // Cumulative: show floor 1 up to the selected floor, hide higher floors
          // e.g. selecting floor 2 shows floor 1 + floor 2
          // selecting floor 3 shows floor 1 + 2 + 3 (roof hidden)
          if (!childFloorNumber) {
            // Unclassified meshes always visible
            child.visible = true;
          } else if (waypointEditModeRef.current && isolatedFloorViewRef.current) {
            child.visible = childFloorNumber === floorNumber;
          } else {
            child.visible = childFloorNumber <= floorNumber;
          }
        }
      }
    });

    floorsRef.current.forEach((floor) => {
      if (!floor.modelGroupName) return;
      const group = modelRoot.getObjectByName(floor.modelGroupName);
      if (!group) return;
      group.visible =
        (floor.enabled !== false ||
          (waypointEditModeRef.current && isolatedFloorViewRef.current)) &&
        (floorNumber === null ||
        (waypointEditModeRef.current && isolatedFloorViewRef.current
          ? Number(floor.order ?? floor.number) === floorNumber
          : Number(floor.order ?? floor.number) <= floorNumber));
    });

    waypointMarkerGroupRef.current?.children.forEach((child) => {
      if (!child.userData?.waypointId) return;
      child.visible =
        floorNumber === null ||
        (waypointEditModeRef.current && isolatedFloorViewRef.current
          ? child.userData.floorNumber === floorNumber
          : (child.userData.floorNumber ?? START_FLOOR_NUMBER) <= floorNumber);
    });

    if (mountRef.current) {
      mountRef.current.dataset.visibleFloor = floorNumber
        ? String(floorNumber)
        : "all";
    }
  }

  function disposeWaypointMarkers() {
    const markerGroup = waypointMarkerGroupRef.current;

    if (markerGroup) {
      markerGroup.parent?.remove(markerGroup);
      disposeObject(markerGroup);
      waypointMarkerGroupRef.current = null;
    }

    waypointMarkersRef.current.clear();
  }

  function updateWaypointMarkers() {
    const scene = sceneRef.current;
    const modelRoot = modelRootRef.current;

    disposeWaypointMarkers();
    if (
      !scene ||
      !modelRoot ||
      (!waypointEditModeRef.current && !showNavigationDebug)
    ) {
      return;
    }

    const group = new THREE.Group();
    group.name = "navigation_waypoints";
    const nodeMap = new Map(pathNodesRef.current.map((node) => [node.id, node]));
    const markerMaterialCache = new Map();

    function getMarkerMaterial(node) {
      const isSelected = node.id === selectedWaypointIdRef.current;
      const color =
        node.type === "kiosk"
          ? 0x16a34a
          : node.type === "stairs" || node.type === "stair"
            ? 0x2563eb
            : node.type === "office"
              ? 0xdc2626
              : node.type === "elevator"
                ? 0x9333ea
                : 0xd97706;
      const key = `${color}-${isSelected}`;

      if (!markerMaterialCache.has(key)) {
        markerMaterialCache.set(
          key,
          new THREE.MeshBasicMaterial({
            color: isSelected ? 0xffffff : color,
            depthTest: false,
          }),
        );
      }

      return markerMaterialCache.get(key);
    }

    pathNodesRef.current.forEach((node) => {
      if (
        !node.position ||
        !["x", "y", "z"].every((axis) => Number.isFinite(node.position[axis]))
      ) {
        return;
      }

      const floorNumber =
        getFloorNumber(node.floor, floorsRef.current, node.floorId) ??
        START_FLOOR_NUMBER;
      const isVisible =
        visibleFloorRef.current === null ||
        floorNumber <= visibleFloorRef.current;
      const worldPosition = modelRoot.localToWorld(
        new THREE.Vector3(node.position.x, node.position.y, node.position.z),
      );
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(
          node.id === selectedWaypointIdRef.current ? 0.1 : 0.075,
          12,
          10,
        ),
        getMarkerMaterial(node),
      );
      marker.position.copy(worldPosition);
      marker.renderOrder = 100;
      marker.visible = isVisible;
      marker.userData = { waypointId: node.id, floorNumber };
      group.add(marker);
      waypointMarkersRef.current.set(node.id, marker);
    });

    if (showNavigationDebug) {
      const edgePoints = [];
      pathEdgesRef.current.forEach((edge) => {
        const from = nodeMap.get(edge.from);
        const to = nodeMap.get(edge.to);
        if (!from?.position || !to?.position) return;

        edgePoints.push(
          modelRoot.localToWorld(
            new THREE.Vector3(
              from.position.x,
              from.position.y,
              from.position.z,
            ),
          ),
          modelRoot.localToWorld(
            new THREE.Vector3(to.position.x, to.position.y, to.position.z),
          ),
        );
      });

      if (edgePoints.length) {
        const edgeGeometry = new THREE.BufferGeometry().setFromPoints(edgePoints);
        const edgeMaterial = new THREE.LineBasicMaterial({
          color: 0x0f766e,
          transparent: true,
          opacity: 0.9,
          depthTest: false,
        });
        const edgeLines = new THREE.LineSegments(edgeGeometry, edgeMaterial);
        edgeLines.renderOrder = 99;
        group.add(edgeLines);
      }
    }

    scene.add(group);
    waypointMarkerGroupRef.current = group;
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

    isRouteFollowingRef.current = false;
    routeFollowOffsetRef.current = null;
    const { target, cameraPosition } = getFrontOverviewView(
      bounds,
      nodePositionsRef.current,
      cameraRef.current?.aspect ?? 1,
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

    if (!routeGroup.userData.isComplete) {
      onNavigationStatusRef.current?.({
        status: "stopped",
        officeName: routeGroup.userData.destinationOffice?.name || "",
        reason: "",
      });
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
    onRouteFloorChangeRef.current?.(
      getFloorLabel(floorNumber, floorsRef.current),
    );
  }

  function createRouteGroup(points, routeFloors, office) {
    const scene = sceneRef.current;

    if (!scene || points.length < 2) {
      return null;
    }

    disposeRouteGroup();

    const group = new THREE.Group();
    group.name = "generated_3d_route";

    const routePoints = points.map(
      (point) => point.clone().add(new THREE.Vector3(0, ROUTE_FLOOR_LIFT, 0)),
    );
    const routePointDistances = getRoutePointDistances(routePoints);
    const totalDistance = getRouteDistance(routePoints);
    const animationDuration =
      (totalDistance / ROUTE_SPEED_UNITS_PER_SECOND) * 1000;
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
      const pathSegment = createRouteSegment(
        start,
        end,
        0.019,
        pathMaterial,
        31,
        true,
      );

      if (pathSegment) {
        pathSegment.visible = false;
        pathSegment.scale.y = 0.001;
        pathSegment.userData = {
          ...pathSegment.userData,
          isAnimatedRouteSegment: true,
          routeStartDistance: traveledDistance,
          routeEndDistance: traveledDistance + segmentDistance,
          segmentLength: segmentDistance,
          routeStartFloor: routeFloors[index] ?? START_FLOOR_NUMBER,
          routeEndFloor: routeFloors[index + 1] ?? routeFloors[index] ?? START_FLOOR_NUMBER,
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
        routeFloorNumber: routeFloors[index] ?? 1,
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
      routeFloors,
      destinationOffice: office,
      routePointDistances,
      totalDistance,
      startedAt: window.performance.now(),
      animationDuration,
      isComplete: false,
    };

    scene.add(group);
    routeGroupRef.current = group;
    return { group, routePoints };
  }

  function updateRouteAnimation(now) {
    const routeGroup = routeGroupRef.current;
    const routePoints = routeGroup?.userData.routePoints;
    const routeFloors = routeGroup?.userData.routeFloors;
    const routePointDistances = routeGroup?.userData.routePointDistances;
    const totalDistance = routeGroup?.userData.totalDistance ?? 0;
    const animationDuration = routeGroup?.userData.animationDuration ?? 0;
    const startedAt = routeGroup?.userData.startedAt ?? now;

    if (
      !routeGroup ||
      !routePoints ||
      !routeFloors ||
      totalDistance <= 0 ||
      animationDuration <= 0
    ) {
      return;
    }

    const progress = THREE.MathUtils.clamp(
      (now - startedAt) / animationDuration,
      0,
      1,
    );
    const visibleDistance = totalDistance * progress;
    const routeHeadPosition = getRoutePointAtDistance(
      routePoints,
      visibleDistance,
    );
    let activeSegmentIndex = 0;
    while (
      activeSegmentIndex < routePoints.length - 2 &&
      visibleDistance >= (routePointDistances?.[activeSegmentIndex + 1] ?? 0)
    ) {
      activeSegmentIndex += 1;
    }

    const activeSegmentStart =
      routePointDistances?.[activeSegmentIndex] ?? 0;
    const activeSegmentEnd =
      routePointDistances?.[activeSegmentIndex + 1] ?? activeSegmentStart;
    const activeSegmentProgress = THREE.MathUtils.clamp(
      (visibleDistance - activeSegmentStart) /
        Math.max(activeSegmentEnd - activeSegmentStart, 0.001),
      0,
      1,
    );
    const segmentStartFloor =
      routeFloors[activeSegmentIndex] ?? START_FLOOR_NUMBER;
    const segmentEndFloor =
      routeFloors[activeSegmentIndex + 1] ?? segmentStartFloor;
    const routeFloor =
      segmentStartFloor !== segmentEndFloor && activeSegmentProgress < 1
        ? segmentStartFloor
        : segmentEndFloor;
    if (routeFloor !== currentRouteFloorRef.current) {
      currentRouteFloorRef.current = routeFloor;
      setVisibleFloor(routeFloor);
      notifyRouteFloorChange(routeFloor);
      const bounds = modelBoundsRef.current;
      if (bounds) {
        routeFollowOffsetRef.current = getRouteFollowOffset(
          routeFloor,
          bounds,
          floorMetadataRef.current,
        );
      }
    }

    if (
      isRouteFollowingRef.current &&
      !focusAnimationRef.current &&
      routeHeadPosition
    ) {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      const followOffset = routeFollowOffsetRef.current;

      if (camera && controls && followOffset) {
        controls.target.lerp(routeHeadPosition, 0.12);
        camera.position.lerp(
          controls.target.clone().add(followOffset),
          0.12,
        );
      }
    }

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

        const visibleFloor = visibleFloorRef.current;
        const routeStartFloor =
          child.userData.routeStartFloor ?? START_FLOOR_NUMBER;
        const routeEndFloor =
          child.userData.routeEndFloor ?? routeStartFloor;
        const isFloorTransition = routeStartFloor !== routeEndFloor;
        const floorIsVisible =
          visibleFloor === null ||
          (isFloorTransition
            ? visibleFloor === routeStartFloor ||
              visibleFloor === routeEndFloor
            : routeEndFloor <= visibleFloor);
        child.visible = segmentProgress > 0 && floorIsVisible;
        child.scale.y = Math.max(segmentLength * segmentProgress, 0.001);
        return;
      }

      if (child.userData.isRouteMarker) {
        const visibleFloor = visibleFloorRef.current;
        child.visible =
          visibleDistance >= (child.userData.revealDistance ?? 0) &&
          (visibleFloor === null ||
            (child.userData.routeFloorNumber ?? START_FLOOR_NUMBER) <= visibleFloor);
        return;
      }

      if (child.userData.isRouteHead && routeHeadPosition) {
        child.visible = true;
        child.position.copy(routeHeadPosition);
        child.position.y += Math.sin(now * 0.012) * 0.012;
      }
    });

    if (progress >= 1 && !routeGroup.userData.isComplete) {
      routeGroup.userData.isComplete = true;
      onNavigationStatusRef.current?.({
        status: "complete",
        officeName: routeGroup.userData.destinationOffice?.name || "",
        reason: "",
      });
      routeGroup.children.forEach((child) => {
        if (child.userData.isAnimatedRouteSegment) {
          child.visible = true;
          child.scale.y = child.userData.segmentLength;
        } else if (child.userData.isRouteMarker) {
          child.visible = true;
        }
      });
      const destination = routePoints[routePoints.length - 1];
      const bounds = modelBoundsRef.current;
      if (destination && bounds) {
        isRouteFollowingRef.current = false;
        setFocusMarker(destination);
        animateView(
          destination,
          destination.clone().add(
            routeFollowOffsetRef.current ?? getRouteFollowOffset(
              routeFloor,
              bounds,
              floorMetadataRef.current,
            ),
          ),
        );
      }
    }
  }

  function getGraphRouteForOffice(office) {
    const modelRoot = modelRootRef.current;
    const destinationNode = pathNodesRef.current.find(
      (node) =>
        node.officeId === office?.id || node.id === office?.routeNode,
    );

    if (!office || !modelRoot || !destinationNode) {
      return {
        points: [],
        floors: [],
        error: !destinationNode ? "missing-destination" : "missing-start",
      };
    }

    const result = findWaypointRoute({
      nodes: pathNodesRef.current,
      edges: pathEdgesRef.current,
      floors: floorsRef.current,
      startNodeId: startNodeIdRef.current,
      destinationNodeId: destinationNode.id,
      accessibleMode: accessibilityModeRef.current,
    });

    if (result.error || result.nodes.length < 2) {
      return { points: [], floors: [], error: result.error || "no-route" };
    }

    return {
      points: result.nodes.map((node) =>
        modelRoot.localToWorld(
          new THREE.Vector3(node.position.x, node.position.y, node.position.z),
        ),
      ),
      floors: result.nodes.map((node) =>
        getFloorNumber(node.floor, floorsRef.current, node.floorId),
      ),
      error: null,
    };
  }

  function enterRouteForOffice(office, instant = false) {
    clearRouteSequenceTimers();
    disposeRouteGroup();
    renderSceneRef.current?.();
    isRouteFollowingRef.current = false;
    routeFollowOffsetRef.current = null;

    const route = getGraphRouteForOffice(office);
    if (route.error) {
      const routeStatus = `unavailable-${route.error}`;
      if (mountRef.current) {
        mountRef.current.dataset.routeStatus = routeStatus;
      }
      onNavigationStatusRef.current?.({
        status: "unavailable",
        officeName: office?.name || "",
        reason: route.error,
      });
      if (import.meta.env.DEV) {
        console.warn(`No configured waypoint route for ${office?.name || "office"}: ${route.error}`);
      }
      return [];
    }

    const startFloor = route.floors[0] ?? START_FLOOR_NUMBER;
    setVisibleFloor(startFloor);
    currentRouteFloorRef.current = startFloor;
    notifyRouteFloorChange(startFloor);
    createRouteGroup(route.points, route.floors, office);
    scheduleViewerFrameRef.current?.();
    const bounds = modelBoundsRef.current;
    if (bounds && route.points[0]) {
      const start = route.points[0];
      routeFollowOffsetRef.current = getRouteFollowOffset(
        startFloor,
        bounds,
        floorMetadataRef.current,
      );
      isRouteFollowingRef.current = true;
      setFocusMarker(start);
      animateView(start, start.clone().add(routeFollowOffsetRef.current), instant);
    }

    if (mountRef.current) {
      mountRef.current.dataset.routeStatus = "ready-waypoint-graph";
      mountRef.current.dataset.routeNodeCount = String(route.points.length);
    }
    onNavigationStatusRef.current?.({
      status: "working",
      officeName: office?.name || "",
      reason: "",
    });
    return route.points;
  }

  function focusFloor(floor, instant = false) {
    const bounds = modelBoundsRef.current;
    const floorNumber = getFloorNumber(floor, floorsRef.current);
    const floorMetadata = floorMetadataRef.current;

    isRouteFollowingRef.current = false;
    routeFollowOffsetRef.current = null;
    setVisibleFloor(floorNumber);
    notifyRouteFloorChange(floorNumber);

    if (!bounds) {
      return;
    }

    const routeGroup = routeGroupRef.current;
    if (routeGroup?.userData.routeFloors?.includes(floorNumber)) {
      const { target, cameraPosition } = getFloorOverviewView(
        floorNumber,
        bounds,
        floorMetadata,
      );
      animateView(target, cameraPosition, instant);
      return;
    }

    disposeRouteGroup();
    currentRouteFloorRef.current = floorNumber;
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

  function zoomModel(direction, instant = false) {
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

    animateView(target, nextPosition, instant);
  }

  function applyViewCommand(command, instant = false) {
    if (!command || command.type === "reset-view") {
      clearRouteSequenceTimers();
      resetModelView(instant);
      return;
    }

    if (command.type === "focus-office" || command.type === "enter-route") {
      enterRouteForOffice(selectedOfficeRef.current, instant);
      return;
    }

    if (command.type === "focus-floor") {
      clearRouteSequenceTimers();
      focusFloor(
        command.payload?.floor ?? selectedOfficeRef.current?.floor,
        instant,
      );
      return;
    }

    if (command.type === "zoom-in") {
      zoomModel("in", instant);
      return;
    }

    if (command.type === "zoom-out") {
      zoomModel("out", instant);
    }
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
    pathNodesRef.current = pathNodes;
    pathEdgesRef.current = pathEdges;
    startNodeIdRef.current = startNodeId;
    if (modelRootRef.current) {
      applyConfiguredFloorGroups();
      const bounds = new THREE.Box3().setFromObject(modelRootRef.current);
      floorMetadataRef.current = getFloorMetadata(
        modelRootRef.current,
        bounds,
        floorNumbers,
      );
      setVisibleFloor(visibleFloorRef.current);
      updateWaypointMarkers();
    }
  }, [pathSourceKey, startNodeId, selectedWaypointId, waypointEditMode, showNavigationDebug]);

  useEffect(() => {
    waypointEditModeRef.current = waypointEditMode;
    isDrawingRouteRef.current = isDrawingRoute;
    selectedWaypointIdRef.current = selectedWaypointId;
    isPlacingWaypointRef.current = isPlacingWaypoint;
    onWaypointPlaceRef.current = onWaypointPlace;
    onRoutePointPlaceRef.current = onRoutePointPlace;
    onWaypointPositionChangeRef.current = onWaypointPositionChange;
    onNavigationStatusRef.current = onNavigationStatus;
  }, [
    waypointEditMode,
    isDrawingRoute,
    selectedWaypointId,
    isPlacingWaypoint,
    onWaypointPlace,
    onRoutePointPlace,
    onWaypointPositionChange,
    onNavigationStatus,
  ]);

  useEffect(() => {
    if (!viewCommand) {
      return;
    }
    applyViewCommand(viewCommand);
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
    let draggingWaypoint = null;
    const clickableOfficeMeshes = [];
    const pointer = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();

    const scene = new THREE.Scene();
    const skyBlue = 0xbfe8ff;
    scene.background = new THREE.Color(skyBlue);
    scene.fog = new THREE.Fog(skyBlue, 18, 58);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    camera.position.set(7, 5, 7);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: !optimizeForKiosk,
      preserveDrawingBuffer: !optimizeForKiosk,
      powerPreference: "high-performance",
    });
    renderer.setClearColor(skyBlue, 1);
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, optimizeForKiosk ? 1 : 1.5),
    );
    renderer.shadowMap.enabled = !optimizeForKiosk;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mountElement.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enableRotate = !lockCameraRotationRef.current;
    controls.enablePan = !lockCameraRotationRef.current;
    controls.enableZoom = true;
    controls.minDistance = 0.75;
    controls.maxDistance = 55;
    controls.panSpeed = 0.75;
    controls.rotateSpeed = 0.7;
    controls.target.set(0, 0, 0);
    if (lockCameraRotationRef.current) {
      lockCameraAzimuth(camera, controls);
    }
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

    const clouds = new THREE.Group();
    clouds.position.y = 1.8;
    scene.add(clouds);

    const cloudMaterial = new THREE.MeshStandardMaterial({
      color: 0xf7fcff,
      transparent: true,
      opacity: 0.82,
      emissive: 0xeaf7ff,
      emissiveIntensity: 0.08,
      roughness: 1,
      metalness: 0,
      depthWrite: false,
    });

    for (let i = 0; i < 6; i += 1) {
      const cloud = new THREE.Group();
      const isLarge = i % 3 === 0;
      const puffSpecs = isLarge
        ? [
            [0, 0, 0, 0.8],
            [0.7, 0.12, 0.2, 0.68],
            [-0.7, 0.15, -0.18, 0.64],
            [1.14, 0.04, 0.1, 0.4],
            [-1.18, -0.08, 0.18, 0.42],
            [0.1, 0.4, 0.08, 0.44],
          ]
        : [
            [0, 0, 0, 0.52],
            [0.46, 0.09, 0.12, 0.42],
            [-0.54, 0.07, -0.1, 0.4],
            [0.94, 0.04, 0.12, 0.3],
            [-0.94, -0.06, 0.18, 0.32],
          ];

      puffSpecs.forEach(([x, y, z, radius]) => {
        const puff = new THREE.Mesh(
          new THREE.SphereGeometry(radius, 16, 12),
          cloudMaterial,
        );
        puff.position.set(x, y, z);
        cloud.add(puff);
      });

      cloud.position.set(-11 + i * 4.8, 1.7 + (i % 3) * 0.35, -12 - (i % 3) * 3.2);
      cloud.rotation.y = (i % 2 === 0 ? 1 : -1) * 0.45;
      cloud.userData = {
        drift: 0.003 + i * 0.0005,
        phase: i * 1.3,
      };
      clouds.add(cloud);
    }

    function resizeRenderer() {
      const width = mountElement.clientWidth || 1;
      const height = mountElement.clientHeight || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      scheduleViewerFrameRef.current?.();
    }

    function renderScene() {
      if (mountElement.isConnected) {
        renderer.render(scene, camera);
      }
    }

    function scheduleAnimationFrame() {
      if (!frameId && !document.hidden && mountElement.isConnected) {
        frameId = window.requestAnimationFrame(animate);
      }
    }

    renderSceneRef.current = renderScene;
    scheduleViewerFrameRef.current = scheduleAnimationFrame;
    controls.addEventListener("change", scheduleAnimationFrame);
    controls.addEventListener("start", scheduleAnimationFrame);

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
        ? getClickableOfficeId(matchingIntersection.object, modelOfficeObjectIds)
        : null;
    }

    function setPointerFromEvent(event) {
      const rect = renderer.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;

      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      return true;
    }

    function getModelPositionAtPointer(event) {
      const modelRoot = modelRootRef.current;
      if (!modelRoot || !setPointerFromEvent(event)) return null;

      const intersection = raycaster
        .intersectObject(modelRoot, true)
        .find(
          ({ object }) =>
            object.isMesh &&
            isObjectVisibleInScene(object) &&
            (!(waypointEditModeRef.current || isDrawingRouteRef.current) ||
              !isolatedFloorViewRef.current ||
              getModelFloorNumber(object) ===
                getFloorNumber(editFloorRef.current, floorsRef.current)) &&
            !isNavmeshObject(object) &&
            !shouldHideRouteHelper(object),
        );
      if (!intersection) return null;

      return modelRoot.worldToLocal(intersection.point.clone());
    }

    function handlePointerDown(event) {
      pointerStart = { x: event.clientX, y: event.clientY };

      if (!waypointEditModeRef.current || !setPointerFromEvent(event)) return;
      if (isPlacingWaypointRef.current) return;

      const markers = [...waypointMarkersRef.current.values()];
      const markerHit = raycaster.intersectObjects(markers, false)[0];
      if (markerHit) {
        const marker = markerHit.object;
        draggingWaypoint = {
          id: marker.userData.waypointId,
          marker,
          plane: new THREE.Plane(
            new THREE.Vector3(0, 1, 0),
            -marker.position.y,
          ),
        };
        controls.enabled = false;
        renderer.domElement.style.cursor = "grabbing";
      }
    }

    function handlePointerMove(event) {
      if (draggingWaypoint && setPointerFromEvent(event)) {
        const intersection = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(draggingWaypoint.plane, intersection)) {
          draggingWaypoint.marker.position.copy(intersection);
        }
        return;
      }

      if (waypointEditModeRef.current) {
        renderer.domElement.style.cursor = isPlacingWaypointRef.current
          ? "crosshair"
          : "grab";
        return;
      }

      const officeId = getOfficeIdAtPointer(event);
      renderer.domElement.style.cursor = officeId ? "pointer" : "grab";
    }

    function handlePointerUp(event) {
      if (draggingWaypoint) {
        const draggedWaypoint = draggingWaypoint;
        draggingWaypoint = null;
        controls.enabled = true;
        pointerStart = null;
        const modelRoot = modelRootRef.current;
        if (modelRoot) {
          const position = modelRoot.worldToLocal(
            draggedWaypoint.marker.position.clone(),
          );
          onWaypointPositionChangeRef.current?.(draggedWaypoint.id, {
            x: position.x,
            y: position.y,
            z: position.z,
          });
        }
        renderer.domElement.style.cursor = "grab";
        return;
      }

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

      if (waypointEditModeRef.current && isPlacingWaypointRef.current) {
        const position = getModelPositionAtPointer(event);
        if (position) {
          event.preventDefault();
          onWaypointPlaceRef.current?.({
            x: position.x,
            y: position.y,
            z: position.z,
          });
        }
        return;
      }

      if (isDrawingRouteRef.current) {
        const position = getModelPositionAtPointer(event);
        if (position) {
          event.preventDefault();
          onRoutePointPlaceRef.current?.({
            x: position.x,
            y: position.y,
            z: position.z,
          });
        }
        return;
      }

      if (waypointEditModeRef.current) return;

      const officeId = getOfficeIdAtPointer(event);
      const office = officesById.get(officeId);

      if (!office) {
        return;
      }

      event.preventDefault();
      onSelectOfficeRef.current?.(office.id, { focusDestinationFloor: true });
      enterRouteForOffice(office);

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

    const loadModel = async (sourcePath) => {
      const gltf = await loadModelAsset(sourcePath);
      return { sourcePath, scene: cloneModelScene(gltf.scene) };
    };

    Promise.allSettled(activeModelPaths.map(loadModel)).then(
      (results) => {
        if (isDisposed) {
          return;
        }

        const loadedScenes = [];
        const failedPaths = [];

        results.forEach((result, index) => {
          if (result.status === "fulfilled") {
            loadedScenes.push(result.value);
          } else {
            failedPaths.push(activeModelPaths[index]);
            console.error(
              `Failed to load 3D model: ${activeModelPaths[index]}`,
              result.reason,
            );
          }
        });

        if (loadedScenes.length === 0) {
          setStatus("error");
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
        applyConfiguredFloorGroups();
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

          const officeId = getModelOfficeId(child, modelOfficeObjectIds);
          const office = officesById.get(officeId);
          if (child.isMesh && office) {
            child.userData = {
              ...child.userData,
              officeId,
              isClickableOfficeMarker: true,
              floorNumber: getFloorNumber(
                office.floor,
                floorsRef.current,
                office.floorId,
              ),
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
          floorNumbers,
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
          const office = officesById.get(child.userData?.officeId);
          const floorNumber =
            child.userData?.floorNumber ??
            getModelFloorNumber(child) ??
            (office
              ? getFloorNumber(office.floor, floorsRef.current, office.floorId)
              : null);
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
              getFloorNumber(office.floor, floorsRef.current, office.floorId),
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
        setStatus("ready");
        applyViewCommand(viewCommandRef.current, true);
        updateWaypointMarkers();
        scheduleAnimationFrame();
      },
      (error) => {
        if (isDisposed) {
          return;
        }

        console.error("Failed to process 3D models", error);
        setStatus("error");
      }
    );

    function animate(now = window.performance.now()) {
      frameId = 0;
      if (document.hidden || !mountElement.isConnected) {
        return;
      }

      updateRouteAnimation(now);
      const controlsAreMoving = controls.update();
      renderScene();

      const routeGroup = routeGroupRef.current;
      const routeIsAnimating = routeGroup && !routeGroup.userData.isComplete;
      if (
        !optimizeForKiosk ||
        controlsAreMoving ||
        routeIsAnimating ||
        focusAnimationRef.current
      ) {
        scheduleAnimationFrame();
      }
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (frameId) {
          window.cancelAnimationFrame(frameId);
          frameId = 0;
        }
        return;
      }

      scheduleAnimationFrame();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    animate();

    return () => {
      isDisposed = true;
      window.cancelAnimationFrame(frameId);
      if (focusAnimationRef.current) {
        window.cancelAnimationFrame(focusAnimationRef.current);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      resizeObserver.disconnect();
      controls.removeEventListener("change", scheduleAnimationFrame);
      controls.removeEventListener("start", scheduleAnimationFrame);
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
      renderSceneRef.current = null;
      scheduleViewerFrameRef.current = null;
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
        <div className="viewer-status">{t("loadingModel")}</div>
      ) : null}
      {status === "error" ? (
        <div className="viewer-status error">{t("unableLoadModel")}</div>
      ) : null}
    </div>
  );
}
