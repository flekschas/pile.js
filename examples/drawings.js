import { ndjsonToJsonText } from 'ndjson-to-json-text';
import createPilingJs from '../src/library';

import createGoogleQuickDrawRenderer from './google-quickdraw-renderer';
import createGoogleQuickDrawCoverRenderer from './google-quickdraw-cover-renderer';
import createGoogleQuickDrawCoverAggregator from './google-quickdraw-cover-aggregator';

const createDrawingPiles = async element => {
  const ndjsonText = await fetch('data/apple.ndjson').then(body =>
    body.text().then(s => s)
  );

  const jsonText = ndjsonToJsonText(ndjsonText);

  const data = JSON.parse(jsonText).map(d => {
    d.src = d.drawing;
    delete d.drawing;
    return d;
  });

  const testData = data.slice(0, 1000);

  const coverOptions = { size: 128, lineWidth: 3 };

  const quickDrawRenderer = createGoogleQuickDrawRenderer();
  const quickDrawCoverAggregator = createGoogleQuickDrawCoverAggregator(
    coverOptions
  );
  const quickDrawCoverRenderer = createGoogleQuickDrawCoverRenderer(
    coverOptions
  );

  const pilingJs = createPilingJs(element, {
    renderer: quickDrawRenderer,
    coverRenderer: quickDrawCoverRenderer,
    coverAggregator: quickDrawCoverAggregator,
    items: testData,
    itemSize: 32,
    cellPadding: 16,
    pileItemOffset: [0, 0],
    pileBackgroundColor: 'rgba(255, 255, 255, 0.66)',
    pileScale: pile => 1 + Math.min((pile.items.length - 1) * 0.05, 2),
    pileVisibilityItems: pile => pile.items.length === 1,
    backgroundColor: '#ffffff',
    lassoFillColor: '#000000',
    lassoStrokeColor: '#000000'
  });

  return [pilingJs];
};

export default createDrawingPiles;
