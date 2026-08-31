// El wasm vive en un worker (ver `worker.js`), así que aquí no se bloquea nada:
// mientras convierte, la página sigue respondiendo y la barra de progreso puede
// moverse de verdad.
//
// Este módulo es el único que habla con el worker. Las vistas leen las señales
// y llaman a `load`, `convert` y `reset`; ninguna de ellas sabe que hay
// mensajes, ni ids, ni un temporizador.

import { signal } from "@preact/signals";

/** Metadatos de la imagen cargada; los píxeles se quedan en el worker. */
export const source = signal(null);
/** Los píxeles del original, para que la vista los pinte en su canvas. */
export const image = signal(null);
/** Último SVG generado, para enseñar, descargar y copiar. */
export const svg = signal("");
/** El resultado entero del wasm: cada modo lee de él las cifras que cuenta. */
export const result = signal(null);
/**
 * Qué segmentación produjo ese resultado. No es lo mismo que el modo elegido:
 * entre cambiar de pestaña y que llegue la conversión nueva, en pantalla sigue
 * el resultado de la otra, y leerlo con el vocabulario equivocado da huecos.
 */
export const engine = signal("");
/** Hay una imagen en juego: el espacio de trabajo está abierto. */
export const active = signal(false);
/** Milisegundos de la última conversión. */
export const elapsed = signal(0);
export const error = signal("");
/** `{ at, label, pulse }` mientras hay barra, o `null` cuando no la hay. */
export const progress = signal(null);
/** Hay una conversión en vuelo. */
export const pending = signal(false);
/** Se está decodificando y leyendo la imagen, antes de que haya nada que pintar. */
export const decoding = signal(false);
/** Explicación del control sobre el que está el ratón o el foco. */
export const activeHint = signal("");

let worker = null;

function createWorker() {
  const w = new Worker(new URL("./worker.js", import.meta.url), {
    type: "module",
  });

  w.onmessage = ({ data }) => {
    // Una respuesta de una petición ya superada no debe pintar nada.
    if (data.id !== request) return;

    if (data.kind === "stage") return stage(data.stage, running);
    if (data.kind === "progress") return advance(data.value);
    if (data.kind === "error") {
      endProgress();
      return fail(data.message);
    }
    if (data.kind === "done") return done(data.result, data.ms);
  };

  w.onerror = (e) => {
    endProgress();
    fail(`El worker ha fallado: ${e.message}`);
  };

  return w;
}

/** Id de la petición en vuelo: las respuestas viejas se descartan. */
let request = 0;
let timer;
let hiding;

worker = createWorker();

function abortWorker() {
  if (worker) {
    worker.terminate();
  }
  worker = createWorker();
  request += 1;

  const currentPixels = image.peek();
  if (currentPixels) {
    const rgba = new Uint8Array(currentPixels.data);
    send("image", {
      width: currentPixels.width,
      height: currentPixels.height,
      rgba: rgba.slice(),
    });
  }
}

function send(kind, payload, transfer = []) {
  const id = ++request;
  worker.postMessage({ id, kind, ...payload }, transfer);
  return id;
}

/* --------------------------------------------------------------- progreso --- */

const MODE_NAMES = {
  illustration: "ilustración",
  pixelart: "pixel art",
};

const STAGES = {
  decode: { at: 15, label: "Decodificando la imagen…" },
  sample: { at: 35, label: "Leyendo los píxeles…" },
  wasm: { at: 55, label: "Cargando el motor…" },
  convert: { at: 75, label: "Convirtiendo…", pulse: true },
};

function stage(name, modeName) {
  const step = STAGES[name];
  if (!step) return;
  clearTimeout(hiding);

  let label = step.label;
  if (name === "convert") {
    const target = MODE_NAMES[modeName] || modeName;
    label = target ? `Convirtiendo a ${target}…` : step.label;
  }

  progress.value = {
    at: step.at,
    label,
    pulse: Boolean(step.pulse),
  };
}

