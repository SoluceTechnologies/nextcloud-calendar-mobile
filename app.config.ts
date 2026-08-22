import type {ExpoConfig} from 'expo/config';
import {version} from './package.json';

const [major, minor, patch] = version.split('.').map(Number);

if (![major, minor, patch].every(Number.isInteger)) {
    throw new Error(
        `package.json: version "${version}" invalid`,
    );
}

const versionCode = 10600;

if (versionCode !== major * 10000 + minor * 100 + patch) {
    throw new Error(
        `app.config.ts: versionCode ${versionCode} does not match version "${version}" ` +
        `(expected ${major * 10000 + minor * 100 + patch})`,
    );
}

const config: ExpoConfig = {
    name: 'Nextcloud Calendar',
    slug: 'nextcloud-calendar',
    scheme: 'nextcloud-calendar',
    version,
    orientation: 'default',
    userInterfaceStyle: 'automatic',
    platforms: ['ios', 'android'],
    icon: './assets/icon.png',
    assetBundlePatterns: ['**/*'],

    ios: {
        supportsTablet: true,
        bundleIdentifier: 'com.soluce.nextcloud-calendar',
        icon: './assets/icon-ios.icon',
        infoPlist: {
            CFBundleDisplayName: 'Nextcloud Calendar',
            LSApplicationQueriesSchemes: ['nextcloudtalk'],
            ITSAppUsesNonExemptEncryption: false,
            NSAppTransportSecurity: {
                NSAllowsArbitraryLoads: true,
            },
        },
        entitlements: {
            'com.apple.security.application-groups': ['group.com.soluce.nextcloud-calendar'],
        },
    },

    android: {
        package: 'com.soluce.nextcloudcalendar',
        versionCode,
        adaptiveIcon: {
            foregroundImage: './assets/adaptive-icon.png',
            backgroundColor: '#109be6',
        },
        softwareKeyboardLayoutMode: 'resize',
    },

    web: {
        favicon: './assets/favicon.png',
    },

    extra: {
        eas: {
            projectId: 'b344d590-32ff-417f-8c5a-f8e453288f60',
        },
    },
    owner: 'soluce',

    plugins: [
        [
            'expo-build-properties',
            {
                android: {
                    usesCleartextTraffic: true,
                },
            },
        ],
        './plugins/withAndroidNetworkSecurityConfig',
        '@morrowdigital/watermelondb-expo-plugin',
        '@react-native-community/datetimepicker',
        'expo-router',
        'expo-secure-store',
        'expo-web-browser',
        [
            'expo-camera',
            {
                cameraPermission:
                    'Allow Calendar to access the camera to scan a Nextcloud login QR code.',
            },
        ],
        [
            'expo-splash-screen',
            {
                image: './assets/splash-icon.png',
                imageWidth: 200,
                resizeMode: 'contain',
                backgroundColor: '#109be6',
                dark: {
                    backgroundColor: '#109be6',
                },
            },
        ],
        'expo-localization',
        'expo-status-bar',
        'expo-font',
        'expo-notifications',
        'expo-background-task',
        [
            'expo-widgets',
            {
                bundleIdentifier: "com.soluce.nextcloud-calendar.ExpoWidgetsTarget",
                groupIdentifier: 'group.com.soluce.nextcloud-calendar',
                widgets: [
                    {
                        name: 'NextcloudCalendarWidget',
                        displayName: 'Nextcloud Calendar',
                        description: 'Your upcoming events',
                        contentMarginsDisabled: true,
                        supportedFamilies: [
                            'systemSmall',
                            'systemMedium',
                            'systemLarge',
                            'accessoryInline',
                            'accessoryCircular',
                            'accessoryRectangular',
                        ],
                    },
                ],
            },
        ],
        [
            'react-native-android-widget',
            {
                widgets: [
                    {
                        name: 'CalendarSmallWidget',
                        label: 'Nextcloud Calendar',
                        minWidth: '110dp',
                        minHeight: '110dp',
                        targetCellWidth: 2,
                        targetCellHeight: 2,
                        description: 'Shows the next upcoming event',
                        previewImage: './assets/icon.png',
                        updatePeriodMillis: 1800000,
                        resizeMode: 'horizontal|vertical',
                    },
                    {
                        name: 'CalendarMediumWidget',
                        label: 'Nextcloud Calendar',
                        minWidth: '250dp',
                        minHeight: '110dp',
                        targetCellWidth: 4,
                        targetCellHeight: 2,
                        description: 'Shows up to three upcoming events',
                        previewImage: './assets/icon.png',
                        updatePeriodMillis: 1800000,
                        resizeMode: 'horizontal|vertical',
                    },
                    {
                        name: 'CalendarLargeWidget',
                        label: 'Nextcloud Calendar',
                        minWidth: '250dp',
                        minHeight: '250dp',
                        targetCellWidth: 4,
                        targetCellHeight: 4,
                        description: 'Multi-day agenda grouped by day',
                        previewImage: './assets/icon.png',
                        updatePeriodMillis: 1800000,
                        resizeMode: 'horizontal|vertical',
                    },
                ],
            },
        ],
    ],
};

export default config;
