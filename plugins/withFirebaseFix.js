/**
 * Expo SDK 54 / RN 0.81 / RNFirebase static-framework compatibility.
 *
 * This patches two native build issues seen in EAS iOS builds:
 * - RNFirebase Objective-C sources can import RNFBApp headers before their own
 *   module headers, which trips Clang's strict module importer in Xcode.
 * - RNFirebase framework targets import React headers, so static framework
 *   builds must allow non-modular includes for those pod targets.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const STATIC_FRAMEWORK_FLAG = '$RNFirebaseAsStaticFramework = true';
const HELPER_MARKER = '# @nouriva/rnfb-static-framework-compatibility';
const HELPER_NAME = 'apply_rnfb_static_framework_compatibility!';

const RNFB_IMPORT_PATCHES = [
  {
    relativePath:
      'node_modules/@react-native-firebase/crashlytics/ios/RNFBCrashlytics/RNFBCrashlyticsModule.m',
    before: `#import "RNFBApp/RNFBSharedUtils.h"
#import "RNFBCrashlyticsInitProvider.h"
#import "RNFBCrashlyticsModule.h"`,
    after: `#import "RNFBCrashlyticsModule.h"
#import "RNFBApp/RNFBSharedUtils.h"
#import "RNFBCrashlyticsInitProvider.h"`,
  },
  {
    relativePath:
      'node_modules/@react-native-firebase/analytics/ios/RNFBAnalytics/RNFBAnalyticsModule.m',
    before: `#import <RNFBApp/RNFBSharedUtils.h>
#import "RNFBAnalyticsModule.h"`,
    after: `#import "RNFBAnalyticsModule.h"
#import <RNFBApp/RNFBSharedUtils.h>`,
  },
  {
    relativePath: 'node_modules/@react-native-firebase/app/ios/RNFBApp/RNFBUtilsModule.m',
    before: `#import "RNFBApp/RNFBSharedUtils.h"
#import "RNFBUtilsModule.h"`,
    after: `#import "RNFBUtilsModule.h"
#import "RNFBApp/RNFBSharedUtils.h"`,
  },
];

function patchRnFirebaseImportOrder(projectRoot) {
  RNFB_IMPORT_PATCHES.forEach(({ relativePath, before, after }) => {
    const filePath = path.join(projectRoot, relativePath);

    if (!fs.existsSync(filePath)) {
      console.warn(`withFirebaseFix: skipped missing ${relativePath}`);
      return;
    }

    const source = fs.readFileSync(filePath, 'utf8');
    if (source.includes(after)) {
      return;
    }

    if (!source.includes(before)) {
      console.warn(`withFirebaseFix: import pattern not found in ${relativePath}`);
      return;
    }

    fs.writeFileSync(filePath, source.replace(before, after));
    console.log(`withFirebaseFix: patched RNFirebase import order in ${relativePath}`);
  });
}

function buildHelper() {
  return `
${HELPER_MARKER}
def ${HELPER_NAME}(installer)
  installer.pods_project.build_configurations.each do |config|
    config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
  end

  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'

      next unless target.name.start_with?('RNFB')

      config.build_settings['CLANG_ENABLE_MODULES'] = 'YES'
      config.build_settings['DEFINES_MODULE'] = 'YES'
      config.build_settings['GCC_TREAT_WARNINGS_AS_ERRORS'] = 'NO'

      flags = config.build_settings['OTHER_CFLAGS']
      flags = ['$(inherited)'] if flags.nil?
      flags = [flags] if flags.is_a?(String)
      unless flags.include?('-Wno-error=non-modular-include-in-framework-module')
        flags << '-Wno-error=non-modular-include-in-framework-module'
      end
      config.build_settings['OTHER_CFLAGS'] = flags
    end
  end

  # Add -ObjC to the app target so Objective-C static libraries (e.g. react-native-health)
  # register their native modules properly and are not stripped by the linker.
  installer.aggregate_targets.each do |aggregate_target|
    aggregate_target.user_project.targets.each do |target|
      target.build_configurations.each do |config|
        ldflags = config.build_settings['OTHER_LDFLAGS'] || '$(inherited)'
        ldflags = [ldflags] if ldflags.is_a?(String)
        unless ldflags.include?('-ObjC')
          ldflags << '-ObjC'
          config.build_settings['OTHER_LDFLAGS'] = ldflags
        end
      end
    end
    aggregate_target.user_project.save
  end
end
`;
}

function ensureStaticFrameworkFlag(podfile) {
  if (podfile.includes(STATIC_FRAMEWORK_FLAG)) {
    return podfile;
  }

  return `${STATIC_FRAMEWORK_FLAG}\n${podfile}`;
}

function ensureHelper(podfile) {
  if (podfile.includes(HELPER_MARKER)) {
    return podfile;
  }

  const targetIndex = podfile.indexOf("target '");
  if (targetIndex === -1) {
    return `${buildHelper()}\n${podfile}`;
  }

  return `${podfile.slice(0, targetIndex)}${buildHelper()}\n${podfile.slice(targetIndex)}`;
}

function removeGlobalModularHeaders(podfile) {
  return podfile.replace(/\n\s*use_modular_headers!\n/g, '\n');
}

function insertPostInstallCall(podfile) {
  const helperCallRegex = new RegExp(`\\n\\s+${HELPER_NAME}\\(`);
  if (helperCallRegex.test(podfile)) {
    return podfile;
  }

  const postInstallMatch = podfile.match(/post_install do \|(\w+)\|/);
  if (!postInstallMatch) {
    console.warn('withFirebaseFix: could not find a Podfile post_install block');
    return podfile;
  }

  const installerVar = postInstallMatch[1];
  const call = `    ${HELPER_NAME}(${installerVar})\n`;
  const postInstallStart = postInstallMatch.index ?? 0;
  const afterPostInstall = podfile.slice(postInstallStart);
  const reactNativePostInstallMatch = afterPostInstall.match(
    /(react_native_post_install\([\s\S]*?\n\s*\)\n)/
  );

  if (reactNativePostInstallMatch) {
    const insertAt =
      postInstallStart +
      (reactNativePostInstallMatch.index ?? 0) +
      reactNativePostInstallMatch[0].length;
    return `${podfile.slice(0, insertAt)}${call}${podfile.slice(insertAt)}`;
  }

  const postInstallLineEnd = podfile.indexOf('\n', postInstallStart);
  if (postInstallLineEnd === -1) {
    return podfile;
  }

  return `${podfile.slice(0, postInstallLineEnd + 1)}${call}${podfile.slice(
    postInstallLineEnd + 1
  )}`;
}

function patchPodfile(podfilePath) {
  let podfile = fs.readFileSync(podfilePath, 'utf8');
  podfile = removeGlobalModularHeaders(podfile);
  podfile = ensureStaticFrameworkFlag(podfile);
  podfile = ensureHelper(podfile);
  podfile = insertPostInstallCall(podfile);
  fs.writeFileSync(podfilePath, podfile);
}

function withFirebaseFix(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      patchRnFirebaseImportOrder(config.modRequest.projectRoot);

      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      if (!fs.existsSync(podfilePath)) {
        console.warn('withFirebaseFix: Podfile not found');
        return config;
      }

      patchPodfile(podfilePath);
      console.log('withFirebaseFix: patched Podfile for RNFirebase static frameworks');
      return config;
    },
  ]);
}

module.exports = withFirebaseFix;
