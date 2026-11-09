const { withXcodeProject } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const GROUP_NAME = 'AppIntents';
const SRC_DIR = 'targets/app-intents';

// Compiles targets/app-intents/*.swift into the MAIN app target so the system
// discovers the App Intents at install time (pod/framework code is not reliably
// scanned). App Intents then run in the app process — including in the
// background for read intents — and in CarPlay via Siri.
module.exports = function withAppIntents(config) {
    return withXcodeProject(config, (cfg) => {
        const project = cfg.modResults;
        const srcAbs = path.join(cfg.modRequest.projectRoot, SRC_DIR);
        if (!fs.existsSync(srcAbs)) return cfg;
        const files = fs.readdirSync(srcAbs).filter((f) => f.endsWith('.swift'));
        if (files.length === 0) return cfg;

        const targetName = cfg.modRequest.projectName ?? config.name;
        const targetKey = project.findTargetKey(targetName);
        if (!targetKey) {
            throw new Error(`withAppIntents: app target "${targetName}" not found`);
        }

        const relToProject = path.relative(cfg.modRequest.platformProjectRoot, srcAbs);
        const groupKey = project.pbxCreateGroup(GROUP_NAME, relToProject);
        for (const file of files) {
            project.addSourceFile(file, { target: targetKey }, groupKey);
        }
        return cfg;
    });
};
