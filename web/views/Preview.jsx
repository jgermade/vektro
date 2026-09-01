import { useEffect, useRef, useState } from "preact/hooks";
import { CanvasBox, Figure } from "../components/CanvasBox.jsx";
import { ProcessingPlaceholder } from "../components/ProcessingPlaceholder.jsx";
import { LightboxModal } from "../components/LightboxModal.jsx";
import { Progress } from "../components/Progress.jsx";
import * as converter from "../services/converter.js";
import { percent, size } from "../services/format.js";
import { t } from "../services/i18n.js";
import { MODES } from "./modes.jsx";

export function OriginalPane() {
  const canvas = useRef(null);
  const image = converter.image.value;
  const source = converter.source.value;

  useEffect(() => {
    if (!image || !canvas.current) return;
    canvas.current.width = image.width;
    canvas.current.height = image.height;
    canvas.current.getContext("2d").putImageData(image, 0, 0);
  }, [image]);

  return (
    <div class="original-pane">
      <Figure
        caption={t("original", "Original")}
        meta={source ? `${source.width}×${source.height} · ${size(source.bytes)}` : ""}
      >
        <CanvasBox id="originalBox" skeleton={!image}>
          <canvas ref={canvas} hidden={!image} />
        </CanvasBox>
      </Figure>
    </div>
  );
}

