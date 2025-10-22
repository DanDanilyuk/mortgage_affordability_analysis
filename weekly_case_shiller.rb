#!/usr/bin/env ruby

require 'net/http'
require 'json'
require 'uri'
require 'date'
require 'optparse'

# Configuration constants
LOAN_TERM_MONTHS = 30 * 12
DEFAULT_YEARS_BACK = 10
HOUSEHOLD_MULTIPLIER = 1.4
OUTPUT_FILE = 'weekly_case_shiller_output.json'

# Monthly seasonal factors (will be interpolated to daily)
SEASONAL_FACTORS = {
  1 => -0.10, 2 => -0.10, 3 => -0.05, 4 => 0.00,
  5 => 0.05, 6 => 0.10, 7 => 0.10, 8 => 0.08,
  9 => 0.03, 10 => -0.03, 11 => -0.07, 12 => -0.10
}.freeze

class CLIParser
  def self.parse
    options = {}
    OptionParser.new do |opts|
      opts.banner = "Usage: weekly_case_schiller.rb [options]"
      opts.on("-b", "--bls-api-key KEY", "BLS API Key") { |key| options[:bls_api_key] = key }
      opts.on("-f", "--fred-api-key KEY", "FRED API Key") { |key| options[:fred_api_key] = key }
      opts.on("-s", "--start-date DATE", "Start Date (YYYY-MM-DD)") do |date|
        options[:start_date] = Date.parse(date)
      rescue ArgumentError
        abort "Invalid date format. Use YYYY-MM-DD."
      end
    end.parse!
    options
  end
end

# Daily seasonal price estimator with income trend projection
class DailySeasonalEstimator
  # Calculate daily seasonal factor by interpolating between monthly factors
  def self.daily_seasonal_factor(target_date)
    day_of_year = target_date.yday
    days_in_year = Date.leap?(target_date.year) ? 366 : 365

    # Convert to fractional month position (0-12)
    month_position = (day_of_year.to_f / days_in_year) * 12

    # Get surrounding months
    month_before = month_position.floor
    month_after = month_position.ceil

    # Handle wraparound
    month_before = 12 if month_before == 0
    month_after = 1 if month_after > 12
    month_after = 12 if month_after == 0

    # Get factors
    factor_before = SEASONAL_FACTORS[month_before]
    factor_after = SEASONAL_FACTORS[month_after]

    # Interpolate
    fraction = month_position - month_position.floor
    factor_before + (factor_after - factor_before) * fraction
  end

  # Estimate price for any specific date using daily seasonal factors
  def self.estimate_daily_price(base_price, base_date, target_date)
    base_factor = daily_seasonal_factor(base_date)
    target_factor = daily_seasonal_factor(target_date)

    base_price * (1 + target_factor - base_factor)
  end

  # Linear interpolation for other data
  def self.interpolate(prev_value, next_value, prev_date, next_date, target_date)
    return prev_value if prev_date == target_date
    return next_value if next_date == target_date

    days_diff = (next_date - prev_date).to_i
    target_diff = (target_date - prev_date).to_i
    ratio = target_diff.to_f / days_diff
    prev_value + (next_value - prev_value) * ratio
  end

  # NEW: Estimate weekly income with trend projection for future dates
  def self.estimate_weekly_income(income_data, target_date)
    last_income = income_data.last
    last_income_date = Date.parse(last_income[:date])

    # If target date is within historical range, use interpolation
    if target_date <= last_income_date
      prev_month = income_data.select { |d| Date.parse(d[:date]) <= target_date }.last
      next_month = income_data.find { |d| Date.parse(d[:date]) > target_date }
      return prev_month[:value] unless next_month

      return interpolate(
        prev_month[:value], next_month[:value],
        Date.parse(prev_month[:date]), Date.parse(next_month[:date]),
        target_date
      )
    end

    # NEW: For future dates, project using trend from last two months
    if income_data.length >= 2
      second_last = income_data[-2]
      last = income_data[-1]

      prev_income = second_last[:value]
      current_income = last[:value]

      # Calculate monthly growth rate
      monthly_growth_rate = (current_income - prev_income) / prev_income

      # Calculate how many months ahead we are
      days_ahead = (target_date - last_income_date).to_i
      months_ahead = days_ahead / 30.0

      # Apply exponential growth (compound growth)
      estimated_income = current_income * ((1 + monthly_growth_rate) ** months_ahead)

      return estimated_income
    end

    # Fallback: just use last known income
    last_income[:value]
  end
