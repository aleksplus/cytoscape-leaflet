import L, { PointTuple } from 'leaflet';
import { MapHandlerOptions } from './types';
import { getUpdatedPositionsMemo, isMultSelKeyDown } from './utils';

const DEFAULT_FIT_PADDING: PointTuple = [50, 50];
const DEFAULT_ANIMATION_DURATION = 1;
const HIDDEN_CLASS = 'cytoscape-map__hidden';

export class MapHandler {
  cy: cytoscape.Core | undefined;
  mapOptions: L.MapOptions;
  options: MapHandlerOptions | undefined;

  mapContainer: HTMLElement | undefined;
  map: L.Map | undefined;

  originalAutoungrabify: boolean | undefined;
  originalUserZoomingEnabled: boolean | undefined;
  originalUserPanningEnabled: boolean | undefined;

  originalPositions: cytoscape.NodePositionMap | undefined;
  originalZoom: number | undefined;
  originalPan: cytoscape.Position | undefined;

  panning: boolean = false;

  requestAnimationId: number | undefined;

  onGraphContainerMouseDownBound = this.onGraphContainerMouseDown.bind(this);
  onGraphContainerMouseMoveBound = this.onGraphContainerMouseMove.bind(this);
  onGraphContainerWheelBound = this.onGraphContainerWheel.bind(this);
  onMapMoveBound = this.onMapMove.bind(this);

  onGraphAddBound = this.onGraphAdd.bind(this);
  onGraphResizeBound = this.onGraphResize.bind(this);
  onGraphDragFreeBound = this.onGraphDragFree.bind(this);
  onDataChangeBound = this.onDataChange.bind(this);

  /**
   * @param {cytoscape.Core} cy
   * @param {L.MapOptions} mapOptions
   * @param {MapHandlerOptions} options
   */
  constructor(
    cy: cytoscape.Core,
    mapOptions: L.MapOptions,
    options: MapHandlerOptions
  ) {
    this.cy = cy;
    this.mapOptions = mapOptions;
    this.options = options;

    if (!(typeof this.options.getPosition === 'function')) {
      throw new Error('getPosition should be a function');
    }
    if (
      this.options.setPosition &&
      !(typeof this.options.setPosition === 'function')
    ) {
      throw new Error('setPosition should be a function');
    }

    // Cytoscape config
    this.originalAutoungrabify = this.cy.autoungrabify();
    this.originalUserZoomingEnabled = this.cy.userZoomingEnabled();
    this.originalUserPanningEnabled = this.cy.userPanningEnabled();

    this.cy.userZoomingEnabled(false);
    this.cy.userPanningEnabled(false);

    // Cytoscape events
    const graphContainer = this.cy.container() as unknown as HTMLElement;
    graphContainer.addEventListener(
      'mousedown',
      this.onGraphContainerMouseDownBound
    );
    graphContainer.addEventListener(
      'mousemove',
      this.onGraphContainerMouseMoveBound
    );
    graphContainer.addEventListener('wheel', this.onGraphContainerWheelBound);
    this.cy.on('add', this.onGraphAddBound);
    this.cy.on('resize', this.onGraphResizeBound);
    this.cy.on('dragfree', this.onGraphDragFreeBound);
    this.cy.on('data', this.onDataChangeBound);

    // Map container
    this.mapContainer = document.createElement('div');
    this.mapContainer.style.position = 'absolute';
    this.mapContainer.style.top = '0px';
    this.mapContainer.style.left = '0px';
    this.mapContainer.style.width = '100%';
    this.mapContainer.style.height = '100%';

    graphContainer?.prepend(this.mapContainer);

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
      this.cy.animate(
        {
          zoom: zoom,
          pan: pan,
        },
        {
          duration:
            this.options.animationDuration ?? DEFAULT_ANIMATION_DURATION,
          easing: 'linear',
        }
      );
    } else {
      this.cy.viewport({ zoom, pan });
    }

