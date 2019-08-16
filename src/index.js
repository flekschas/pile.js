import * as PIXI from 'pixi.js';
import createPubSub from 'pub-sub-es';
import withRaf from 'with-raf';
import * as RBush from 'rbush';
import withThrottle from 'lodash-es/throttle';

import createStore, {
  initPiles,
  // mergePiles,
  // movePiles,
  setItemRenderer,
  setItems,
  setOrderer,
  setGrid
} from './store';

import { dist, getBBox, isPileInPolygon } from './utils';

import createPile from './pile';
import createGrid from './grid';

const createPileMe = rootElement => {
  const canvas = document.createElement('canvas');
  const pubSub = createPubSub();
  const store = createStore();

  let state = store.getState();

  const renderer = new PIXI.Renderer({
    width: rootElement.getBoundingClientRect().width,
    height: rootElement.getBoundingClientRect().height,
    view: canvas,
    antialias: true,
    transparent: true,
    resolution: window.devicePixelRatio,
    autoResize: true
  });

  const stage = new PIXI.Container();
  stage.interactive = true;
  stage.sortableChildren = true;

  const get = property => {
    switch (property) {
      case 'renderer':
        return state.itemRenderer;

      case 'items':
        return state.items;

      case 'piles':
        return state.piles;

      case 'orderer':
        return state.orderer;

      case 'grid':
        return state.grid;

      default:
        console.warn(`Unknown property "${property}"`);
        return undefined;
    }
  };

  const set = (property, value) => {
    const actions = [];

    switch (property) {
      case 'renderer':
        actions.push(setItemRenderer(value));
        break;

      case 'items':
        actions.push(setItems(value));
        actions.push(initPiles(value.length));
        break;

      case 'orderer':
        actions.push(setOrderer(value));
        break;

      case 'grid':
        actions.push(setGrid(value));
        break;

      default:
        console.warn(`Unknown property "${property}"`);
    }

    if (actions.length !== 0) {
      actions.forEach(action => {
        store.dispatch(action);
      });
    }
  };

  const render = () => {
    renderer.render(stage);
  };

  const renderRaf = withRaf(render);

  const pileInstances = new Map();
  const activePile = new PIXI.Container();
  const normalPile = new PIXI.Container();

  const searchIndex = new RBush();

  const createRBush = () => {
    searchIndex.clear();

    const boxList = [];

    if (pileInstances) {
      pileInstances.forEach(pile => {
        pile.updateBBox();
        boxList.push(pile.bBox);
      });
      searchIndex.load(boxList);
    }
  };

  const deleteSearchIndex = pileId => {
    const pile = pileInstances.get(pileId);

    searchIndex.remove(pile.bBox, (a, b) => {
      return a.pileId === b.pileId;
    });
  };

  const updateBoundingBox = pileId => {
    const pile = pileInstances.get(pileId);

    searchIndex.remove(pile.bBox, (a, b) => {
      return a.pileId === b.pileId;
    });
    pile.updateBBox();
    searchIndex.insert(pile.bBox);
  };

  const lassoContainer = new PIXI.Container();
  const lassoBgContainer = new PIXI.Container();
  const lasso = new PIXI.Graphics();
  const lassoFill = new PIXI.Graphics();

  const createItems = () => {
    const { itemRenderer, items } = store.getState();

    pileInstances.clear();

    stage.removeChildren();

    stage.addChild(lassoBgContainer);
    lassoBgContainer.addChild(lassoFill);
    stage.addChild(normalPile);

    const renderItems = items.map(({ src }) => itemRenderer(src));

    return Promise.all(renderItems).then(itemsA => {
      itemsA.forEach((item, index) => {
        const pile = createPile(item, renderRaf, index, pubSub);
        pileInstances.set(index, pile);
        normalPile.addChild(pile.pileGraphics);
      });
      stage.addChild(activePile);
      stage.addChild(lassoContainer);
      lassoContainer.addChild(lasso);
      renderRaf();
    });
  };

  let layout;

  const initGrid = () => {
    const { grid } = store.getState();

    layout = createGrid(canvas, grid);
  };

  const positionPiles = () => {
    const { items, orderer } = store.getState();

    // const movingPiles = [];

    if (pileInstances) {
      pileInstances.forEach((pile, id) => {
        let x;
        let y;
        if (items[id].position) {
          [x, y] = items[id].position;
        } else {
          const getPosition = orderer(layout.myColNum);
          [x, y] = getPosition(id);
        }

        x *= layout.myColWidth;
        y *= layout.myRowHeight;

        pile.pileGraphics.x += x;
        pile.pileGraphics.y += y;

        // movePiles.push({
        //   id,
        //   x: pile.pileGraphics.x,
        //   y: pile.pileGraphics.y
        // })
      });
      // store.dispatch(movePiles(movingPiles));
      createRBush();
      renderRaf();
    }
  };

  let stateUpdates;

  const updated = () => {
    const newState = store.getState();

    stateUpdates = new Set();
    const updates = [];

    if (
      state.items !== newState.items ||
      state.itemRenderer !== newState.itemRenderer
    ) {
      updates.push(createItems());
      stateUpdates.add('piles');
    }

    if (state.piles !== newState.piles) {
      console.log(newState.piles);
      // newState.piles
      //   .filter((pile, id) => pile !== state.piles[id])
      //   .forEach((pile, id) => {
      //     if(pile === []) {
      //       deleteSearchIndex(id);
      //     }
      //     else {
      //       updateBoundingBox(id);
      //     }
      //   })
    }

    if (state.orderer !== newState.orderer) stateUpdates.add('layout');

    if (state.grid !== newState.grid) {
      initGrid();
      stateUpdates.add('layout');
    }

    Promise.all(updates).then(() => {
      if (stateUpdates.has('piles') || stateUpdates.has('layout')) {
        positionPiles();
      }
    });

    state = newState;
  };

  const mergePile = (sourceId, targetId) => {
    // get item container
    const source = pileInstances.get(sourceId).pileGraphics.getChildAt(1);
    const target = pileInstances.get(targetId).pileGraphics.getChildAt(1);

    pileInstances.get(sourceId).itemIDs.forEach((item, id) => {
      pileInstances.get(targetId).itemIDs.set(id, item);
    });

    const srcLength = source.children.length;
    for (let i = 0; i < srcLength; i++) {
      // move one container's child to another container means
      // that child is removed from the original container
      // so always add the first child
      target.addChild(source.children[0]);
    }

    target.children.forEach((item, index) => {
      const padding = index * 5 + 2;
      item.x = -item.width / 2 + padding;
      item.y = -item.height / 2 + padding;
    });

    deleteSearchIndex(sourceId);
    updateBoundingBox(targetId);

    source.parent.destroy();
    pileInstances.delete(sourceId);

    // store.dispatch(mergePiles([sourceId, targetId], true))

    // updatePileState(sourceId);
    // updatePileState(targetId);
  };

  const mergeMultiPiles = pileIds => {
    const targetId = Math.min(...pileIds);
    const targetPile = pileInstances.get(targetId);

    let centerX = 0;
    let centerY = 0;
    pileIds.forEach(id => {
      const box = pileInstances.get(id).bBox;
      centerX += box.minX + (box.maxX - box.minX) / 2;
      centerY += box.minY + (box.maxY - box.minY) / 2;
    });
    pileIds.forEach(id => {
      if (id !== targetId) {
        mergePile(id, targetId);
      }
    });
    centerX /= pileIds.length;
    centerY /= pileIds.length;
    targetPile.pileGraphics.x = centerX;
    targetPile.pileGraphics.y = centerY;

    updateBoundingBox(targetId);
    // updatePileState(targetId);
  };

  const mousePosition = [0, 0];

  // Get a copy of the current mouse position
  const getMousePos = () => mousePosition.slice();

  const getRelativeMousePosition = event => {
    const rect = canvas.getBoundingClientRect();

    mousePosition[0] = event.clientX - rect.left;
    mousePosition[1] = event.clientY - rect.top;

    return [...mousePosition];
  };

  const LASSO_MIN_DIST = 8;
  const LASSO_MIN_DELAY = 25;
  let lassoPos = [];
  let lassoPosFlat = [];
  let lassoPrevMousePos;
  let isLasso = false;

  const drawlasso = () => {
    lasso.clear();
    lassoFill.clear();
    lasso.lineStyle(2, 0xffffff, 1);
    lasso.moveTo(...lassoPos[0]);
    lassoPos.forEach(pos => {
      lasso.lineTo(...pos);
      lasso.moveTo(...pos);
    });
    lassoFill.beginFill(0xffffff, 0.2);
    lassoFill.drawPolygon(lassoPosFlat);
    renderRaf();
  };

  let mouseDown = false;

  const lassoExtend = () => {
    if (!mouseDown) return;

    const currMousePos = getMousePos();

    if (!lassoPrevMousePos) {
      lassoPos.push(currMousePos);
      lassoPosFlat.push(...currMousePos);
      lassoPrevMousePos = currMousePos;
      lasso.moveTo(...currMousePos);
    } else {
      const d = dist(...currMousePos, ...lassoPrevMousePos);

      if (d > LASSO_MIN_DIST) {
        lassoPos.push(currMousePos);
        lassoPosFlat.push(...currMousePos);
        lassoPrevMousePos = currMousePos;
        if (lassoPos.length > 1) {
          drawlasso();
          isLasso = true;
        }
      }
    }
  };
  const lassoExtendDb = withThrottle(lassoExtend, LASSO_MIN_DELAY, true);

  const findPilesInLasso = lassoPolygon => {
    // get the bounding box of the lasso selection...
    const bBox = getBBox(lassoPolygon);
    // ...to efficiently preselect potentially selected Piles
    const pilesInBBox = searchIndex.search(bBox);
    // next we test each Pile in the bounding box if it is in the polygon too
    const pilesInPolygon = [];
    pilesInBBox.forEach(pile => {
      if (
        isPileInPolygon([pile.minX, pile.minY], lassoPolygon) ||
        isPileInPolygon([pile.minX, pile.maxY], lassoPolygon) ||
        isPileInPolygon([pile.maxX, pile.minY], lassoPolygon) ||
        isPileInPolygon([pile.maxX, pile.maxY], lassoPolygon)
      )
        pilesInPolygon.push(pile.pileId);
    });

    return pilesInPolygon;
  };

  const lassoEnd = () => {
    if (isLasso) {
      const pilesInLasso = findPilesInLasso(lassoPosFlat);
      // console.log(pilesInLasso);
      if (pilesInLasso.length > 1) {
        mergeMultiPiles(pilesInLasso);
      }
      lasso.closePath();
      lasso.clear();
      lassoFill.clear();
      render();
      isLasso = false;
    }
    lassoPos = [];
    lassoPosFlat = [];
    lassoPrevMousePos = undefined;
  };

  const handleDropPile = pileId => {
    let hit;
    const pile = pileInstances.get(pileId).pileGraphics;

    const collidePiles = searchIndex
      .search(pileInstances.get(pileId).calcBBox())
      .filter(collidePile => collidePile.pileId !== pileId);

    // only one pile is colliding with the pile
    if (collidePiles.length === 1) {
      mergePile(pileId, collidePiles[0].pileId);
      hit = true;
    } else {
      updateBoundingBox(pileId);
      // updatePileState(pileId);
    }

    activePile.removeChildren();
    // if hit = true, then the original pile is destoryed
    if (hit !== true) {
      normalPile.addChild(pile);
    }
  };

  const handleDragPile = pileId => {
    const pile = pileInstances.get(pileId).pileGraphics;
    activePile.addChild(pile);
  };

  let oldResult = [];
  let newResult = [];

  const handleHighlightPile = pileId => {
    oldResult = [...newResult];
    newResult = searchIndex.search(pileInstances.get(pileId).calcBBox());

    if (oldResult !== []) {
      oldResult.forEach(collidePile => {
        if (pileInstances.get(collidePile.pileId)) {
          const pile = pileInstances.get(collidePile.pileId).pileGraphics;
          const border = pile.getChildAt(0).getChildAt(0);
          border.clear();
        }
      });
    }

    newResult.forEach(collidePile => {
      if (pileInstances.get(collidePile.pileId)) {
        const pile = pileInstances.get(collidePile.pileId).pileGraphics;
        const border = pile.getChildAt(0).getChildAt(0);
        pileInstances.get(collidePile.pileId).drawBorder(pile, border);
      }
    });
  };

  // let mouseDownShift = false;
  let mouseDownPosition = [0, 0];

  const mouseDownHandler = event => {
    render();

    mouseDownPosition = getRelativeMousePosition(event);

    // whether mouse click on any pile
    const result = searchIndex.collides({
      minX: mouseDownPosition[0],
      minY: mouseDownPosition[1],
      maxX: mouseDownPosition[0] + 1,
      maxY: mouseDownPosition[1] + 1
    });

    if (!result) {
      mouseDown = true;
    }
  };

  const mouseUpHandler = () => {
    if (mouseDown) {
      lassoEnd();
      mouseDown = false;
    }
  };

  const mouseClickHandler = event => {
    // const currentMousePosition = [event.clientX, event.clientY];
    // const clickDist = dist(...currentMousePosition, ...mouseDownPosition);

    // if (clickDist >= LASSO_MIN_DIST) return;
    getRelativeMousePosition(event);
  };

  const mouseMoveHandler = event => {
    getRelativeMousePosition(event);

    lassoExtendDb();
  };

  const init = () => {
    // Setup event handler
    window.addEventListener('blur', () => {}, false);
    window.addEventListener('mousedown', mouseDownHandler, false);
    window.addEventListener('mouseup', mouseUpHandler, false);
    window.addEventListener('mousemove', mouseMoveHandler, false);
    canvas.addEventListener('mouseenter', () => {}, false);
    canvas.addEventListener('mouseleave', () => {}, false);
    canvas.addEventListener('click', mouseClickHandler, false);
    canvas.addEventListener('dblclick', () => {}, false);

    pubSub.subscribe('dropPile', handleDropPile);
    pubSub.subscribe('dragPile', handleDragPile);
    pubSub.subscribe('highlightPile', handleHighlightPile);

    store.subscribe(updated);
    rootElement.appendChild(canvas);
  };

  const destroy = () => {
    // Remove event listeners
    window.removeEventListener('keyup', () => {}, false);
    window.removeEventListener('blur', () => {}, false);
    window.removeEventListener('mousedown', mouseDownHandler, false);
    window.removeEventListener('mouseup', mouseUpHandler, false);
    window.removeEventListener('mousemove', mouseMoveHandler, false);
    canvas.removeEventListener('mouseenter', () => {}, false);
    canvas.removeEventListener('mouseleave', () => {}, false);
    canvas.removeEventListener('click', mouseClickHandler, false);
    canvas.removeEventListener('dblclick', () => {}, false);

    stage.destroy(false);
    renderer.destroy(true);
    store.unsubscribe(updated);

    rootElement.removeChild(canvas);
    pubSub.clear();
  };

  init();

  return {
    destroy,
    get,
    render: renderRaf,
    set,
    subscribe: pubSub.subscribe,
    unsubscribe: pubSub.unsubscribe
  };
};

export default createPileMe;
