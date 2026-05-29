require_relative 'test_helper'
require 'stringio'

# Covers the two top-level helper functions defined in weekly_case_shiller.rb:
#   strict_float      - safe Float() coercion
#   sanitize_for_log  - secret redaction (B7 broadens registrationkey to the JSON form)
class LogHelpersTest < Minitest::Test
  # Captures and returns whatever the block writes to $stdout (helpers `puts` warnings).
  def capture_stdout
    original = $stdout
    $stdout = StringIO.new
    yield
    $stdout.string
  ensure
    $stdout = original
  end

  # ---- strict_float ----------------------------------------------------------

  def test_strict_float_parses_valid_number
    assert_in_delta 123.45, strict_float('123.45')
  end

  def test_strict_float_parses_integer_string
    assert_in_delta 1000.0, strict_float('1000')
  end

  def test_strict_float_nil_returns_nil
    assert_nil strict_float(nil)
  end

  def test_strict_float_blank_returns_nil
    assert_nil strict_float('')
    assert_nil strict_float('   ')
  end

  def test_strict_float_dot_placeholder_returns_nil
    assert_nil strict_float('.')
  end

  def test_strict_float_malformed_returns_nil_with_warning
    result = nil
    output = capture_stdout { result = strict_float('N/A', 'test field') }
    assert_nil result
    assert_match(/malformed numeric value/, output)
    assert_match(/test field/, output)
  end

  # ---- sanitize_for_log ------------------------------------------------------

  def test_sanitize_redacts_api_key_query_param
    assert_equal '?api_key=[REDACTED]&foo=bar',
                 sanitize_for_log('?api_key=SECRET123&foo=bar')
  end

  def test_sanitize_redacts_ruby_hash_registrationkey
    assert_equal '{"registrationkey"=>"[REDACTED]"}',
                 sanitize_for_log('{"registrationkey"=>"abc123"}')
  end

  def test_sanitize_redacts_json_registrationkey
    # B7: the JSON form ("registrationkey":"x") must be redacted too.
    assert_equal '{"registrationkey":"[REDACTED]"}',
                 sanitize_for_log('{"registrationkey":"abc123"}')
  end

  def test_sanitize_redacts_registrationkey_inside_larger_json
    raw = '{"seriesid":["CES0500000011"],"registrationkey":"deadbeef"}'
    out = sanitize_for_log(raw)
    refute_includes out, 'deadbeef'
    assert_includes out, '"registrationkey":"[REDACTED]"'
  end

  def test_sanitize_is_case_insensitive_for_registrationkey
    assert_equal '{"RegistrationKey":"[REDACTED]"}',
                 sanitize_for_log('{"RegistrationKey":"abc123"}')
  end

  def test_sanitize_leaves_clean_strings_untouched
    assert_equal 'nothing secret here', sanitize_for_log('nothing secret here')
  end
end
