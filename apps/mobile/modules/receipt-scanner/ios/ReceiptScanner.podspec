Pod::Spec.new do |s|
  s.name = 'ReceiptScanner'
  s.version = '1.0.0'
  s.summary = 'Local bill text recognition'
  s.description = 'Recognizes user-selected bill photos with Apple Vision.'
  s.author = 'SettleUp'
  s.homepage = 'https://example.invalid/settleup'
  s.license = { :type => 'MIT' }
  s.platforms = { :ios => '15.1' }
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Vision', 'ImageIO'
  s.swift_version = '5.9'
  s.source_files = '**/*.swift'
end
