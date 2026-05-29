import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { qualityLabel, estimationBadge } from '../../modules/quality.js';

describe('qualityLabel', () => {
  it('labels an estimated (extrapolated) entry', () => {
    assert.deepEqual(qualityLabel({ estimated: true, observed: false }), {
      text: 'Estimated',
      cls: 'quality-estimated',
    });
  });

  it('labels an observed entry', () => {
    assert.deepEqual(qualityLabel({ estimated: false, observed: true }), {
      text: 'Observed',
      cls: 'quality-observed',
    });
  });

  it('falls through to Interpolated when neither observed nor estimated', () => {
    assert.deepEqual(qualityLabel({ estimated: false, observed: false }), {
      text: 'Interpolated',
      cls: 'quality-interpolated',
    });
  });

  it('estimated takes precedence over observed', () => {
    assert.equal(qualityLabel({ estimated: true, observed: true }).text, 'Estimated');
  });
});

describe('estimationBadge', () => {
  it('shows "Estimated" when the field is estimated (wins over interpolated)', () => {
    assert.deepEqual(estimationBadge(true, false), { active: true, label: 'Estimated' });
    assert.deepEqual(estimationBadge(true, true), { active: true, label: 'Estimated' });
  });

  it('shows "Interpolated" when the row is interpolated and the field is not estimated', () => {
    assert.deepEqual(estimationBadge(false, true), { active: true, label: 'Interpolated' });
  });

  it('shows no badge when the field is neither estimated nor interpolated', () => {
    assert.deepEqual(estimationBadge(false, false), { active: false, label: '' });
  });
});
