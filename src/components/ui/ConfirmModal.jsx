import React from 'react';
import Modal from './Modal';
import { Button } from './button';

const ConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  icon: Icon,
  confirmVariant = 'default',
  loading = false,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} hideHeader maxWidth="max-w-sm">
      <div className="p-6 text-center">
        {Icon && (
          <Icon className="mx-auto mb-4 h-8 w-8" />
        )}
        <h2 className="text-xl font-bold text-gray-900 mb-2">{title}</h2>
        {description && <p className="text-gray-500 mb-6">{description}</p>}

        <div className="flex gap-3 justify-center">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onClose}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant}
            className="flex-1"
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ConfirmModal;
