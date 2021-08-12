import L from 'leaflet'

/** @typedef {import('cytoscape')} cytoscape */

/** @typedef {import('./map-handler').MapHandlerOptions} MapHandlerOptions */

/**
 * @param {MouseEvent} event
 * @see https://github.com/cytoscape/cytoscape.js/blob/master/src/extensions/renderer/base/load-listeners.js
 */
function isMultSelKeyDown(event) {
  return event.shiftKey || event.metaKey || event.ctrlKey; // maybe event.altKey
}

const DEFAULT_FIT_PADDING = [50, 50];
const DEFAULT_ANIMATION_DURATION = 500;
const HIDDEN_CLASS = 'cytoscape-map__hidden';

export class MapHandler {
  /** @type cytoscape.Core */
  cy;
  /** @type L.MapOptions */
  mapOptions;
  /** @type MapHandlerOptions */
  options;

  /** @type HTMLElement */
  mapContainer;
  /** @type L.Map */
  map;

  /** @type boolean | undefined */
  originalAutoungrabify;
  /** @type boolean | undefined */
  originalUserZoomingEnabled;
  /** @type boolean | undefined */
  originalUserPanningEnabled;

  /** @type cytoscape.NodePositionMap | undefined */
  originalPositions;
  /** @type number | undefined */
  originalZoom;
  /** @type cytoscape.Position | undefined */
  originalPan;

  /** @type boolean */
  panning = false;

  onGraphContainerMouseDownBound = this.onGraphContainerMouseDown.bind(this);
  onGraphContainerMouseMoveBound = this.onGraphContainerMouseMove.bind(this);
  onGraphContainerWheelBound = this.onGraphContainerWheel.bind(this);
  onMapMoveBound = this.onMapMove.bind(this);

  onGraphAddBound = this.onGraphAdd.bind(this);
  onGraphResizeBound = this.onGraphResize.bind(this);
  onGraphDragFreeBound = this.onGraphDragFree.bind(this);

  /**
   * @param {cytoscape.Core} cy
   * @param {L.MapOptions} mapOptions
   * @param {MapHandlerOptions} options
   */
  constructor(cy, mapOptions, options) {
    this.cy = cy;
    this.mapOptions = mapOptions;
    this.options = options;

    if (!(this.options.getPosition instanceof Function)) {
      throw new Error('getPosition should be a function');
    }
    if (this.options.setPosition && !(this.options.setPosition instanceof Function)) {
      throw new Error('setPosition should be a function');
    }

    // Cytoscape config
    this.originalAutoungrabify = this.cy.autoungrabify();
    this.originalUserZoomingEnabled = this.cy.userZoomingEnabled();
    this.originalUserPanningEnabled = this.cy.userPanningEnabled();

    this.cy.userZoomingEnabled(false);
    this.cy.userPanningEnabled(false);

    // Cytoscape events
    const graphContainer = /** @type HTMLElement */ (this.cy.container());
    graphContainer.addEventListener('mousedown', this.onGraphContainerMouseDownBound);
    graphContainer.addEventListener('mousemove', this.onGraphContainerMouseMoveBound);
    graphContainer.addEventListener('wheel', this.onGraphContainerWheelBound);
    this.cy.on('add', this.onGraphAddBound);
    this.cy.on('resize', this.onGraphResizeBound);
    this.cy.on('dragfree', this.onGraphDragFreeBound);

    // Map container
    this.mapContainer = document.createElement('div');
    this.mapContainer.style.position = 'absolute';
    this.mapContainer.style.top = '0px';
    this.mapContainer.style.left = '0px';
    this.mapContainer.style.width = '100%';
    this.mapContainer.style.height = '100%';
    graphContainer.insertBefore(this.mapContainer, this.cy.renderer().data.canvasContainer);

    // Leaflet instance
    this.map = new L.Map(this.mapContainer, this.mapOptions);
    this.fit(undefined, { padding: DEFAULT_FIT_PADDING, animate: false });

    // Map events
    this.map.on('move', this.onMapMoveBound);

    // Cytoscape unit viewport
    this.originalZoom = this.cy.zoom();
    this.originalPan = { ...this.cy.pan() };

    const zoom = 1;
    const pan = { x: 0, y: 0 };

    if (this.options.animate) {
      this.cy.animate({
        zoom: zoom,
        pan: pan,
      }, {
        duration: this.options.animationDuration ?? DEFAULT_ANIMATION_DURATION,
        easing: 'linear',
      });
    } else {
      this.cy.viewport(
        zoom,
        pan
      );
    }

    // Cytoscape positions
    this.enableGeographicPositions();
  }

