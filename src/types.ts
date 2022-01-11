import L from 'leaflet';
import * as cytoscape from 'cytoscape';

export interface MapHandlerOptions {
  getPosition: (node: cytoscape.NodeSingular) => L.LatLng | null;
  setPosition?: (node: cytoscape.NodeSingular, lngLat: L.LatLng) => void;
  animate?: boolean;
  animationDuration?: number;
}

type RegisterFn = (mapConfig: L.MapOptions, config: MapHandlerOptions) => any;

export type Instance = (
  core: string,
  module: string,
  fn: RegisterFn
) => cytoscape.Core;
