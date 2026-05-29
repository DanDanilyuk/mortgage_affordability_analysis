import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveState,
  parseUrlParams,
  anyFilterNonDefault,
} from '../../modules/urlState.js';

describe('resolveState', () => {
  it('aliases us/all (any case) to ALL', () => {
    assert.equal(resolveState('us'), 'ALL');
    assert.equal(resolveState('US'), 'ALL');
    assert.equal(resolveState('all'), 'ALL');
    assert.equal(resolveState('All'), 'ALL');
  });

  it('uppercases and accepts a known state code', () => {
    assert.equal(resolveState('ca'), 'CA');
    assert.equal(resolveState('Tx'), 'TX');
    assert.equal(resolveState('DC'), 'DC');
  });

  it('falls back to the default for unknown codes', () => {
    assert.equal(resolveState('zz'), 'ALL');
    assert.equal(resolveState('california'), 'ALL');
  });

  it('falls back to the default for empty/missing input', () => {
    assert.equal(resolveState(''), 'ALL');
    assert.equal(resolveState(null), 'ALL');
    assert.equal(resolveState(undefined), 'ALL');
  });
});

describe('parseUrlParams', () => {
  it('returns all defaults for an empty search string', () => {
    assert.deepEqual(parseUrlParams(''), {
      state: 'ALL',
      range: '2y',
      view: 'both',
      yaxis: 'auto',
    });
  });

  it('parses a fully-specified, mixed-case query', () => {
    assert.deepEqual(parseUrlParams('?state=CA&range=5Y&view=Single&yaxis=ZERO'), {
      state: 'CA',
      range: '5y',
      view: 'single',
      yaxis: 'zero',
    });
  });

  it('aliases state=us to ALL', () => {
    assert.equal(parseUrlParams('?state=us').state, 'ALL');
  });

  it('rejects invalid range/view and falls back to defaults', () => {
    const parsed = parseUrlParams('?range=10y&view=triple&yaxis=nope');
    assert.equal(parsed.range, '2y');
    assert.equal(parsed.view, 'both');
    assert.equal(parsed.yaxis, 'auto');
  });

  it('accepts every valid range and view', () => {
    for (const range of ['1y', '2y', '5y', 'all']) {
      assert.equal(parseUrlParams(`?range=${range}`).range, range);
    }
    for (const view of ['both', 'single', 'household']) {
      assert.equal(parseUrlParams(`?view=${view}`).view, view);
    }
  });
});

describe('anyFilterNonDefault', () => {
  const defaults = { state: 'ALL', range: '2y', view: 'both', yAxisZero: false };

  it('is false when everything matches the defaults', () => {
    assert.equal(anyFilterNonDefault(defaults), false);
  });

  it('is true when the state differs', () => {
    assert.equal(anyFilterNonDefault({ ...defaults, state: 'CA' }), true);
  });

  it('is true when the range differs', () => {
    assert.equal(anyFilterNonDefault({ ...defaults, range: '5y' }), true);
  });

  it('is true when the view differs', () => {
    assert.equal(anyFilterNonDefault({ ...defaults, view: 'single' }), true);
  });

  it('is true when the y-axis is pinned to zero', () => {
    assert.equal(anyFilterNonDefault({ ...defaults, yAxisZero: true }), true);
  });
});
