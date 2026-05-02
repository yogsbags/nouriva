import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Platform } from 'react-native';
import {
  documentDirectory,
  copyAsync,
  deleteAsync,
  getInfoAsync,
} from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUserId, saveUserProfile } from './userProfile';
import { supabase } from './supabase';

const LOCAL_URI_KEY = 'profile_avatar_local_uri';
/** Backup when DB `avatar_url` column is missing or upsert fails — still show photo across restarts */
const REMOTE_URL_CACHE_KEY = 'profile_avatar_remote_url';

const AVATAR_FILENAME = 'profile_avatar.jpg';

function permanentAvatarPath(): string {
  return `${documentDirectory ?? ''}${AVATAR_FILENAME}`;
}

/** Resize + copy to app documents so the file survives until user replaces it. */
export async function savePickedImageToAvatar(uri: string): Promise<string | null> {
  try {
    const manipulated = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 400 } }],
      { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
    );
    const dest = permanentAvatarPath();
    await copyAsync({ from: manipulated.uri, to: dest });
    await AsyncStorage.setItem(LOCAL_URI_KEY, dest);
    return dest;
  } catch (e) {
    console.error('savePickedImageToAvatar', e);
    return null;
  }
}

export async function getCachedRemoteAvatarUrl(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(REMOTE_URL_CACHE_KEY);
  } catch {
    return null;
  }
}

export async function setCachedRemoteAvatarUrl(url: string): Promise<void> {
  try {
    await AsyncStorage.setItem(REMOTE_URL_CACHE_KEY, url);
  } catch {
    /* ignore */
  }
}

export async function getStoredAvatarUri(): Promise<string | null> {
  try {
    const stored = await AsyncStorage.getItem(LOCAL_URI_KEY);
    if (!stored) return null;
    const info = await getInfoAsync(stored);
    if (!info.exists) {
      await AsyncStorage.removeItem(LOCAL_URI_KEY);
      return null;
    }
    return stored;
  } catch {
    return null;
  }
}


export type UploadAvatarResult = { url: string | null; error: string | null };

export async function uploadAvatarToCloud(localUri: string): Promise<UploadAvatarResult> {
  const userId = await getUserId();
  if (!userId) return { url: null, error: 'Not signed in' };
  try {
    const response = await fetch(localUri);
    const blob = await response.blob();
    const path = `avatars/${userId}/profile.jpg`;

    const { error } = await supabase.storage
      .from('food-scans')
      .upload(path, blob, { contentType: 'image/jpeg', upsert: true });

    if (error) return { url: null, error: error.message };

    const { data } = supabase.storage.from('food-scans').getPublicUrl(path);
    const publicUrl = `${data.publicUrl}?v=${Date.now()}`;

    await AsyncStorage.setItem(REMOTE_URL_CACHE_KEY, publicUrl);
    await saveUserProfile({ avatar_url: publicUrl });
    return { url: publicUrl, error: null };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Upload failed';
    console.error('uploadAvatarToCloud', e);
    return { url: null, error: msg };
  }
}

export async function removeAvatarEverywhere(): Promise<void> {
  try {
    const path = await getStoredAvatarUri();
    if (path) {
      await deleteAsync(path, { idempotent: true }).catch(() => {});
    }
    await AsyncStorage.removeItem(LOCAL_URI_KEY);
    await AsyncStorage.removeItem(REMOTE_URL_CACHE_KEY);
    await saveUserProfile({ avatar_url: '' });
    const userId = await getUserId();
    if (userId) {
      await supabase.storage.from('food-scans').remove([`avatars/${userId}/profile.jpg`]).catch(() => {});
    }
  } catch (e) {
    console.error('removeAvatarEverywhere', e);
  }
}

/** Call on sign-out — deletes the local file but keeps the remote URL cache so the
 *  avatar restores immediately on re-login (the Supabase Storage public URL never expires). */
export async function clearAvatarLocalOnLogout(): Promise<void> {
  try {
    const path = await getStoredAvatarUri();
    if (path) {
      await deleteAsync(path, { idempotent: true }).catch(() => {});
    }
    await AsyncStorage.removeItem(LOCAL_URI_KEY);
    // REMOTE_URL_CACHE_KEY intentionally kept — allows avatar to restore on re-login
  } catch (e) {
    console.error('clearAvatarLocalOnLogout', e);
  }
}

export async function requestCameraPermission(): Promise<boolean> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  return status === 'granted';
}

export async function requestMediaLibraryPermission(): Promise<boolean> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return status === 'granted';
}

export async function pickAvatarFromLibrary(): Promise<string | null> {
  const ok = await requestMediaLibraryPermission();
  if (!ok) return null;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: Platform.OS === 'ios',
    aspect: Platform.OS === 'ios' ? [1, 1] : undefined,
    quality: 0.9,
    ...(Platform.OS === 'android'
      ? { legacy: false as const, defaultTab: 'photos' as const }
      : {}),
  });
  if (result.canceled || !result.assets?.[0]?.uri) return null;
  return savePickedImageToAvatar(result.assets[0].uri);
}

export async function takeAvatarSelfie(): Promise<string | null> {
  const ok = await requestCameraPermission();
  if (!ok) return null;
  const result = await ImagePicker.launchCameraAsync({
    allowsEditing: Platform.OS === 'ios',
    aspect: Platform.OS === 'ios' ? [1, 1] : undefined,
    quality: 0.9,
    cameraType: ImagePicker.CameraType.front,
  });
  if (result.canceled || !result.assets?.[0]?.uri) return null;
  return savePickedImageToAvatar(result.assets[0].uri);
}
