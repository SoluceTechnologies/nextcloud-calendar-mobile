require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'TlsTrust'
  s.version        = package['version'] || '0.1.0'
  s.summary        = package['description'] || 'TOFU TLS trust module'
  s.description    = 'Trust-on-first-use TLS certificate pinning for self-signed Nextcloud instances.'
  s.author         = ''
  s.homepage       = 'https://github.com/SoluceTechnologies/nextcloud-calendar-mobile'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
