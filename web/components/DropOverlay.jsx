export function DropOverlay({ visible }) {
  if (!visible) return null;

  return (
    <div class="drop-overlay" aria-hidden="true">
      <div class="drop-overlay-box">
        <svg class="drop-overlay-icon" viewBox="0 0 24 24">
          <path d="M12 16V4m0 0L8 8m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
        <p class="drop-overlay-title">Suelta la imagen para cargarla</p>
        <p class="drop-overlay-hint">
          Se procesará la imagen automáticamente
        </p>
      </div>
    </div>
  );
}
