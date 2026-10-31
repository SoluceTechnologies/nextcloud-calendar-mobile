const {withAndroidManifest, AndroidConfig} = require('@expo/config-plugins');

const EXTRA_CONFIG_CHANGES = ['density', 'fontScale'];

module.exports = function withAndroidMultiDisplay(config) {
    return withAndroidManifest(config, (cfg) => {
        const application = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
        const activity = application.activity?.find(
            (a) => a.$['android:name'] === '.MainActivity',
        );
        if (!activity) return cfg;

        activity.$['android:resizeableActivity'] = 'true';
        const changes = (activity.$['android:configChanges'] ?? '')
            .split('|')
            .filter(Boolean);
        for (const flag of EXTRA_CONFIG_CHANGES) {
            if (!changes.includes(flag)) changes.push(flag);
        }
        activity.$['android:configChanges'] = changes.join('|');
        return cfg;
    });
};
