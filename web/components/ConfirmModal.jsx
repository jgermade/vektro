import { Modal } from "./Modal.jsx";

export function ConfirmModal({ open, fileName, onConfirm, onCancel }) {
  return (
    <Modal open={open} onClose={onCancel} title="¿Reemplazar imagen actual?">
      <p class="confirm-message">
        Ya hay una imagen cargada en el espacio de trabajo. ¿Deseas reemplazarla por{" "}
        <strong>{fileName || "la nueva imagen"}</strong>?
      </p>
      <div class="modal-actions">
        <button type="button" onClick={onCancel}>
          Cancelar
        </button>
        <button type="button" class="primary" onClick={onConfirm} autoFocus>
          Reemplazar
        </button>
      </div>
    </Modal>
  );
}
