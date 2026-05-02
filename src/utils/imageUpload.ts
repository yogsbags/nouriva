import { supabase } from './supabase';

async function uploadBlob(blob: Blob, userId: string): Promise<string | null> {
  const fileName = `${userId}/${Date.now()}.jpg`;

  const { error } = await supabase.storage
    .from('food-scans')
    .upload(fileName, blob, { contentType: 'image/jpeg', upsert: false });

  if (error) return null;

  const { data } = supabase.storage.from('food-scans').getPublicUrl(fileName);
  return data.publicUrl;
}

// Upload the already-compressed local scan image. Returns public URL or null on failure.
export async function uploadFoodImageFromUri(imageUri: string, userId: string): Promise<string | null> {
  try {
    const response = await fetch(imageUri);
    const blob = await response.blob();
    return uploadBlob(blob, userId);
  } catch {
    return null;
  }
}

// Fallback for old history/replay flows that only have base64.
export async function uploadFoodImage(base64: string, userId: string): Promise<string | null> {
  try {
    const response = await fetch(`data:image/jpeg;base64,${base64}`);
    const blob = await response.blob();
    return uploadBlob(blob, userId);
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
