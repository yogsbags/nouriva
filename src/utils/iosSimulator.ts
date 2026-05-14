import { Platform } from 'react-native';
import * as Device from 'expo-device';

/** True on iOS Simulator only (ExpoDevice uses compile-time targetEnvironment(simulator)). */
export function isIosSimulator(): boolean {
  return Platform.OS === 'ios' && Device.isDevice === false;
}
