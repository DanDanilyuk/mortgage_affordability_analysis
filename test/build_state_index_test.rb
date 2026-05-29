require_relative 'test_helper'
require 'stringio'
require 'fileutils'

# B5: build_state_index must be loud-but-non-fatal on a malformed/truncated
# data/{STATE}.json (rescue + warn + skip) and must omit a state whose
# single_costs is empty (warn + skip) instead of silently dropping or crashing.
#
# Both covered cases produce an empty `rows`, so build_state_index early-returns
# WITHOUT writing data/index.json - that lets us exercise the guards without
# clobbering the real, checked-in index file. We use the fake state code "ZZ"
# (not a real state) and clean it up in teardown so it never reaches CI's
# data/??.json schema glob.
class BuildStateIndexTest < Minitest::Test
  PROJECT_ROOT = File.expand_path('..', __dir__)
  DATA_DIR     = File.join(PROJECT_ROOT, 'data')
  FAKE_CODE    = 'ZZ'.freeze
  FAKE_PATH    = File.join(DATA_DIR, "#{FAKE_CODE}.json").freeze
  INDEX_PATH   = File.join(DATA_DIR, 'index.json').freeze

  def capture_stdout
    original = $stdout
    $stdout = StringIO.new
    yield
    $stdout.string
  ensure
    $stdout = original
  end

  def teardown
    File.delete(FAKE_PATH) if File.exist?(FAKE_PATH)
  end

  def index_snapshot
    File.exist?(INDEX_PATH) ? File.read(INDEX_PATH) : nil
  end

  # Runs build_state_index from the project root so the relative STATE_DATA_DIR
  # ('data') resolves to the same dir our fixture lives in.
  def run_index(states)
    result = nil
    output = nil
    Dir.chdir(PROJECT_ROOT) do
      output = capture_stdout { result = WeeklyCaseShiller.new.build_state_index(states) }
    end
    [result, output]
  end

  def test_malformed_json_is_skipped_with_warning_and_index_untouched
    File.write(FAKE_PATH, '{ this is not valid json ]')
    before = index_snapshot

    result, output = run_index([FAKE_CODE])

    assert_match(/could not parse/, output)
    assert_match(/skipping #{FAKE_CODE}/, output)
    assert_nil result, 'empty rows should early-return nil'
    assert_equal before, index_snapshot, 'index.json must not be rewritten when all states are skipped'
  end

  def test_empty_single_costs_is_omitted_with_warning
    File.write(FAKE_PATH, JSON.generate('single_costs' => [], 'household_costs' => []))
    before = index_snapshot

    result, output = run_index([FAKE_CODE])

    assert_match(/empty single_costs/, output)
    assert_nil result
    assert_equal before, index_snapshot
  end

  def test_missing_file_is_skipped_without_raising
    # FAKE_PATH intentionally not created.
    refute File.exist?(FAKE_PATH)
    result, = run_index([FAKE_CODE])
    assert_nil result
  end

  def test_us_code_is_skipped
    # National data lives at the repo root, not data/ - 'US' is always skipped.
    result, = run_index(['US'])
    assert_nil result
  end
end
