require_relative 'test_helper'

class HomePriceEnhancerTest < Minitest::Test
  def obs(date_str, value)
    { 'date' => date_str, 'value' => value.to_s }
  end

  def thursdays_between(start_date, end_date)
    days = []
    d = start_date
    while d <= end_date
      days << d if d.thursday?
      d += 1
    end
    days
  end

  def silence_io
    original_stdout = $stdout
    $stdout = StringIO.new
    yield
  ensure
    $stdout = original_stdout
  end

  def test_matches_thursdays_and_marks_observed_within_range
    monthly = [
      obs('2025-01-01', '300000'),
      obs('2025-02-01', '310000'),
      obs('2025-03-01', '320000')
    ]
    thursdays = thursdays_between(Date.new(2025, 1, 1), Date.new(2025, 3, 31))

    result = silence_io { HomePriceEnhancer.match_thursday_dates(monthly, thursdays) }
    assert_equal thursdays.length, result.length

    observed_points = result.select { |r| r['observed'] }
    assert observed_points.any?, 'expected at least one observed point'

    interpolated_points = result.select { |r| r['interpolated'] }
    assert interpolated_points.any?, 'expected at least one interpolated point'
  end

  def test_raises_when_last_observation_value_is_invalid
    monthly = [
      obs('2025-01-01', '300000'),
      obs('2025-02-01', 'not-a-number')
    ]
    thursdays = thursdays_between(Date.new(2025, 1, 1), Date.new(2025, 2, 28))

    silence_io do
      assert_raises(RuntimeError) do
        HomePriceEnhancer.match_thursday_dates(monthly, thursdays)
      end
    end
  end

  def test_skips_middle_observations_with_invalid_values
    monthly = [
      obs('2025-01-01', '300000'),
      obs('2025-02-01', 'not-a-number'),
      obs('2025-03-01', '320000')
    ]
    thursdays = thursdays_between(Date.new(2025, 1, 1), Date.new(2025, 3, 31))

    result = silence_io { HomePriceEnhancer.match_thursday_dates(monthly, thursdays) }
    assert_equal thursdays.length, result.length

    observed_points = result.select { |r| r['observed'] }
    observed_values = observed_points.map { |r| r['value'].to_f }
    refute_includes observed_values, 0.0, 'invalid observation must not appear as 0.0'
  end

  def test_does_not_corrupt_growth_rate_when_anchor_invalid
    monthly = (1..6).map do |m|
      next obs("2025-0#{m}-01", 'not-a-number') if m == 1 # anchor 6 months back is invalid
      obs("2025-0#{m}-01", (300_000 + m * 1000).to_s)
    end
    thursdays = thursdays_between(Date.new(2025, 1, 1), Date.new(2025, 9, 30))

    result = silence_io { HomePriceEnhancer.match_thursday_dates(monthly, thursdays) }

    extrapolated = result.select { |r| r['estimated'] && r['estimation_method'] == 'trend_only' }
    extrapolated.each do |row|
      assert_in_delta 0.0, row['monthly_growth_rate'], 0.0001,
        "expected 0.0% growth when 6-months-ago anchor is invalid, got #{row['monthly_growth_rate']}"
    end
  end
end
