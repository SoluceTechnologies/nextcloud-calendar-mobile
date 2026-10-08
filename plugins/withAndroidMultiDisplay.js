const {withAndroidManifest, AndroidConfig} = require('@expo/config-plugins');

// Multi-display (Samsung DeX, external monitors): declare the activity
// explicitly resizable and survive density/fontScale changes without a
// restart. DeX otherwise puts the app on its compatibility path where the
// window may report a very low logical density (~111 dpi), rendering
// everything ~70% smaller (#274).
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
