/**
 * Adds the HealthKit capability to iOS entitlements so react-native-health can
 * call initHealthKit and show the system permission dialog.
 * Without com.apple.developer.healthkit, connection fails immediately (no Apple sheet).
 * Ensure the App ID in Apple Developer has HealthKit enabled for signed builds.
 */
const { withEntitlementsPlist } = require('@expo/config-plugins');

function withHealthKit(config) {
  return withEntitlementsPlist(config, (config) => {
    if (config.modResults['com.apple.developer.healthkit'] !== true) {
      config.modResults['com.apple.developer.healthkit'] = true;
    }
    return config;
  });
}

module.exports = withHealthKit;
