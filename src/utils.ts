import memoizeOne from 'memoize-one';

/**
 * @see https://github.com/cytoscape/cytoscape.js/blob/master/src/extensions/renderer/base/load-listeners.js
 */
export function isMultSelKeyDown(event: MouseEvent) {
  return event.shiftKey || event.metaKey || event.ctrlKey; // maybe event.altKey
}

/**
 * @param {cytoscape.Position} position1
 * @param {cytoscape.Position} position2
 * @return {boolean}
 */
function arePositionsEqual(
  position1: cytoscape.Position,
  position2: cytoscape.Position
) {
  return position1.x === position2.x && position1.y === position2.y;
}

export function getUpdatedPositions(
  currentPositions: cytoscape.NodePositionMap,
  positions: cytoscape.NodePositionMap
): cytoscape.NodePositionMap {
  return Object.fromEntries(
    Object.entries(positions).filter(([id, position]) => {
      const currentPosition = currentPositions[id];
      return !arePositionsEqual(currentPosition, position);
    })
  );
}

export const getUpdatedPositionsMemo = memoizeOne(getUpdatedPositions);
