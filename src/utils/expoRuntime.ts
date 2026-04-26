import Constants, { ExecutionEnvironment } from 'expo-constants';

/** True when running inside the Expo Go app (no custom native code like Nitro / IAP). */
export function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}
