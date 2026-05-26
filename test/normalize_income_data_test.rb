require_relative 'test_helper'

class NormalizeIncomeDataTest < Minitest::Test
  def build_raw(entries)
    { 'Results' => { 'series' => [{ 'data' => entries }] } }
  end

  def silence_io
    original_stdout = $stdout
    original_stderr = $stderr
    $stdout = StringIO.new
    $stderr = StringIO.new
    yield
  ensure
    $stdout = original_stdout
    $stderr = original_stderr
  end

  def monthly(year, m_code, name, value)
    { 'year' => year.to_s, 'period' => m_code, 'periodName' => name, 'value' => value }
  end

  def test_returns_entries_in_chronological_order
    year = Date.today.year
    raw = build_raw([
      monthly(year, 'M03', 'March',    '1300.00'),
      monthly(year, 'M02', 'February', '1200.00'),
      monthly(year, 'M01', 'January',  '1100.00')
    ])

    result = MortgageCalculator.normalize_income_data(raw)
    assert_equal 3, result.length
    assert_equal "#{year}-01-01", result.first[:date]
    assert_equal "#{year}-03-01", result.last[:date]
    assert_in_delta 1100.0, result.first[:value]
    assert_in_delta 1300.0, result.last[:value]
  end

  def test_skips_annual_average_entries
    year = Date.today.year
    raw = build_raw([
      monthly(year, 'M13', 'Annual',  '1200.00'),
      monthly(year, 'M01', 'January', '1100.00')
    ])

    result = silence_io { MortgageCalculator.normalize_income_data(raw) }
    assert_equal 1, result.length
    assert_equal "#{year}-01-01", result.first[:date]
  end

  def test_skips_entries_with_malformed_period_code
    year = Date.today.year
    raw = build_raw([
      monthly(year, 'NotAPeriod', 'January', '1200.00'),
      monthly(year, 'M01',        'January', '1100.00')
    ])

    result = silence_io { MortgageCalculator.normalize_income_data(raw) }
    assert_equal 1, result.length
  end

  def test_skips_entries_with_nil_period
    year = Date.today.year
    raw = build_raw([
      { 'year' => year.to_s, 'period' => nil,   'periodName' => 'February', 'value' => '1200.00' },
      monthly(year, 'M01', 'January', '1100.00')
    ])

    result = silence_io { MortgageCalculator.normalize_income_data(raw) }
    assert_equal 1, result.length
  end

  def test_skips_entries_with_invalid_year
    raw = build_raw([
      monthly('not-a-year', 'M02', 'February', '1200.00'),
      monthly(Date.today.year, 'M01', 'January', '1100.00')
    ])

    result = silence_io { MortgageCalculator.normalize_income_data(raw) }
    assert_equal 1, result.length
  end

  def test_skips_entries_with_invalid_value
    year = Date.today.year
    raw = build_raw([
      monthly(year, 'M02', 'February', 'not-a-number'),
      monthly(year, 'M01', 'January',  '1100.00')
    ])

    result = silence_io { MortgageCalculator.normalize_income_data(raw) }
    assert_equal 1, result.length
    assert_in_delta 1100.0, result.first[:value]
  end

  def test_skips_zero_padded_invalid_months
    year = Date.today.year
    raw = build_raw([
      monthly(year, 'M00', 'Invalid', '1200.00'),
      monthly(year, 'M14', 'Invalid', '1300.00'),
      monthly(year, 'M01', 'January', '1100.00')
    ])

    result = silence_io { MortgageCalculator.normalize_income_data(raw) }
    assert_equal 1, result.length
  end

  def test_returns_empty_array_when_results_missing
    assert_equal [], MortgageCalculator.normalize_income_data({})
    assert_equal [], MortgageCalculator.normalize_income_data({ 'Results' => {} })
    assert_equal [], MortgageCalculator.normalize_income_data({ 'Results' => { 'series' => [] } })
  end
end
