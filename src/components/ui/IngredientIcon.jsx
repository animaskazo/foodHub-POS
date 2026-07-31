import { HugeiconsIcon } from '@hugeicons/react';
import { getIngredientIcon, recommendIngredientIcon } from '../../utils/ingredientIcons';

export const IngredientIcon = ({ icon, name, className, size = 24 }) => {
  const resolved = getIngredientIcon(icon || (name ? recommendIngredientIcon(name) : null));
  return <HugeiconsIcon icon={resolved} className={className} size={size} color="currentColor" strokeWidth={1.5} />;
};

export default IngredientIcon;
