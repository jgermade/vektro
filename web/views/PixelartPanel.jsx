import { useState } from "preact/hooks";
import { Field, Row, RowLabel } from "../components/Field.jsx";
import {
  ButtonGroup,
  Check,
  ColorInput,
  NumberInput,
  Range,
  Toggle,
} from "../components/inputs.jsx";
import { Advanced } from "../components/Advanced.jsx";
import { FIT_OPTIONS, FIT_TOLERANCE, fitPatch } from "./modes.jsx";

export function PixelartPanel({ hidden, values: v, onChange }) {
  const [rangeHint, setRangeHint] = useState(null);
  const [activeHint, setActiveHint] = useState(null);
  const set = (key) => (value, opts) => onChange({ [key]: value }, opts);

  const HINTS = {
    scale: "Píxeles reales que ocupa cada píxel del dibujo.",
    tolerance: "Funde los tonos casi idénticos del ruido de compresión.",
    removeChecker: "Devuelve a transparente el damero que se queda pegado al capturar la pantalla de un editor.",
    alpha: "Por debajo, el píxel se considera transparente.",
    pixelSize: "Unidades SVG por píxel del dibujo.",
    background: "Sin marcar, el SVG queda con fondo transparente.",
    removeBackground: "Vacía el color liso que rodea al dibujo y ajusta el lienzo a lo que queda. El mismo color encerrado dentro se conserva.",
    mergeColors: "Ocupa menos, pero cada figura del SVG pasa a ser todo lo que comparte color, esté donde esté.",
    fit: "En pixel art la escalera es el dibujo, así que lo normal es dejarla. El polígono endereza las diagonales y las curvas redondean el sprite.",
    fitTolerance: "Cuánto puede apartarse la línea del contorno original.",
  };

  return (
    <aside
      class="controls"
      id="panel-pixelart"
      role="tabpanel"
      aria-labelledby="tab-pixelart"
      hidden={hidden}
    >
      <Field
        label="Escala de la rejilla"
        onHover={() => setActiveHint(HINTS.scale)}
      >
        <Row>
          <Check checked={v.autoScale} onChange={set("autoScale")} />
          <RowLabel>
            {v.autoScale && v.scale !== ""
              ? `automática (${v.scale} px)`
              : "automática"}
          </RowLabel>
        </Row>
        <NumberInput
          min="1"
          step="0.01"
          value={v.scale}
          disabled={v.autoScale}
          onChange={set("scale")}
        />
      </Field>

      <Range
        label="Tolerancia de color"
        value={v.tolerance}
        min="0"
        max="48"
        step="1"
        onHover={() => setActiveHint(HINTS.tolerance)}
        onChange={set("tolerance")}
      />

      <Toggle
        label="Quitar cuadrícula de transparencia"
        note="damero blanco/gris"
        checked={v.removeChecker}
        onHover={() => setActiveHint(HINTS.removeChecker)}
        onChange={set("removeChecker")}
      />

      <ButtonGroup
        label="Contorno"
        value={v.fit}
        options={FIT_OPTIONS}
        onHover={(hintText) => setActiveHint(hintText || HINTS.fit)}
        onChange={(fit, opts) => onChange(fitPatch(fit), opts)}
      />

      <div class="active-hint-card">
        <span class="hint-icon">💡</span>
        <div class="hint-content">
          {activeHint || "Pasa el ratón o pulsa sobre cualquier opción para ver su explicación detallada."}
        </div>
      </div>

      <Advanced>
        <div class="vertical-sliders-box">
          <div class="vertical-sliders-row cols-2">
            <Range
              label="Umbral alfa"
              value={v.alpha}
              min="0"
              max="255"
              step="1"
              vertical
              onHover={() => setRangeHint(HINTS.alpha)}
              onChange={set("alpha")}
            />

            <Range
              label="Desviación máx"
              suffix="px"
              value={v.fitTolerance}
              min="0.25"
              max="3"
              step="0.05"
              vertical
              hidden={!(v.fit in FIT_TOLERANCE)}
              onHover={() => setRangeHint(HINTS.fitTolerance)}
              onChange={set("fitTolerance")}
            />
          </div>
          <div class="range-hint-card">
            <span class="hint-icon">🎛️</span>
            <div class="hint-content">
              {rangeHint || "Pasa el ratón sobre un potenciómetro avanzado para ver su explicación."}
            </div>
          </div>
        </div>

        <Field
          label="Tamaño de píxel"
          onHover={() => setActiveHint(HINTS.pixelSize)}
        >
          <Row>
            <Check checked={v.autoPixel} onChange={set("autoPixel")} />
            <RowLabel>tamaño original</RowLabel>
          </Row>
          <NumberInput
            min="1"
            step="1"
            value={v.pixelSize}
            disabled={v.autoPixel}
            onChange={set("pixelSize")}
          />
        </Field>

        <Field
          label="Fondo"
          onHover={() => setActiveHint(HINTS.background)}
        >
          <Row>
            <Check checked={v.useBackground} onChange={set("useBackground")} />
            <ColorInput
              value={v.background}
              disabled={!v.useBackground}
              onChange={set("background")}
            />
          </Row>
        </Field>

        <Toggle
          label="Quitar el fondo"
          note="y recortar al dibujo"
          checked={v.removeBackground}
          onHover={() => setActiveHint(HINTS.removeBackground)}
          onChange={set("removeBackground")}
        />

        <Toggle
          label="Un path por color"
          note="en vez de por bloque"
          checked={v.mergeColors}
          onHover={() => setActiveHint(HINTS.mergeColors)}
          onChange={set("mergeColors")}
        />
      </Advanced>
    </aside>
  );
}
