// input.js — keyboard + mouse + pointer lock. Arrow keys also turn the view, so the game
// is playable (and testable) without pointer lock.
export function createInput(canvas) {
  const input = {
    keys: new Set(),
    mouseDX: 0,
    mouseDY: 0,
    fireHeld: false,
    locked: false,
    lookSpeed: 0.0023,
    onLockChange: null,
    onKeyDown: null,
    onKeyUp: null,
    onMouseDown: null,
  };

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    input.keys.add(e.code);
    if (input.onKeyDown) input.onKeyDown(e.code, e);
  });
  window.addEventListener('keyup', (e) => {
    input.keys.delete(e.code);
    if (input.onKeyUp) input.onKeyUp(e.code, e);
  });
  window.addEventListener('blur', () => { input.keys.clear(); input.fireHeld = false; });

  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) input.fireHeld = true;
    if (input.onMouseDown) input.onMouseDown(e.button);
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) input.fireHeld = false; });
  document.addEventListener('mousemove', (e) => {
    if (input.locked) { input.mouseDX += e.movementX; input.mouseDY += e.movementY; }
  });
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
    if (input.onLockChange) input.onLockChange(input.locked);
  });
  document.addEventListener('pointerlockerror', () => { input.locked = false; });

  input.requestLock = () => {
    try { canvas.requestPointerLock(); } catch { /* headless or denied: arrows still work */ }
  };
  input.exitLock = () => { try { document.exitPointerLock(); } catch { /* noop */ } };

  /** Consume accumulated mouse deltas (called once per tick). */
  input.consumeMouse = () => {
    const dx = input.mouseDX, dy = input.mouseDY;
    input.mouseDX = 0; input.mouseDY = 0;
    return { dx, dy };
  };
  input.down = (code) => input.keys.has(code);
  return input;
}
