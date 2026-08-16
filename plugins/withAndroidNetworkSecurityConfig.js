const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Lets the app reach self-hosted Nextcloud instances that serve HTTPS with a
 * self-signed / private-CA certificate on the local network.
 *
 * By default Android (targetSdk >= 24) trusts only the system CA store, so a
 * self-signed cert fails TLS validation ("Trust anchor for certification path
 * not found") before any HTTP status is seen. Adding `user` to the trust
 * anchors makes the app honour a CA the user has installed on the device
 * (Settings > Security > Encryption & credentials > Install a certificate).
 * The user must still install their cert explicitly, so this does NOT blindly
 * trust arbitrary certificates.
 *
 * `cleartextTrafficPermitted="true"` preserves plain-HTTP local access: once a
 * networkSecurityConfig is present the `android:usesCleartextTraffic` manifest
 * flag is ignored on API 24+ in favour of this base-config value.
 *
 * iOS needs no equivalent: NSAllowsArbitraryLoads is already set, and iOS trusts
 * a self-signed cert once the user installs its profile and enables full trust.
 */

const NSC_FILE_NAME = 'network_security_config.xml';

const NSC_CONTENTS = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
            <certificates src="user" />
        </trust-anchors>
    </base-config>
</network-security-config>
`;

function withNetworkSecurityConfigFile(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const xmlDir = path.join(
        cfg.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'xml',
      );
      await fs.promises.mkdir(xmlDir, { recursive: true });
      await fs.promises.writeFile(path.join(xmlDir, NSC_FILE_NAME), NSC_CONTENTS, 'utf8');
      return cfg;
    },
  ]);
}

function withNetworkSecurityConfigManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    application.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    return cfg;
  });
}

module.exports = function withAndroidNetworkSecurityConfig(config) {
  config = withNetworkSecurityConfigFile(config);
  config = withNetworkSecurityConfigManifest(config);
  return config;
};