    // Cytoscape positions
    this.enableGeographicPositions();
  }

  destroy() {
    // Cytoscape events
    const graphContainer = this.cy?.container();
    if (graphContainer) {
      graphContainer.removeEventListener(
        'mousedown',
        this.onGraphContainerMouseDownBound
      );
      graphContainer.removeEventListener(
        'mousemove',
        this.onGraphContainerMouseMoveBound
      );
      graphContainer.removeEventListener(
        'wheel',
        this.onGraphContainerWheelBound
      );
    }
    if (this.cy) {
      this.cy.off('add', this.onGraphAddBound);
      this.cy.off('resize', this.onGraphResizeBound);
      this.cy.off('dragfree', this.onGraphDragFreeBound);
      this.cy.off('data', this.onDataChangeBound);

      // Cytoscape config
      this.cy.autoungrabify(this.originalAutoungrabify);
      this.cy.userZoomingEnabled(this.originalUserZoomingEnabled);
      this.cy.userPanningEnabled(this.originalUserPanningEnabled);
    }
    this.originalAutoungrabify = undefined;
    this.originalUserZoomingEnabled = undefined;
    this.originalUserPanningEnabled = undefined;

    // Map events
    this.map?.off('move', this.onMapMoveBound);

    // Map instance
    this.map?.remove();
    this.map = undefined;

    // Map container
    this.mapContainer?.remove();
    this.mapContainer = undefined;

    // Cytoscape unit viewport
    if (this.options?.animate) {
      this.cy?.animate(
        {
          zoom: this.originalZoom,
          pan: this.originalPan,
        },
        {
          duration:
            this.options.animationDuration ?? DEFAULT_ANIMATION_DURATION,
          easing: 'linear',
        }
      );
    } else {
      this.cy?.viewport({
        zoom: this.originalZoom ?? 5,
        pan:
          this.originalPan ??
          ({
            x: 0,
            y: 0,
          } as cytoscape.Position),
      });
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
  fit(
    nodes: cytoscape.NodeCollection = this.cy?.nodes() ??
      ([] as unknown as cytoscape.NodeCollection),
    options: L.FitBoundsOptions
  ) {
    const bounds = this.getNodeLngLatBounds(nodes);
    if (!bounds.isValid()) {
      return;
    }

    this.map?.fitBounds(bounds, options);
  }

  /**
   * @private
   */
  private enableGeographicPositions() {
    const nodes: cytoscape.NodeCollection =
      this.cy?.nodes() ?? ([] as unknown as cytoscape.NodeCollection);

    this.originalPositions = Object.fromEntries(
      nodes.map((node) => {
        return [node.id(), { ...node.position() }];
      })
    );

    const positions: cytoscape.NodePositionMap = Object.fromEntries(
      nodes
        .map((node) => {
          return [node.id(), this.getGeographicPosition(node)];
        })
        .filter(([_id, position]) => {
          return !!position;
        })
    );

    // hide nodes without position
    const nodesWithoutPosition = nodes.filter((node) => !positions[node.id()]);
    nodesWithoutPosition.addClass(HIDDEN_CLASS).style('display', 'none');

    this.cy
      ?.layout({
        name: 'preset',
        positions: positions,
        fit: false,
        animate: this.options?.animate,
        animationDuration:
          this.options?.animationDuration ?? DEFAULT_ANIMATION_DURATION,
        animationEasing: 'ease-out-cubic',
      })
      .run();
  }

  /**
   * @private
   * @param {cytoscape.NodeCollection | undefined} nodes
   */
  private updateGeographicPositions(
    nodes = this.cy?.nodes() ?? ([] as unknown as cytoscape.NodeCollection)
  ) {
    const updatePositions = (
      nodes = this.cy?.nodes() ?? ([] as unknown as cytoscape.NodeCollection)
    ) => {
      const positions: cytoscape.NodePositionMap = Object.fromEntries(
        nodes
          .map((node) => {
            return [node.id(), this.getGeographicPosition(node)];
          })
          .filter(([_id, position]) => {
            return !!position;
          })
      );

      // update only positions which have changed, for cytoscape-edgehandles compatibility
      const currentPositions: cytoscape.NodePositionMap = Object.fromEntries(
        nodes.map((node) => {
          return [node.id(), { ...node.position() }];
        })
      );
      const updatedPositions = getUpdatedPositionsMemo(
        currentPositions,
        positions
      );

      // hide nodes without position
      const nodesWithoutPosition = nodes.filter(
        (node) => !positions[node.id()]
      );
      nodesWithoutPosition.addClass(HIDDEN_CLASS).style('display', 'none');

      this.cy
        ?.layout({
          name: 'preset',
          positions: updatedPositions,
          fit: false,
        })
        .run();
    };

    this.requestAnimationId = window.requestAnimationFrame(
      function animatedUpdateGeographicPositions() {
        updatePositions(nodes);
      }
    );
  }

  /**
   * @private
   */
  private disableGeographicPositions() {
    const nodes =
      this.cy?.nodes() ?? ([] as unknown as cytoscape.NodeCollection);

    this.cy
      ?.layout({
        name: 'preset',
        positions: this.originalPositions,
        fit: false,
        animate: this.options?.animate,
        animationDuration:
          this.options?.animationDuration ?? DEFAULT_ANIMATION_DURATION,
        animationEasing: 'ease-in-cubic',
        stop: () => {
          // show nodes without position
          const nodesWithoutPosition = nodes.filter((node) =>
            node.hasClass(HIDDEN_CLASS)
          );
          nodesWithoutPosition.removeClass(HIDDEN_CLASS).style('display', null);
        },
      })
      .run();

    this.originalPositions = undefined;
  }

  /**
   * @private
   * @param {MouseEvent} event
   */
  private onGraphContainerMouseDown(event: MouseEvent) {
    // @ts-ignore
    const renderer = this.cy?.renderer();
    if (
      event.buttons === 1 &&
      !isMultSelKeyDown(event) &&
      !renderer.hoverData.down
    ) {
      // @ts-ignore,
      if (this.cy) this.cy.renderer().hoverData.dragging = true; // cytoscape-lasso compatibility
      this.dispatchMapEvent(event);

      document.addEventListener(
        'mouseup',
        () => {
          if (!this.panning) {
            return;
          }

          this.panning = false;

          // @ts-ignore, prevent unselecting in Cytoscape mouseup
          if (this.cy) this.cy.renderer().hoverData.dragged = true;
        },
        { once: true }
      );
    }
  }

  /**
   * @private
   * @param {MouseEvent} event
   */
  private onGraphContainerMouseMove(event: MouseEvent) {
    // @ts-ignore
    const renderer = this.cy?.renderer();
    if (
      event.buttons === 1 &&
      !isMultSelKeyDown(event) &&
      !renderer.hoverData.down
    ) {
      this.panning = true;

      this.dispatchMapEvent(event);
    }
  }

  /**
   * @private
   * @param {MouseEvent} event
   */
  private onGraphContainerWheel(event: MouseEvent) {
    event.preventDefault();
    this.dispatchMapEvent(event);
  }

  /**
   * @private
   */
  private onMapMove() {
    this.updateGeographicPositions();
  }

  /**
   * @private
   */
  private onDataChange() {
    this.updateGeographicPositions();
  }

  /**
   * @private
   * @param {cytoscape.EventObject} event
   */
  private onGraphAdd(event: cytoscape.EventObject) {
    if (!event.target.isNode()) {
      return;
    }

    const node: cytoscape.NodeSingular = event.target;

    if (!this.originalPositions) this.originalPositions = {};
    this.originalPositions[node.id()] = { ...node.position() };

    const nodes = this.cy?.collection().merge(node);
    this.updateGeographicPositions(nodes);
  }

  /**
   * @private
   */
  private onGraphResize() {
    this.map?.invalidateSize(false);
  }

  /**
   * @private
   * @param {cytoscape.EventObject} event
   */
  private onGraphDragFree(event: cytoscape.EventObject) {
    const node: cytoscape.NodeSingular = event.target;

    if (this.options?.setPosition) {
      const { x, y } = node.position();
      const position: PointTuple = [x, y];
      const lngLat = this.map?.containerPointToLatLng(position);
      if (lngLat) this.options.setPosition(node, lngLat);
    }

    const nodes = this.cy?.collection().merge(node);
    this.updateGeographicPositions(nodes);
  }

  /**
   * @private
   * @param {MouseEvent} event
   */
  private dispatchMapEvent(event: MouseEvent) {
    if (
      event.target === this.mapContainer ||
      // @ts-ignore
      this.mapContainer?.contains(event.target)
    ) {
      return;
    }

    // @ts-ignore
    const clonedEvent = new event.constructor(event.type, event);
    this.map?.getContainer().dispatchEvent(clonedEvent);
  }

  /**
   * @private
   * @param {cytoscape.NodeSingular} node
   * @return {L.LatLng | undefined}
   */
  private getNodeLngLat(node: cytoscape.NodeSingular): L.LatLng | undefined {
    if (typeof this.options?.getPosition !== 'function') return;

    const lngLatLike = this.options?.getPosition(node);
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
  private getNodeLngLatBounds(
    nodes: cytoscape.NodeCollection = this.cy?.nodes() ??
      ([] as unknown as cytoscape.NodeCollection)
  ): L.LatLngBounds {
    return nodes.reduce((bounds, node) => {
      const lngLat = this.getNodeLngLat(node);
      if (!lngLat) {
        return bounds;
      }

      return bounds.extend(lngLat);
    }, L.latLngBounds([]));
  }

  /**
   * @private
   * @param {cytoscape.NodeSingular} node
   * @return {cytoscape.Position | undefined}
   */
  private getGeographicPosition(
    node: cytoscape.NodeSingular
  ): cytoscape.Position | undefined {
    const lngLat = this.getNodeLngLat(node);
    if (!lngLat) {
      return;
    }

    return this.map?.latLngToContainerPoint(lngLat);
  }
}
