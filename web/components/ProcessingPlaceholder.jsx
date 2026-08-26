import { useEffect, useRef } from "preact/hooks";

export function ProcessingPlaceholder({ image, mode }) {
  const canvasRef = useRef(null);
  const pixelCanvasRef = useRef(null);
  const feFuncRRef = useRef(null);
  const feFuncGRef = useRef(null);
  const feFuncBRef = useRef(null);

  useEffect(() => {
    if (!image || !canvasRef.current) return;
    canvasRef.current.width = image.width;
    canvasRef.current.height = image.height;
    const ctx = canvasRef.current.getContext("2d");
    ctx.putImageData(image, 0, 0);
  }, [image]);

  // Animación Pixel art: oscilar tamaño de píxeles
  useEffect(() => {
    if (!image || mode !== "pixelart" || !pixelCanvasRef.current) return;
    const canvas = pixelCanvasRef.current;
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = image.width;
    tempCanvas.height = image.height;
    tempCanvas.getContext("2d").putImageData(image, 0, 0);

    const offscreen = document.createElement("canvas");
    const offCtx = offscreen.getContext("2d");

    let animId;
    let startTime = performance.now();

    function render(now) {
      const elapsed = (now - startTime) / 1000;
      const pixelSize = 8 + 20 * (0.5 + 0.5 * Math.sin(elapsed * 2.8));

      const lowW = Math.max(8, Math.round(image.width / pixelSize));
      const lowH = Math.max(8, Math.round(image.height / pixelSize));

      offscreen.width = lowW;
      offscreen.height = lowH;
      offCtx.drawImage(tempCanvas, 0, 0, lowW, lowH);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(offscreen, 0, 0, lowW, lowH, 0, 0, image.width, image.height);

      animId = requestAnimationFrame(render);
    }

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [image, mode]);

  // Animación Ilustración: cambiar niveles de posterizado de más a menos colores
  useEffect(() => {
    if (mode !== "illustration") return;
    let animId;
    let startTime = performance.now();

    function updatePosterize(now) {
      const elapsed = (now - startTime) / 1000;
      // Oscila suavemente de 12 niveles (más colores) a 3 niveles (menos colores)
      const t = 0.5 + 0.5 * Math.sin(elapsed * 2.2);
      const numSteps = Math.round(3 + t * 9);

      const tableValues = Array.from({ length: numSteps }, (_, i) =>
        (i / (numSteps - 1)).toFixed(3)
      ).join(" ");

      if (feFuncRRef.current) feFuncRRef.current.setAttribute("tableValues", tableValues);
      if (feFuncGRef.current) feFuncGRef.current.setAttribute("tableValues", tableValues);
      if (feFuncBRef.current) feFuncBRef.current.setAttribute("tableValues", tableValues);

      animId = requestAnimationFrame(updatePosterize);
    }

    animId = requestAnimationFrame(updatePosterize);
    return () => {
      cancelAnimationFrame(animId);
    };
  }, [mode]);

  const aspectRatio = image ? `${image.width} / ${image.height}` : "1 / 1";
  const badgeLabel = mode === "pixelart" ? "Pixel art" : "Ilustración";

  return (
    <div
      class={`processing-placeholder mode-${mode}`}
      style={{ aspectRatio }}
      aria-label="Procesando imagen"
    >
      {image ? (
        <>
          <canvas ref={canvasRef} class="processing-canvas" />
          {mode === "pixelart" ? (
            <canvas ref={pixelCanvasRef} class="processing-pixel-canvas" />
          ) : null}
        </>
      ) : (
        <div class="processing-fallback-skeleton" />
      )}

      {mode === "illustration" ? (
        <svg class="svg-posterize-filter" aria-hidden="true" width="0" height="0">
          <filter id="posterize-filter">
            <feComponentTransfer>
              <feFuncR ref={feFuncRRef} type="discrete" tableValues="0 0.25 0.5 0.75 1.0" />
              <feFuncG ref={feFuncGRef} type="discrete" tableValues="0 0.25 0.5 0.75 1.0" />
              <feFuncB ref={feFuncBRef} type="discrete" tableValues="0 0.25 0.5 0.75 1.0" />
            </feComponentTransfer>
          </filter>
        </svg>
      ) : null}

      <div class="processing-effects" aria-hidden="true">
        {mode === "pixelart" ? <div class="effect-pixel-zone-glow" /> : null}
        <span class="processing-badge">{badgeLabel}</span>
      </div>
    </div>
  );
}
