import { useEffect, useRef, useState } from "preact/hooks";
import { DropZone } from "../components/DropZone.jsx";
import { DropOverlay } from "../components/DropOverlay.jsx";
import { ConfirmModal } from "../components/ConfirmModal.jsx";
import * as converter from "../services/converter.js";
import { Header } from "./Header.jsx";
import { Footer } from "./Footer.jsx";
import { Preview } from "./Preview.jsx";
import { PixelartPanel } from "./PixelartPanel.jsx";
import { IllustrationPanel } from "./IllustrationPanel.jsx";
import { MODES, modeFromHash } from "./modes.jsx";

const PANELS = { pixelart: PixelartPanel, illustration: IllustrationPanel };

export function App() {
  const [mode, setMode] = useState(modeFromHash);
  const [settings, setSettings] = useState(() => ({
    pixelart: { ...MODES.pixelart.defaults },
    illustration: { ...MODES.illustration.defaults },
  }));
  const [isDragging, setIsDragging] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);

  const active = converter.active.value;
  const error = converter.error.value;

  useEffect(() => {
    document.body.dataset.mode = mode;
  }, [mode]);

  /** Convierte con los ajustes de un modo. Un solo sitio que arma opciones. */
  function convert(which, values, { debounce = false } = {}) {
    converter.convert(which, MODES[which].options(values), { debounce });
  }

  // Un cambio de ajuste: se guarda y se convierte. Rebota o no según el tipo de
  // control, que es quien lo sabe.
  function change(patch, { continuous = false } = {}) {
    const values = { ...settings[mode], ...patch };
    setSettings((prev) => ({ ...prev, [mode]: values }));
    convert(mode, values, { debounce: continuous });
  }

  // Cambiar de modo reconvierte siempre: el SVG en pantalla es el de la otra
  // segmentación, y sus cifras describen algo que ya no se está viendo.
  function choose(next) {
    if (!(next in MODES)) return;
    setMode(next);
    if (location.hash.slice(1) !== next) {
      history.replaceState(null, "", `#${next}`);
    }
    convert(next, settings[next]);
  }

  async function open(file, name) {
    if (!(await converter.load(file, name ?? file.name))) return;
    // Cada imagen trae su propia rejilla: se vuelve a detectar.
    const pixelart = { ...settings.pixelart, autoScale: true, scale: "" };
    setSettings((prev) => ({ ...prev, pixelart }));
    convert(mode, mode === "pixelart" ? pixelart : settings[mode]);
  }

  function handleFileSelect(file, name) {
    const filename = name ?? file?.name ?? "";
    if (!converter.isSupportedRasterFormat(file, filename)) {
      converter.error.value = converter.UNSUPPORTED_FORMAT_ERROR;
      return;
    }

    if (active) {
      setPendingFile({ file, name: filename });
    } else {
      open(file, filename);
    }
  }

  // Los oyentes de documento y de hash se montan una vez, así que leen lo de
  // arriba por referencia y no por copia: si no, se quedarían con los ajustes
  // del primer render.
  const latest = useRef();
  latest.current = { open, choose, handleFileSelect };

  useEffect(() => {
    let dragCounter = 0;

    const onDragEnter = (e) => {
      const types = e.dataTransfer?.types;
      if (types && Array.from(types).includes("Files")) {
        dragCounter++;
        setIsDragging(true);
      }
    };

    const onDragOver = (e) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "copy";
      }
    };

    const onDragLeave = (e) => {
      const types = e.dataTransfer?.types;
      if (types && Array.from(types).includes("Files")) {
        dragCounter--;
        if (dragCounter <= 0) {
          dragCounter = 0;
          setIsDragging(false);
        }
      }
    };

    const onDrop = (e) => {
      e.preventDefault();
      dragCounter = 0;
      setIsDragging(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) {
        latest.current.handleFileSelect(file, file.name);
      }
    };

    const onPaste = (e) => {
      const item = [...(e.clipboardData?.items || [])].find((i) =>
        i.type.startsWith("image/"),
      );
      if (!item) return;
      const file = item.getAsFile();
      latest.current.handleFileSelect(file, file.name || "pegado.png");
    };

    const onHash = () => latest.current.choose(modeFromHash());

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("paste", onPaste);
    addEventListener("hashchange", onHash);

    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("paste", onPaste);
      removeEventListener("hashchange", onHash);
    };
  }, []);

  // Con la escala en automático, el campo manual refleja lo detectado para que
  // retocarlo a mano parta de ahí. Escribir un **resultado** en el campo no
  // vuelve a convertir: sólo lo haría un cambio del usuario.
  const result = converter.result.value;
  const engine = converter.engine.value;
  useEffect(() => {
    if (engine !== "pixelart" || !result || !settings.pixelart.autoScale) return;
    const detected = Math.max(result.cellWidth, result.cellHeight).toFixed(2);
    if (settings.pixelart.scale === detected) return;
    setSettings((prev) => ({
      ...prev,
      pixelart: { ...prev.pixelart, scale: detected },
    }));
  }, [result, engine]);

  const actions = {
    onDownload: converter.download,
    onCopy: converter.copy,
    onReset: converter.reset,
  };

  return (
    <>
      <DropOverlay visible={isDragging} />

      <ConfirmModal
        open={Boolean(pendingFile)}
        fileName={pendingFile?.name}
        onConfirm={() => {
          if (pendingFile) {
            open(pendingFile.file, pendingFile.name);
            setPendingFile(null);
          }
        }}
        onCancel={() => setPendingFile(null)}
      />

      <Header mode={mode} onSelect={choose} />

      <main>
        <DropZone hidden={active} onFile={(file) => handleFileSelect(file)} />

        <div class="workspace" hidden={!active}>
          {active ? <Preview /> : null}

          {Object.entries(PANELS).map(([id, Panel]) => (
            <Panel
              key={id}
              hidden={id !== mode}
              values={settings[id]}
              onChange={change}
              actions={actions}
            />
          ))}
        </div>

        <p class="error" hidden={!error}>
          {error}
        </p>
      </main>

      <Footer mode={mode} />
    </>
  );
}

