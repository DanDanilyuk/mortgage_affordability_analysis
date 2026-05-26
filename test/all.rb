Dir.glob(File.join(__dir__, '*_test.rb')).sort.each { |f| require_relative File.basename(f) }
