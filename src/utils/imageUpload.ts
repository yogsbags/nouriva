import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from './supabase';

// Compress + upload to Supabase Storage. Returns public URL or null on failure.
export async function uploadFoodImage(base64: string, userId: string): Promise<string | null> {
  try {
    // Compress: resize to max 900px wide, 65% JPEG quality (~80-120KB typical)
    const compressed = await ImageManipulator.manipulateAsync(
      `data:image/jpeg;base64,${base64}`,
      [{ resize: { width: 900 } }],
      { compress: 0.65, format: ImageManipulator.SaveFormat.JPEG }
    );

    // Fetch the local file URI as a blob — works reliably in React Native
    const response = await fetch(compressed.uri);
    const blob = await response.blob();

    const fileName = `${userId}/${Date.now()}.jpg`;

    const { error } = await supabase.storage
      .from('food-scans')
      .upload(fileName, blob, { contentType: 'image/jpeg', upsert: false });

    if (error) return null;

    const { data } = supabase.storage.from('food-scans').getPublicUrl(fileName);
    return data.publicUrl;
  } catch {
    return null;
  }
}

export async function deleteFoodImage(imageUrl: string): Promise<void> {
  try {
    const parts = imageUrl.split('/food-scans/');
    if (parts.length < 2) return;
    await supabase.storage.from('food-scans').remove([parts[1]]);
  } catch {}
}
