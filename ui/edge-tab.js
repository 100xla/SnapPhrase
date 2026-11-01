/**
 * SatzTresor Edge-Tab Handle Script
 * Uses Pointer Capture for smooth vertical dragging along the screen edge,
 * single-click opening without stealing foreground focus, and right-click menu.
 */

(function () {
  const handle = document.getElementById('edgeHandle');
  const ipcBridge = window.satztresorApi || window.quicktabApi;
  let activePointerId = null;
  let didDrag = false;
  let startScreenY = 0;

  function send(action, payload = {}) {
    if (ipcBridge) {
      ipcBridge.send({ action, ...payload });
    }
  }

  if (ipcBridge) {
    ipcBridge.onMessage((data) => {
      if (!data || data.type !== 'edgeTabState') return;
      document.documentElement.className = data.theme === 'light' ? 'light' : 'dark';
      document.body.classList.remove('side-left', 'side-right');
      document.body.classList.add(data.side === 'right' ? 'side-right' : 'side-left');
    });
  }

  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    activePointerId = e.pointerId;
    didDrag = false;
    startScreenY = e.screenY;
    try {
      handle.setPointerCapture(e.pointerId);
    } catch (err) {}
  });

  handle.addEventListener('pointermove', (e) => {
    if (activePointerId !== e.pointerId) return;
    if (Math.abs(e.screenY - startScreenY) > 5) {
      didDrag = true;
      document.body.classList.add('dragging');
      send('edgeTabDrag', { screenY: e.screenY });
    }
  });

  handle.addEventListener('pointerup', (e) => {
    if (activePointerId !== e.pointerId) return;
    try {
      handle.releasePointerCapture(e.pointerId);
    } catch (err) {}
    activePointerId = null;
    document.body.classList.remove('dragging');

    if (didDrag) {
      send('edgeTabDragEnd', { screenY: e.screenY });
    } else {
      send('edgeTabClick');
    }
  });

  handle.addEventListener('pointercancel', () => {
    activePointerId = null;
    document.body.classList.remove('dragging');
  });

  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    send('edgeTabContextMenu');
  });

  send('edgeTabReady');
})();
