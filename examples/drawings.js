import createPilingJs from '../src/library';

import createGoogleQuickDrawRenderer from './google-quickdraw-renderer';
import createGoogleQuickDrawCoverRenderer from './google-quickdraw-cover-renderer';
import createGoogleQuickDrawCoverAggregator from './google-quickdraw-cover-aggregator';

const createDrawingPiles = async (element, darkMode) => {
  const response = await fetch('data/apple.json');
  const items = await response.json();

  const coverOptions = { size: 128, lineWidth: 3 };

  const quickDrawRenderer = createGoogleQuickDrawRenderer();
  const quickDrawCoverAggregator = createGoogleQuickDrawCoverAggregator(
    coverOptions
  );
  const quickDrawCoverRenderer = createGoogleQuickDrawCoverRenderer(
    coverOptions
  );

  const piling = createPilingJs(element, {
    darkMode,
    renderer: quickDrawRenderer,
    coverRenderer: quickDrawCoverRenderer,
    coverAggregator: quickDrawCoverAggregator,
    items: items.slice(0, 50),
    itemSize: 32,
    cellPadding: 16,
    pileCoverInvert: darkMode,
    pileItemInvert: darkMode,
    pileItemOffset: [0, 0],
    pileBackgroundColor: darkMode
      ? 'rgba(0, 0, 0, 0.85)'
      : 'rgba(255, 255, 255, 0.85)',
    pileScale: pile => 1 + Math.min((pile.items.length - 1) * 0.05, 2),
    pileVisibilityItems: pile => pile.items.length === 1
  });

  return [piling];
};

export default createDrawingPiles;
