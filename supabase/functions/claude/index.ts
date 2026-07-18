const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  // Manejo de Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const apiKey = Deno.env.get("CLAUDE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ success: false, error: "CLAUDE_API_KEY no está configurada en las variables de entorno de Supabase" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { action, payload } = await req.json();

    if (action === 'extract_menu') {
      const { imageBase64, mimeType } = payload;
      if (!imageBase64 || !mimeType) {
        return new Response(JSON.stringify({ success: false, error: "Faltan parámetros imageBase64 o mimeType" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

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

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
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
                    data: imageBase64,
                  },
                }
              ]
            }
          ]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        return new Response(JSON.stringify({ success: false, error: `Anthropic API error: ${response.status} - ${errorText}` }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const resData = await response.json();
      const responseText = resData.content[0].text;
      const cleanedText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsedData = JSON.parse(cleanedText);

      return new Response(JSON.stringify({ success: true, data: parsedData }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });

    } else if (action === 'generate_description') {
      const { productName } = payload;
      if (!productName) {
        return new Response(JSON.stringify({ success: false, error: "Falta el parámetro productName" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const prompt = `
Eres un redactor gastronómico experto. Escribe una descripción breve, muy atractiva y apetitosa (máximo 2 frases, idealmente en español de Chile) para un plato llamado "${productName}". 
La descripción debe sonar natural, tentar al cliente y no superar las 2 líneas en pantalla. No uses hashtags ni formato markdown. Devuelve SOLO el texto de la descripción, sin introducciones ni comentarios adicionales.
      `;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 150,
          messages: [
            {
              role: "user",
              content: prompt
            }
          ]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        return new Response(JSON.stringify({ success: false, error: `Anthropic API error: ${response.status} - ${errorText}` }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const resData = await response.json();
      const description = resData.content[0].text.trim();

      return new Response(JSON.stringify({ success: true, description }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });

    } else if (action === 'generate_image') {
      const { productName, description, comboItems, geminiApiKey, imageDetails } = payload;
      if (!productName) {
        return new Response(JSON.stringify({ success: false, error: "Falta el parámetro productName" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const apiKeyToUse = geminiApiKey || Deno.env.get("GEMINI_API_KEY");
      if (!apiKeyToUse) {
        return new Response(JSON.stringify({ success: false, error: "No se proporcionó la API Key de Gemini" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      let imagePrompt = `A professional gourmet food photography of ${productName}`;
      if (description) {
        imagePrompt += `. ${description.replace(/["]/g, '')}`;
      }
      if (comboItems && comboItems.length > 0) {
        imagePrompt += `. Placed next to: ${comboItems.join(', ')}`;
      }
      if (imageDetails) {
        imagePrompt += `. Style/Details: ${imageDetails.replace(/["]/g, '')}`;
      }
      imagePrompt += `. Premium restaurant presentation, top-down clean food shot, beautiful color grading, studio lighting, hyper-realistic, extremely detailed`;

      try {
        let url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";
        const headers: Record<string, string> = {
          "Content-Type": "application/json"
        };
        
        if (apiKeyToUse.startsWith("AIzaSy")) {
          url += `?key=${apiKeyToUse}`;
        } else {
          headers["Authorization"] = `Bearer ${apiKeyToUse}`;
        }

        const geminiRes = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `Generate a detailed Stable Diffusion prompt in English to create a realistic food photo of: "${productName}". Description: "${description}". Combo items: "${comboItems.join(', ')}".${imageDetails ? ` Requested style details: "${imageDetails}".` : ''} Return ONLY the prompt text, no intro, no comments, no quotes.`
                  }
                ]
              }
            ]
          })
        });

        if (geminiRes.ok) {
          const resData = await geminiRes.json();
          const responseText = resData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (responseText && responseText.trim()) {
            imagePrompt = responseText.trim();
          }
        } else {
          console.warn("Gemini API returned error:", geminiRes.status, await geminiRes.text());
        }
      } catch (geminiError) {
        console.warn("Gemini request failed in edge function, using fallback prompt:", geminiError);
      }

      // Normalizar texto: remover acentos, eñes y caracteres especiales, y acortar la longitud del prompt
      const cleanPrompt = imagePrompt.trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Remueve acentos
        .replace(/[^a-zA-Z0-9\s,._-]/g, "") // Mantener letras, números, espacios y signos básicos
        .replace(/\.+$/, "") // Evitar punto final
        .substring(0, 300); // Cortar para evitar URL excesiva

      const encodedPrompt = encodeURIComponent(cleanPrompt);
      const randomSeed = Math.floor(Math.random() * 999999999);
      const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=800&height=800&nologo=true&seed=${randomSeed}`;

      const imageRes = await fetch(imageUrl);
      if (!imageRes.ok) {
        throw new Error(`Error al obtener imagen de Pollinations: ${imageRes.status}`);
      }
      
      const arrayBuffer = await imageRes.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      let binary = '';
      const len = uint8Array.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(uint8Array[i]);
      }
      const base64Image = btoa(binary);

      return new Response(JSON.stringify({ success: true, imageBase64: base64Image, mimeType: 'image/jpeg' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });

    } else {
      return new Response(JSON.stringify({ success: false, error: "Acción no soportada" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message || "Error interno del servidor" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
