import { supabase } from '../lib/supabase';
import { uploadImage } from './storageService';
import { GoogleGenerativeAI } from '@google/generative-ai';

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

export const generateProductImage = async (productName, description = '', comboItems = [], imageDetails = '') => {
  try {
    const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY;

    const { data, error } = await supabase.functions.invoke('claude', {
      body: {
        action: 'generate_image',
        payload: {
          productName,
          description,
          comboItems,
          geminiApiKey,
          imageDetails
        }
      }
    });

    if (error) {
      throw new Error(error.message || "Error al invocar la función de Supabase");
    }

    if (data && data.success === false) {
      throw new Error(data.error || "Error devuelto por la IA al generar la imagen");
    }

    // Convertir la cadena base64 devuelta a un Blob
    const byteCharacters = atob(data.imageBase64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: data.mimeType || 'image/jpeg' });

    // Crear un archivo y subirlo
    const filename = `generated-combo-${Date.now()}.jpg`;
    const file = new File([blob], filename, { type: data.mimeType || 'image/jpeg' });

    const finalUrl = await uploadImage(file, 'products');
    return finalUrl;
  } catch (error) {
    console.error("Error al generar imagen gastronómica con Supabase Edge Function:", error);
    throw new Error(error.message || "No se pudo generar la imagen del producto. Inténtalo de nuevo.");
  }
};
