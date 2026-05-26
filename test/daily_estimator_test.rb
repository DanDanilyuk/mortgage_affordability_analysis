require_relative 'test_helper'

class HermiteInterpolateTest < Minitest::Test
  def test_returns_nil_for_empty_inputs
    assert_nil DailyEstimator.hermite_interpolate([], [], Date.today)
  end

  def test_returns_first_value_for_single_control_point
    values = [100.0]
    dates  = [Date.new(2025, 1, 1)]
    assert_equal 100.0, DailyEstimator.hermite_interpolate(values, dates, Date.new(2025, 6, 1))
  end

  def test_returns_first_value_when_target_before_all_dates
    values = [100.0, 110.0]
    dates  = [Date.new(2025, 6, 1), Date.new(2025, 7, 1)]
    assert_equal 100.0, DailyEstimator.hermite_interpolate(values, dates, Date.new(2025, 1, 1))
  end

  def test_returns_last_value_when_target_after_all_dates
    values = [100.0, 110.0]
    dates  = [Date.new(2025, 1, 1), Date.new(2025, 2, 1)]
    assert_equal 110.0, DailyEstimator.hermite_interpolate(values, dates, Date.new(2025, 12, 1))
  end

  def test_interpolates_between_dates
    values = [100.0, 200.0, 300.0, 400.0]
    dates  = [Date.new(2025, 1, 1), Date.new(2025, 2, 1), Date.new(2025, 3, 1), Date.new(2025, 4, 1)]
    result = DailyEstimator.hermite_interpolate(values, dates, Date.new(2025, 2, 15))
    assert result > 200.0 && result < 300.0,
      "expected interpolation between Feb (200) and Mar (300), got #{result}"
  end

  def test_handles_identical_dates_in_consecutive_positions
    values = [100.0, 100.0, 200.0]
    dates  = [Date.new(2025, 1, 1), Date.new(2025, 1, 1), Date.new(2025, 2, 1)]
    result = DailyEstimator.hermite_interpolate(values, dates, Date.new(2025, 1, 15))
    refute_nil result
    refute result.nan?
    refute result.infinite?
  end
end

class EstimateWeeklyIncomeTest < Minitest::Test
  def income(year, month, value)
    { date: Date.new(year, month, 1).to_s, value: value }
  end

  def test_interpolates_between_known_months
    data = (1..6).map { |m| income(2025, m, 1000 + m * 10) }
    target = Date.new(2025, 3, 15)
    result = DailyEstimator.estimate_weekly_income(data, target)
    assert result.between?(1030.0, 1040.0), "expected ~$1035, got #{result}"
  end

  def test_extrapolates_into_the_future_using_growth_rate
    data = [income(2025, 1, 1000.0), income(2025, 2, 1010.0)]
    target = Date.new(2025, 12, 1)
    result = DailyEstimator.estimate_weekly_income(data, target)
    assert result > 1010.0, "expected extrapolation above last known value, got #{result}"
  end

  def test_falls_through_to_last_known_value_with_single_data_point
    data = [income(2025, 1, 1000.0)]
    target = Date.new(2025, 12, 1)
    result = DailyEstimator.estimate_weekly_income(data, target)
    assert_equal 1000.0, result
  end

  def test_handles_zero_prev_income_without_dividing_by_zero
    data = [income(2025, 1, 0.0), income(2025, 2, 1000.0)]
    target = Date.new(2025, 12, 1)
    result = DailyEstimator.estimate_weekly_income(data, target)
    refute_nil result
    refute result.respond_to?(:nan?) && result.nan?
    refute result.respond_to?(:infinite?) && result.infinite?
  end
end
