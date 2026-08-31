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
  vertical = false,
  hasAuto = false,
  autoChecked = false,
  onAutoChange,
  disabled = false,
}) {
  if (vertical) {
    const isInactive = disabled || autoChecked;
    return (
      <label
        class={`field field-vertical ${isInactive ? "is-disabled" : ""}`}
        hidden={hidden}
        onMouseEnter={() => onHover?.(hint)}
        onFocusCapture={() => onHover?.(hint)}
      >
        <span class="field-title">{label}</span>
        <div class="vertical-range-wrapper">
          <button
            type="button"
            class="step-btn step-plus"
            disabled={isInactive || value >= max}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const stepVal = Number(step) || 1;
              const next = Math.min(Number(max), Number((Number(value) + stepVal).toFixed(4)));
              onChange(next, { continuous: false });
            }}
            title="Incrementar"
          >
            +
          </button>

          <input
            type="range"
            class="vertical-slider"
            min={min}
            max={max}
            step={step}
            value={value}
            disabled={isInactive}
            onInput={(e) =>
              onChange(Number(e.currentTarget.value), { continuous: true })
            }
          />

          <button
            type="button"
            class="step-btn step-minus"
            disabled={isInactive || value <= min}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const stepVal = Number(step) || 1;
              const next = Math.max(Number(min), Number((Number(value) - stepVal).toFixed(4)));
              onChange(next, { continuous: false });
            }}
            title="Decrementar"
          >
            −
          </button>
        </div>
        <b class="field-value">
          {value}
          {suffix ? ` ${suffix}` : ""}
        </b>
        {hasAuto ? (
          <div class="auto-toggle-row">
            <Check checked={autoChecked} onChange={onAutoChange} />
            <span class="auto-label">auto</span>
          </div>
        ) : null}
      </label>
    );
  }

  return (
    <Field
      label={
        <>
          {label} <b>{value}</b>
          {suffix ? ` ${suffix}` : null}
        </>
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
        disabled={disabled}
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
