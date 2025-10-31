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

class DailyEstimator
  # Simple linear interpolation
  def self.linear_interpolate(v1, v2, d1, d2, target)
    return v1 if d1 == target
    return v2 if d2 == target

    days_diff = (d2 - d1).to_f
    return v1 if days_diff == 0

    target_diff = (target - d1).to_f
    ratio = target_diff / days_diff
    v1 + (v2 - v1) * ratio
  end

  # Cubic Hermite spline interpolation with safety checks
  def self.hermite_interpolate(values, dates, target_date)
    return nil if values.empty? || dates.empty?
    return values.first if dates.length == 1

    # Find the surrounding points
    idx = dates.index { |d| d > target_date }

    if idx.nil?
      # Target is after all dates - use last value
      return values.last
    elsif idx == 0
      # Target is before all dates - use first value
      return values.first
    end

    # We're between idx-1 and idx
    i1 = idx - 1
    i2 = idx

    d1 = dates[i1]
    d2 = dates[i2]
    v1 = values[i1]
    v2 = values[i2]

    # For edge cases or insufficient data, fall back to linear
    if i1 == 0 || i2 == dates.length - 1
      return linear_interpolate(v1, v2, d1, d2, target_date)
    end

    # Get surrounding points for tangent calculation
    i0 = i1 - 1
    i3 = i2 + 1

    d0 = dates[i0]
    d3 = dates[i3]
    v0 = values[i0]
    v3 = values[i3]

    # Calculate normalized position (0 to 1)
    total_days = (d2 - d1).to_f
    return v1 if total_days == 0  # Avoid division by zero

    elapsed_days = (target_date - d1).to_f
    t = elapsed_days / total_days

    # Calculate tangents using central differences
    days_before = (d1 - d0).to_f
    days_after = (d3 - d2).to_f
    days_current = (d2 - d1).to_f

    # Avoid division by zero
    return linear_interpolate(v1, v2, d1, d2, target_date) if days_before == 0 || days_after == 0

    slope_left = (v1 - v0) / days_before
    slope_right = (v2 - v1) / days_current
    m1 = (slope_left + slope_right) / 2.0

    slope_current = (v2 - v1) / days_current
    slope_next = (v3 - v2) / days_after
    m2 = (slope_current + slope_next) / 2.0

    # Hermite basis functions
    t2 = t * t
    t3 = t2 * t
    h00 = 2*t3 - 3*t2 + 1
    h10 = t3 - 2*t2 + t
    h01 = -2*t3 + 3*t2
    h11 = t3 - t2

    # Calculate interpolated value
    result = v1 * h00 + m1 * total_days * h10 + v2 * h01 + m2 * total_days * h11

    # Safety check for NaN
    if result.nan? || result.infinite?
      return linear_interpolate(v1, v2, d1, d2, target_date)
    end

    result
  end

  # Estimate price with trend
  def self.estimate_price_with_trend(base_price, base_date, target_date, monthly_growth_rate = 0.0)
    days_elapsed = (target_date - base_date).to_i
    daily_growth_rate = (1 + monthly_growth_rate) ** (1.0 / 30.0) - 1
    trend_multiplier = (1 + daily_growth_rate) ** days_elapsed
    base_price * trend_multiplier
  end

  # Estimate weekly income
  def self.estimate_weekly_income(income_data, target_date)
    last_income = income_data.last
    last_income_date = Date.parse(last_income[:date])

    if target_date <= last_income_date
      # Use hermite interpolation for smooth curves
      dates = income_data.map { |d| Date.parse(d[:date]) }
      values = income_data.map { |d| d[:value] }
      result = hermite_interpolate(values, dates, target_date)
      return result if result

      # Fallback to simple logic
      prev_month = income_data.select { |d| Date.parse(d[:date]) <= target_date }.last
      return prev_month[:value] if prev_month
      return income_data.first[:value]
    end

    if income_data.length >= 2
      second_last = income_data[-2]
      last = income_data[-1]
      prev_income = second_last[:value]
      current_income = last[:value]
      monthly_growth_rate = (current_income - prev_income) / prev_income
      days_ahead = (target_date - last_income_date).to_i
      months_ahead = days_ahead / 30.0
      estimated_income = current_income * ((1 + monthly_growth_rate) ** months_ahead)
      return estimated_income
    end

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
    http.verify_mode = OpenSSL::SSL::VERIFY_NONE
    response = http.get(uri.request_uri)
    JSON.parse(response.body)
  end

  private

  def make_post_request(uri, payload)
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true
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

