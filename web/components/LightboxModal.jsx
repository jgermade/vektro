import { useEffect, useRef, useState } from "preact/hooks";

export function LightboxModal({ open, svg, meta, onClose, onDownload }) {
  const dialogRef = useRef(null);
  const [zoom, setZoom] = useState(1.0);

  const handleClose = () => {
    setZoom(1.0);
    onClose?.();
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      setZoom(1.0);
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      setZoom(1.0);
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const handleWheel = (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.87;
    setZoom((prev) => Math.min(5.0, Math.max(0.5, prev * factor)));
  };

  const zoomIn = () => setZoom((prev) => Math.min(5.0, prev * 1.25));
  const zoomOut = () => setZoom((prev) => Math.max(0.5, prev / 1.25));
  const zoomReset = () => setZoom(1.0);

  if (!open) return null;

  const zoomPercent = Math.round(zoom * 100);

  return (
    <dialog
      ref={dialogRef}
      class="lightbox-dialog"
      onCancel={(e) => {
        e.preventDefault();
        handleClose();
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current || e.target.classList.contains("lightbox-backdrop")) {
          handleClose();
        }
      }}
    >
      <div class="lightbox-backdrop">
        <header class="lightbox-toolbar">
          <div class="lightbox-meta">
            <span class="lightbox-title">Vista SVG</span>
            {meta ? <span class="lightbox-info">{meta}</span> : null}
          </div>

          <div class="lightbox-zoom-controls">
            <button type="button" class="zoom-btn" onClick={zoomOut} title="Alejar (-)">
              −
            </button>
            <button
              type="button"
              class="zoom-btn zoom-level"
              onClick={zoomReset}
              title="Restablecer a 100%"
            >
              {zoomPercent}%
            </button>
            <button type="button" class="zoom-btn" onClick={zoomIn} title="Acercar (+)">
              +
            </button>
          </div>

          <div class="lightbox-actions">
            {onDownload ? (
              <button
                type="button"
                class="primary"
                onClick={(e) => {
                  e.stopPropagation();
                  onDownload();
                }}
              >
                Descargar SVG
              </button>
            ) : null}
            <button
              type="button"
              class="lightbox-close-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleClose();
              }}
              aria-label="Cerrar"
            >
              ✕ Cerrar
            </button>
          </div>
        </header>

        <main class="lightbox-body" onWheel={handleWheel}>
          <div
            class="lightbox-svg-wrapper checker"
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: "center center",
              transition: zoom === 1.0 ? "none" : "transform 0.08s ease-out",
            }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </main>
      </div>
    </dialog>
  );
}
