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
import * as converter from "../services/converter.js";

export function IllustrationPanel({ hidden, values: v, onChange }) {
  const set = (key) => (value, opts) => onChange({ [key]: value }, opts);

  const HINTS = {
    simplify: "El rasgo más pequeño que sobrevive, en tantos por mil del lado largo. Decide a qué resolución se reinterpreta el dibujo.",
    tolerance: "Distancia máxima entre un color y el de la región que lo pinta (de negro a blanco hay 1).",
    filterSpeckle: "Área de región que se funde con su vecina. En automático elimina el ruido JPEG según la resolución del lienzo.",
    gradientStep: "Ensancha las bandas de un cielo fundiendo tonos que sólo se distinguen en luz.",
    fit: "El polígono junta en un tramo recto los escalones que no dibujan nada. Las curvas mantienen el contorno liso.",
    fitTolerance: "Cuánto puede apartarse la línea del contorno del dibujo original.",
    subpixel: "El color de los píxeles del borde recoloca los vértices fuera de la retícula entera.",
    relax: "Lima los peldaños irregulares moviendo vértices sin tocar las esquinas.",
    ramps: "Funde las bandas de color en figuras con degradado lineal.",
    removeBackground: "Vacía lo que toca el borde de la imagen. El mismo color encerrado dentro se conserva.",
    layering: "Añade un solapamiento en las fronteras de color para eliminar las líneas blancas sin alterar la geometría de las formas.",
    minColorShare: "Lo que un color tiene que valer para llevarse una entrada de la paleta.",
    minThickness: "Quita las bandas de un píxel que bordean cada frontera de color. En automático protege líneas finas.",
    colorPrecision: "Bits por canal antes de agrupar; baja el ruido del último bit.",
    maxColors: "Con tope, los colores que sobran van al más cercano aunque quede lejos.",
    alpha: "Por debajo, el píxel se considera transparente.",
    background: "Sin marcar, el SVG queda con fondo transparente.",
  };

  const setHint = (text) => {
    if (text) {
      converter.activeHint.value = text;
    }
  };

  return (
    <aside
      class="controls"
      id="panel-illustration"
      role="tabpanel"
      aria-labelledby="tab-illustration"
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
          data-hint={HINTS.subpixel}
          onMouseEnter={() => setHint(HINTS.subpixel)}
          onFocusCapture={() => setHint(HINTS.subpixel)}
          onClick={() => setHint(HINTS.subpixel)}
          onTouchStart={() => setHint(HINTS.subpixel)}
        >
          <Check checked={v.subpixel} onChange={set("subpixel")} />
          <span>Subpíxel</span>
        </label>

        <label
          class="toggle-card"
          data-hint={HINTS.ramps}
          onMouseEnter={() => setHint(HINTS.ramps)}
          onFocusCapture={() => setHint(HINTS.ramps)}
          onClick={() => setHint(HINTS.ramps)}
          onTouchStart={() => setHint(HINTS.ramps)}
        >
          <Check checked={v.ramps} onChange={set("ramps")} />
          <span>Degradados</span>
        </label>

        <label
          class="toggle-card"
          data-hint={HINTS.layering}
          onMouseEnter={() => setHint(HINTS.layering)}
          onFocusCapture={() => setHint(HINTS.layering)}
          onClick={() => setHint(HINTS.layering)}
          onTouchStart={() => setHint(HINTS.layering)}
        >
          <Check checked={v.layering} onChange={set("layering")} />
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
      </div>

      <Range
        label="Simplificación"
        hint={HINTS.simplify}
        value={v.simplify}
        min="2"
        max="15"
        step="0.5"
        hasAuto
        autoChecked={v.autoSimplify}
        onAutoChange={set("autoSimplify")}
        onHover={() => setHint(HINTS.simplify)}
        onChange={set("simplify")}
      />

      <Range
        label="Tolerancia color"
        hint={HINTS.tolerance}
        value={v.tolerance}
        min="0.01"
        max="0.2"
        step="0.005"
        onHover={() => setHint(HINTS.tolerance)}
        onChange={set("tolerance")}
      />

      <Range
        label="Filtro motas"
        hint={HINTS.filterSpeckle}
        value={v.filterSpeckle}
        min="0"
        max="64"
        step="1"
        hasAuto
        autoChecked={v.autoSpeckle}
        onAutoChange={set("autoSpeckle")}
        onHover={() => setHint(HINTS.filterSpeckle)}
        onChange={set("filterSpeckle")}
      />

      <Range
        label="Escalón degradado"
        hint={HINTS.gradientStep}
        value={v.gradientStep}
        min="0"
        max="0.2"
        step="0.005"
        onHover={() => setHint(HINTS.gradientStep)}
        onChange={set("gradientStep")}
      />

      <Range
        label="Desviación máxima"
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

      <Range
        label="Limar temblor"
        hint={HINTS.relax}
        suffix="px"
        value={v.relax}
        min="0"
        max="1.5"
        step="0.05"
        onHover={() => setHint(HINTS.relax)}
        onChange={set("relax")}
      />

      <Advanced>
        <Range
          label="Mínimo color"
          hint={HINTS.minColorShare}
          suffix="%"
          value={v.minColorShare}
          min="0"
          max="1"
          step="0.05"
          onHover={() => setHint(HINTS.minColorShare)}
          onChange={set("minColorShare")}
        />

        <Range
          label="Grosor mín"
          hint={HINTS.minThickness}
          value={v.minThickness}
          min="0"
          max="3"
          step="0.25"
          hasAuto
          autoChecked={v.autoThickness}
          onAutoChange={set("autoThickness")}
          onHover={() => setHint(HINTS.minThickness)}
          onChange={set("minThickness")}
        />

        <Range
          label="Precisión color"
          hint={HINTS.colorPrecision}
          value={v.colorPrecision}
          min="2"
          max="8"
          step="1"
          onHover={() => setHint(HINTS.colorPrecision)}
          onChange={set("colorPrecision")}
        />

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

        <Field
          label="Máximo de colores"
          hint={HINTS.maxColors}
          onHover={() => setHint(HINTS.maxColors)}
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
