const el = document.getElementById('avatar');
let down = false;
let moved = false;
let downX = 0;
let downY = 0;

el.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  down = true;
  moved = false;
  downX = e.screenX;
  downY = e.screenY;
  el.setPointerCapture?.(e.pointerId);
  window.vektolab.startAvatarDrag(e.screenX, e.screenY);
  e.preventDefault();
});

el.addEventListener('pointermove', e => {
  if (!down) return;
  if (Math.hypot(e.screenX - downX, e.screenY - downY) > 5) moved = true;
  window.vektolab.moveAvatarDrag(e.screenX, e.screenY);
  e.preventDefault();
});

function finish(e) {
  if (!down) return;
  down = false;
  window.vektolab.endAvatarDrag();
  el.classList.remove('dragging');
  if (!moved) window.vektolab.togglePanel();
  else {
    el.classList.remove('released');
    void el.offsetWidth;
    el.classList.add('released');
  }
  try { el.releasePointerCapture?.(e.pointerId); } catch (_) {}
}

el.addEventListener('pointerup', finish);
el.addEventListener('pointercancel', finish);

window.vektolab.onAvatarDragging(active => {
  el.classList.toggle('dragging', !!active);
});
