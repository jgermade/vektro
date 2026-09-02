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
import * as converter from "../services/converter.js";

export function PixelartPanel({ hidden, values: v, onChange }) {
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
    decoupage: "Dibuja cada figura entera y por debajo de las que se le ponen encima, como las capas de un recorte de papel. Con el contorno en Escalón no hace falta —los bordes caen en la retícula—, pero con Polígono o Curva suave es lo que quita las líneas claras de las fronteras.",
  };

  const setHint = (text) => {
    if (text) {
      converter.activeHint.value = text;
    }
  };

  return (
    <aside
      class="controls"
      id="panel-pixelart"
      role="tabpanel"
      aria-labelledby="tab-pixelart"
      hidden={hidden}
    >
      <ButtonGroup
        label="Contorno"
        hint={HINTS.fit}
        value={v.fit}
        options={FIT_OPTIONS}
        onHover={(hintText) => setHint(hintText || HINTS.fit)}
        onChange={(fit, opts) => onChange(fitPatch(fit), opts)}
      />

      <div class="toggles-row">
        <label
          class="toggle-card"
          data-hint={HINTS.removeChecker}
          onMouseEnter={() => setHint(HINTS.removeChecker)}
          onFocusCapture={() => setHint(HINTS.removeChecker)}
          onClick={() => setHint(HINTS.removeChecker)}
          onTouchStart={() => setHint(HINTS.removeChecker)}
        >
          <Check checked={v.removeChecker} onChange={set("removeChecker")} />
          <span>Damero</span>
        </label>

        <label
          class="toggle-card"
          data-hint={HINTS.decoupage}
          onMouseEnter={() => setHint(HINTS.decoupage)}
          onFocusCapture={() => setHint(HINTS.decoupage)}
          onClick={() => setHint(HINTS.decoupage)}
          onTouchStart={() => setHint(HINTS.decoupage)}
        >
          <Check checked={v.decoupage} onChange={set("decoupage")} />
          <span>Découpage</span>
        </label>

        <label
          class="toggle-card"
          data-hint={HINTS.removeBackground}
          onMouseEnter={() => setHint(HINTS.removeBackground)}
          onFocusCapture={() => setHint(HINTS.removeBackground)}
          onClick={() => setHint(HINTS.removeBackground)}
          onTouchStart={() => setHint(HINTS.removeBackground)}
        >
          <Check checked={v.removeBackground} onChange={set("removeBackground")} />
          <span>Quitar fondo</span>
        </label>

        <label
          class="toggle-card"
          data-hint={HINTS.mergeColors}
          onMouseEnter={() => setHint(HINTS.mergeColors)}
          onFocusCapture={() => setHint(HINTS.mergeColors)}
          onClick={() => setHint(HINTS.mergeColors)}
          onTouchStart={() => setHint(HINTS.mergeColors)}
        >
          <Check checked={v.mergeColors} onChange={set("mergeColors")} />
          <span>Por color</span>
        </label>
      </div>

      <Field
        label="Escala de la rejilla"
        hint={HINTS.scale}
        onHover={() => setHint(HINTS.scale)}
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
          step="0.5"
          value={v.scale}
          disabled={v.autoScale}
          onChange={set("scale")}
        />
      </Field>

      <Range
        label="Tolerancia de color"
        hint={HINTS.tolerance}
        value={v.tolerance}
        min="0"
        max="48"
        step="1"
        onHover={() => setHint(HINTS.tolerance)}
        onChange={set("tolerance")}
      />

      <Advanced>
        <Range
          label="Umbral alfa"
          hint={HINTS.alpha}
          value={v.alpha}
          min="0"
          max="255"
          step="1"
          onHover={() => setHint(HINTS.alpha)}
          onChange={set("alpha")}
        />

        <Range
          label="Desviación máx"
          hint={HINTS.fitTolerance}
          suffix="px"
          value={v.fitTolerance}
          min="0.25"
          max="3"
          step="0.05"
          hidden={!(v.fit in FIT_TOLERANCE)}
          onHover={() => setHint(HINTS.fitTolerance)}
          onChange={set("fitTolerance")}
        />

        <Field
          label="Tamaño de píxel"
          hint={HINTS.pixelSize}
          onHover={() => setHint(HINTS.pixelSize)}
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
          hint={HINTS.background}
          onHover={() => setHint(HINTS.background)}
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
      </Advanced>
    </aside>
  );
}
