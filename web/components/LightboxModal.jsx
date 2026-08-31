import { useEffect, useRef, useState } from "preact/hooks";

export function LightboxModal({ open, svg, meta, onClose, onDownload }) {
  const dialogRef = useRef(null);
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const dragStartRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });

  const resetZoomAndPan = () => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
    setIsDragging(false);
  };

  const handleClose = () => {
    resetZoomAndPan();
    onClose?.();
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      resetZoomAndPan();
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      resetZoomAndPan();
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
    setZoom((prev) => {
      const next = Math.min(5.0, Math.max(0.5, prev * factor));
      if (next === 1.0) {
        setPan({ x: 0, y: 0 });
      }
      return next;
    });
  };

  const zoomIn = () => setZoom((prev) => Math.min(5.0, prev * 1.25));
  const zoomOut = () => {
    setZoom((prev) => {
      const next = Math.max(0.5, prev / 1.25);
      if (next === 1.0) setPan({ x: 0, y: 0 });
      return next;
    });
  };
  const zoomReset = () => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  };

  const handleMouseDown = (e) => {
    // Si el clic no fue en un botón, iniciar arrastre
    if (e.target.closest("button")) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { ...pan };
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan({
      x: panStartRef.current.x + dx,
      y: panStartRef.current.y + dy,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

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

        <main
          class="lightbox-body"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{
            cursor: isDragging ? "grabbing" : zoom > 1.0 ? "grab" : "default",
          }}
        >
          <div
            class="lightbox-svg-wrapper checker"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "center center",
              transition: isDragging || zoom === 1.0 ? "none" : "transform 0.08s ease-out",
            }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </main>
      </div>
    </dialog>
  );
}
