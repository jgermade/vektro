import { useEffect, useRef, useState } from "preact/hooks";

export function LightboxModal({ open, svg, meta, initialFitMode = "vertical", onClose, onDownload }) {
  const dialogRef = useRef(null);
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [fitMode, setFitMode] = useState(initialFitMode);

  const dragStartRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });
  const touchRef = useRef({ dist: 0, initialZoom: 1 });

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
    setFitMode(initialFitMode);
  }, [initialFitMode]);

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

  const handleTouchStart = (e) => {
    if (e.target.closest("button")) return;
    if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      touchRef.current = { dist, initialZoom: zoom };
    } else if (e.touches.length === 1) {
      const t1 = e.touches[0];
      dragStartRef.current = { x: t1.clientX, y: t1.clientY };
      panStartRef.current = { ...pan };
      setIsDragging(true);
    }
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      if (touchRef.current.dist > 0) {
        const scale = dist / touchRef.current.dist;
        const nextZoom = Math.min(6.0, Math.max(0.4, touchRef.current.initialZoom * scale));
        setZoom(nextZoom);
      }
    } else if (e.touches.length === 1 && isDragging) {
      const t1 = e.touches[0];
      const dx = t1.clientX - dragStartRef.current.x;
      const dy = t1.clientY - dragStartRef.current.y;
      setPan({
        x: panStartRef.current.x + dx,
        y: panStartRef.current.y + dy,
      });
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    touchRef.current.dist = 0;
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
                class="primary icon-only-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onDownload();
                }}
                title="Descargar SVG"
                aria-label="Descargar SVG"
              >
                <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
            ) : null}
            <button
              type="button"
              class="lightbox-close-btn icon-only-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleClose();
              }}
              title="Cerrar"
              aria-label="Cerrar"
            >
              <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
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
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{
            cursor: isDragging ? "grabbing" : zoom > 1.0 ? "grab" : "default",
          }}
        >
          {(() => {
            const isMovedOrZoomed = zoom !== 1.0 || pan.x !== 0 || pan.y !== 0;
            return (
              <button
                type="button"
                class={`lightbox-floating-reset-btn ${isMovedOrZoomed ? "is-panned" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isMovedOrZoomed) {
                    resetZoomAndPan();
                  } else {
                    setFitMode((prev) => (prev === "vertical" ? "horizontal" : "vertical"));
                  }
                }}
                title={
                  isMovedOrZoomed
                    ? "Reajustar vista"
                    : fitMode === "vertical"
                      ? "Cambiar a ajuste horizontal"
                      : "Cambiar a ajuste vertical"
                }
                aria-label={
                  isMovedOrZoomed
                    ? "Reajustar vista"
                    : "Alternar ajuste"
                }
              >
                {isMovedOrZoomed ? (
                  <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
                  </svg>
                ) : fitMode === "vertical" ? (
                  <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4" />
                  </svg>
                ) : (
                  <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4" />
                  </svg>
                )}
              </button>
            );
          })()}

          <div class="lightbox-svg-wrapper checker">
            <div
              class={`lightbox-svg-content fit-${fitMode}`}
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "center center",
                transition: isDragging || (zoom === 1.0 && pan.x === 0 && pan.y === 0) ? "none" : "transform 0.08s ease-out",
              }}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </div>
        </main>
      </div>
    </dialog>
  );
}
