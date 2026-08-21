const {withAndroidManifest, withDangerousMod, AndroidConfig} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

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
            await fs.promises.mkdir(xmlDir, {recursive: true});
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
