# Botones e iconos de FoodHub

## Contrato compartido

Usar `Button` para acciones y `IconButton` cuando no haya texto visible. `IconButton` requiere `label` y usa iconos de 16 px (20 px en icon-lg), con un área mínima de 44 px en móvil. Los iconos decorativos llevan `aria-hidden="true"`.

| Uso | Variante / tamaño |
| --- | --- |
| Principal | default |
| Alternativa / cancelar | outline |
| Herramienta de bajo énfasis | ghost |
| Eliminar desde un listado | destructive |
| Confirmación final de eliminación | destructive-solid |
| Navegación textual | enlace semántico; link si corresponde al control |
| Escritorio denso | sm: 32 px |
| Acción estándar | default: 40 px |
| Táctil | touch o lg: 48 px |
| Guardar / cobrar en POS | pos: 56 px |

Los botones de texto son cápsulas por defecto. Usar `shape="rounded"` para una excepción intencional. Los tamaños no cambian mayúsculas ni peso de letra. Separación de icono y texto: 8 px, sin `mr-*`/`ml-*` adicionales.

`Button` tiene `type="button"` por defecto. Los formularios deben especificar `type="submit"`. Para operaciones asíncronas, usar `loading` y `loadingText`: deshabilita la acción, expone `aria-busy` y reserva el espacio de ambas etiquetas cuando se configura loadingText. El icono animado respeta movimiento reducido.

Lucide es la biblioteca de acciones. Usar Plus, Minus, Pencil, Trash2, X, ArrowLeft, MoreHorizontal y RefreshCw. Hugeicons permanece encapsulado en IngredientIcon para ingredientes. Mantener logotipos e ilustraciones de contenido.

## Composición

- `QuantityStepper`: cantidad, etiquetas por producto, bloqueo independiente de cada extremo y estado deshabilitado. El consumidor decide los límites y la persistencia. `removeOnDecrease` muestra papelera y anuncia eliminación; no cambia el manejador de negocio. `children` admite el valor editable de stock.
- `ActionDropdown`: menús de acciones individuales y masivas sobre Base UI; navegación por teclado, Escape, portales y devolución de foco.
- `Tooltip`: Base UI, unido al elemento hijo para descripción y apertura con foco. No sustituye el nombre del control. Los hijos deben propagar props y ref al elemento DOM.

Los temas de cocina y tienda pública conservan sus colores semánticos. Cards de productos, selectores de variantes, mesas del plano, pestañas, desplegables de dirección y controles embebidos en campos conservan su estructura especializada. No sustituirlos mecánicamente por botones de acción.

## Validación

`npm run test:ui`, `npm run lint` y `npm run build`.

Se revisaron visualmente los componentes compartidos y el carrito público, y se comprobaron cantidad, menú por teclado, Escape, foco, tooltip y carga en una vista local aislada con datos ficticios. No se ejecutaron cobros, cambios de inventario reales ni recorridos autenticados de producción. Antes de futuras extensiones, revisar móvil/tablet, los temas y los estados con datos representativos.
