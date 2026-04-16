#!/usr/bin/env ruby

require 'net/http'
require 'json'
require 'csv'
require 'uri'
require 'date'
require 'optparse'
require 'fileutils'

# Configuration constants
LOAN_TERM_MONTHS = 30 * 12
DEFAULT_YEARS_BACK = 10
# Ratio applied to single-earner income to model a dual-income household.
# 1.4 approximates 1.0 primary earner + 0.4 part-time/secondary earner,
# consistent with BLS data on household income vs individual wages.
HOUSEHOLD_MULTIPLIER = 1.4
MAX_RATE_GAP_DAYS = 14
OUTPUT_FILE = 'weekly_case_shiller_output.json'
STATE_DATA_DIR = 'data'

# Single source of truth for all state metadata.
# STATE_FRED_SERIES / STATE_NAMES / STATE_FIPS are derived below for callsite compatibility.
STATES = {
  'US' => { name: 'United States',        fred: 'USAUCSFRCONDOSMSAMID', fips: 'US000' },
  'AL' => { name: 'Alabama',              fred: 'ALUCSFRCONDOSMSAMID',  fips: '01000' },
  'AK' => { name: 'Alaska',               fred: 'AKUCSFRCONDOSMSAMID',  fips: '02000' },
  'AZ' => { name: 'Arizona',              fred: 'AZUCSFRCONDOSMSAMID',  fips: '04000' },
  'AR' => { name: 'Arkansas',             fred: 'ARUCSFRCONDOSMSAMID',  fips: '05000' },
  'CA' => { name: 'California',           fred: 'CAUCSFRCONDOSMSAMID',  fips: '06000' },
  'CO' => { name: 'Colorado',             fred: 'COUCSFRCONDOSMSAMID',  fips: '08000' },
  'CT' => { name: 'Connecticut',          fred: 'CTUCSFRCONDOSMSAMID',  fips: '09000' },
  'DE' => { name: 'Delaware',             fred: 'DEUCSFRCONDOSMSAMID',  fips: '10000' },
  'DC' => { name: 'District of Columbia', fred: 'DCUCSFRCONDOSMSAMID',  fips: '11000' },
  'FL' => { name: 'Florida',              fred: 'FLUCSFRCONDOSMSAMID',  fips: '12000' },
  'GA' => { name: 'Georgia',              fred: 'GAUCSFRCONDOSMSAMID',  fips: '13000' },
  'HI' => { name: 'Hawaii',               fred: 'HIUCSFRCONDOSMSAMID',  fips: '15000' },
  'ID' => { name: 'Idaho',                fred: 'IDUCSFRCONDOSMSAMID',  fips: '16000' },
  'IL' => { name: 'Illinois',             fred: 'ILUCSFRCONDOSMSAMID',  fips: '17000' },
  'IN' => { name: 'Indiana',              fred: 'INUCSFRCONDOSMSAMID',  fips: '18000' },
  'IA' => { name: 'Iowa',                 fred: 'IAUCSFRCONDOSMSAMID',  fips: '19000' },
  'KS' => { name: 'Kansas',               fred: 'KSUCSFRCONDOSMSAMID',  fips: '20000' },
  'KY' => { name: 'Kentucky',             fred: 'KYUCSFRCONDOSMSAMID',  fips: '21000' },
  'LA' => { name: 'Louisiana',            fred: 'LAUCSFRCONDOSMSAMID',  fips: '22000' },
  'ME' => { name: 'Maine',                fred: 'MEUCSFRCONDOSMSAMID',  fips: '23000' },
  'MD' => { name: 'Maryland',             fred: 'MDUCSFRCONDOSMSAMID',  fips: '24000' },
  'MA' => { name: 'Massachusetts',        fred: 'MAUCSFRCONDOSMSAMID',  fips: '25000' },
  'MI' => { name: 'Michigan',             fred: 'MIUCSFRCONDOSMSAMID',  fips: '26000' },
  'MN' => { name: 'Minnesota',            fred: 'MNUCSFRCONDOSMSAMID',  fips: '27000' },
  'MS' => { name: 'Mississippi',          fred: 'MSUCSFRCONDOSMSAMID',  fips: '28000' },
  'MO' => { name: 'Missouri',             fred: 'MOUCSFRCONDOSMSAMID',  fips: '29000' },
  'MT' => { name: 'Montana',              fred: 'MTUCSFRCONDOSMSAMID',  fips: '30000' },
  'NE' => { name: 'Nebraska',             fred: 'NEUCSFRCONDOSMSAMID',  fips: '31000' },
  'NV' => { name: 'Nevada',               fred: 'NVUCSFRCONDOSMSAMID',  fips: '32000' },
  'NH' => { name: 'New Hampshire',        fred: 'NHUCSFRCONDOSMSAMID',  fips: '33000' },
  'NJ' => { name: 'New Jersey',           fred: 'NJUCSFRCONDOSMSAMID',  fips: '34000' },
  'NM' => { name: 'New Mexico',           fred: 'NMUCSFRCONDOSMSAMID',  fips: '35000' },
  'NY' => { name: 'New York',             fred: 'NYUCSFRCONDOSMSAMID',  fips: '36000' },
  'NC' => { name: 'North Carolina',       fred: 'NCUCSFRCONDOSMSAMID',  fips: '37000' },
  'ND' => { name: 'North Dakota',         fred: 'NDUCSFRCONDOSMSAMID',  fips: '38000' },
  'OH' => { name: 'Ohio',                 fred: 'OHUCSFRCONDOSMSAMID',  fips: '39000' },
  'OK' => { name: 'Oklahoma',             fred: 'OKUCSFRCONDOSMSAMID',  fips: '40000' },
  'OR' => { name: 'Oregon',               fred: 'ORUCSFRCONDOSMSAMID',  fips: '41000' },
  'PA' => { name: 'Pennsylvania',         fred: 'PAUCSFRCONDOSMSAMID',  fips: '42000' },
  'RI' => { name: 'Rhode Island',         fred: 'RIUCSFRCONDOSMSAMID',  fips: '44000' },
  'SC' => { name: 'South Carolina',       fred: 'SCUCSFRCONDOSMSAMID',  fips: '45000' },
  'SD' => { name: 'South Dakota',         fred: 'SDUCSFRCONDOSMSAMID',  fips: '46000' },
  'TN' => { name: 'Tennessee',            fred: 'TNUCSFRCONDOSMSAMID',  fips: '47000' },
  'TX' => { name: 'Texas',                fred: 'TXUCSFRCONDOSMSAMID',  fips: '48000' },
  'UT' => { name: 'Utah',                 fred: 'UTUCSFRCONDOSMSAMID',  fips: '49000' },
  'VT' => { name: 'Vermont',              fred: 'VTUCSFRCONDOSMSAMID',  fips: '50000' },
  'VA' => { name: 'Virginia',             fred: 'VAUCSFRCONDOSMSAMID',  fips: '51000' },
  'WA' => { name: 'Washington',           fred: 'WAUCSFRCONDOSMSAMID',  fips: '53000' },
  'WV' => { name: 'West Virginia',        fred: 'WVUCSFRCONDOSMSAMID',  fips: '54000' },
  'WI' => { name: 'Wisconsin',            fred: 'WIUCSFRCONDOSMSAMID',  fips: '55000' },
  'WY' => { name: 'Wyoming',              fred: 'WYUCSFRCONDOSMSAMID',  fips: '56000' },
}.freeze

