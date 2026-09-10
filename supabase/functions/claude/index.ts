const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Tasa de conversión para cuando el menú trae precios en moneda extranjera.
// Debe mantenerse sincronizada con src/utils/priceParser.js
const USD_TO_CLP = 950;
const EUR_TO_CLP = 1000;
const UF_TO_CLP = 39000;

/**
 * Convierte cualquier formato de precio a entero CLP (>= 0, sin decimales).
 * Duplicado intencional del parser del frontend (la edge function no comparte código).
 * Acepta: "$12.990", "12,990", "12990", "$12.990,50", "12k", "US$9.99", "gratis", etc.
 */
function parsePriceToCLP(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return 0;
    return Math.round(value);
  }
  let s = String(value).trim();
  if (!s) return 0;
  const lower = s.toLowerCase();
  if (/(gratis|gratuito|cortes[ií]a|incluido|inclu[ií]do|consultar|s\/p|^s\.?p\.?$|a convenir|por confirmar)/i.test(lower)) return 0;

  const isUSD = /\busd\b|us\$|u\$|\$us|d[oó]lar|dollar|buck/i.test(s);
  const isEUR = /€|\beur\b/i.test(s);
  const isUF = /\buf\b|\bclf\b|unidad de fomento/i.test(s);

  const kMatch = lower.replace(/\s+/g, '').match(/^[$\w.,]*?(\d[\d.,]*)\s*k$/);
  if (kMatch) {
    const base = parseNumericPart(kMatch[1]);
    if (base === null) return 0;
    return Math.max(0, Math.round(base * 1000 * (isUSD ? USD_TO_CLP : 1)));
  }

  const numeric = parseNumericPart(s);
  if (numeric === null || !Number.isFinite(numeric) || numeric < 0) return 0;

  let clp = numeric;
  if (isUSD) clp = numeric * USD_TO_CLP;
  else if (isEUR) clp = numeric * EUR_TO_CLP;
  else if (isUF) clp = numeric * UF_TO_CLP;
  return Math.max(0, Math.round(clp));
}

