import {
  Home,
  Users,
  Lightbulb,
  Droplets,
  Flame,
  Wifi,
  Calculator,
  Landmark,
  ShieldCheck,
  Siren,
  Globe,
  ShoppingCart,
  Drumstick,
  Beef,
  Fish,
  Apple,
  Milk,
  Croissant,
  CupSoda,
  Beer,
  Coffee,
  ShoppingBasket,
  Soup,
  Snowflake,
  Package,
  Bike,
  Fuel,
  Clock,
  Wrench,
  Bug,
  Shirt,
  WashingMachine,
  Megaphone,
  Sparkles,
  Tag,
} from 'lucide-react';

// Registro para override manual: si una categoría trae `icon` con uno de
// estos nombres, se usa ese en vez de la detección automática.
export const CATEGORY_ICONS = {
  Home,
  Users,
  Lightbulb,
  Droplets,
  Flame,
  Wifi,
  Calculator,
  Landmark,
  ShieldCheck,
  Siren,
  Globe,
  ShoppingCart,
  Drumstick,
  Beef,
  Fish,
  Apple,
  Milk,
  Croissant,
  CupSoda,
  Beer,
  Coffee,
  ShoppingBasket,
  Soup,
  Snowflake,
  Package,
  Bike,
  Fuel,
  Clock,
  Wrench,
  Bug,
  Shirt,
  WashingMachine,
  Megaphone,
  Sparkles,
  Tag,
};

// Reglas en orden: la primera coincidencia gana.
const RULES = [
  [['alarma', 'monitoreo'], Siren],
  [['seguro'], ShieldCheck],
  [['contador'], Calculator],
  [['patente', 'municipal'], Landmark],
  [['arriendo'], Home],
  [['uniforme'], Shirt],
  [['sueldo', 'nomina'], Users],
  [['hora'], Clock],
  [['plaga', 'fumiga'], Bug],
  [['luz', 'electric'], Lightbulb],
  [['agua'], Droplets],
  [['hielo'], Snowflake],
  [['gas'], Flame],
  [['internet', 'telefono', 'wifi'], Wifi],
  [['software', 'suscripci', 'sistema'], Globe],
  [['pollo'], Drumstick],
  [['carne', 'vacuno', 'cerdo'], Beef],
  [['pescado', 'marisco'], Fish],
  [['fruta', 'verdura', 'feria'], Apple],
  [['lacteo', 'huevo', 'queso'], Milk],
  [['pan', 'masa', 'pastel'], Croissant],
  [['bebida', 'jugo', 'gaseosa'], CupSoda],
  [['cerveza', 'licor', 'vino', 'alcohol'], Beer],
  [['cafe'], Coffee],
  [['aceite', 'abarrote', 'arroz', 'harina'], ShoppingBasket],
  [['especia', 'salsa', 'condimento'], Soup],
  [['carbon', 'lena'], Flame],
  [['packaging', 'desechable', 'envase'], Package],
  [['delivery', 'reparto', 'comision', 'uber', 'rappi', 'pedidos'], Bike],
  [['flete', 'combustible', 'bencina'], Fuel],
  [['mantenci', 'manteni', 'equipo', 'reparaci'], Wrench],
  [['lavander', 'mantel'], WashingMachine],
  [['marketing', 'publicidad', 'redes'], Megaphone],
  [['limpieza', 'aseo'], Sparkles],
  [['insumo', 'mercader', 'materia'], ShoppingCart],
];

const normalize = (s) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export const getExpenseCategoryIcon = (name) => {
  const n = normalize(name);
  for (const [keywords, Icon] of RULES) {
    if (keywords.some((k) => n.includes(k))) return Icon;
  }
  return Tag;
};

export const resolveCategoryIcon = (category) => {
  if (category?.icon && CATEGORY_ICONS[category.icon]) return CATEGORY_ICONS[category.icon];
  return getExpenseCategoryIcon(category?.name);
};