// Avance de verdad, que sólo manda el camino de ilustración: en cuanto llega el
// primero se apaga el pulso, porque ya hay algo que contar. El de pixel art no
// manda ninguno y se queda con el pulso, que es lo honesto cuando lo que se
// sabe es «está en ello».
//
// El tramo de la conversión ocupa de STAGES.convert.at a 100: los pasos de
// antes —decodificar, leer los píxeles, cargar el motor— son de la página y ya
// estaban contados.
function advance(value) {
  const desde = STAGES.convert.at;
  const current = progress.peek();
  if (!current) return;
  progress.value = {
    ...current,
    at: Math.round(desde + (100 - desde) * value),
    pulse: false,
  };
}

function endProgress() {
  const current = progress.peek();
  if (!current) return;
  progress.value = { ...current, at: 100, pulse: false };
  // Se deja ver el 100% un instante: desaparecer de golpe se lee como un fallo.
  clearTimeout(hiding);
  hiding = setTimeout(() => {
    progress.value = null;
  }, 180);
}

/* ------------------------------------------------------------------ carga --- */

const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

export const UNSUPPORTED_FORMAT_ERROR =
  "Formato no compatible. Por favor, selecciona una imagen rasterizada (.png, .jpg, .webp, .gif, .avif, .bmp, .ico).";

export function isSupportedRasterFormat(file, name = "") {
  const filename = (name || file?.name || "").toLowerCase();
  const mime = (file?.type || "").toLowerCase();

  if (mime === "image/svg+xml" || filename.endsWith(".svg")) {
    return false;
  }

  const allowedExts = [
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".gif",
    ".avif",
    ".bmp",
    ".ico",
  ];
  const allowedMimes = [
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "image/avif",
    "image/bmp",
    "image/x-icon",
    "image/vnd.microsoft.icon",
  ];

  return (
    allowedExts.some((ext) => filename.endsWith(ext)) ||
    allowedMimes.includes(mime)
  );
}

async function decodeImageBlob(blob, name = "") {
  if (!isSupportedRasterFormat(blob, name)) {
    throw new Error(UNSUPPORTED_FORMAT_ERROR);
  }

  try {
    const bitmap = await createImageBitmap(blob);
    if (bitmap.width > 0 && bitmap.height > 0) {
      return {
        width: bitmap.width,
        height: bitmap.height,
        drawable: bitmap,
        close: () => bitmap.close?.(),
      };
    }
    bitmap.close?.();
  } catch {
    // Si createImageBitmap falla, cae en el fallback de elemento Image
  }

  return await decodeViaImageElement(blob);
}

function decodeViaImageElement(blob, defaultW, defaultH) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w = img.naturalWidth || defaultW || 800;
      const h = img.naturalHeight || defaultH || 800;
      if (w <= 0 || h <= 0) {
        reject(new Error("La imagen tiene dimensiones nulas."));
        return;
      }
      resolve({
        width: w,
        height: h,
        drawable: img,
        close: () => {},
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("El navegador no ha podido decodificar esa imagen."));
    };
    img.src = url;
  });
}

