require_relative 'test_helper'

# Covers DailyEstimator.estimate_price_with_trend - the forward price projection
# used for Thursdays beyond the last monthly home-price release.
class EstimatePriceWithTrendTest < Minitest::Test
  BASE  = 300_000.0
  START = Date.new(2025, 1, 1)

  def test_zero_growth_returns_base_price
    result = DailyEstimator.estimate_price_with_trend(BASE, START, START + 30, 0.0)
    assert_in_delta BASE, result, 0.01
  end

  def test_positive_growth_increases_price
    result = DailyEstimator.estimate_price_with_trend(BASE, START, START + 30, 0.01)
    assert result > BASE, "expected projection above base with positive growth, got #{result}"
    # ~1% over roughly one month
    assert_in_delta BASE * 1.01, result, BASE * 0.005
  end

  def test_projection_is_monotonic_in_horizon
    near = DailyEstimator.estimate_price_with_trend(BASE, START, START + 30, 0.01)
    far  = DailyEstimator.estimate_price_with_trend(BASE, START, START + 60, 0.01)
    assert far > near, "expected later horizon to project higher, got #{far} <= #{near}"
  end

  def test_negative_growth_decreases_price
    result = DailyEstimator.estimate_price_with_trend(BASE, START, START + 30, -0.01)
    assert result < BASE, "expected projection below base with negative growth, got #{result}"
  end

  def test_same_date_returns_base_price
    result = DailyEstimator.estimate_price_with_trend(BASE, START, START, 0.05)
    assert_in_delta BASE, result, 0.01
  end
end
