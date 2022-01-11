import L from 'leaflet';
import { MapHandler } from './mapHandler';
import { Instance, MapHandlerOptions } from './types';

function register(cytoscape: Instance) {
  if (!cytoscape) {
    return;
  }

  cytoscape(
    'core',
    'L',
    function (mapConfig: L.MapOptions, config: MapHandlerOptions) {
      return new MapHandler(
        // @ts-ignore
        this,
        mapConfig,
        config
      );
    }
  );
}

if (typeof window.cytoscape !== 'undefined') {
  register(window.cytoscape);
}

export default register;