export async function load(blob, name) {
  clearTimeout(timer);
  error.value = "";

  const filename = name ?? blob.name ?? "";
  if (!isSupportedRasterFormat(blob, filename)) {
    endProgress();
    return fail(UNSUPPORTED_FORMAT_ERROR);
  }

  // El espacio de trabajo aparece ya, con esqueletos: así se ve la forma de la
  // página desde el primer momento en vez de una zona de carga congelada.
  active.value = true;
  decoding.value = true;
  pending.value = true;
  source.value = null;
  image.value = null;
  svg.value = "";
  result.value = null;

  stage("decode");
  let decoded;
  try {
    decoded = await decodeImageBlob(blob, filename);
  } catch (err) {
    decoding.value = false;
    pending.value = false;
    endProgress();
    return fail(err?.message || "El navegador no ha podido decodificar esa imagen.");
  }

  stage("sample");
  // Un fotograma para que el esqueleto y la barra lleguen a pintarse antes del
  // `getImageData`, que en una imagen grande sí cuesta.
  await frame();

  const canvas = document.createElement("canvas");
  canvas.width = decoded.width;
  canvas.height = decoded.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(decoded.drawable, 0, 0);
  const pixels = ctx.getImageData(0, 0, decoded.width, decoded.height);
  decoded.close();

  source.value = {
    name: filename.replace(/\.[^.]+$/, "") || "imagen",
    width: pixels.width,
    height: pixels.height,
    bytes: blob.size,
  };
  image.value = pixels;
  decoding.value = false;

  // Los píxeles se envían al worker: cada cambio de ajuste manda sólo las opciones.
  const rgba = new Uint8Array(pixels.data);
  send("image", { width: pixels.width, height: pixels.height, rgba: rgba.slice() }, [
    rgba.slice().buffer,
  ]);
  return true;
}

/* ------------------------------------------------------------- conversión --- */

/** Espera antes de convertir con un control continuo (deslizador, número, color). */
const DEBOUNCE = 120;

export function convert(engine, options, { debounce = false } = {}) {
  clearTimeout(timer);
  if (!source.peek()) return;
  if (debounce) {
    timer = setTimeout(() => run(engine, options), DEBOUNCE);
    return;
  }
  run(engine, options);
}

let running = "";
let conversionTimeoutTimer = null;
const WASM_TIMEOUT_MS = 60000;

function run(mode, options) {
  clearTimeout(conversionTimeoutTimer);
  if (!source.peek()) return;
  if (pending.peek()) {
    abortWorker();
  }
  running = mode;
  pending.value = true;
  error.value = "";
  stage("convert", mode);

  conversionTimeoutTimer = setTimeout(() => {
    if (pending.peek()) {
      abortWorker();
      endProgress();
      fail(
        "La imagen no parece tener una cuadrícula de píxeles clara o el procesamiento ha tardado demasiado. Te recomendamos probar la pestaña Ilustración."
      );
    }
  }, WASM_TIMEOUT_MS);

  send("convert", { engine: mode, options });
}

function done(out, ms) {
  clearTimeout(conversionTimeoutTimer);
  svg.value = out.svg;
  result.value = out;
  engine.value = running;
  elapsed.value = ms;
  pending.value = false;
  error.value = "";
  endProgress();
}

function fail(message) {
  clearTimeout(conversionTimeoutTimer);
  error.value = message;
  pending.value = false;
  decoding.value = false;
  if (!source.peek()) {
    active.value = false;
  }
  return false;
}

export function reset() {
  clearTimeout(timer);
  // Sube el id sin mandar nada: lo que esté en vuelo llegará con uno viejo y se
  // descartará. Sin esto, un `done` posterior pintaría sobre la página ya
  // vaciada y leería un `source` que ya no existe.
  request += 1;
  active.value = false;
  source.value = null;
  image.value = null;
  svg.value = "";
  result.value = null;
  engine.value = "";
  pending.value = false;
  decoding.value = false;
  error.value = "";
  clearTimeout(hiding);
  progress.value = null;
}

/* ------------------------------------------------------------- resultados --- */

export function download() {
  const out = svg.peek();
  const from = source.peek();
  if (!out || !from) return;
  const url = URL.createObjectURL(new Blob([out], { type: "image/svg+xml" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${from.name}.svg`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Resuelve a `true` si copió; la vista decide qué enseñar. */
export async function copy() {
  const out = svg.peek();
  if (!out) return false;
  try {
    await navigator.clipboard.writeText(out);
    return true;
  } catch {
    fail("El navegador ha bloqueado el acceso al portapapeles.");
    return false;
  }
}
