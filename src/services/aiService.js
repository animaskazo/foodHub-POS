import Anthropic from '@anthropic-ai/sdk';

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

/**
 * Usa Claude de Anthropic para extraer el menú de una foto.
 */
export const extractMenuFromImage = async (imageFile, apiKey) => {
  if (!apiKey) throw new Error("API Key de Anthropic no proporcionada");

  const anthropic = new Anthropic({
    apiKey: apiKey,
    baseURL: window.location.origin + '/api/anthropic',
    dangerouslyAllowBrowser: true // Requerido porque corremos esto en el frontend Vite
  });

  const { data, mimeType } = await fileToBase64Info(imageFile);

  const prompt = `
Eres un sistema experto en extracción de datos para un software de Punto de Venta (POS) de restaurantes.
Analiza la siguiente imagen de un menú y extrae toda la información en un formato JSON estricto.

Reglas:
1. Extrae las categorías principales (ej: Pizzas, Bebidas, Entradas).
2. MUY IMPORTANTE SOBRE INGREDIENTES: El texto que aparece debajo de los nombres de los productos, especialmente si está separado por comas o consiste en listas de elementos únicos (ej: "queso, tomate, jamón"), DEBE tratarse como INGREDIENTES individuales y NO como una descripción general.
3. Todo ingrediente detectado bajo un plato debe agregarse a la lista global "ingredients". Asígnales "price": 0 si no tienen precio extra.
4. Extrae todos los productos con su nombre, precio, categoría y sus ingredientes. Usa el campo "description" SOLO si es una frase puramente descriptiva o publicitaria; si son elementos separados por comas, van en "ingredients".
5. Devuelve SOLO un objeto JSON válido, sin bloques de código ni markdown.

Estructura del JSON:
{
  "categories": ["nombre_categoria_1", "nombre_categoria_2"],
  "ingredients": [
    { "name": "tomate", "price": 0 },
    { "name": "queso", "price": 0 }
  ],
  "products": [
    {
      "name": "nombre producto",
      "description": "descripción promocional (opcional, omitir si es solo lista de ingredientes)",
      "price": 0,
      "category": "nombre_categoria_1",
      "ingredients": ["tomate", "queso"]
    }
  ]
}

Ten en cuenta que los precios deben ser números (sin símbolos). Si no hay ingredientes, deja el arreglo vacío. Procesa todo el texto bajo el producto como ingredientes si están separados por comas.
  `;

  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      temperature: 1,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt
            },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mimeType,
                data: data,
              },
            }
          ],
        }
      ],
      thinking: { type: "disabled" }
    });

    const responseText = msg.content[0].text;
    
    // Limpiar posible formato markdown (ej. ```json ... ```) por si acaso el modelo los incluye a pesar del system prompt
    const cleanedText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    return JSON.parse(cleanedText);
  } catch (error) {
    console.error("Error extraiendo menú con Claude:", error);
    throw new Error(error.message || "Error desconocido al comunicarse con Claude.");
  }
};

/**
 * Genera una descripción persuasiva y apetitosa para un plato basándose en su nombre.
 */
export const generateProductDescription = async (productName) => {
  const apiKey = import.meta.env.VITE_CLAUDE_API_KEY;
  if (!apiKey) throw new Error("API Key de Anthropic no configurada en las variables de entorno");

  const anthropic = new Anthropic({
    apiKey: apiKey,
    baseURL: window.location.origin + '/api/anthropic',
    dangerouslyAllowBrowser: true
  });

  const prompt = `
Eres un redactor gastronómico experto. Escribe una descripción breve, muy atractiva y apetitosa (máximo 2 frases, idealmente en español de Chile) para un plato llamado "${productName}". 
La descripción debe sonar natural, tentar al cliente y no superar las 2 líneas en pantalla. No uses hashtags ni formato markdown. Devuelve SOLO el texto de la descripción, sin introducciones ni comentarios adicionales.
  `;

  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 150,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      thinking: { type: "disabled" }
    });

    return msg.content[0].text.trim();
  } catch (error) {
    console.error("Error al generar descripción con Claude:", error);
    throw new Error(error.message || "Error al comunicarse con Claude.");
  }
};

