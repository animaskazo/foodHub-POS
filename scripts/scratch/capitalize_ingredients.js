import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const capitalizeFirstLetter = (string) => {
  if (!string) return '';
  return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
};

async function run() {
  const email = 'animaskazo@gmail.com';
  const password = 'Amelia0920+';

  console.log("Autenticando...");
  const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
  
  if (authError) {
    console.error("Error al autenticar:", authError.message);
    return;
  }

  console.log("Obteniendo ingredientes...");
  const { data: ingredients, error: fetchError } = await supabase.from('ingredients').select('id, name');

  if (fetchError) {
    console.error("Error al obtener:", fetchError);
    return;
  }

  console.log(`Actualizando ${ingredients.length} ingredientes...`);
  for (const ing of ingredients) {
    const newName = capitalizeFirstLetter(ing.name.trim());
    if (newName !== ing.name) {
      await supabase.from('ingredients').update({ name: newName }).eq('id', ing.id);
      console.log(`- "${ing.name}" -> "${newName}"`);
    }
  }

  console.log("¡Listo!");
}

run();
