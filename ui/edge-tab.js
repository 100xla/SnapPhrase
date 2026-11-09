/**
 * SatzTresor Edge-Tab & Corner-Triangle Handle Script
 * Supports all 4 screen edges (left, right, top, bottom) and all 4 screen corners
 * (right-angled triangle wedges: top-left, top-right, bottom-left, bottom-right),
 * 2D Pointer Capture dragging with live edge/corner snapping, corner polygon click-through,
 * single-click opening without stealing foreground focus, and right-click context menu.
 */

(function () {
  const dragSurface = document.getElementById('dragSurface');
  const ipcBridge = window.satztresorApi || window.quicktabApi;

  const ALL_POS_CLASSES = [
    'pos-left',
    'pos-right',
    'pos-top',
    'pos-bottom',
    'pos-top-left',
    'pos-top-right',
    'pos-bottom-left',
    'pos-bottom-right',
  ];
  const ALL_SIZE_CLASSES = ['size-compact', 'size-standard', 'size-large'];

  let currentPosition = 'left';
  let currentSize = 'standard';
  let currentLocked = false;
  let activePointerId = null;
  let didDrag = false;
  let startScreenX = 0;
  let startScreenY = 0;
  let isHovered = false;
  let isIgnoringMouse = null;
  let dragRafId = null;
  let pendingDragPoint = null;

  function send(action, payload = {}) {
    if (ipcBridge) {
      ipcBridge.send({ action, ...payload });
    }
  }

  function isCorner(pos) {
    return (
      pos === 'top-left' ||
      pos === 'top-right' ||
      pos === 'bottom-left' ||
      pos === 'bottom-right'
    );
  }

  function isPointInCornerTriangle(pos, x, y, w, h, pad = 0) {
    if (!isCorner(pos)) return true;
    const limit = Math.max(w, h) + pad;
    switch (pos) {
      case 'top-left':
        return x + y <= limit;
      case 'top-right':
        return (w - x) + y <= limit;
      case 'bottom-left':
        return x + (h - y) <= limit;
      case 'bottom-right':
        return (w - x) + (h - y) <= limit;
      default:
        return true;
    }
  }

  function setIgnoreMouse(ignore) {
    const next = Boolean(ignore);
    if (isIgnoringMouse === next) return;
    isIgnoringMouse = next;
    send('edgeTabSetIgnoreMouse', { ignore: next });
  }

  function setHoveredState(hovered) {
    const next = Boolean(hovered);
    if (isHovered === next) return;
    isHovered = next;
    document.body.classList.toggle('hovered', next);
  }

  function updateTooltip() {
    document.body.title = currentLocked
      ? 'SatzTresor öffnen (Position fixiert • Rechtsklick für Menü)'
      : 'SatzTresor öffnen (Ziehen zum Verschieben • Rechtsklick für Menü)';
  }

  function applyVisualState(data) {
    const pos = data.position || (data.side === 'right' ? 'right' : 'left');
    const size = ALL_SIZE_CLASSES.includes('size-' + data.size) ? data.size : 'standard';
    const locked = Boolean(data.locked);

    currentPosition = pos;
    currentSize = size;
    currentLocked = locked;

    document.documentElement.className = data.theme === 'light' ? 'light' : 'dark';

    const cl = document.body.classList;
    cl.remove(...ALL_POS_CLASSES, ...ALL_SIZE_CLASSES, 'is-corner', 'is-edge', 'locked');
    cl.add('pos-' + pos);
    cl.add(isCorner(pos) ? 'is-corner' : 'is-edge');
    cl.add('size-' + size);
    if (locked) {
      cl.add('locked');
    }

    updateTooltip();

    if (activePointerId !== null) {
      setIgnoreMouse(false);
    } else if (isCorner(pos)) {
      if (!isHovered) {
        setIgnoreMouse(true);
      }
    } else {
      setIgnoreMouse(false);
    }
  }

  if (ipcBridge) {
    ipcBridge.onMessage((data) => {
      if (!data || data.type !== 'edgeTabState') return;
      applyVisualState(data);
    });
  }

  function evaluateHoverAtClientPoint(clientX, clientY) {
    if (activePointerId !== null) return;

    if (!isCorner(currentPosition)) {
      setHoveredState(true);
      setIgnoreMouse(false);
      return;
    }

    const w = window.innerWidth || 36;
    const h = window.innerHeight || 36;
    const pad = isHovered ? 3 : 0;
    const inside = isPointInCornerTriangle(currentPosition, clientX, clientY, w, h, pad);

    if (inside) {
      setHoveredState(true);
      setIgnoreMouse(false);
    } else {
      setHoveredState(false);
      setIgnoreMouse(true);
    }
  }

  window.addEventListener('mousemove', (e) => {
    evaluateHoverAtClientPoint(e.clientX, e.clientY);
  });

  window.addEventListener('mouseleave', () => {
    if (activePointerId !== null) return;
    setHoveredState(false);
    if (isCorner(currentPosition)) {
      setIgnoreMouse(true);
    }
  });

  function flushPendingDrag() {
    dragRafId = null;
    if (!pendingDragPoint || activePointerId === null) return;
    const pt = pendingDragPoint;
    pendingDragPoint = null;
    send('edgeTabDrag', pt);
  }

  dragSurface.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;

    if (isCorner(currentPosition)) {
      const w = window.innerWidth || 36;
      const h = window.innerHeight || 36;
      if (!isPointInCornerTriangle(currentPosition, e.clientX, e.clientY, w, h, 3)) {
        setIgnoreMouse(true);
        return;
      }
    }

    activePointerId = e.pointerId;
    didDrag = false;
    startScreenX = e.screenX;
    startScreenY = e.screenY;
    document.body.classList.add('pressing');
    if (isCorner(currentPosition)) {
      setIgnoreMouse(false);
    }

    try {
      dragSurface.setPointerCapture(e.pointerId);
    } catch (err) {}
  });

  dragSurface.addEventListener('pointermove', (e) => {
    if (activePointerId !== e.pointerId) {
      evaluateHoverAtClientPoint(e.clientX, e.clientY);
      return;
    }

    if (currentLocked) return;

    const dist = Math.hypot(e.screenX - startScreenX, e.screenY - startScreenY);
    if (!didDrag && dist > 5) {
      didDrag = true;
      document.body.classList.add('dragging');
    }

    if (didDrag) {
      pendingDragPoint = { screenX: e.screenX, screenY: e.screenY };
      if (!dragRafId) {
        dragRafId = requestAnimationFrame(flushPendingDrag);
      }
    }
  });

  function finishPointerInteraction(e, cancelled = false) {
    if (activePointerId === null) return;
    if (e && e.pointerId !== undefined && activePointerId !== e.pointerId) return;

    const pid = activePointerId;
    const wasDragging = didDrag;
    activePointerId = null;
    didDrag = false;
    pendingDragPoint = null;

    if (dragRafId) {
      cancelAnimationFrame(dragRafId);
      dragRafId = null;
    }

    try {
      dragSurface.releasePointerCapture(pid);
    } catch (err) {}

    document.body.classList.remove('dragging', 'pressing');

    if (cancelled) {
      if (wasDragging) {
        send('edgeTabDragEnd', {});
      }
      setHoveredState(false);
      if (isCorner(currentPosition)) {
        setIgnoreMouse(true);
      }
      return;
    }

    if (wasDragging) {
      send('edgeTabDragEnd', {
        screenX: e ? e.screenX : undefined,
        screenY: e ? e.screenY : undefined,
      });
    } else {
      send('edgeTabClick');
    }
  }

  dragSurface.addEventListener('pointerup', (e) => {
    finishPointerInteraction(e, false);
  });

  dragSurface.addEventListener('pointercancel', (e) => {
    finishPointerInteraction(e, true);
  });

  window.addEventListener('contextmenu', (e) => {
    if (isCorner(currentPosition) && activePointerId === null) {
      const w = window.innerWidth || 36;
      const h = window.innerHeight || 36;
      if (!isPointInCornerTriangle(currentPosition, e.clientX, e.clientY, w, h, 3)) {
        return;
      }
    }
    e.preventDefault();
    send('edgeTabContextMenu');
  });

  // Apply initial query-string state synchronously before first paint to eliminate startup flicker
  try {
    const params = new URLSearchParams(window.location.search || '');
    const initPos = params.get('pos');
    if (initPos) {
      applyVisualState({
        position: initPos,
        size: params.get('size') || 'standard',
        locked: params.get('locked') === '1',
        theme: params.get('theme') || 'dark',
      });
    }
  } catch (e) {}

  send('edgeTabReady');
})();