function parseNumericPart(raw: string): number | null {
  let s = String(raw).replace(/[^\d.,\s'-]/g, '').trim().replace(/[\s']/g, '');
  if (!s || s === '.' || s === ',' || s === '-') return null;
  s = s.replace(/-/g, '');
  if (!s) return null;
  const hasDot = s.includes('.');
  const hasComma = s.includes(',');
  let normalized: string;
  if (hasDot && hasComma) {
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    const decimalSep = lastDot > lastComma ? '.' : ',';
    const thousandSep = decimalSep === '.' ? ',' : '.';
    normalized = s.split(thousandSep).join('').replace(decimalSep, '.');
  } else if (hasComma) {
    const parts = s.split(',');
    if (parts.length > 2) normalized = parts.join('');
    else {
      const dec = parts[1] ?? '';
      if (dec.length === 2) normalized = parts.join('.');
      else if (dec.length === 3 || dec.length === 0) normalized = parts.join('');
      else normalized = parts.join('.');
    }
  } else if (hasDot) {
    const parts = s.split('.');
    if (parts.length > 2) normalized = parts.join('');
    else {
      const dec = parts[1] ?? '';
      if (dec.length === 3) normalized = parts.join('');
      else normalized = parts.join('.');
    }
  } else {
    normalized = s;
  }
  if (!normalized || normalized === '.') return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Normaliza productos e ingredientes del menú extraído a CLP entero. */
function normalizeMenuPrices(menu: Record<string, unknown>): Record<string, unknown> {
  const out = { ...(menu as object) } as { products?: Array<Record<string, unknown>>; ingredients?: Array<Record<string, unknown>> };
  if (Array.isArray(out.products)) {
    out.products = out.products.map((p) => ({ ...p, price: parsePriceToCLP((p as { price?: unknown }).price) }));
  }
  if (Array.isArray(out.ingredients)) {
    out.ingredients = out.ingredients.map((ing) => ({ ...ing, price: parsePriceToCLP((ing as { price?: unknown }).price) }));
  }
  return out as Record<string, unknown>;
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
Eres un sistema experto en extracción de datos para un software de Punto de Venta (POS) de restaurantes en Chile.
Analiza la siguiente imagen de un menú y extrae toda la información en un formato JSON estricto.

Reglas:
1. Extrae las categorías principales (ej: Pizzas, Bebidas, Entradas).
2. MUY IMPORTANTE SOBRE INGREDIENTES: El texto que aparece debajo de los nombres de los productos, especialmente si está separado por comas o consiste en listas de elementos únicos (ej: "queso, tomate, jamón"), DEBE tratarse como INGREDIENTES individuales y NO como una descripción general.
3. Todo ingrediente detectado bajo un plato debe agregarse a la lista global "ingredients". Asígnales "price": 0 si no tienen precio extra.
4. Extrae todos los productos con su nombre, precio, categoría y sus ingredientes. Usa el campo "description" SOLO si es una frase puramente descriptiva o publicitaria; si son elementos separados por comas, van en "ingredients".
5. PRECIOS — SIEMPRE EN PESOS CHILENOS (CLP), número entero sin decimales, sin símbolos ni puntos de miles:
   - "$12.990", "12.990", "12,990", "12990", "CLP 12.990" → 12990
   - "$12.990,50" o "12,990.50" → 12991 (redondeado, CLP no usa decimales)
   - "12k" o "12,5k" → 12000 o 12500
   - Si el precio está en dólares ("US$9.99", "USD 10", "10 dólares") conviértelo a CLP multiplicando por ~950. Si está en euros ("€10") multiplica por ~1000. Si está en UF multiplica por ~39000.
   - Si dice "gratis", "incluido", "s/p", "consultar" o no tiene precio visible → 0
   - NUNCA devuelvas strings como "$12.990" ni decimales como 12.99 para representar $12.990. Siempre entero CLP.
   - Ejemplos: "$8.500" → 8500. "US$10" → 9500. "Gratis" → 0.
6. Devuelve SOLO un objeto JSON válido, sin bloques de código ni markdown.

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
      "price": 12990,
      "category": "nombre_categoria_1",
      "ingredients": ["tomate", "queso"]
    }
  ]
}
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
      let parsedData: Record<string, unknown>;
      try {
        parsedData = JSON.parse(cleanedText);
      } catch {
        // Fallback: extraer el primer bloque {...} válido si la IA agregó texto extra
        const match = cleanedText.match(/\{[\s\S]*\}/);
        if (!match) throw new Error("La IA no devolvió un JSON válido");
        parsedData = JSON.parse(match[0]);
      }
      // Defensa en profundidad: aunque el prompt exige entero CLP, la IA a veces
      // devuelve strings ("$12.990") o decimales. Normalizar todo a CLP aquí.
      parsedData = normalizeMenuPrices(parsedData);

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

    } else if (action === 'generate_joke') {
      const topics = [
        "especias raras", "el origen de la pizza", "frutas exóticas", 
        "técnicas de cocina antiguas", "datos curiosos del café", 
        "historia del chocolate", "el umami", "fermentación tradicional",
        "quesos del mundo", "comida espacial", "gastronomía japonesa",
        "el picante y los chiles", "postres históricos", "vegetales extraños",
        "el mundo del té", "el sushi", "cultura del vino", "panadería milenaria",
        "datos sorprendentes sobre el agua", "la miel que no caduca", "hongos comestibles",
        "los primeros restaurantes", "inventos culinarios por accidente", "comida de reyes",
        "comida callejera asiática", "historia de las hamburguesas", "frutas que ya no existen",
        "datos sobre el ajo", "curiosidades del azúcar", "el origen del helado"
      ];
      const randomTopic = topics[Math.floor(Math.random() * topics.length)];

      const prompt = `
Eres un experto en cultura general y gastronomía. Tu objetivo es sorprender y entretener al cliente que acaba de hacer un pedido de comida.
Genera una curiosidad o dato interesante corto (máximo 2 líneas) sobre el mundo de la cocina, los alimentos, o alguna curiosidad fascinante del mundo en general.
IMPORTANTE: Para asegurar variedad, centra esta curiosidad en el siguiente tema específico: "${randomTopic}".
Reglas:
1. DEBE ser un dato real, curioso y sorprendente.
2. NO repitas datos súper conocidos (ej: "el tomate es una fruta"). Sé original.
3. Totalmente apto para todo público.
4. Devuelve SOLO la curiosidad directa, sin comillas, sin introducciones ni emoticones.
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
          temperature: 0.9,
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
      const joke = resData.content[0].text.trim();

      return new Response(JSON.stringify({ success: true, joke }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });

    } else if (action === 'analyze_sales') {
      const { question, summaryData, chatHistory } = payload || {};
      if (!question || !summaryData) {
        return new Response(JSON.stringify({ success: false, error: "Faltan parámetros question o summaryData" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const systemPrompt = `
Eres "FoodHub BI", un asistente experto en análisis financiero y consultor de inteligencia de negocios para restaurantes y locales de comida.
Tu trabajo es responder las preguntas del administrador utilizando los datos reales del reporte del mes actual que se te proveen en formato JSON.

REGLAS DE RESPUESTA:
1. Responde de forma concisa, clara, profesional y entusiasta, con un tono ejecutivo.
2. Utiliza siempre formato Markdown (negrita, viñetas, tablas cortas si aplica) para que la respuesta sea fácil de leer.
3. Formatea los montos en pesos chilenos ($XX.XXX).
4. Si la pregunta solicita recomendaciones, da consejos prácticos basados en los datos (ej: impulsar ciertos canales, promociones en horas valle).
5. Si los datos no contienen la información solicitada para responder exactamente la pregunta, indícalo amablemente.
      `;

      const userContent = `
DATOS DEL REPORTE MENSUAL EN CURSO:
\`\`\`json
${JSON.stringify(summaryData, null, 2)}
\`\`\`

PREGUNTA DEL ADMINISTRADOR:
"${question}"
      `;

      const formattedMessages = [
        ...(Array.isArray(chatHistory) ? chatHistory.map(msg => ({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.text
        })) : []),
        { role: 'user', content: userContent }
      ];

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 600,
          temperature: 0.7,
          system: systemPrompt,
          messages: formattedMessages
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
      const answer = resData.content[0].text.trim();

      return new Response(JSON.stringify({ success: true, answer }), {
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
