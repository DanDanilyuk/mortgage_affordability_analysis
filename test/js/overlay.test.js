import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isOverlayVisible, buildOverlayData } from '../../modules/overlay.js';

const nationalCache = {
  single_costs: [
    { date: '2023-01-05', cost_to_income: '4.10' },
    { date: '2023-01-12', cost_to_income: '4.20' },
    { date: '2023-01-26', cost_to_income: '4.30' },
  ],
};

describe('isOverlayVisible', () => {
  it('is hidden for the national (ALL) view', () => {
    assert.equal(isOverlayVisible('ALL', true, nationalCache), false);
  });

  it('is hidden when the user toggled the overlay off', () => {
    assert.equal(isOverlayVisible('CA', false, nationalCache), false);
  });

  it('is hidden when the national cache has not loaded yet', () => {
    assert.equal(isOverlayVisible('CA', true, null), false);
  });

  it('is visible for a single state with the toggle on and cache present', () => {
    assert.equal(isOverlayVisible('CA', true, nationalCache), true);
  });
});

describe('buildOverlayData', () => {
  const stateData = {
    single_costs: [
      { date: '2023-01-05' },
      { date: '2023-01-12' },
      { date: '2023-01-19' }, // not in the national cache -> null
      { date: '2023-01-26' },
    ],
  };

  it('joins by date and parses cost_to_income to a number', () => {
    assert.deepEqual(
      buildOverlayData(stateData.single_costs.length, 'CA', nationalCache, stateData),
      [4.1, 4.2, null, 4.3],
    );
  });

  it('returns an all-null array for the ALL view', () => {
    assert.deepEqual(buildOverlayData(3, 'ALL', nationalCache, stateData), [null, null, null]);
  });

  it('returns an all-null array of the given length when the cache is empty', () => {
    assert.deepEqual(buildOverlayData(2, 'CA', null, stateData), [null, null]);
  });

  it('yields all-null when no state dates match the cache', () => {
    const other = { single_costs: [{ date: '2099-01-01' }, { date: '2099-01-02' }] };
    assert.deepEqual(buildOverlayData(2, 'CA', nationalCache, other), [null, null]);
  });
});