end

class DataFetcher
  def initialize(bls_key, fred_key, start_date = nil)
    @bls_key = bls_key
    @fred_key = fred_key
    @start_date = start_date || (Date.today - (DEFAULT_YEARS_BACK * 365))
  end

  def fetch_bls_income_data
    uri = URI('https://api.bls.gov/publicAPI/v2/timeseries/data/')
    payload = {
      'seriesid' => ['CES0500000011'],
      'startyear' => @start_date.year.to_s,
      'endyear' => (Date.today.year + 1).to_s,
      'registrationkey' => @bls_key
    }
    response = make_post_request(uri, payload)
    JSON.parse(response.body)
  end

  def fetch_fred_data(series_id, frequency: nil)
    uri = build_fred_uri(series_id, frequency)

    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true
    http.verify_mode = OpenSSL::SSL::VERIFY_NONE # Insecure: Skips all certificate checks

    response = http.get(uri.request_uri)
    JSON.parse(response.body)
  end

  private

  def make_post_request(uri, payload)
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true

    # Quick insecure fix: Disable all SSL verification
    http.verify_mode = OpenSSL::SSL::VERIFY_NONE

    request = Net::HTTP::Post.new(uri.path, { 'Content-Type' => 'application/json' })
    request.body = payload.to_json
    http.request(request)
  end

  def build_fred_uri(series_id, frequency)
    uri = URI('https://api.stlouisfed.org/fred/series/observations')
    params = {
      series_id: series_id,
      api_key: @fred_key,
      file_type: 'json',
      observation_start: @start_date.strftime('%Y-%m-%d'),
      frequency: frequency
    }.compact
    uri.query = URI.encode_www_form(params)
    uri
  end
end

# Extract actual Thursday dates from MORTGAGE30US observations
class MortgageRateEnhancer
  # Get all valid Thursday dates from MORTGAGE30US observations
  def self.extract_thursday_dates(mortgage_weekly)
    valid_dates = []

    mortgage_weekly['observations'].each do |obs|
      next if obs['value'].empty? || obs['value'] == '.'
      valid_dates << Date.parse(obs['date'])
    end

    valid_dates.sort
  end

  # Match mortgage rates to specific Thursday dates
  def self.match_thursday_dates(mortgage_weekly, thursday_dates)
    rates = []

    thursday_dates.each do |thursday|
      rate_obs = mortgage_weekly['observations'].find do |obs|
        Date.parse(obs['date']) == thursday
      end

      if rate_obs && !rate_obs['value'].empty? && rate_obs['value'] != '.'
        rates << {
          'date' => thursday.strftime('%Y-%m-%d'),
          'value' => rate_obs['value'],
          'estimated' => false
        }
      else
        nearest = find_nearest_rate(mortgage_weekly['observations'], thursday)
        rates << {
          'date' => thursday.strftime('%Y-%m-%d'),
          'value' => nearest['value'],
          'estimated' => true
        }
      end
    end

    rates
  end

  def self.find_nearest_rate(observations, target_date)
    valid_obs = observations.select { |o| !o['value'].empty? && o['value'] != '.' }
    valid_obs.min_by { |obs| (Date.parse(obs['date']) - target_date).abs }
  end
end

# Generate Case-Shiller values for MORTGAGE30US Thursday dates
class CaseShillerEnhancer
  # Uses daily seasonal estimation for Thursday dates after last actual data
  def self.match_thursday_dates(monthly_obs, thursday_dates)
    enhanced = []
    last_actual = monthly_obs.last
    last_actual_date = Date.parse(last_actual['date'])
    last_actual_value = last_actual['value'].to_f

    thursday_dates.each do |thursday|
      if thursday <= last_actual_date
        # Use actual monthly data for this period
        monthly_value = find_monthly_value(monthly_obs, thursday)
        enhanced << {
          'date' => thursday.strftime('%Y-%m-%d'),
          'value' => monthly_value.round(3).to_s,
          'estimated' => false
        }
      else
        # Use DAILY seasonal estimation for Thursdays after last data
        estimated_value = DailySeasonalEstimator.estimate_daily_price(
          last_actual_value,
          last_actual_date,
          thursday
        )

        enhanced << {
          'date' => thursday.strftime('%Y-%m-%d'),
          'value' => estimated_value.round(3).to_s,
          'estimated' => true,
          'estimation_method' => 'daily_seasonal'
        }
      end
    end

    enhanced
  end

  def self.find_monthly_value(monthly_obs, target_date)
    match = monthly_obs.find do |obs|
      obs_date = Date.parse(obs['date'])
      obs_date.year == target_date.year && obs_date.month == target_date.month
    end
    match ? match['value'].to_f : monthly_obs.last['value'].to_f
  end
