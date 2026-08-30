import { useEffect, useRef, useState } from "preact/hooks";
import { CanvasBox, Figure } from "../components/CanvasBox.jsx";
import { ProcessingPlaceholder } from "../components/ProcessingPlaceholder.jsx";
import { LightboxModal } from "../components/LightboxModal.jsx";
import { Progress } from "../components/Progress.jsx";
import * as converter from "../services/converter.js";
import { percent, size } from "../services/format.js";
import { MODES } from "./modes.jsx";

export function Preview() {
  const canvas = useRef(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);

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
    if (!image || !canvas.current) return;
    canvas.current.width = image.width;
    canvas.current.height = image.height;
    canvas.current.getContext("2d").putImageData(image, 0, 0);
  }, [image]);

  // Las cifras se leen con el vocabulario de la segmentación que las produjo,
  // no con el de la pestaña abierta.
  const report = result && engine ? MODES[engine].report(result) : null;
  const currentMode = location.hash.slice(1) in MODES ? location.hash.slice(1) : "illustration";
  const metaText = report ? `${report.meta} · ${size(svg?.length ?? 0)}` : "";

  return (
    <section class="preview">
      <div class="panes">
        <Figure
          caption="Original"
          meta={source ? `${source.width}×${source.height} · ${size(source.bytes)}` : ""}
        >
          <CanvasBox id="originalBox" skeleton={!image}>
            <canvas ref={canvas} hidden={!image} />
          </CanvasBox>
        </Figure>

        <Figure
          caption="SVG"
          meta={metaText}
        >
          <CanvasBox
            id="resultBox"
            stale={false}
            skeleton={!svg && !image}
          >
            {pending || !svg ? (
              <ProcessingPlaceholder image={image} mode={currentMode} />
            ) : (
              <div
                class="result-svg clickable"
                title="Haz clic para ver a pantalla completa"
                onClick={() => setLightboxOpen(true)}
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            )}
          </CanvasBox>
        </Figure>
      </div>

      <LightboxModal
        open={lightboxOpen}
        svg={svg}
        meta={metaText}
        onClose={() => setLightboxOpen(false)}
        onDownload={converter.download}
      />

      <Progress
        hidden={!progress}
        at={progress ? progress.at : 0}
        label={progress ? progress.label : ""}
        pulse={Boolean(progress && progress.pulse)}
      />

      <p class="stats">
        {report && source && !decoding
          ? `${report.stats} · ${percent(svg.length, source.bytes)} del original · ${Math.round(ms)} ms`
          : ""}
      </p>
    </section>
  );
}