  destroy() {
    // Cytoscape events
    const graphContainer = /** @type HTMLElement */ (this.cy.container());
    graphContainer.removeEventListener('mousedown', this.onGraphContainerMouseDownBound);
    graphContainer.removeEventListener('mousemove', this.onGraphContainerMouseMoveBound);
    graphContainer.removeEventListener('wheel', this.onGraphContainerWheelBound);
    this.cy.off('add', this.onGraphAddBound);
    this.cy.off('resize', this.onGraphResizeBound);
    this.cy.off('dragfree', this.onGraphDragFreeBound);

    // Cytoscape config
    this.cy.autoungrabify(this.originalAutoungrabify);
    this.cy.userZoomingEnabled(this.originalUserZoomingEnabled);
    this.cy.userPanningEnabled(this.originalUserPanningEnabled);

    this.originalAutoungrabify = undefined;
    this.originalUserZoomingEnabled = undefined;
    this.originalUserPanningEnabled = undefined;

    // Map events
    this.map.off('move', this.onMapMoveBound);

    // Map instance
    this.map.remove();
    this.map = undefined;

    // Map container
    this.mapContainer.remove();
    this.mapContainer = undefined;

    // Cytoscape unit viewport
    if (this.options.animate) {
      this.cy.animate({
        zoom: this.originalZoom,
        pan: this.originalPan,
      }, {
        duration: this.options.animationDuration ?? DEFAULT_ANIMATION_DURATION,
        easing: 'linear',
      });
    } else {
      this.cy.viewport(
        this.originalZoom,
        this.originalPan
      );
    }

    this.originalZoom = undefined;
    this.originalPan = undefined;

    // Cytoscape positions
    this.disableGeographicPositions();

    this.cy = undefined;
    this.options = undefined;
  }

  /**
   * @param {cytoscape.NodeCollection} nodes
   * @param {L.FitBoundsOptions} options
   */
  fit(nodes = this.cy.nodes(), options) {
    const bounds = this.getNodeLngLatBounds(nodes);
    if (!bounds.isValid()) {
      return;
    }

    this.map.fitBounds(bounds, options);
  }

  /**
   * @private
   */
  enableGeographicPositions() {
    const nodes = this.cy.nodes();

    this.originalPositions = Object.fromEntries(nodes.map(node => {
      return [node.id(), { ...node.position() }];
    }));

    const positions = /** @type cytoscape.NodePositionMap */ (Object.fromEntries(
      /** @type [string, cytoscape.Position | undefined][] */ (nodes.map(node => {
        return [node.id(), this.getGeographicPosition(node)];
      })).filter(([_id, position]) => {
        return !!position;
      })
    ));

    // hide nodes without position
    const nodesWithoutPosition = nodes.filter(node => !positions[node.id()]);
    nodesWithoutPosition.addClass(HIDDEN_CLASS).style('display', 'none');

    this.cy.layout({
      name: 'preset',
      positions: positions,
      fit: false,
      animate: this.options.animate,
      animationDuration: this.options.animationDuration ?? DEFAULT_ANIMATION_DURATION,
      animationEasing: 'ease-out-cubic',
    }).run();
  }

  /**
   * @private
   * @param {cytoscape.NodeCollection | undefined} nodes
   */
  updateGeographicPositions(nodes = this.cy.nodes()) {
    const positions = /** @type cytoscape.NodePositionMap */ (Object.fromEntries(
      /** @type [string, cytoscape.Position | undefined][] */ (nodes.map(node => {
        return [node.id(), this.getGeographicPosition(node)];
      })).filter(([_id, position]) => {
        return !!position;
      })
    ));

    // update only positions which have changed, for cytoscape-edgehandles compatibility
    const currentPositions = /** @type cytoscape.NodePositionMap */ (Object.fromEntries(nodes.map(node => {
      return [node.id(), { ...node.position() }];
    })));
    const updatedPositions = /** @type cytoscape.NodePositionMap */ (Object.fromEntries(
      Object.entries(positions).filter(([id, position]) => {
        const currentPosition = currentPositions[id];
        return !this.arePositionsEqual(currentPosition, position);
      })
    ));

    // hide nodes without position
    const nodesWithoutPosition = nodes.filter(node => !positions[node.id()]);
    nodesWithoutPosition.addClass(HIDDEN_CLASS).style('display', 'none');

    this.cy.layout({
      name: 'preset',
      positions: updatedPositions,
      fit: false
    }).run();
  }

