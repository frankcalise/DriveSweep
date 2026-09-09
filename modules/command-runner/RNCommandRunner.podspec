Pod::Spec.new do |s|
  s.name = "RNCommandRunner"
  s.version = "1.0.0"
  s.summary = "Run allowlisted tools and read their output"
  s.license = { :type => "MIT" }
  s.author = "Legend / DriveSweep"
  s.homepage = "https://github.com/LegendApp/legend-apps"
  s.source = { :path => "." }
  s.platforms = { :ios => "15.0", :osx => "14.0" }
  s.source_files = "ios/**/*.{h,m,mm}"
  s.dependency "React-Core"
  s.dependency "ReactCodegen"
end
