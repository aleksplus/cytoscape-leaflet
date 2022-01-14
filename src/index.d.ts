import * as cy from 'cytoscape';
import L from 'leaflet';
import { MapHandlerOptions } from './types';

declare const cytoscapeLeaflet: cy.Ext;
export = cytoscapeLeaflet;
export as namespace cytoscapeLeaflet;

declare namespace cytoscapeLeaflet {
  interface CyMap {
    map: null | L.Map;
    cy: null | cytoscape.Core;
    originalZoom: number;
    originalPan: cy.Position;

    fit(nodes: cy.ElementDefinition[], options: L.FitBoundsOptions): void;

    updateGeographicPositions(nodes: cy.NodeSingular): void;

    destroy(): void;

    enableGeographicPositions(): void;

    disableGeographicPositions(): void;

    updateGeographicPositions(): void;
  }
}

declare global {
  namespace cytoscape {
    type Rendered = {
      data: { canvasContainer: Node };
      hoverData: {
        down: null | boolean;
        last: null | boolean;
        dragging: null | boolean;
        dragged: null | boolean;
        draggingEles: null | any[];
        which: null | number;
        capture: null | boolean;
        downTime: null;
        triggerMode: null;
        initialPan: [null, null];
      };
    };

    interface Core {
      L(
        mapConfig: L.MapOptions,
        config: MapHandlerOptions
      ): cytoscapeLeaflet.CyMap;

      renderer(): Rendered;
    }
  }
}
