import { offices } from "./offices.js";

export const defaultOffices = offices;
export const DEFAULT_CITY_NAME = "Olongapo City";
export const DEFAULT_NAVIGATOR_TITLE = "City Hall Navigator";
export const DEFAULT_LANDING_KICKER = "Municipal wayfinding";
export const DEFAULT_LANDING_TAGLINE =
  "Olongapo City Hall office finder and 3D route guide";

export const defaultModelPaths = [
  "/TEST.glb",
];

export const defaultFloors = [
  {
    id: "floor-1",
    label: "1st Floor",
    number: 1,
    order: 1,
    modelPath: defaultModelPaths[0],
    enabled: true,
    description: "",
    modelGroupName: "",
  },
  {
    id: "floor-2",
    label: "2nd Floor",
    number: 2,
    order: 2,
    modelPath: defaultModelPaths[0],
    enabled: true,
    description: "",
    modelGroupName: "",
  },
  {
    id: "floor-3",
    label: "3rd Floor",
    number: 3,
    order: 3,
    modelPath: defaultModelPaths[0],
    enabled: true,
    description: "",
    modelGroupName: "",
  },
];

export const DEFAULT_NAVIGATION_START_NODE_ID = "entrance-kiosk";

export const defaultPathNodes = [
  {
    id: DEFAULT_NAVIGATION_START_NODE_ID,
    name: "Entrance Kiosk",
    type: "kiosk",
    floor: "1st Floor",
    position: null,
  },
];

export const defaultPathEdges = [];

export function createDefaultNavigatorConfig() {
  return {
    version: 1,
    cityName: DEFAULT_CITY_NAME,
    organizationType: "City Government",
    organizationName: DEFAULT_CITY_NAME,
    address: "",
    city: DEFAULT_CITY_NAME,
    province: "",
    country: "Philippines",
    phone: "",
    email: "",
    website: "",
    logoFileId: "",
    navigatorTitle: DEFAULT_NAVIGATOR_TITLE,
    landingKicker: DEFAULT_LANDING_KICKER,
    landingTagline: DEFAULT_LANDING_TAGLINE,
    modelPaths: defaultModelPaths,
    modelFiles: [],
    buildingModelFileId: "",
    modelGroupNames: [],
    floors: defaultFloors,
    offices,
    pathNodes: defaultPathNodes,
    pathEdges: defaultPathEdges,
    startNodeId: DEFAULT_NAVIGATION_START_NODE_ID,
    updatedAt: new Date().toISOString(),
  };
}