STATE_FRED_SERIES = STATES.transform_values { |v| v[:fred] }.freeze
STATE_NAMES       = STATES.transform_values { |v| v[:name] }.freeze
STATE_FIPS        = STATES.transform_values { |v| v[:fips] }.freeze

def sanitize_for_log(str)
  str.to_s
     .gsub(/([?&]api_key=)[^&\s"]+/i, '\1[REDACTED]')
     .gsub(/"registrationkey"\s*=>\s*"[^"]+"/, '"registrationkey"=>"[REDACTED]"')
end

def strict_float(str, field_name = nil)
  return nil if str.nil? || str.to_s.strip.empty? || str.to_s.strip == '.'
  Float(str)
rescue ArgumentError, TypeError
  label = field_name ? " (#{field_name})" : ''
  puts "⚠️  Warning: malformed numeric value#{label}: #{str.inspect}"
  nil
end

class CLIParser
  def self.parse
    options = {}
    OptionParser.new do |opts|
      opts.banner = "Usage: weekly_case_shiller.rb [options]"
      opts.on("-b", "--bls-api-key KEY", "BLS API Key") { |key| options[:bls_api_key] = key }
      opts.on("-f", "--fred-api-key KEY", "FRED API Key") { |key| options[:fred_api_key] = key }
      opts.on("-s", "--start-date DATE", "Start Date (YYYY-MM-DD)") do |date|
        options[:start_date] = Date.parse(date)
      rescue ArgumentError
        abort "Invalid date format. Use YYYY-MM-DD."
      end
      opts.on("--state STATE", "Generate data for a specific state only (e.g., CA)") do |st|
        st = st.upcase
        abort "Unknown state code: #{st}" unless STATE_FRED_SERIES.key?(st)
        options[:state] = st
      end
    end.parse!
    options
  end
end

class QCEWFetcher
  QCEW_BASE_URL = 'https://data.bls.gov/cew/data/api'

  # Fetches QCEW annual data and computes state-to-national wage ratios.
  # Returns [multipliers_hash, year_used] where multipliers_hash maps
  # state codes to their wage ratio vs national (e.g., CA => 1.25).
  # US is always 1.0.
  def self.fetch_state_multipliers
    year = Date.today.year - 1

    2.times do |attempt|
      target_year = year - attempt
      puts "  Trying QCEW data for #{target_year}..."

      csv_data = fetch_industry_data(target_year)
      if csv_data
        multipliers = parse_multipliers(csv_data, target_year)
        if multipliers
          puts "  ✓ Using QCEW #{target_year} data for state income multipliers"
          return [multipliers, target_year]
        end
      end
    end

    puts "  ⚠️  QCEW data unavailable, using 1.0 multiplier for all states"
    [default_multipliers, nil]
  end

  private

  def self.fetch_industry_data(year)
    uri = URI("#{QCEW_BASE_URL}/#{year}/a/industry/10.csv")
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true
    http.verify_mode = OpenSSL::SSL::VERIFY_PEER
    http.open_timeout = 30
    http.read_timeout = 60
    response = http.get(uri.request_uri)
    return nil unless response.code.to_i == 200 && response.body.length > 100
    response.body
  rescue => e
    puts "  ⚠️  QCEW fetch error: #{sanitize_for_log(e.message)}"
    nil
  end

  def self.parse_multipliers(csv_data, year)
    fips_to_state = STATE_FIPS.invert
    national_wage = nil
    state_wages = {}

    CSV.parse(csv_data, headers: true, liberal_parsing: true) do |row|
      own_code = row['own_code'].to_s.strip.delete('"')
      next unless own_code == '5' # Private sector only

      area = row['area_fips'].to_s.strip.delete('"')
      wage_str = row['annual_avg_wkly_wage'].to_s.strip.delete('"')
      wage = strict_float(wage_str, 'QCEW wage')
      next unless wage && wage > 0

      if area == 'US000'
        national_wage = wage
      elsif fips_to_state.key?(area)
        state_wages[fips_to_state[area]] = wage
      end
    end

    return nil unless national_wage && national_wage > 0

    multipliers = { 'US' => {value: 1.0, source: "qcew_#{year}"} }
    state_wages.each do |code, wage|
      multipliers[code] = {value: (wage / national_wage).round(4), source: "qcew_#{year}"}
    end

    # Fill any missing states with 1.0
    STATE_FIPS.each_key { |code| multipliers[code] ||= {value: 1.0, source: 'fallback_missing'} }

    multipliers
  end

  def self.default_multipliers
    STATE_FIPS.each_key.with_object({}) { |code, h| h[code] = {value: 1.0, source: 'fallback_unavailable'} }
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
      monthly_growth_rate = prev_income.zero? ? 0.0 : (current_income - prev_income) / prev_income
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
    @start_date = start_date || Date.today.prev_year(DEFAULT_YEARS_BACK)
  end

  def fetch_bls_income_data
    with_retry('BLS income data fetch') do
      uri = URI('https://api.bls.gov/publicAPI/v2/timeseries/data/')
      payload = {
        'seriesid' => ['CES0500000011'],
        'startyear' => @start_date.year.to_s,
        'endyear' => (Date.today.year + 1).to_s,
        'registrationkey' => @bls_key
      }
      response = make_post_request(uri, payload)
      raise "BLS API error (HTTP #{response.code}): #{sanitize_for_log(response.body[0..200])}" unless response.code.to_i == 200
      parsed = JSON.parse(response.body)
      raise "BLS API error: #{parsed['message']}" unless parsed['status'] == 'REQUEST_SUCCEEDED'
      parsed
    end
  end

  def fetch_fred_data(series_id, frequency: nil)
    with_retry("FRED data fetch (#{series_id})") do
      uri = build_fred_uri(series_id, frequency)
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = true
      http.verify_mode = OpenSSL::SSL::VERIFY_PEER
      http.open_timeout = 30
      http.read_timeout = 60
      response = http.get(uri.request_uri)
      raise "FRED API error (HTTP #{response.code}): #{sanitize_for_log(response.body[0..200])}" unless response.code.to_i == 200
      JSON.parse(response.body)
    end
  end

  private

  def with_retry(description, max_attempts: 3, base_delay: 2)
    attempts = 0
    begin
      attempts += 1
      yield
    rescue StandardError => e
      if attempts < max_attempts
        delay = base_delay * (2 ** (attempts - 1))
        puts "  ⚠️  #{description} failed (attempt #{attempts}/#{max_attempts}): #{sanitize_for_log(e.message)}. Retrying in #{delay}s..."
        sleep delay
        retry
      else
        raise
      end
    end
  end

  def make_post_request(uri, payload)
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true
    http.verify_mode = OpenSSL::SSL::VERIFY_PEER
    http.open_timeout = 30
    http.read_timeout = 60
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
        if nearest
          gap = (Date.parse(nearest['date']) - thursday).abs.to_i
          if gap > MAX_RATE_GAP_DAYS
            puts "⚠️  No mortgage rate within #{MAX_RATE_GAP_DAYS} days of #{thursday} (nearest is #{gap} days away), skipping data point"
            rates << nil
          else
            rates << {
              'date' => thursday.strftime('%Y-%m-%d'),
              'value' => nearest['value'],
              'estimated' => true,
              'rate_gap_days' => gap
            }
          end
        else
          rates << nil
        end
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
    last_actual_value = strict_float(last_actual['value'], 'home price') || 0.0
    last_actual_year = last_actual_date.year
    last_actual_month = last_actual_date.month
    last_actual_end = Date.new(last_actual_year, last_actual_month, -1)

    # Calculate monthly growth rate from last 6 months
    monthly_growth_rate = 0.0
    if monthly_obs.length >= 6
      six_months_ago = monthly_obs[-6]
      current = monthly_obs[-1]
      months_diff = 5
      six_ago_value = strict_float(six_months_ago['value'], 'home price') || 0.0
      current_value = strict_float(current['value'], 'home price') || 0.0
      total_growth = six_ago_value.zero? ? 0.0 : (current_value - six_ago_value) / six_ago_value
      monthly_growth_rate = ((1 + total_growth) ** (1.0 / months_diff)) - 1
    end

    # Prepare control points for interpolation (use first day of each month)
    control_dates = []
    control_values = []

    monthly_obs.each do |obs|
      obs_date = Date.parse(obs['date'])
      control_point = Date.new(obs_date.year, obs_date.month, 1)
      control_dates << control_point
      control_values << (strict_float(obs['value'], 'home price') || 0.0)
    end

    # For each monthly control point, find the closest Thursday - that Thursday is
    # "observed" (uses the actual monthly value directly, not interpolated).
    observed_thursday_map = {}
    control_dates.each_with_index do |cd, i|
      next unless cd <= last_actual_end
      closest = thursday_dates.select { |t| t <= last_actual_end }.min_by { |t| (t - cd).abs }
      observed_thursday_map[closest] = control_values[i] if closest
    end

    thursday_dates.each do |thursday|
      if observed_thursday_map.key?(thursday)
        enhanced << {
          'date' => thursday.strftime('%Y-%m-%d'),
          'value' => observed_thursday_map[thursday].round(3).to_s,
          'estimated' => false,
          'observed' => true
        }
      elsif thursday <= last_actual_end
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
    cutoff_date = Date.new(Date.today.year - DEFAULT_YEARS_BACK, 1, 1)

    data.filter_map do |entry|
      date = Date.parse("#{entry['year']}-#{entry['periodName']}-01")
      next if date < cutoff_date
      value = strict_float(entry['value'], 'BLS income')
      next unless value
      { date: date.to_s, value: value }
    end
  end

  def self.calculate_costs(home_price_data, mortgage_data, income_data, income_multiplier: 1.0)
    single_costs, household_costs = [], []
    last_income_date = Date.parse(income_data.last[:date])

    home_price_data.each_with_index do |home_price_obs, i|
      mortgage_obs = mortgage_data[i]
      next unless mortgage_obs

      date = Date.parse(home_price_obs['date'])
      weekly_income = DailyEstimator.estimate_weekly_income(income_data, date)
      income_estimated = date > last_income_date

      house_price = strict_float(home_price_obs['value'], 'home price')

      # Safety check for NaN values
      if house_price.nil? || house_price.nan? || house_price.infinite? || house_price <= 0
        puts "⚠️  Warning: Invalid house price for #{date}, skipping"
        next
      end

      rate_pct = strict_float(mortgage_obs['value'], 'mortgage rate')
      if rate_pct.nil?
        puts "⚠️  Warning: Invalid mortgage rate for #{date}, skipping"
        next
      end
      rate = rate_pct / 100.0
      total_cost = calculate_total_mortgage_cost(house_price, rate)

      single_income = weekly_income * 52 * income_multiplier
      household_income = single_income * HOUSEHOLD_MULTIPLIER

      metadata = {}
      metadata[:observed] = home_price_obs['observed'] == true

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

class WeeklyCaseShiller
  def run
    options = CLIParser.parse
    fetcher = DataFetcher.new(options[:bls_api_key], options[:fred_api_key], options[:start_date])

    puts "📊 Fetching shared data from APIs..."

    bls_data = fetcher.fetch_bls_income_data
    income_data = MortgageCalculator.normalize_income_data(bls_data)
    puts "✓ BLS Income data: #{income_data.length} months"

    if income_data.length >= 2
      last_two = income_data[-2..-1]
      growth = last_two[0][:value].zero? ? 0.0 : ((last_two[1][:value] - last_two[0][:value]) / last_two[0][:value] * 100)
      puts "  Last two months: #{last_two[0][:date]} (#{last_two[0][:value]}) → #{last_two[1][:date]} (#{last_two[1][:value]})"
      puts "  Monthly growth rate: #{growth.round(3)}%"
    end

    mortgage_weekly = fetcher.fetch_fred_data('MORTGAGE30US')
    puts "✓ Mortgage rates (weekly): #{mortgage_weekly['observations'].length} observations"

    thursday_dates = MortgageRateEnhancer.extract_thursday_dates(mortgage_weekly)
    puts "\n📅 Using MORTGAGE30US Thursday release dates..."
    puts "  Total Thursdays: #{thursday_dates.length}"
    puts "  First date: #{thursday_dates.first.strftime('%Y-%m-%d')}"
    puts "  Last date: #{thursday_dates.last.strftime('%Y-%m-%d')}"

    mortgage_aligned = MortgageRateEnhancer.match_thursday_dates(
      mortgage_weekly,
      thursday_dates
    )
    puts "✓ Mortgage rates (Thursday-aligned): #{mortgage_aligned.length} observations"

    # Fetch QCEW state income multipliers
    puts "\n💰 Fetching state income multipliers from BLS QCEW..."
    income_multipliers, qcew_year = QCEWFetcher.fetch_state_multipliers

    # Show a sample of multipliers
    sample_states = ['CA', 'TX', 'NY', 'FL', 'MS'].select { |s| income_multipliers.key?(s) }
    sample_states.each do |s|
      puts "  #{STATE_NAMES[s]}: #{income_multipliers[s][:value]}x"
    end

    # Determine which states to generate
    states_to_generate = if options[:state]
                           [options[:state]]
                         else
                           STATE_FRED_SERIES.keys
                         end

    failed_states = []
    states_to_generate.each do |state_code|
      entry = income_multipliers[state_code] || {value: 1.0, source: 'fallback_unavailable'}
      multiplier = entry[:value]
      multiplier_source = entry[:source]
      begin
        generate_state_data(fetcher, state_code, income_data, thursday_dates, mortgage_aligned, multiplier, qcew_year, multiplier_source)
      rescue => e
        puts "❌ Failed to generate data for #{state_code}: #{sanitize_for_log(e.message)}"
        failed_states << state_code
      end
    end

    if failed_states.any?
      puts "\n❌ #{failed_states.length} state(s) failed: #{failed_states.join(', ')}"
      exit 1
    end
  end

  private

  def generate_state_data(fetcher, state_code, income_data, thursday_dates, mortgage_aligned, income_multiplier, qcew_year, multiplier_source)
    series_id = STATE_FRED_SERIES[state_code]
    state_name = STATE_NAMES[state_code]
    puts "\n" + "=" * 60
    puts "📍 Generating data for #{state_name} (#{state_code})..."
    puts "   FRED series: #{series_id}"
    puts "   Income multiplier: #{income_multiplier}x" unless state_code == 'US'

    home_price_monthly = fetcher.fetch_fred_data(series_id)

    if home_price_monthly['observations'].nil? || home_price_monthly['observations'].empty?
      raise "No home price data found for #{state_name}"
    end

    # Filter out invalid observations
    valid_observations = home_price_monthly['observations'].select do |obs|
      obs['value'] && obs['value'] != '.' && !obs['value'].empty?
    end

    if valid_observations.empty?
      raise "No valid home price observations for #{state_name}"
    end

    puts "✓ Home Price monthly: #{valid_observations.length} observations"

    if valid_observations.length >= 6
      last_six = valid_observations[-6..-1]
      first_val = last_six[0]['value'].to_f
      last_val = last_six[-1]['value'].to_f
      growth = first_val.zero? ? 0.0 : ((last_val - first_val) / first_val * 100)
      avg_monthly = ((1 + growth/100) ** (1.0/5) - 1) * 100
      puts "  Last 6 months growth: #{growth.round(3)}% total, #{avg_monthly.round(3)}% avg/month"
    end

    home_price_aligned = HomePriceEnhancer.match_thursday_dates(
      valid_observations,
      thursday_dates
    )
    puts "✓ Home Price (Thursday-aligned): #{home_price_aligned.length} observations"

    puts "🧮 Calculating affordability metrics..."

    single_costs, household_costs = MortgageCalculator.calculate_costs(
      home_price_aligned,
      mortgage_aligned,
      income_data,
      income_multiplier: income_multiplier
    )

    estimated_count = single_costs.count { |c| c[:estimated] }
    actual_count = single_costs.length - estimated_count
    income_estimated_count = single_costs.count { |c| c.dig(:estimation_details, :income_estimated) }
    sq_observed_count = single_costs.count { |c| c[:observed] == true }
    sq_extrapolated_count = single_costs.count { |c| c.dig(:estimation_details, :price_estimated) == true }
    sq_interpolated_count = single_costs.length - sq_observed_count - sq_extrapolated_count

    last_actual_home_price = valid_observations.last
    last_actual_date = Date.parse(last_actual_home_price['date'])
    last_income_date = Date.parse(income_data.last[:date])

    output_data = {
      single_costs: single_costs,
      household_costs: household_costs,
      metadata: {
        generated_at: Time.now.iso8601,
        state: state_code,
        state_name: state_name,
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
        series_quality: {
          observed: sq_observed_count,
          interpolated: sq_interpolated_count,
          extrapolated: sq_extrapolated_count
        },
        data_sources: {
          bls_series: 'CES0500000011',
          fred_home_price: series_id,
          fred_mortgage: 'MORTGAGE30US',
          qcew_income_multiplier: income_multiplier,
          qcew_year: qcew_year,
          qcew_multiplier_source: multiplier_source
        },
        methodology: {
          loan_term_months: LOAN_TERM_MONTHS,
          household_multiplier: HOUSEHOLD_MULTIPLIER,
          home_price_estimation: 'Trend-only estimation based on 6-month growth rate',
          home_price_interpolation: 'Cubic Hermite spline through monthly averages with linear fallback',
          income_estimation: 'Hermite spline interpolation with trend projection',
          income_note: 'National BLS weekly earnings scaled by QCEW state-to-national private sector wage ratio',
          date_alignment: 'All data points aligned to MORTGAGE30US Thursday release dates',
          note: 'Smooth curves through monthly data with safety checks for edge cases'
        }
      }
    }

    # Write to appropriate file
    if state_code == 'US'
      output_file = OUTPUT_FILE
    else
      FileUtils.mkdir_p(STATE_DATA_DIR)
      output_file = File.join(STATE_DATA_DIR, "#{state_code}.json")
    end

    tmp_file = "#{output_file}.tmp"
    File.write(tmp_file, JSON.pretty_generate(output_data))
    File.rename(tmp_file, output_file)

    puts "✅ Data written to #{output_file}"
    puts "📊 Total: #{single_costs.length} Thursday-aligned data points"
    puts "  - Observed:    #{sq_observed_count} points (actual mortgage reading + within price/income range)"
    puts "  - Interpolated: #{sq_interpolated_count} points (nearest-neighbor mortgage, within price/income range)"
    puts "  - Extrapolated: #{sq_extrapolated_count} points (price or income projected beyond actual data)"
    puts "    • With estimated income: #{income_estimated_count} points"
    puts "📅 Full range: #{single_costs.first[:date]} to #{single_costs.last[:date]}"
    puts "📈 Last actual Home Price: #{last_actual_date.strftime('%Y-%m-%d')}"
    puts "💰 Last actual Income: #{last_income_date.strftime('%Y-%m-%d')}"
  end
end

WeeklyCaseShiller.new.run if $PROGRAM_NAME == __FILE__
