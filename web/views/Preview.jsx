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

  const image = converter.image.value;
  const source = converter.source.value;
  const svg = converter.svg.value;
  const result = converter.result.value;
  const engine = converter.engine.value;
  const progress = converter.progress.value;
  const pending = converter.pending.value;
  const decoding = converter.decoding.value;
  const ms = converter.elapsed.value;

  async function handleCopy() {
    if (!(await converter.copy())) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleShare() {
    if (!svg) return;
    try {
      const file = new File([svg], "vector.svg", { type: "image/svg+xml" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: "Vektro SVG",
          files: [file],
        });
      } else if (navigator.share) {
        await navigator.share({
          title: "Vektro SVG",
          text: svg,
        });
      } else {
        await handleCopy();
      }
    } catch {
      // User cancelled share dialog
    }
  }

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
          stale={pending && Boolean(svg)}
          skeleton={!svg && !image}
        >
          {pending && !svg ? (
            <ProcessingPlaceholder image={image} mode={currentMode} />
          ) : (
            <div
              class="result-svg clickable"
              title={t("full_page_view", "Haz clic para ver a pantalla completa")}
              onClick={() => setLightboxOpen(true)}
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
