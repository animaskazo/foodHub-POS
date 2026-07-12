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