  /**
   * @private
   */
  disableGeographicPositions() {
    const nodes = this.cy.nodes();

    this.cy.layout({
      name: 'preset',
      positions: this.originalPositions,
      fit: false,
      animate: this.options.animate,
      animationDuration: this.options.animationDuration ?? DEFAULT_ANIMATION_DURATION,
      animationEasing: 'ease-in-cubic',
      stop: () => {
        // show nodes without position
        const nodesWithoutPosition = nodes.filter(node => node.hasClass(HIDDEN_CLASS));
        nodesWithoutPosition.removeClass(HIDDEN_CLASS).style('display', null);
      }
    }).run();

    this.originalPositions = undefined;
  }

  /**
   * @private
   * @param {MouseEvent} event
   */
  onGraphContainerMouseDown(event) {
    if (
      event.buttons === 1 &&
      !isMultSelKeyDown(event) &&
      !this.cy.renderer().hoverData.down
    ) {
      this.cy.renderer().hoverData.dragging = true; // cytoscape-lasso compatibility
      this.dispatchMapEvent(event);

      document.addEventListener('mouseup', () => {
        if (!this.panning) {
          return;
        }

        this.panning = false;

        // prevent unselecting in Cytoscape mouseup
        this.cy.renderer().hoverData.dragged = true;
      }, { once: true });
    }
  }

  /**
   * @private
   * @param {MouseEvent} event
   */
  onGraphContainerMouseMove(event) {
    if (
      event.buttons === 1 &&
      !isMultSelKeyDown(event) &&
      !this.cy.renderer().hoverData.down
    ) {
      this.panning = true;

      this.dispatchMapEvent(event);
    }
  }

  /**
   * @private
   * @param {MouseEvent} event
   */
  onGraphContainerWheel(event) {
    this.dispatchMapEvent(event);
  }

  /**
   * @private
   */
  onMapMove() {
    this.updateGeographicPositions();
  }

  /**
   * @private
   * @param {cytoscape.EventObject} event
   */
  onGraphAdd(event) {
    if (!event.target.isNode()) {
      return;
    }

    const node = /** @type cytoscape.NodeSingular */ (event.target);

    this.originalPositions[node.id()] = { ...node.position() };

    const nodes = this.cy.collection().merge(node);
    this.updateGeographicPositions(nodes);
  }

  /**
   * @private
   */
  onGraphResize() {
    this.map.invalidateSize(false);
  }

  /**
   * @private
   * @param {cytoscape.EventObject} event
   */
  onGraphDragFree(event) {
    const node = /** @type cytoscape.NodeSingular */ (event.target);

    if (this.options.setPosition) {
      const lngLat = this.map.containerPointToLatLng(node.position());
      this.options.setPosition(node, lngLat);
    }

    const nodes = this.cy.collection().merge(node);
    this.updateGeographicPositions(nodes);
  }

  /**
   * @private
   * @param {MouseEvent} event
   */
  dispatchMapEvent(event) {
    if (event.target === this.mapContainer || this.mapContainer.contains(event.target)) {
      return;
    }

    const clonedEvent = new event.constructor(event.type, event);
    this.map.getContainer().dispatchEvent(clonedEvent);
  }

  /**
   * @private
   * @param {cytoscape.NodeSingular} node
   * @return {L.LatLng | undefined}
   */
  getNodeLngLat(node) {
    const lngLatLike = this.options.getPosition(node);
    if (!lngLatLike) {
      return;
    }

    let lngLat;
    try {
      lngLat = L.latLng(lngLatLike);
    } catch (e) {
      return;
    }

    return lngLat;
  }

  /**
   * @private
   * @param {cytoscape.NodeCollection} nodes
   * @return {L.LatLngBounds}
   */
  getNodeLngLatBounds(nodes = this.cy.nodes()) {
    const bounds = nodes.reduce((bounds, node) => {
      const lngLat = this.getNodeLngLat(node);
      if (!lngLat) {
        return bounds;
      }

      return bounds.extend(lngLat);
    }, L.latLngBounds([]));
    return bounds;
  }

  /**
   * @private
   * @param {cytoscape.NodeSingular} node
   * @return {cytoscape.Position | undefined}
   */
  getGeographicPosition(node) {
    const lngLat = this.getNodeLngLat(node);
    if (!lngLat) {
      return;
    }

    const position = this.map.latLngToContainerPoint(lngLat);
    return position;
  }

  /**
   * @private
   * @param {cytoscape.Position} position1
   * @param {cytoscape.Position} position2
   * @return {boolean}
   */
  arePositionsEqual(position1, position2) {
    return position1.x === position2.x && position1.y === position2.y;
  }
}