export function ResultPane() {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fitMode, setFitMode] = useState("vertical");
  const [isDragging, setIsDragging] = useState(false);
  const [isPanned, setIsPanned] = useState(false);

  const svgRef = useRef(null);
  const panRef = useRef({ x: 0, y: 0 });
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });
  const hasMovedRef = useRef(false);

  const image = converter.image.value;
  const source = converter.source.value;
  const svg = converter.svg.value;
  const result = converter.result.value;
  const engine = converter.engine.value;
  const progress = converter.progress.value;
  const pending = converter.pending.value;
  const decoding = converter.decoding.value;
  const ms = converter.elapsed.value;

  useEffect(() => {
    panRef.current = { x: 0, y: 0 };
    setIsPanned(false);
    if (svgRef.current) {
      svgRef.current.style.transform = "";
    }
  }, [fitMode, image]);

  const handlePointerDown = (e) => {
    if (e.target.closest("button")) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if capture fails
    }
    setIsDragging(true);
    hasMovedRef.current = false;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { ...panRef.current };
  };

  const handlePointerMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      hasMovedRef.current = true;
    }
    const x = panStartRef.current.x + dx;
    const y = panStartRef.current.y + dy;
    panRef.current = { x, y };

    if (svgRef.current) {
      svgRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }
  };

  const handlePointerUp = (e) => {
    if (!isDragging) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Capture already released
    }
    setIsDragging(false);
    if (!hasMovedRef.current) {
      setLightboxOpen(true);
    } else {
      if (Math.abs(panRef.current.x) > 2 || Math.abs(panRef.current.y) > 2) {
        setIsPanned(true);
      } else {
        setIsPanned(false);
      }
    }
  };

  const handleSvgClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleFitBtnClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isPanned) {
      panRef.current = { x: 0, y: 0 };
      setIsPanned(false);
      if (svgRef.current) {
        svgRef.current.style.transform = "";
      }
    } else {
      setFitMode((prev) => (prev === "vertical" ? "horizontal" : "vertical"));
    }
  };

  const report = result && engine ? MODES[engine].report(result) : null;
  const currentMode = location.hash.slice(1) in MODES ? location.hash.slice(1) : "illustration";
  const metaText = report ? `${report.meta} · ${size(svg?.length ?? 0)}` : "";

  return (
    <div class="result-pane">
      <Figure
        caption={t("svg", "SVG")}
        meta={metaText}
      >
        <CanvasBox
          id="resultBox"
          class={`fit-${fitMode} ${isDragging ? "is-dragging" : ""}`}
          stale={pending && Boolean(svg)}
          skeleton={!svg && !image}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <button
            type="button"
            class={`floating-fit-btn ${isPanned ? "is-panned" : ""}`}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={handleFitBtnClick}
            title={
              isPanned
                ? t("recenter_image", "Reubicar imagen")
                : fitMode === "vertical"
                  ? t("fit_horizontal", "Cambiar a ajuste horizontal")
                  : t("fit_vertical", "Cambiar a ajuste vertical")
            }
            aria-label={
              isPanned
                ? t("recenter_image", "Reubicar imagen")
                : t("toggle_fit", "Conmutar ajuste de imagen")
            }
          >
            {isPanned ? (
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

          {pending ? (
            <ProcessingPlaceholder image={image} mode={currentMode} fitMode={fitMode} />
          ) : (
            <div
              ref={svgRef}
              class="result-svg clickable"
              title={t("full_page_view", "Haz clic para ver a pantalla completa")}
              onClick={handleSvgClick}
              style={{
                cursor: isDragging ? "grabbing" : "grab",
              }}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          )}
        </CanvasBox>

        <ResultActions />
      </Figure>

      <LightboxModal
        open={lightboxOpen}
        svg={svg}
        meta={metaText}
        initialFitMode={fitMode}
        onClose={() => setLightboxOpen(false)}
        onDownload={converter.download}
      />
    </div>
  );
}

export function ResultActions() {
  const pending = converter.pending.value;
  const svg = converter.svg.value;
  const progress = converter.progress.value;
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!svg) return;
    try {
      await navigator.clipboard.writeText(svg);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback si la Clipboard API falla
    }
  };

  const handleShare = async () => {
    if (!svg) return;
    if (navigator.share) {
      try {
        const file = new File([svg], "vector.svg", { type: "image/svg+xml" });
        await navigator.share({
          files: [file],
          title: "Vektro SVG",
        });
      } catch {
        // Ignorar cancelación o error de compartición
      }
    } else {
      handleCopy();
    }
  };

  return (
    <div class="result-footer-box">
      {pending || !svg ? (
        <div class="progress-wrapper">
          <Progress
            hidden={!progress}
            at={progress ? progress.at : 0}
            label={progress ? progress.label : ""}
            pulse={Boolean(progress && progress.pulse)}
          />
        </div>
      ) : (
        <div class="result-actions">
          <button
            type="button"
            class="icon-only-btn share-btn"
            onClick={handleShare}
            title={t("share_svg", "Compartir SVG")}
            aria-label={t("share_svg", "Compartir SVG")}
          >
            <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
          </button>

          <button
            type="button"
            class="primary download-btn"
            onClick={converter.download}
            title={t("download_svg", "Descargar SVG")}
          >
            <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>{t("download_svg", "Descargar SVG")}</span>
          </button>

          <button
            type="button"
            class="icon-only-btn copy-btn"
            onClick={handleCopy}
            title={copied ? t("copied", "¡Copiado!") : t("copy_svg", "Copiar SVG")}
            aria-label={t("copy_svg", "Copiar SVG")}
          >
            {copied ? (
              <svg class="btn-icon text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

export function ResultHintCard() {
  return (
    <div class="active-hint-card result-hint-card">
      <span class="hint-icon">💡</span>
      <div class="hint-content">
        {converter.activeHint.value || t("default_hint", "Pasa el ratón o pulsa sobre cualquier opción para ver su explicación.")}
      </div>
    </div>
  );
}

export function ResultStats() {
  const source = converter.source.value;
  const svg = converter.svg.value;
  const result = converter.result.value;
  const engine = converter.engine.value;
  const decoding = converter.decoding.value;
  const ms = converter.elapsed.value;

  const report = result && engine ? MODES[engine].report(result) : null;

  return (
    <p class="stats">
      {report && source && !decoding
        ? `${report.stats} · ${percent(svg.length, source.bytes)} del original · ${Math.round(ms)} ms`
        : ""}
    </p>
  );
}

export function Preview() {
  return (
    <section class="preview">
      <div class="panes">
        <OriginalPane />
        <ResultPane />
        <ResultHintCard />
        <ResultStats />
      </div>
    </section>
  );
}