end

class MortgageCalculator
  def self.normalize_income_data(raw_data)
    data = raw_data.dig('Results', 'series', 0, 'data')&.reverse || []
    cutoff_year = Date.today.year - DEFAULT_YEARS_BACK
    cutoff_date = Date.new(cutoff_year, Date.today.month, 1)

    data.filter_map do |entry|
      date = Date.parse("#{entry['year']}-#{entry['periodName']}-01")
      next if date < cutoff_date
      { date: date.to_s, value: entry['value'].to_f }
    end
  end

  def self.calculate_costs(schiller_data, mortgage_data, income_data)
    single_costs, household_costs = [], []

    # Get last income date for tracking estimated income
    last_income_date = Date.parse(income_data.last[:date])

    schiller_data.each_with_index do |schiller_obs, i|
      mortgage_obs = mortgage_data[i]
      next unless mortgage_obs

      date = Date.parse(schiller_obs['date'])

      # NEW: Uses trend projection for future dates
      weekly_income = DailySeasonalEstimator.estimate_weekly_income(income_data, date)
      income_estimated = date > last_income_date

      house_price = schiller_obs['value'].to_f * 1000
      rate = mortgage_obs['value'].to_f / 100.0
      total_cost = calculate_total_mortgage_cost(house_price, rate)

      single_income = weekly_income * 52
      household_income = single_income * HOUSEHOLD_MULTIPLIER

      metadata = {}
      if schiller_obs['estimated'] || mortgage_obs['estimated'] || income_estimated
        metadata[:estimated] = true
        metadata[:estimation_details] = {
          price_estimated: schiller_obs['estimated'],
          rate_estimated: mortgage_obs['estimated'],
          income_estimated: income_estimated
        }
      end

      single_costs << build_cost_entry('single', schiller_obs['date'], total_cost, single_income, house_price, rate * 100, metadata)
      household_costs << build_cost_entry('household', schiller_obs['date'], total_cost, household_income, house_price, rate * 100, metadata)
    end

    [single_costs, household_costs]
  end

  private

  def self.calculate_total_mortgage_cost(price, annual_rate)
    monthly_rate = annual_rate / 12.0
    monthly_payment = (price * monthly_rate) / (1 - (1 + monthly_rate)**(-LOAN_TERM_MONTHS))
    monthly_payment * LOAN_TERM_MONTHS
  end

  def self.build_cost_entry(type, date, total_cost, income, price, rate, metadata = {})
    entry = {
      type: type,
      date: date,
      total_cost: total_cost.to_i,
      "#{type}_income": income.to_i,
      cost_to_income: format('%.2f', (total_cost / income).round(2)),
      schiller_price: price.to_i,
      mortgage_rate: format('%.2f', rate.round(2))
    }
    entry.merge!(metadata) unless metadata.empty?
    entry
  end
end

