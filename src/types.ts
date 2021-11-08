declare module 'cytoscape-leaflet' {
  namespace cytoscapeLeaflet {
    export interface CyMap {
      map: null | L.Map;
      cy: null | cytoscape.Core;

      fit(nodes: cytoscape.NodeSingular[], options: L.FitBoundsOptions): void;

      updateGeographicPositions(nodes: cytoscape.NodeSingular): void;

      destroy(): void;

      enableGeographicPositions(): void;

      disableGeographicPositions(): void;

      updateGeographicPositions(): void;
    }
  }
}

declare global {
  namespace cytoscape {


    interface MapHandlerOptions {
      getPosition: (node: cytoscape.NodeSingular) => L.LatLng | null;
      setPosition?: (node: cytoscape.NodeSingular, lngLat: L.LatLng) => void;
      animate?: boolean;
      animationDuration?: number;
    }

    interface Core extends cytoscape.Core {
      L: (mapConfig: Leaflet.MapOptions, config: MapHandlerOptions) => CyMap;
    }
  }
}
