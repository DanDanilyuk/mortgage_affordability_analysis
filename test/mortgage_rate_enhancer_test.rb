require_relative 'test_helper'
require 'stringio'

# B3: a FRED `null` (nil) observation value must not crash MortgageRateEnhancer.
# Before the fix, nil.empty? raised NoMethodError at the top level (outside the
# per-state rescue), aborting the whole run.
class MortgageRateEnhancerTest < Minitest::Test
  def silence_io
    original_stdout = $stdout
    $stdout = StringIO.new
    yield
  ensure
    $stdout = original_stdout
  end

  # observations array containing a nil value, a "." placeholder and an empty string
  def weekly
    { 'observations' => [
      { 'date' => '2024-01-04', 'value' => '6.5' },
      { 'date' => '2024-01-11', 'value' => nil },   # FRED null
      { 'date' => '2024-01-18', 'value' => '.' },   # FRED placeholder
      { 'date' => '2024-01-25', 'value' => '' },    # blank
      { 'date' => '2024-02-01', 'value' => '6.7' }
    ] }
  end

  def test_extract_thursday_dates_skips_nil_without_raising
    dates = nil
    dates = MortgageRateEnhancer.extract_thursday_dates(weekly)
    assert_equal 2, dates.length
    assert_includes dates, Date.new(2024, 1, 4)
    assert_includes dates, Date.new(2024, 2, 1)
  end

  def test_find_nearest_rate_ignores_nil_values_without_raising
    nearest = MortgageRateEnhancer.find_nearest_rate(weekly['observations'], Date.new(2024, 1, 12))
    refute_nil nearest
    # nearest valid observation to Jan 12 is the Jan 4 reading (8 days) - the nil
    # Jan 11 reading is closer but invalid and must be filtered out.
    assert_equal '6.5', nearest['value']
  end

  def test_match_thursday_dates_direct_matches_do_not_raise
    thursdays = MortgageRateEnhancer.extract_thursday_dates(weekly)
    result = silence_io { MortgageRateEnhancer.match_thursday_dates(weekly, thursdays) }
    assert_equal 2, result.length
    assert_equal '6.5', result[0]['value']
    assert_equal false, result[0]['estimated']
    assert_equal '6.7', result[1]['value']
  end

  def test_match_thursday_dates_nearest_fill_with_nil_present_does_not_raise
    # A Thursday with no exact observation forces the find_nearest_rate path,
    # which must tolerate the nil-valued observation in the array.
    thursdays = [Date.new(2024, 1, 12)]
    result = silence_io { MortgageRateEnhancer.match_thursday_dates(weekly, thursdays) }
    assert_equal 1, result.length
    assert_equal '6.5', result[0]['value']        # nearest valid reading
    assert_equal true, result[0]['estimated']
    assert_equal 8, result[0]['rate_gap_days']
  end
end
