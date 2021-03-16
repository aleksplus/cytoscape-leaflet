import {LatLng} from "leaflet";

export interface MapHandlerOptions {
  getPosition: (node: cytoscape.NodeSingular) => LatLng;
  setPosition?: (node: cytoscape.NodeSingular, lngLat: LatLng) => void;
  animate?: boolean;
  animationDuration?: number;
}