class WeeklyCaseSchiller
  def run
    options = CLIParser.parse
    fetcher = DataFetcher.new(options[:bls_api_key], options[:fred_api_key], options[:start_date])

    puts "📊 Fetching data from APIs..."

    bls_data = fetcher.fetch_bls_income_data
    income_data = MortgageCalculator.normalize_income_data(bls_data)
    puts "✓ BLS Income data: #{income_data.length} months"

    # Show last two months for trend calculation
    if income_data.length >= 2
      last_two = income_data[-2..-1]
      growth = ((last_two[1][:value] - last_two[0][:value]) / last_two[0][:value] * 100)
      puts "   Last two months: #{last_two[0][:date]} (#{last_two[0][:value]}) → #{last_two[1][:date]} (#{last_two[1][:value]})"
      puts "   Monthly growth rate: #{growth.round(3)}%"
    end

    schiller_monthly = fetcher.fetch_fred_data('CSUSHPINSA')
    puts "✓ Case-Shiller monthly: #{schiller_monthly['observations'].length} observations"

    mortgage_weekly = fetcher.fetch_fred_data('MORTGAGE30US')
    puts "✓ Mortgage rates (weekly): #{mortgage_weekly['observations'].length} observations"

    # Extract actual Thursday dates from MORTGAGE30US
    thursday_dates = MortgageRateEnhancer.extract_thursday_dates(mortgage_weekly)

    puts "\n📅 Using MORTGAGE30US Thursday release dates..."
    puts "   Total Thursdays: #{thursday_dates.length}"
    puts "   First date: #{thursday_dates.first.strftime('%Y-%m-%d')}"
    puts "   Last date: #{thursday_dates.last.strftime('%Y-%m-%d')}"

    # Generate Case-Shiller values for each Thursday using daily seasonal estimation
    schiller_aligned = CaseShillerEnhancer.match_thursday_dates(
      schiller_monthly['observations'],
      thursday_dates
    )
    puts "✓ Case-Shiller (Thursday-aligned): #{schiller_aligned.length} observations"

    # Get mortgage rates for the same Thursday dates
    mortgage_aligned = MortgageRateEnhancer.match_thursday_dates(
      mortgage_weekly,
      thursday_dates
    )
    puts "✓ Mortgage rates (Thursday-aligned): #{mortgage_aligned.length} observations"

    puts "\n🧮 Calculating affordability metrics with income trend projection..."
    single_costs, household_costs = MortgageCalculator.calculate_costs(
      schiller_aligned,
      mortgage_aligned,
      income_data
    )

    estimated_count = single_costs.count { |c| c[:estimated] }
    actual_count = single_costs.length - estimated_count

    # Count how many have estimated income
    income_estimated_count = single_costs.count { |c| c.dig(:estimation_details, :income_estimated) }

    last_actual_schiller = schiller_monthly['observations'].last
    last_actual_date = Date.parse(last_actual_schiller['date'])
    last_income_date = Date.parse(income_data.last[:date])

    output_data = {
      single_costs: single_costs,
      household_costs: household_costs,
      metadata: {
        generated_at: Time.now.iso8601,
        frequency: 'weekly_thursday_aligned',
        date_range: {
          start: single_costs.first[:date],
          end: single_costs.last[:date],
          last_actual_case_shiller: last_actual_date.strftime('%Y-%m-%d'),
          last_actual_income: last_income_date.strftime('%Y-%m-%d')
        },
        counts: {
          total: single_costs.length,
          actual: actual_count,
          estimated: estimated_count,
          income_estimated: income_estimated_count
        },
        data_sources: {
          bls_series: 'CES0500000011',
          fred_schiller: 'CSUSHPINSA',
          fred_mortgage: 'MORTGAGE30US'
        },
        methodology: {
          loan_term_months: LOAN_TERM_MONTHS,
          household_multiplier: HOUSEHOLD_MULTIPLIER,
          case_shiller_estimation: 'Daily seasonal factors interpolated from monthly patterns',
          income_estimation: 'Trend projection using growth rate from last two months of BLS data',
          date_alignment: 'All data points aligned to MORTGAGE30US Thursday release dates'
        },
        seasonal_factors: SEASONAL_FACTORS
      }
    }

    File.write(OUTPUT_FILE, JSON.pretty_generate(output_data))
    puts "\n✅ Data written to #{OUTPUT_FILE}"
    puts "📊 Total: #{single_costs.length} Thursday-aligned data points"
    puts "   - Actual data: #{actual_count} points"
    puts "   - Estimated: #{estimated_count} points"
    puts "     • With estimated income: #{income_estimated_count} points"
    puts "📅 Full range: #{single_costs.first[:date]} to #{single_costs.last[:date]}"
    puts "📈 Last actual Case-Shiller: #{last_actual_date.strftime('%Y-%m-%d')}"
    puts "💰 Last actual Income: #{last_income_date.strftime('%Y-%m-%d')}"
  end
end

WeeklyCaseSchiller.new.run if $PROGRAM_NAME == __FILE__
