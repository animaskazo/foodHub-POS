import { ChevronDown } from 'lucide-react';
import { ActionDropdown } from './ActionDropdown';

const BulkActionMenu = ({ actions }) => (
  <ActionDropdown actions={actions}>
    Acciones <ChevronDown className="size-4" aria-hidden="true" />
  </ActionDropdown>
);

export default BulkActionMenu;
