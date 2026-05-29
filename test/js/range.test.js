import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  rangeWindow,
  rangeEdgeIndices,
  clampedRangeIndices,
} from '../../modules/range.js';

// A daily-ish series spanning 2018-01-01 .. 2025-01-01 (sparse: year boundaries).
const items = [
  { date: '2018-01-01' },
  { date: '2019-01-01' },
  { date: '2020-01-01' },
  { date: '2021-01-01' },
  { date: '2022-01-01' },
  { date: '2023-01-01' },
  { date: '2024-01-01' },
  { date: '2025-01-01' },
];
const minDate = '2018-01-01';
const maxDate = '2025-01-01';

describe('rangeWindow', () => {
  it('1y subtracts one year from maxDate', () => {
    assert.deepEqual(rangeWindow('1y', minDate, maxDate), {
      startIso: '2024-01-01',
      endIso: '2025-01-01',
    });
  });

  it('2y subtracts two years', () => {
    assert.equal(rangeWindow('2y', minDate, maxDate).startIso, '2023-01-01');
  });

  it('5y subtracts five years', () => {
    assert.equal(rangeWindow('5y', minDate, maxDate).startIso, '2020-01-01');
  });

  it('all spans minDate..maxDate', () => {
    assert.deepEqual(rangeWindow('all', minDate, maxDate), {
      startIso: '2018-01-01',
      endIso: '2025-01-01',
    });
  });

  it('preserves day-of-month when subtracting years', () => {
    assert.equal(rangeWindow('1y', '2020-06-15', '2024-06-15').startIso, '2023-06-15');
  });
});

describe('rangeEdgeIndices', () => {
  it('returns the first index >= each window edge', () => {
    assert.deepEqual(rangeEdgeIndices(items, '1y', minDate, maxDate), {
      startIndex: 6, // 2024-01-01
      endIndex: 7,   // 2025-01-01
    });
  });

  it('returns -1 for a start beyond the last row', () => {
    const future = [{ date: '2010-01-01' }, { date: '2011-01-01' }];
    const { startIndex } = rangeEdgeIndices(future, '1y', '2010-01-01', '2011-01-01');
    // window start 2010-01-01 -> index 0; end 2011-01-01 -> index 1
    assert.equal(startIndex, 0);
  });

  it('start falls past the end of the list -> -1', () => {
    // maxDate is after every row, so a 1y window start is also after every row.
    const { startIndex, endIndex } = rangeEdgeIndices(items, '1y', minDate, '2030-01-01');
    assert.equal(startIndex, -1);
    assert.equal(endIndex, -1);
  });
});

describe('clampedRangeIndices', () => {
  it('clamps a matched window to its indices', () => {
    assert.deepEqual(clampedRangeIndices(items, '5y', minDate, maxDate), {
      start: 2, // 2020-01-01
      end: 7,   // 2025-01-01
    });
  });

  it('spans the whole list for all', () => {
    assert.deepEqual(clampedRangeIndices(items, 'all', minDate, maxDate), {
      start: 0,
      end: 7,
    });
  });

  it('clamps start to 0 and end to last index when edges miss', () => {
    assert.deepEqual(clampedRangeIndices(items, '1y', minDate, '2030-01-01'), {
      start: 0,
      end: items.length - 1,
    });
  });
});