class MortgageRateEnhancer
  def self.extract_thursday_dates(mortgage_weekly)
    valid_dates = []
    mortgage_weekly['observations'].each do |obs|
      next if obs['value'].empty? || obs['value'] == '.'
      valid_dates << Date.parse(obs['date'])
    end
    valid_dates.sort
  end

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

class HomePriceEnhancer
  def self.match_thursday_dates(monthly_obs, thursday_dates)
    enhanced = []

    last_actual = monthly_obs.last
    last_actual_date = Date.parse(last_actual['date'])
    last_actual_value = last_actual['value'].to_f
    last_actual_year = last_actual_date.year
    last_actual_month = last_actual_date.month
    last_actual_end = Date.new(last_actual_year, last_actual_month, -1)

    # Calculate monthly growth rate from last 6 months
    monthly_growth_rate = 0.0
    if monthly_obs.length >= 6
      six_months_ago = monthly_obs[-6]
      current = monthly_obs[-1]
      months_diff = 5
      six_ago_value = six_months_ago['value'].to_f
      current_value = current['value'].to_f
      total_growth = (current_value - six_ago_value) / six_ago_value
      monthly_growth_rate = ((1 + total_growth) ** (1.0 / months_diff)) - 1
    end

    # Prepare control points for interpolation (use first day of each month)
    control_dates = []
    control_values = []

    monthly_obs.each do |obs|
      obs_date = Date.parse(obs['date'])
      control_point = Date.new(obs_date.year, obs_date.month, 1)
      control_dates << control_point
      control_values << obs['value'].to_f
    end

    thursday_dates.each do |thursday|
      if thursday <= last_actual_end
        # Use Hermite interpolation for smooth curves
        interpolated_value = DailyEstimator.hermite_interpolate(
          control_values,
          control_dates,
          thursday
        )

        # Safety fallback if interpolation fails
        if interpolated_value.nil? || interpolated_value.nan? || interpolated_value.infinite?
          # Find closest month value
          closest_month = control_dates.each_with_index.min_by { |d, i| (d - thursday).abs }
          interpolated_value = control_values[closest_month[1]]
        end

        enhanced << {
          'date' => thursday.strftime('%Y-%m-%d'),
          'value' => interpolated_value.round(3).to_s,
          'estimated' => false,
          'interpolated' => true
        }
      else
        # Estimate future values using trend only
        estimated_value = DailyEstimator.estimate_price_with_trend(
          last_actual_value,
          last_actual_date,
          thursday,
          monthly_growth_rate
        )

        enhanced << {
          'date' => thursday.strftime('%Y-%m-%d'),
          'value' => estimated_value.round(3).to_s,
          'estimated' => true,
          'price_estimated' => true,
          'estimation_method' => 'trend_only',
          'monthly_growth_rate' => (monthly_growth_rate * 100).round(4)
        }
      end
    end

    enhanced
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

  def self.calculate_costs(home_price_data, mortgage_data, income_data)
    single_costs, household_costs = [], []
    last_income_date = Date.parse(income_data.last[:date])

    home_price_data.each_with_index do |home_price_obs, i|
      mortgage_obs = mortgage_data[i]
      next unless mortgage_obs

      date = Date.parse(home_price_obs['date'])
      weekly_income = DailyEstimator.estimate_weekly_income(income_data, date)
      income_estimated = date > last_income_date

      house_price = home_price_obs['value'].to_f

      # Safety check for NaN values
      if house_price.nan? || house_price.infinite? || house_price <= 0
        puts "⚠️  Warning: Invalid house price for #{date}, skipping"
        next
      end

      rate = mortgage_obs['value'].to_f / 100.0
      total_cost = calculate_total_mortgage_cost(house_price, rate)

      single_income = weekly_income * 52
      household_income = single_income * HOUSEHOLD_MULTIPLIER

      metadata = {}
      if home_price_obs['estimated'] || mortgage_obs['estimated'] || income_estimated
        metadata[:estimated] = true
        metadata[:estimation_details] = {
          price_estimated: home_price_obs['estimated'] || false,
          rate_estimated: mortgage_obs['estimated'],
          income_estimated: income_estimated
        }
      end

      single_costs << build_cost_entry('single', home_price_obs['date'], total_cost, single_income, house_price, rate * 100, metadata)
      household_costs << build_cost_entry('household', home_price_obs['date'], total_cost, household_income, house_price, rate * 100, metadata)
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
      home_price: price.to_i,
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

    if income_data.length >= 2
      last_two = income_data[-2..-1]
      growth = ((last_two[1][:value] - last_two[0][:value]) / last_two[0][:value] * 100)
      puts "  Last two months: #{last_two[0][:date]} (#{last_two[0][:value]}) → #{last_two[1][:date]} (#{last_two[1][:value]})"
      puts "  Monthly growth rate: #{growth.round(3)}%"
    end

    home_price_monthly = fetcher.fetch_fred_data('USAUCSFRCONDOSMSAMID')
    puts "✓ Home Price monthly: #{home_price_monthly['observations'].length} observations"

    if home_price_monthly['observations'].length >= 6
      last_six = home_price_monthly['observations'][-6..-1]
      first_val = last_six[0]['value'].to_f
      last_val = last_six[-1]['value'].to_f
      growth = ((last_val - first_val) / first_val * 100)
      avg_monthly = ((1 + growth/100) ** (1.0/5) - 1) * 100
      puts "  Last 6 months growth: #{growth.round(3)}% total, #{avg_monthly.round(3)}% avg/month"
    end

    mortgage_weekly = fetcher.fetch_fred_data('MORTGAGE30US')
    puts "✓ Mortgage rates (weekly): #{mortgage_weekly['observations'].length} observations"

    thursday_dates = MortgageRateEnhancer.extract_thursday_dates(mortgage_weekly)
    puts "\n📅 Using MORTGAGE30US Thursday release dates..."
    puts "  Total Thursdays: #{thursday_dates.length}"
    puts "  First date: #{thursday_dates.first.strftime('%Y-%m-%d')}"
    puts "  Last date: #{thursday_dates.last.strftime('%Y-%m-%d')}"

    home_price_aligned = HomePriceEnhancer.match_thursday_dates(
      home_price_monthly['observations'],
      thursday_dates
    )
    puts "✓ Home Price (Thursday-aligned): #{home_price_aligned.length} observations"

    mortgage_aligned = MortgageRateEnhancer.match_thursday_dates(
      mortgage_weekly,
      thursday_dates
    )
    puts "✓ Mortgage rates (Thursday-aligned): #{mortgage_aligned.length} observations"

    puts "\n🧮 Calculating affordability metrics..."

    single_costs, household_costs = MortgageCalculator.calculate_costs(
      home_price_aligned,
      mortgage_aligned,
      income_data
    )

    estimated_count = single_costs.count { |c| c[:estimated] }
    actual_count = single_costs.length - estimated_count
    income_estimated_count = single_costs.count { |c| c.dig(:estimation_details, :income_estimated) }

    last_actual_home_price = home_price_monthly['observations'].last
    last_actual_date = Date.parse(last_actual_home_price['date'])
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
          last_actual_home_price: last_actual_date.strftime('%Y-%m-%d'),
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
          fred_home_price: 'USAUCSFRCONDOSMSAMID',
          fred_mortgage: 'MORTGAGE30US'
        },
        methodology: {
          loan_term_months: LOAN_TERM_MONTHS,
          household_multiplier: HOUSEHOLD_MULTIPLIER,
          home_price_estimation: 'Trend-only estimation based on 6-month growth rate',
          home_price_interpolation: 'Cubic Hermite spline through monthly averages with linear fallback',
          income_estimation: 'Hermite spline interpolation with trend projection',
          date_alignment: 'All data points aligned to MORTGAGE30US Thursday release dates',
          note: 'Smooth curves through monthly data with safety checks for edge cases'
        }
      }
    }

    File.write(OUTPUT_FILE, JSON.pretty_generate(output_data))

    puts "\n✅ Data written to #{OUTPUT_FILE}"
    puts "📊 Total: #{single_costs.length} Thursday-aligned data points"
    puts "  - Actual data: #{actual_count} points"
    puts "  - Estimated: #{estimated_count} points"
    puts "    • With estimated income: #{income_estimated_count} points"
    puts "📅 Full range: #{single_costs.first[:date]} to #{single_costs.last[:date]}"
    puts "📈 Last actual Home Price: #{last_actual_date.strftime('%Y-%m-%d')}"
    puts "💰 Last actual Income: #{last_income_date.strftime('%Y-%m-%d')}"
  end
end

WeeklyCaseSchiller.new.run if $PROGRAM_NAME == __FILE__
