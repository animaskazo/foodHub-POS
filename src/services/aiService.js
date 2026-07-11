import { supabase } from '../lib/supabase';

/**
 * Convierte un File a un string base64 y extrae su mimeType
 */
const fileToBase64Info = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      // El resultado es un string tipo "data:image/jpeg;base64,....."
      const base64Data = reader.result.split(',')[1];
      resolve({
        data: base64Data,
        mimeType: file.type
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const extractMenuFromImage = async (imageFile) => {
  const { data: fileInfo, mimeType } = await fileToBase64Info(imageFile);

  try {
    const { data, error } = await supabase.functions.invoke('claude', {
      body: {
        action: 'extract_menu',
        payload: {
          imageBase64: fileInfo,
          mimeType: mimeType
        }
      }
    });

    if (error) {
      throw new Error(error.message || "Error al invocar la función de Supabase");
    }

    if (data && data.success === false) {
      throw new Error(data.error || "Error devuelto por la IA");
    }

    // Retorna data.data ya que el wrapper es { success: true, data: parsedData }
    return data.data || data;
  } catch (error) {
    console.error("Error extraiendo menú con Claude via Edge Function:", error);
    throw new Error(error.message || "Error al comunicarse con la función de Supabase.");
  }
};

export const generateProductDescription = async (productName) => {
  try {
    const { data, error } = await supabase.functions.invoke('claude', {
      body: {
        action: 'generate_description',
        payload: {
          productName
        }
      }
    });

    if (error) {
      throw new Error(error.message || "Error al invocar la función de Supabase");
    }

    if (data && data.success === false) {
      throw new Error(data.error || "Error devuelto por la IA al generar descripción");
    }

    return data.description;
  } catch (error) {
    console.error("Error al generar descripción con Claude via Edge Function:", error);
    throw new Error(error.message || "Error al comunicarse con la función de Supabase.");
  }
};
