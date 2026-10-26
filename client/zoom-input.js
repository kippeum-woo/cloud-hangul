// Chromium/Firefox trackpads emit ctrl+wheel; Safari also emits GestureEvents.
export function wheelZoomFactor(event, height = 800) {
  const unit = [1, 16, height][event.deltaMode] ?? 1;
  const sensitivity = event.ctrlKey ? 0.01 : 0.0015;
  return Math.exp(Math.max(-1, Math.min(1, -event.deltaY * unit * sensitivity)));
}

export function bindZoomInput(surface, { zoom, pan = () => {}, interrupt = () => {}, changed = () => {}, pointersActive = () => false }) {
  let gestureScale = null;
  const allowed = e => !e.target.closest?.('input, textarea, #browse, #cluster-pick, #popover') &&
    (e.ctrlKey || !e.target.closest?.('#tray'));
  surface.addEventListener('wheel', e => {
    if (!allowed(e)) return;
    e.preventDefault();
    if (gestureScale !== null) return; // Safari can report both kinds.
    interrupt();
    if (e.ctrlKey) {
      zoom(wheelZoomFactor(e, surface.clientHeight), e.clientX, e.clientY);
    } else {
      const unit = [1, 16, surface.clientHeight][e.deltaMode] ?? 1;
      pan(-e.deltaX * unit, -e.deltaY * unit);
    }
    changed();
  }, { passive: false });
  surface.addEventListener('gesturestart', e => {
    if (!allowed(e)) return;
    e.preventDefault();
    gestureScale = e.scale > 0 ? e.scale : 1;
    interrupt();
  }, { passive: false });
  surface.addEventListener('pointerdown', () => { gestureScale = null; });
  surface.addEventListener('gesturechange', e => {
    if (gestureScale === null) return;
    e.preventDefault();
    if (e.scale > 0 && !pointersActive()) {
      const box = surface.getBoundingClientRect();
      zoom(e.scale / gestureScale, Number.isFinite(e.clientX) ? e.clientX : box.x + box.width / 2,
        Number.isFinite(e.clientY) ? e.clientY : box.y + box.height / 2);
      changed();
    }
    if (e.scale > 0) gestureScale = e.scale;
  }, { passive: false });
  surface.addEventListener('gestureend', e => {
    if (gestureScale === null) return;
    e.preventDefault();
    gestureScale = null;
  }, { passive: false });
}
