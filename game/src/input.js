// Keyboard + mouse input with pointer lock. The game only listens for look
// and fire while locked; Esc pauses. Screenshot mode (?shot=) never locks.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  let lookX = 0;
  let lookY = 0;
  let firing = false;
  let locked = false;

  function onKeyDown(event) {
    if (event.repeat) return;
    keys.add(event.code);
    if (event.code === 'KeyB' || event.code === 'KeyE' || event.code === 'KeyG' ||
        event.code === 'Digit1' || event.code === 'Digit2' || event.code === 'Digit3' ||
        event.code === 'Digit4' || event.code === 'KeyQ') {
      input.pressed.add(event.code);
    }
  }
  function onKeyUp(event) { keys.delete(event.code); }
  function onMouseMove(event) {
    if (!locked) return;
    lookX += event.movementX;
    lookY += event.movementY;
  }
  function onMouseDown(event) {
    if (locked && event.button === 0) firing = true;
  }
  function onMouseUp(event) {
    if (event.button === 0) firing = false;
  }
  function onLock() {
    locked = document.pointerLockElement === canvas;
    onLockChange(locked);
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onLock);

  const input = {
    keys,
    pressed: new Set(),
    get firing() { return firing; },
    get locked() { return locked; },
    requestLock() { canvas.requestPointerLock(); },
    takeLook() {
      const look = { x: lookX, y: lookY };
      lookX = 0; lookY = 0;
      return look;
    },
    endStep() { input.pressed.clear(); },
  };
  return input;
}
