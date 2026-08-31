// La forma que comparten los ajustes: título, control(es) y la activación
// de la explicación dinámica.

export function Field({ label, hint, hidden, onHover, children }) {
  return (
    <label
      class="field"
      hidden={hidden}
      onMouseEnter={() => onHover?.(hint)}
      onFocusCapture={() => onHover?.(hint)}
    >
      <span>{label}</span>
      {children}
    </label>
  );
}

/** La fila donde conviven una casilla y lo que habilita. */
export function Row({ children }) {
  return <div class="row">{children}</div>;
}

export function RowLabel({ children }) {
  return <span class="row-label">{children}</span>;
}
