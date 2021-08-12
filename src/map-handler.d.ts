import { LatLng } from 'leaflet';
import * as cytoscape from 'cytoscape'

export interface MapHandlerOptions {
  getPosition: (node: cytoscape.NodeSingular) => LatLng;
  setPosition?: (node: cytoscape.NodeSingular, lngLat: LatLng) => void;
  animate?: boolean;
  animationDuration?: number;
}
