import { Tabs } from "../components/Tabs.jsx";
import * as converter from "../services/converter.js";
import { t } from "../services/i18n.js";
import { MODES } from "./modes.jsx";

const TABS = Object.entries(MODES).map(([id, { name, hint, icon }]) => ({
  id,
  name,
  hint,
  icon,
}));

export function Header({ mode, onSelect }) {
  return (
    <header class="top">
      <h1
        class="clickable-logo"
        onClick={() => converter.reset()}
        title="Reiniciar vista"
      >
        <img class="logo" src="./img2svg.svg" alt="" /> {t("app_name", "Vektro")}
      </h1>
      <p>Imágenes a SVG, entero en tu navegador: la imagen no sale de tu equipo.</p>

      <Tabs
        label="Modo de conversión"
        tabs={TABS}
        active={mode}
        onSelect={onSelect}
      />
    </header>
  );
}
