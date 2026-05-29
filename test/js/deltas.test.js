import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeDelta } from '../../modules/deltas.js';

describe('computeDelta', () => {
  it('returns an empty line for a null diff (no year-ago row)', () => {
    assert.deepEqual(computeDelta(null, '+$0', 'down'), {
      text: '',
      className: 'info-delta',
    });
  });

  it('returns "flat vs 1Y" when the change is below the threshold', () => {
    assert.deepEqual(computeDelta(0, '+$0', 'down'), {
      text: 'flat vs 1Y',
      className: 'info-delta',
    });
    assert.deepEqual(computeDelta(0.0009, '+$1', 'up'), {
      text: 'flat vs 1Y',
      className: 'info-delta',
    });
  });

  it('treats a change at/above the threshold as non-flat', () => {
    assert.equal(computeDelta(0.001, '+0.00x', 'down').text, '▲ +0.00x vs 1Y');
  });

  describe('per-metric direction', () => {
    it('ratio (down is better): a decrease is better, increase worse', () => {
      assert.deepEqual(computeDelta(-0.12, '-0.12x', 'down'), {
        text: '▼ -0.12x vs 1Y',
        className: 'info-delta better',
      });
      assert.deepEqual(computeDelta(0.12, '+0.12x', 'down'), {
        text: '▲ +0.12x vs 1Y',
        className: 'info-delta worse',
      });
    });

    it('price (down is better)', () => {
      assert.equal(computeDelta(-5000, '-$5,000', 'down').className, 'info-delta better');
      assert.equal(computeDelta(5000, '+$5,000', 'down').className, 'info-delta worse');
    });

    it('income (up is better): an increase is better, decrease worse', () => {
      assert.deepEqual(computeDelta(2400, '+$2,400', 'up'), {
        text: '▲ +$2,400 vs 1Y',
        className: 'info-delta better',
      });
      assert.deepEqual(computeDelta(-2400, '-$2,400', 'up'), {
        text: '▼ -$2,400 vs 1Y',
        className: 'info-delta worse',
      });
    });

    it('mortgage rate (down is better)', () => {
      assert.equal(computeDelta(-0.5, '-0.50%', 'down').className, 'info-delta better');
      assert.equal(computeDelta(0.5, '+0.50%', 'down').className, 'info-delta worse');
    });
  });

  it('arrow tracks the sign of the diff regardless of better/worse', () => {
    assert.ok(computeDelta(1, '+1', 'up').text.startsWith('▲'));
    assert.ok(computeDelta(-1, '-1', 'up').text.startsWith('▼'));
  });
});
