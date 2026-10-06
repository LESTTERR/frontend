const STAIR_NODE_TYPES = new Set(["stairs", "stair"]);

function getFloorNumber(floor, floors, floorId) {
  const configuredFloor = floors.find((entry) => entry.id === floorId);
  if (configuredFloor) {
    return Number(configuredFloor.order ?? configuredFloor.number);
  }

  if (typeof floor === "number" && Number.isFinite(floor) && floor > 0) {
    return floor;
  }

  const byId = floors.find((entry) => entry.id === floor);
  if (byId) return Number(byId.order ?? byId.number);
  const byLabel = floors.find((entry) => entry.label === floor);
  if (byLabel) return Number(byLabel.order ?? byLabel.number);

  const match = String(floor ?? "").match(/\d+/);
  const floorNumber = match ? Number(match[0]) : null;
  return Number.isFinite(floorNumber) && floorNumber > 0 ? floorNumber : null;
}

function hasPosition(position) {
  return (
    position &&
    Number.isFinite(position.x) &&
    Number.isFinite(position.y) &&
    Number.isFinite(position.z)
  );
}

function getValidEdges(nodesById, edges, floors) {
  return edges.flatMap((edge) => {
    const from = nodesById.get(edge.from);
    const to = nodesById.get(edge.to);

    if (!from || !to || !hasPosition(from.position) || !hasPosition(to.position)) {
      return [];
    }

    const fromFloor = getFloorNumber(from.floor, floors, from.floorId);
    const toFloor = getFloorNumber(to.floor, floors, to.floorId);

    if (fromFloor === null || toFloor === null) {
      return [];
    }

    const isFloorTransition =
      fromFloor !== null && toFloor !== null && fromFloor !== toFloor;
    if (isFloorTransition) {
      const stairTransition =
        Math.abs(fromFloor - toFloor) === 1 &&
        STAIR_NODE_TYPES.has(from.type) &&
        STAIR_NODE_TYPES.has(to.type) &&
        edge.type === "stairs";
      const elevatorTransition =
        from.type === "elevator" &&
        to.type === "elevator" &&
        edge.type === "elevator";
      if (!stairTransition && !elevatorTransition) return [];
    } else if (edge.type && edge.type !== "walk") {
      return [];
    }

    return [{ from, to, bidirectional: edge.bidirectional !== false }];
  });
}

export function validateNavigationGraph({
  nodes = [],
  edges = [],
  floors = [],
  startNodeId,
}) {
  const issues = [];
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const nodeIds = new Set();
  const startNode = nodesById.get(startNodeId);

  if (!startNode) {
    issues.push({ code: "missing-start", nodeId: startNodeId });
  } else if (startNode.type !== "kiosk") {
    issues.push({ code: "start-not-kiosk", nodeId: startNodeId });
  }

  nodes.forEach((node) => {
    if (nodeIds.has(node.id)) {
      issues.push({ code: "duplicate-node-id", nodeId: node.id });
    }
    nodeIds.add(node.id);

    if (!hasPosition(node.position)) {
      issues.push({ code: "missing-position", nodeId: node.id });
    }

    if (getFloorNumber(node.floor, floors, node.floorId) === null) {
      issues.push({ code: "invalid-floor", nodeId: node.id });
    }

    if (
      node.type === "office" &&
      !node.officeId
    ) {
      issues.push({ code: "unlinked-office-node", nodeId: node.id });
    }
  });

  edges.forEach((edge) => {
    const from = nodesById.get(edge.from);
    const to = nodesById.get(edge.to);

    if (!from || !to) {
      issues.push({ code: "missing-edge-node", edgeId: edge.id });
      return;
    }

    if (!hasPosition(from.position) || !hasPosition(to.position)) {
      issues.push({ code: "edge-node-unplaced", edgeId: edge.id });
      return;
    }

    const fromFloor = getFloorNumber(from.floor, floors, from.floorId);
    const toFloor = getFloorNumber(to.floor, floors, to.floorId);

    const isFloorTransition =
      fromFloor !== null && toFloor !== null && fromFloor !== toFloor;
    const stairTransition =
      isFloorTransition &&
      Math.abs(fromFloor - toFloor) === 1 &&
      STAIR_NODE_TYPES.has(from.type) &&
      STAIR_NODE_TYPES.has(to.type) &&
      edge.type === "stairs";
    const elevatorTransition =
      isFloorTransition &&
      from.type === "elevator" &&
      to.type === "elevator" &&
      edge.type === "elevator";
    if (
      (isFloorTransition && !stairTransition && !elevatorTransition) ||
      (!isFloorTransition && edge.type && edge.type !== "walk")
    ) {
      issues.push({ code: "invalid-floor-transition", edgeId: edge.id });
    }
  });

  return issues;
}

export function findWaypointRoute({
  nodes = [],
  edges = [],
  floors = [],
  startNodeId,
  destinationNodeId,
}) {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const start = nodesById.get(startNodeId);
  const destination = nodesById.get(destinationNodeId);

  if (!start || !hasPosition(start.position)) {
    return { nodes: [], distance: 0, error: "missing-start" };
  }

  if (!destination || !hasPosition(destination.position)) {
    return { nodes: [], distance: 0, error: "missing-destination" };
  }

  if (start.id === destination.id) {
    return { nodes: [start], distance: 0, error: null };
  }

  const adjacency = new Map(nodes.map((node) => [node.id, []]));
  getValidEdges(nodesById, edges, floors).forEach(({ from, to, bidirectional }) => {
    const distance = Math.hypot(
      from.position.x - to.position.x,
      from.position.y - to.position.y,
      from.position.z - to.position.z,
    );

    adjacency.get(from.id).push({ nodeId: to.id, distance });
    if (bidirectional) {
      adjacency.get(to.id).push({ nodeId: from.id, distance });
    }
  });

  const open = new Set([start.id]);
  const costs = new Map([[start.id, 0]]);
  const estimatedCosts = new Map([
    [
      start.id,
      Math.hypot(
        start.position.x - destination.position.x,
        start.position.y - destination.position.y,
        start.position.z - destination.position.z,
      ),
    ],
  ]);
  const previous = new Map();

  while (open.size > 0) {
    let currentId = null;
    let currentEstimate = Infinity;

    open.forEach((nodeId) => {
      const estimate = estimatedCosts.get(nodeId) ?? Infinity;
      if (estimate < currentEstimate) {
        currentId = nodeId;
        currentEstimate = estimate;
      }
    });

    if (currentId === destination.id) {
      const route = [];
      let routeId = destination.id;

      while (routeId) {
        route.push(nodesById.get(routeId));
        if (routeId === start.id) break;
        routeId = previous.get(routeId);
      }

      route.reverse();
      return {
        nodes: route,
        distance: costs.get(destination.id) ?? 0,
        error: null,
      };
    }

    open.delete(currentId);
    (adjacency.get(currentId) ?? []).forEach(({ nodeId, distance }) => {
      const nextCost = (costs.get(currentId) ?? Infinity) + distance;
      if (nextCost >= (costs.get(nodeId) ?? Infinity)) return;

      const next = nodesById.get(nodeId);
      previous.set(nodeId, currentId);
      costs.set(nodeId, nextCost);
      estimatedCosts.set(
        nodeId,
        nextCost +
          Math.hypot(
            next.position.x - destination.position.x,
            next.position.y - destination.position.y,
            next.position.z - destination.position.z,
          ),
      );
      open.add(nodeId);
    });
  }

  return { nodes: [], distance: 0, error: "no-route" };
}
