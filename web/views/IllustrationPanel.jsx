import { useState } from "preact/hooks";
import { Field, Row } from "../components/Field.jsx";
import {
  ButtonGroup,
  Check,
  ColorInput,
  NumberInput,
  Range,
} from "../components/inputs.jsx";
import { Advanced } from "../components/Advanced.jsx";
import { FIT_OPTIONS, FIT_TOLERANCE, fitPatch } from "./modes.jsx";

export function IllustrationPanel({ hidden, values: v, onChange }) {
  const [rangeHint, setRangeHint] = useState(null);
  const [advRangeHint, setAdvRangeHint] = useState(null);
  const [generalHint, setGeneralHint] = useState(null);

  const set = (key) => (value, opts) => onChange({ [key]: value }, opts);

  const HINTS = {
    simplify: "El rasgo más pequeño que sobrevive, en tantos por mil del lado largo. Decide a qué resolución se reinterpreta el dibujo (sube escala en imágenes pequeñas y baja en grandes).",
    tolerance: "Distancia máxima entre un color y el de la región que lo pinta, en una escala perceptual donde de negro a blanco hay 1.",
    filterSpeckle: "Área de región que se funde con su vecina. En automático se ajusta dinámicamente según la resolución del lienzo. Subirlo limpia el ruido JPEG.",
    gradientStep: "Ensancha las bandas de un cielo fundiendo tonos que sólo se distinguen en luz. En un dibujo con volumen aplana el sombreado.",
    fit: "El polígono junta en un tramo recto los escalones que no dibujan nada. Las curvas no comprimen (salen más grandes), pero el contorno sigue siendo liso por mucho que se amplíe.",
    fitTolerance: "Cuánto puede apartarse la línea del contorno del dibujo original.",
    subpixel: "El color de los píxeles del borde recoloca los vértices fuera de la retícula entera.",
    relax: "Lima los peldaños irregulares moviendo vértices sin tocar las esquinas. A 0, el contorno tal cual sale del trazado.",
    ramps: "Funde las bandas de color en figuras con degradado lineal.",
    removeBackground: "Vacía lo que toca el borde de la imagen. El mismo color encerrado dentro se conserva.",
    minColorShare: "Lo que un color tiene que valer para llevarse una entrada de la paleta.",
    minThickness: "Quita las bandas de un píxel que bordean cada frontera de color. En automático se ajusta según la presencia de líneas finas de dibujo.",
    colorPrecision: "Bits por canal antes de agrupar; baja el ruido del último bit.",
    maxColors: "Con tope, los colores que sobran van al más cercano aunque quede lejos.",
    alpha: "Por debajo, el píxel se considera transparente.",
    background: "Sin marcar, el SVG queda con fondo transparente.",
  };

  return (
    <aside
      class="controls"
      id="panel-illustration"
      role="tabpanel"
      aria-labelledby="tab-illustration"
      hidden={hidden}
    >
      <div class="vertical-sliders-box">
        <div class="vertical-sliders-row cols-6">
          <Range
            label="Simplificación"
            value={v.simplify}
            min="2"
            max="15"
            step="0.5"
            vertical
            hasAuto
            autoChecked={v.autoSimplify}
            onAutoChange={set("autoSimplify")}
            onHover={() => setRangeHint(HINTS.simplify)}
            onChange={set("simplify")}
          />

          <Range
            label="Tolerancia color"
            value={v.tolerance}
            min="0.01"
            max="0.2"
            step="0.005"
            vertical
            onHover={() => setRangeHint(HINTS.tolerance)}
            onChange={set("tolerance")}
          />

          <Range
            label="Filtro motas"
            value={v.filterSpeckle}
            min="0"
            max="64"
            step="1"
            vertical
            hasAuto
            autoChecked={v.autoSpeckle}
            onAutoChange={set("autoSpeckle")}
            onHover={() => setRangeHint(HINTS.filterSpeckle)}
            onChange={set("filterSpeckle")}
          />

          <Range
            label="Escalón degradado"
            value={v.gradientStep}
            min="0"
            max="0.2"
            step="0.005"
            vertical
            onHover={() => setRangeHint(HINTS.gradientStep)}
            onChange={set("gradientStep")}
          />

          <Range
            label="Desviación máxima"
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

          <Range
            label="Limar temblor"
            suffix="px"
            value={v.relax}
            min="0"
            max="1.5"
            step="0.05"
            vertical
            onHover={() => setRangeHint(HINTS.relax)}
            onChange={set("relax")}
          />
        </div>
        <div class="range-hint-card">
          <span class="hint-icon">🎛️</span>
          <div class="hint-content">
            {rangeHint || "Pasa el ratón sobre un potenciómetro para ver su explicación."}
          </div>
        </div>
      </div>

      <ButtonGroup
        label="Contorno"
        value={v.fit}
        options={FIT_OPTIONS}
        onHover={(hintText) => setGeneralHint(hintText || HINTS.fit)}
        onChange={(fit, opts) => onChange(fitPatch(fit), opts)}
      />

      <div class="toggles-row">
        <label
          class="toggle-card"
          onMouseEnter={() => setGeneralHint(HINTS.subpixel)}
          onFocusCapture={() => setGeneralHint(HINTS.subpixel)}
        >
          <Check checked={v.subpixel} onChange={set("subpixel")} />
          <span>Subpíxel</span>
        </label>

        <label
          class="toggle-card"
          onMouseEnter={() => setGeneralHint(HINTS.ramps)}
          onFocusCapture={() => setGeneralHint(HINTS.ramps)}
        >
          <Check checked={v.ramps} onChange={set("ramps")} />
          <span>Degradados</span>
        </label>

        <label
          class="toggle-card"
          onMouseEnter={() => setGeneralHint(HINTS.removeBackground)}
          onFocusCapture={() => setGeneralHint(HINTS.removeBackground)}
        >
          <Check checked={v.removeBackground} onChange={set("removeBackground")} />
          <span>Quitar fondo</span>
        </label>
      </div>

      <div class="active-hint-card">
        <span class="hint-icon">💡</span>
        <div class="hint-content">
          {generalHint || "Pasa el ratón o pulsa sobre cualquier opción para ver su explicación."}
        </div>
      </div>

      <Advanced>
        <div class="vertical-sliders-box">
          <div class="vertical-sliders-row cols-4">
            <Range
              label="Mínimo color"
              suffix="%"
              value={v.minColorShare}
              min="0"
              max="1"
              step="0.05"
              vertical
              onHover={() => setAdvRangeHint(HINTS.minColorShare)}
              onChange={set("minColorShare")}
            />

            <Range
              label="Grosor mín"
              value={v.minThickness}
              min="0"
              max="3"
              step="0.25"
              vertical
              hasAuto
              autoChecked={v.autoThickness}
              onAutoChange={set("autoThickness")}
              onHover={() => setAdvRangeHint(HINTS.minThickness)}
              onChange={set("minThickness")}
            />

            <Range
              label="Precisión color"
              value={v.colorPrecision}
              min="2"
              max="8"
              step="1"
              vertical
              onHover={() => setAdvRangeHint(HINTS.colorPrecision)}
              onChange={set("colorPrecision")}
            />

            <Range
              label="Umbral alfa"
              value={v.alpha}
              min="0"
              max="255"
              step="1"
              vertical
              onHover={() => setAdvRangeHint(HINTS.alpha)}
              onChange={set("alpha")}
            />
          </div>
          <div class="range-hint-card">
            <span class="hint-icon">🎛️</span>
            <div class="hint-content">
              {advRangeHint || "Pasa el ratón sobre un potenciómetro avanzado para ver su explicación."}
            </div>
          </div>
        </div>

        <Field
          label="Máximo de colores"
          onHover={() => setGeneralHint(HINTS.maxColors)}
        >
          <Row>
            <Check checked={v.capColors} onChange={set("capColors")} />
            <NumberInput
              min="2"
              step="1"
              value={v.maxColors}
              disabled={!v.capColors}
              onChange={set("maxColors")}
            />
          </Row>
        </Field>

        <Field
          label="Fondo"
          onHover={() => setGeneralHint(HINTS.background)}
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
