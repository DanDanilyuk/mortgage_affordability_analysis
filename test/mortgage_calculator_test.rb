require_relative 'test_helper'
require 'stringio'

# Covers MortgageCalculator hardening:
#   calculate_total_mortgage_cost - zero-rate special case (B2)
#   calculate_costs               - skips bad income (B1), bad rate (B2), bad price; never emits Inf/NaN
#   nearest_cpi                   - empty + most-recent-on-or-before lookup
class MortgageCalculatorTest < Minitest::Test
  NUMERIC_RATIO = /\A\d+\.\d{2}\z/

  def silence_io
    original_stdout = $stdout
    $stdout = StringIO.new
    yield
  ensure
    $stdout = original_stdout
  end

  def hp(date, value, observed: nil, estimated: nil)
    h = { 'date' => date, 'value' => value }
    h['observed'] = observed unless observed.nil?
    h['estimated'] = estimated unless estimated.nil?
    h
  end

  def rate(value, estimated: false)
    { 'value' => value, 'estimated' => estimated }
  end

  def income(date, value)
    { date: date, value: value }
  end

  # ---- calculate_total_mortgage_cost (B2) ------------------------------------

  def test_total_cost_nonzero_rate_exceeds_principal
    total = MortgageCalculator.calculate_total_mortgage_cost(300_000.0, 0.06)
    assert total > 300_000.0,
      "30yr amortized total should exceed principal, got #{total}"
  end

  def test_total_cost_zero_rate_returns_principal_exactly
    assert_equal 300_000.0,
                 MortgageCalculator.calculate_total_mortgage_cost(300_000.0, 0.0)
  end

  def test_total_cost_zero_rate_is_finite_not_nan
    total = MortgageCalculator.calculate_total_mortgage_cost(250_000, 0.0)
    assert total.finite?
    assert_in_delta 250_000.0, total, 0.001
  end

  # ---- calculate_costs happy path --------------------------------------------

  def test_normal_row_produces_well_formed_entry
    income_data = [income('2023-12-01', 1200.0), income('2024-02-01', 1250.0)]
    homes = [hp('2024-01-04', '400000', observed: true)]
    rates = [rate('6.5')]

    single, household = silence_io do
      MortgageCalculator.calculate_costs(homes, rates, income_data)
    end

    assert_equal 1, single.length
    assert_equal 1, household.length

    entry = single.first
    assert_match NUMERIC_RATIO, entry[:cost_to_income]
    assert_equal 400_000, entry[:home_price]
    assert_equal '6.50', entry[:mortgage_rate]
    assert_equal true, entry[:observed]
    refute entry.key?(:estimated), 'a fully-observed row should not be flagged estimated'
    assert entry[:single_income] > 0

    # household income is 1.4x single, so its ratio is lower.
    assert household.first[:household_income] > entry[:single_income]
  end

  # ---- calculate_costs guards ------------------------------------------------

  def test_skips_rows_with_zero_or_negative_rate
    income_data = [income('2023-12-01', 1200.0), income('2024-02-01', 1250.0)]
    homes = [hp('2024-01-04', '400000'), hp('2024-01-11', '400000'), hp('2024-01-18', '400000')]
    rates = [rate('0'), rate('-2'), rate('6.5')]

    single, = silence_io { MortgageCalculator.calculate_costs(homes, rates, income_data) }
    # only the third row (valid 6.5 rate) survives
    assert_equal 1, single.length
  end

  def test_skips_rows_with_invalid_price
    income_data = [income('2023-12-01', 1200.0), income('2024-02-01', 1250.0)]
    homes = [hp('2024-01-04', '0'), hp('2024-01-11', '-100'), hp('2024-01-18', 'N/A'),
             hp('2024-01-25', '400000')]
    rates = [rate('6.5'), rate('6.5'), rate('6.5'), rate('6.5')]

    single, = silence_io { MortgageCalculator.calculate_costs(homes, rates, income_data) }
    assert_equal 1, single.length
  end

  def test_skips_all_rows_when_income_is_zero
    # B1: zero income would make cost_to_income "Inf" - must skip instead.
    income_data = [income('2024-01-01', 0.0), income('2024-02-01', 0.0)]
    homes = [hp('2024-01-15', '400000')]
    rates = [rate('6.5')]

    single, household = silence_io { MortgageCalculator.calculate_costs(homes, rates, income_data) }
    assert_empty single
    assert_empty household
  end

  def test_skips_all_rows_when_income_is_negative
    income_data = [income('2024-01-01', -50.0), income('2024-02-01', -60.0)]
    homes = [hp('2024-01-15', '400000')]
    rates = [rate('6.5')]

    single, = silence_io { MortgageCalculator.calculate_costs(homes, rates, income_data) }
    assert_empty single
  end

  def test_skips_row_when_mortgage_obs_is_nil
    income_data = [income('2023-12-01', 1200.0), income('2024-02-01', 1250.0)]
    homes = [hp('2024-01-04', '400000')]
    rates = [nil]

    single, = silence_io { MortgageCalculator.calculate_costs(homes, rates, income_data) }
    assert_empty single
  end

  def test_mixed_bad_rows_never_emit_inf_or_nan_and_do_not_raise
    income_data = [income('2024-01-01', 1200.0), income('2024-03-01', 1300.0)]
    homes = [
      hp('2024-01-04', '400000', observed: true), # good
      hp('2024-01-11', '400000'),                 # zero rate
      hp('2024-01-18', '400000'),                 # negative rate
      hp('2024-01-25', '0'),                       # zero price
      hp('2024-02-01', '-100'),                    # negative price
      hp('2024-02-08', 'N/A'),                     # malformed price
      hp('2024-02-15', '400000'),                  # malformed rate
      hp('2024-02-22', '400000')                   # nil mortgage obs
    ]
    rates = [rate('6.5'), rate('0'), rate('-2'), rate('6.5'), rate('6.5'),
             rate('6.5'), rate('N/A'), nil]

    single, household = silence_io { MortgageCalculator.calculate_costs(homes, rates, income_data) }

    # exactly one good row survives
    assert_equal 1, single.length
    assert_equal 1, household.length

    (single + household).each do |entry|
      assert_match NUMERIC_RATIO, entry[:cost_to_income],
        "cost_to_income must be a plain decimal, got #{entry[:cost_to_income].inspect}"
      refute_includes %w[Inf -Inf NaN], entry[:cost_to_income]
    end
  end

  # ---- nearest_cpi -----------------------------------------------------------

  def cpi(date, value)
    { date: date, value: value }
  end

  def test_nearest_cpi_empty_returns_nil
    assert_nil MortgageCalculator.nearest_cpi([], Date.new(2024, 1, 1))
  end

  def test_nearest_cpi_picks_most_recent_on_or_before_target
    obs = [cpi(Date.new(2024, 1, 1), 300.0),
           cpi(Date.new(2024, 2, 1), 310.0),
           cpi(Date.new(2024, 3, 1), 320.0)]
    assert_equal 310.0, MortgageCalculator.nearest_cpi(obs, Date.new(2024, 2, 15))
    assert_equal 320.0, MortgageCalculator.nearest_cpi(obs, Date.new(2024, 3, 1))
  end

  def test_nearest_cpi_returns_nil_when_target_before_all
    obs = [cpi(Date.new(2024, 1, 1), 300.0)]
    assert_nil MortgageCalculator.nearest_cpi(obs, Date.new(2023, 12, 1))
  end
end
