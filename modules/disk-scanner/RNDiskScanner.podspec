require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name = "RNDiskScanner"
  s.version = "1.0.0"
  s.summary = "Disk usage scanner for DriveSweep"
  s.license = { :type => "MIT" }
  s.author = "DriveSweep"
  s.homepage = "https://github.com/frankcalise/DriveSweep"
  s.source = { :path => "." }
  s.platforms = { :ios => "15.0", :osx => "14.0" }
  s.source_files = "ios/**/*.{h,m,mm}"
  s.public_header_files = "ios/RNDiskScannerCore.h"
  s.dependency "React-Core"
  s.dependency "ReactCodegen"
end
