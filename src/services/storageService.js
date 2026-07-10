import { supabase } from '../lib/supabase';

/**
 * Procesa y recorta la imagen automáticamente según el uso
 */
const processImage = (file, path) => {
  return new Promise((resolve, reject) => {
    let targetWidth = 800;
    let targetHeight = 800; // Por defecto 1:1 (Productos)

    if (path === 'cover') {
      targetWidth = 1200;
      targetHeight = 600; // 2:1 para portada
    } else if (path === 'logo') {
      targetWidth = 400;
      targetHeight = 400; // 1:1 más pequeño
    } else if (path === 'ingredients') {
      targetWidth = 500;
      targetHeight = 500; // 1:1 medio
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');

        const imgRatio = img.width / img.height;
        const targetRatio = targetWidth / targetHeight;

        let drawWidth = img.width;
        let drawHeight = img.height;
        let offsetX = 0;
        let offsetY = 0;

        if (imgRatio > targetRatio) {
          // Imagen más ancha: centramos horizontalmente
          drawWidth = img.height * targetRatio;
          offsetX = (img.width - drawWidth) / 2;
        } else {
          // Imagen más alta: centramos verticalmente
          drawHeight = img.width / targetRatio;
          offsetY = (img.height - drawHeight) / 2;
        }

        // Pintar la imagen recortada en el canvas
        ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight, 0, 0, targetWidth, targetHeight);

        // Exportar a JPG con 85% de calidad
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error('Canvas error'));
          const newFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });
          resolve(newFile);
        }, 'image/jpeg', 0.85);
      };
      img.onerror = () => reject(new Error('Image load error'));
    };
    reader.onerror = () => reject(new Error('File read error'));
  });
};

/**
 * Uploads an image to the Supabase 'images' bucket.
 * @param {File} file - The file to upload.
 * @param {string} path - The subfolder/path (e.g. 'products' or 'ingredients')
 * @returns {Promise<string>} The public URL of the uploaded image.
 */
export const uploadImage = async (file, path = 'general') => {
  if (!file) throw new Error('No file provided');

  let fileToUpload = file;
  try {
    // Intentar procesar y recortar la imagen antes de subirla
    fileToUpload = await processImage(file, path);
  } catch (err) {
    console.warn('No se pudo procesar la imagen, se subirá la original:', err);
  }

  // Generate a unique file name to avoid collisions
  const fileExt = fileToUpload.name.split('.').pop() || 'jpg';
  const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
  const filePath = `${path}/${fileName}`;

  // Upload the file
  const { data, error } = await supabase.storage
    .from('images')
    .upload(filePath, fileToUpload, {
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
