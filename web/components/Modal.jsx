import { useEffect, useRef } from "preact/hooks";

export function Modal({ open, onClose, title, children }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      class="modal-dialog"
      onCancel={(e) => {
        e.preventDefault();
        onClose?.();
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current) {
          onClose?.();
        }
      }}
    >
      <div class="modal-card">
        {title ? <h3 class="modal-title">{title}</h3> : null}
        <div class="modal-body">{children}</div>
      </div>
    </dialog>
  );
}
