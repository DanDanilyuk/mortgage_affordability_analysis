// URL parameter parsing + filter-default comparison.
// Pure: no window/document/state references at module scope. The app.js wrappers
// inject window.location.search and the live `state` values.
import { DEFAULTS, VALID_RANGES, VALID_VIEWS, STATE_NAMES } from './constants.js';

// Normalize a raw ?state= value to a canonical state code.
// `us`/`all` (any case) alias to 'ALL'; unknown codes fall back to the default.
export const resolveState = raw => {
  if (!raw) return DEFAULTS.state;
  const upper = raw.toUpperCase();
  if (upper === 'US' || upper === 'ALL') return 'ALL';
  return STATE_NAMES[upper] ? upper : DEFAULTS.state;
};

// Parse a location.search string into the four validated settings.
export const parseUrlParams = search => {
  const params = new URLSearchParams(search);
  const range = (params.get('range') || '').toLowerCase();
  const view = (params.get('view') || '').toLowerCase();
  const yaxis = (params.get('yaxis') || '').toLowerCase();
  return {
    state: resolveState(params.get('state')),
    range: VALID_RANGES.includes(range) ? range : DEFAULTS.range,
    view: VALID_VIEWS.includes(view) ? view : DEFAULTS.view,
    yaxis: yaxis === 'zero' ? 'zero' : DEFAULTS.yaxis,
  };
};

// True when any of the current settings differs from its default. `yAxisZero`
// is a boolean reflecting the `yaxis === 'zero'` default.
export const anyFilterNonDefault = ({ state, range, view, yAxisZero }) =>
  state !== DEFAULTS.state ||
  range !== DEFAULTS.range ||
  view !== DEFAULTS.view ||
  yAxisZero !== (DEFAULTS.yaxis === 'zero');
