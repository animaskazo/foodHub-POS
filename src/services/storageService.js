import { supabase } from '../lib/supabase';

/**
 * Uploads an image to the Supabase 'images' bucket.
 * @param {File} file - The file to upload.
 * @param {string} path - The subfolder/path (e.g. 'products' or 'ingredients')
 * @returns {Promise<string>} The public URL of the uploaded image.
 */
export const uploadImage = async (file, path = 'general') => {
  if (!file) throw new Error('No file provided');

  // Generate a unique file name to avoid collisions
  const fileExt = file.name.split('.').pop();
  const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
  const filePath = `${path}/${fileName}`;

  // Upload the file
  const { data, error } = await supabase.storage
    .from('images')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false
    });

  if (error) {
    console.error('Error uploading image:', error);
    throw error;
  }

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from('images')
    .getPublicUrl(filePath);

  return publicUrl;
};
