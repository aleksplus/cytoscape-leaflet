import * as cytoscape from 'cytoscape';
import { MapHandler, MapHandlerOptions } from './map-handler';

function register(cytoscape) {
  if (!cytoscape) {
    return;
  }

  cytoscape(
    'core',
    'L',
    function (
      mapConfig: MapHandlerOptions,
      config: cytoscape.CytoscapeOptions
    ) {
      return new MapHandler(this, mapConfig, config);
    }
  );
}

if (typeof window.cytoscape !== 'undefined') {
  register(window.cytoscape);
}

export default register;
