import { MapHandler } from './map-handler';

function register(cytoscape) {
  if (!cytoscape) {
    return;
  }

  cytoscape('core', 'L', function (mapConfig, config) {
    return new MapHandler((this), mapConfig, config);
  });
}

if (typeof window.cytoscape !== 'undefined') {
  register(window.cytoscape);
}

export default register;
