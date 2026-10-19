import { MoreHorizontal, Trash2, Copy } from 'lucide-react';
import { ActionDropdown } from './ActionDropdown';

const ActionMenu = ({ onDelete, onDuplicate, label = 'Más acciones' }) => {
  const actions = [
    onDuplicate && { label: 'Duplicar', icon: <Copy />, onClick: onDuplicate },
    onDelete && { label: 'Eliminar', icon: <Trash2 />, onClick: onDelete, destructive: true },
  ].filter(Boolean);
  return (
    <ActionDropdown actions={actions} label={label} iconOnly>
      <MoreHorizontal className="size-4" aria-hidden="true" />
    </ActionDropdown>
  );
};

export default ActionMenu;
