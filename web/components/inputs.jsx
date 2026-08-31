// Los controles sueltos. Todos son controlados: el valor entra por `value` y
// sale por `onChange`, y ninguno guarda nada.

import { Field, Row, RowLabel } from "./Field.jsx";

export function Check({ checked, onChange }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.currentTarget.checked, { continuous: false })}
    />
  );
}

export function NumberInput({ value, min, step, disabled, onChange }) {
  return (
    <input
      type="number"
      min={min}
      step={step}
      value={value}
      disabled={disabled}
      onInput={(e) => onChange(e.currentTarget.value, { continuous: true })}
    />
  );
}

export function ColorInput({ value, disabled, onChange }) {
  return (
    <input
      type="color"
      value={value}
      disabled={disabled}
      onInput={(e) => onChange(e.currentTarget.value, { continuous: true })}
    />
  );
}

/**
 * Deslizador con su cifra en vivo.
 * `vertical` activa el diseño vertical tipo ecualizador en fila.
 * `hasAuto` permite incluir una casilla de automático integrada.
 */
export function Range({
  label,
  value,
  min,
  max,
  step,
  hint,
  hidden,
  suffix,
  onChange,
  onHover,
  hasAuto = false,
  autoChecked = false,
  onAutoChange,
  disabled = false,
}) {
  const isInactive = disabled || autoChecked;

  return (
    <Field
      label={
        <span class="range-label-row">
          <span class="range-label-title">{label}</span>
          {hasAuto ? (
            <label class="auto-inline-check" title="Ajuste automático según imagen">
              <Check checked={autoChecked} onChange={onAutoChange} />
              <span>auto</span>
            </label>
          ) : (
            <span class="auto-placeholder" />
          )}
          <span class="range-label-value">
            {!autoChecked ? (
              <b>
                {value}
                {suffix ? ` ${suffix}` : ""}
              </b>
            ) : (
              <b class="auto-active-badge">auto</b>
            )}
          </span>
        </span>
      }
      hint={hint}
      hidden={hidden}
      onHover={onHover}
    >
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={isInactive}
        onInput={(e) =>
          onChange(Number(e.currentTarget.value), { continuous: true })
        }
      />
    </Field>
  );
}

export function Select({ label, value, hint, options, onChange, onHover }) {
  return (
    <Field label={label} hint={hint} onHover={onHover}>
      <select
        value={value}
        onChange={(e) => onChange(e.currentTarget.value, { continuous: false })}
      >
        {options.map(({ value: v, label: text }) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </Field>
  );
}

/**
 * Grupo de botones segmentados. Cada botón activa su propio hint al pasar el ratón.
 */
export function ButtonGroup({ label, value, hint, options, onChange, onHover }) {
  return (
    <Field label={label} hint={hint} onHover={onHover}>
      <div class="segmented-group" role="group">
        {options.map(({ value: v, label: text, hint: optionHint }) => {
          const isActive = value === v;
          return (
            <button
              key={v}
              type="button"
              class={`segmented-btn ${isActive ? "active" : ""}`}
              onClick={() => onChange(v, { continuous: false })}
              onMouseEnter={() => onHover?.(optionHint || hint)}
              onFocusCapture={() => onHover?.(optionHint || hint)}
            >
              {text}
            </button>
          );
        })}
      </div>
    </Field>
  );
}

/** Casilla con una etiqueta al lado, sin nada que habilitar. */
export function Toggle({ label, note, hint, checked, onChange, onHover }) {
  return (
    <Field label={label} hint={hint} onHover={onHover}>
      <Row>
        <Check checked={checked} onChange={onChange} />
        <RowLabel>{note}</RowLabel>
      </Row>
    </Field>
  );
}
