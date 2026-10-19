import { getIngredientIcon, recommendIngredientIcon } from '../../utils/ingredientIcons';

export const IngredientIcon = ({ icon, name, className, size = 24 }) => {
  const Icon = getIngredientIcon(icon || (name ? recommendIngredientIcon(name) : null));
  return <Icon className={className} size={size} color="#000" strokeWidth={2} fill="none" aria-hidden="true" />;
};

export default IngredientIcon;
