// Las dos cajas de la vista previa: el damero de fondo, lo que se enseñe
// dentro, y el esqueleto encima mientras no hay nada que enseñar.

export function CanvasBox({ id, stale, skeleton, class: className = "", style, children, ...props }) {
  const baseClasses = stale ? "canvas-box checker stale" : "canvas-box checker";
  const finalClass = className ? `${baseClasses} ${className}` : baseClasses;
  return (
    <div class={finalClass} id={id} style={style} {...props}>
      {children}
      <div class="skeleton" style={style} hidden={!skeleton} aria-hidden="true" />
    </div>
  );
}

export function Figure({ caption, meta, children }) {
  return (
    <figure>
      <figcaption>
        {caption} <span>{meta}</span>
      </figcaption>
      {children}
    </figure>
  );
}
