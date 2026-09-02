import { useRef } from "preact/hooks";
import { t } from "../services/i18n.js";

// Con el espacio de trabajo abierto la zona de arrastre está escondida, así que
// sin este botón cambiar de imagen sólo se puede arrastrando o pegando: dos
// oyentes de `window` que no tienen nada en pantalla que los anuncie.
//
// Se pinta una vez por sitio —a la derecha de las pestañas y bajo el contenido—
// y el CSS enseña la que toque. Un mismo elemento no puede estar dentro de la
// cabecera y entre `main` y el pie a la vez sin un portal, y la copia que sobra
// va con `display: none`, así que ni sale del árbol de accesibilidad ni
// duplica el control.
//
// El `<input>` es suyo y no el de `DropZone`: aquel lleva `id="file"`, y dos
// elementos con el mismo id en el documento es un fallo esperando a pasar.
export function NewImage({ place, onFile }) {
  const input = useRef(null);

  return (
    <div class={`new-image new-image--${place}`}>
      <button
        type="button"
        class="new-image-button"
        onClick={() => input.current?.click()}
      >
        <svg
          class="new-image-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M12 16V4m0 0L8 8m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
        <span>{t("new_image", "Nueva imagen")}</span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp"
        hidden
        onChange={(e) => {
          const file = e.currentTarget.files[0];
          if (file) onFile(file);
          e.currentTarget.value = "";
        }}
      />
    </div>
  );
}
