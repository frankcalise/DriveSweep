Pod::Spec.new do |s|
  s.name = "RNAppExit"
  s.version = "1.0.0"
  s.summary = "App termination control for DriveSweep"
  s.license = { :type => "MIT" }
  s.author = "Legend / DriveSweep"
  s.homepage = "https://github.com/LegendApp/legend-apps"
  s.source = { :path => "." }
  s.platforms = { :ios => "15.0", :osx => "14.0" }
  s.source_files = "ios/**/*.{h,m,mm}"
  s.dependency "React-Core"
  s.dependency "ReactCodegen"
end
