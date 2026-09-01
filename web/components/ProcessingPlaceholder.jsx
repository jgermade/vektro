import { useEffect, useRef } from "preact/hooks";

export function ProcessingPlaceholder({ image, mode, fitMode = "vertical" }) {
  const canvasRef = useRef(null);
  const pixelCanvasRef = useRef(null);
  const feFuncRRef = useRef(null);
  const feFuncGRef = useRef(null);
  const feFuncBRef = useRef(null);

  useEffect(() => {
    if (!image || !canvasRef.current) return;
    const maxDim = 800;
    let targetW = image.width;
    let targetH = image.height;
    if (targetW > maxDim || targetH > maxDim) {
      const scale = maxDim / Math.max(targetW, targetH);
      targetW = Math.round(targetW * scale);
      targetH = Math.round(targetH * scale);
    }
    canvasRef.current.width = targetW;
    canvasRef.current.height = targetH;
    const ctx = canvasRef.current.getContext("2d");

    if (targetW === image.width && targetH === image.height) {
      ctx.putImageData(image, 0, 0);
    } else {
      const fullCanvas = document.createElement("canvas");
      fullCanvas.width = image.width;
      fullCanvas.height = image.height;
      fullCanvas.getContext("2d").putImageData(image, 0, 0);
      ctx.drawImage(fullCanvas, 0, 0, targetW, targetH);
    }
  }, [image]);

  // Animación Pixel art: oscilar tamaño de píxeles
  useEffect(() => {
    if (!image || mode !== "pixelart" || !pixelCanvasRef.current) return;
    const maxDim = 800;
    let animW = image.width;
    let animH = image.height;
    if (animW > maxDim || animH > maxDim) {
      const scale = maxDim / Math.max(animW, animH);
      animW = Math.round(animW * scale);
      animH = Math.round(animH * scale);
    }

    const canvas = pixelCanvasRef.current;
    canvas.width = animW;
    canvas.height = animH;
    const ctx = canvas.getContext("2d");

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = animW;
    tempCanvas.height = animH;
    const tempCtx = tempCanvas.getContext("2d");
    if (animW === image.width && animH === image.height) {
      tempCtx.putImageData(image, 0, 0);
    } else {
      const fullCanvas = document.createElement("canvas");
      fullCanvas.width = image.width;
      fullCanvas.height = image.height;
      fullCanvas.getContext("2d").putImageData(image, 0, 0);
      tempCtx.drawImage(fullCanvas, 0, 0, animW, animH);
    }

    const offscreen = document.createElement("canvas");
    const offCtx = offscreen.getContext("2d");

    let animId;
    let startTime = performance.now();

    function render(now) {
      const elapsed = (now - startTime) / 1000;
      const pixelSize = 8 + 20 * (0.5 + 0.5 * Math.sin(elapsed * 2.8));

      const lowW = Math.max(8, Math.round(animW / pixelSize));
      const lowH = Math.max(8, Math.round(animH / pixelSize));

      if (offscreen.width !== lowW || offscreen.height !== lowH) {
        offscreen.width = lowW;
        offscreen.height = lowH;
      }

      offCtx.drawImage(tempCanvas, 0, 0, lowW, lowH);

      ctx.clearRect(0, 0, animW, animH);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(offscreen, 0, 0, lowW, lowH, 0, 0, animW, animH);

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

  const badgeLabel = mode === "pixelart" ? "Pixel art" : "Ilustración";

  return (
    <div
      class={`processing-placeholder mode-${mode} fit-${fitMode}`}
      aria-label="Procesando imagen"
    >
      {image ? (
        <div
          class="processing-canvas-wrap"
          style={{ aspectRatio: `${image.width} / ${image.height}` }}
        >
          <canvas ref={canvasRef} class="processing-canvas" />
          {mode === "pixelart" ? (
            <canvas ref={pixelCanvasRef} class="processing-pixel-canvas" />
          ) : null}
        </div>
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
        <span class="processing-badge">{badgeLabel}</span>
      </div>
    </div>
  );
}
