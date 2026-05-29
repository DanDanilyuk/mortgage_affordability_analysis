require_relative 'test_helper'
require 'stringio'

# Covers QCEWFetcher.parse_multipliers - the pure CSV -> multipliers transform.
class QCEWFetcherTest < Minitest::Test
  def silence_io
    original_stdout = $stdout
    $stdout = StringIO.new
    yield
  ensure
    $stdout = original_stdout
  end

  # own_code 5 = private sector; area_fips US000 = national, 06000 = CA, 48000 = TX.
  def sample_csv
    <<~CSV
      own_code,area_fips,annual_avg_wkly_wage
      5,US000,1000
      5,06000,1250
      5,48000,800
      1,US000,9999
    CSV
  end

  def test_computes_state_to_national_ratios
    result = silence_io { QCEWFetcher.parse_multipliers(sample_csv, 2024) }
    refute_nil result

    assert_equal 1.0, result['US'][:value]
    assert_equal 'qcew_2024', result['US'][:source]

    assert_in_delta 1.25, result['CA'][:value]
    assert_equal 'qcew_2024', result['CA'][:source]

    assert_in_delta 0.8, result['TX'][:value]
    assert_equal 'qcew_2024', result['TX'][:source]
  end

  def test_ignores_non_private_sector_rows
    # The own_code 1 row for US000 (wage 9999) must not become the national base;
    # otherwise CA's ratio would be 1250/9999, not 1250/1000.
    result = silence_io { QCEWFetcher.parse_multipliers(sample_csv, 2024) }
    assert_in_delta 1.25, result['CA'][:value]
  end

  def test_missing_states_fall_back_to_one_with_marker
    result = silence_io { QCEWFetcher.parse_multipliers(sample_csv, 2024) }
    # NY is absent from the CSV -> filled with 1.0 / fallback_missing.
    assert_equal 1.0, result['NY'][:value]
    assert_equal 'fallback_missing', result['NY'][:source]
  end

  def test_returns_a_multiplier_for_every_known_state
    result = silence_io { QCEWFetcher.parse_multipliers(sample_csv, 2024) }
    STATE_FIPS.each_key do |code|
      assert result.key?(code), "expected multiplier for #{code}"
    end
  end

  def test_returns_nil_when_no_national_wage
    csv = "own_code,area_fips,annual_avg_wkly_wage\n5,06000,1250\n"
    assert_nil silence_io { QCEWFetcher.parse_multipliers(csv, 2024) }
  end

  def test_skips_rows_with_unparseable_wage
    csv = <<~CSV
      own_code,area_fips,annual_avg_wkly_wage
      5,US000,1000
      5,06000,N/A
    CSV
    result = silence_io { QCEWFetcher.parse_multipliers(csv, 2024) }
    # CA wage was unparseable -> CA falls back to 1.0/fallback_missing rather than crashing.
    assert_equal 1.0, result['CA'][:value]
    assert_equal 'fallback_missing', result['CA'][:source]
  end

  def test_default_multipliers_marks_every_state_unavailable
    result = QCEWFetcher.default_multipliers
    assert_equal 1.0, result['CA'][:value]
    assert_equal 'fallback_unavailable', result['CA'][:source]
    STATE_FIPS.each_key { |code| assert result.key?(code) }
  end
end
