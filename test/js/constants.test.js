import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULTS,
  VALID_RANGES,
  VALID_VIEWS,
  VIEW_TO_BTN,
  BTN_TO_VIEW,
  STATE_NAMES,
} from '../../modules/constants.js';

describe('constants', () => {
  it('DEFAULTS contains state/range/view/yaxis keys', () => {
    assert.ok('state' in DEFAULTS);
    assert.ok('range' in DEFAULTS);
    assert.ok('view' in DEFAULTS);
    assert.ok('yaxis' in DEFAULTS);
  });

  it('VALID_RANGES enumerates the four range buttons', () => {
    assert.deepEqual(VALID_RANGES, ['1y', '2y', '5y', 'all']);
  });

  it('VALID_VIEWS enumerates the three view modes', () => {
    assert.deepEqual(VALID_VIEWS, ['both', 'single', 'household']);
  });

  it('VIEW_TO_BTN and BTN_TO_VIEW are inverses', () => {
    for (const view of VALID_VIEWS) {
      assert.equal(BTN_TO_VIEW[VIEW_TO_BTN[view]], view);
    }
  });

  it('STATE_NAMES covers 50 states + DC + the ALL alias', () => {
    assert.equal(Object.keys(STATE_NAMES).length, 52);
    assert.ok(STATE_NAMES.ALL);
    assert.ok(STATE_NAMES.DC);
    assert.equal(STATE_NAMES.CA, 'California');
  });
});
