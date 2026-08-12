// Major iPad/desktop drawing enhancements: 5-stroke undo, pinch zoom, saved-page browser,
// exact palette additions, and conservative line-art fitting to prevent truncation.
(function () {
  const MAX_UNDO = 5;
  const undoStack = [];
  let restoringUndo = false;
  let zoomScale = 1;
  let pinchStartDistance = 0;
  let pinchStartScale = 1;
  let pinching = false;
  const activePointers = new Map();

  // ---------- UI controls ----------
  const undoBtn = document.createElement('button');
  undoBtn.id = 'undoBtn';
  undoBtn.className = 'tool-chip';
  undoBtn.type = 'button';
  undoBtn.textContent = '↶ Undo';
  undoBtn.title = 'Undo the previous stroke (up to five strokes)';
  undoBtn.disabled = true;

  const resetZoomBtn = document.createElement('button');
  resetZoomBtn.id = 'resetZoomBtn';
  resetZoomBtn.className = 'tool-chip';
  resetZoomBtn.type = 'button';
  resetZoomBtn.textContent = '100% zoom';
  resetZoomBtn.title = 'Reset pinch zoom';

  const palettePanel = document.querySelector('.palette-panel');
  const eraserBtn = document.querySelector('#eraserBtn');
  palettePanel.insertBefore(undoBtn, eraserBtn);
  palettePanel.insertBefore(resetZoomBtn, eraserBtn);

  const savedBtn = document.createElement('button');
  savedBtn.id = 'savedPagesBtn';
  savedBtn.className = 'soft-btn';
  savedBtn.type = 'button';
  savedBtn.textContent = 'Saved Pages';
  const saveBtn = document.querySelector('#saveBtn');
  saveBtn.insertAdjacentElement('afterend', savedBtn);

  const zoomBadge = document.createElement('div');
  zoomBadge.className = 'zoom-badge';
  zoomBadge.textContent = '100%';
  canvasShell.appendChild(zoomBadge);

  const modal = document.createElement('div');
  modal.className = 'saved-modal hidden';
  modal.innerHTML = `
    <div class="saved-panel" role="dialog" aria-modal="true" aria-labelledby="savedTitle">
      <div class="saved-head"><h3 id="savedTitle">Saved Coloring Pages</h3><button class="saved-close" type="button" aria-label="Close">×</button></div>
      <div id="savedGrid" class="saved-grid"></div>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelector('.saved-close').onclick = () => modal.classList.add('hidden');
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });

  // ---------- Palette additions ----------
  const exactColors = [
    ['#FF0000', 'Pure red'],
    ['#FFD700', 'Gold'],
    ['#000000', 'Pure black'],
    ['#808080', 'Gray'],
    ['#D2B48C', 'Skin / tan'],
    ['#0000FF', 'Pure blue']
  ];
  const palette = document.querySelector('#palette');
  exactColors.forEach(([color, label]) => {
    const b = document.createElement('button');
    b.className = 'color-dot';
    b.type = 'button';
    b.style.background = color;
    b.title = label;
    b.setAttribute('aria-label', `${label} ${color}`);
    b.addEventListener('click', () => {
      currentColor = color;
      erasing = false;
      eraserBtn.classList.remove('active');
      [...palette.children].forEach(x => x.classList.remove('active'));
      b.classList.add('active');
    });
    palette.appendChild(b);
  });

  // ---------- Undo: store the state immediately before each stroke ----------
  function updateUndoButton() { undoBtn.disabled = undoStack.length === 0; }

  function snapshotForUndo() {
    if (restoringUndo || paintCanvas.width < 2 || paintCanvas.height < 2) return;
    try {
      undoStack.push(paintCanvas.toDataURL('image/png'));
      while (undoStack.length > MAX_UNDO) undoStack.shift();
      updateUndoButton();
    } catch (_) {}
  }

  function clearUndoHistory() {
    undoStack.length = 0;
    updateUndoButton();
  }

  undoBtn.onclick = () => {
    const snapshot = undoStack.pop();
    updateUndoButton();
    if (!snapshot) return;
    restoringUndo = true;
    const img = new Image();
    img.onload = () => {
      paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
      paintCtx.drawImage(img, 0, 0, paintCanvas.width, paintCanvas.height);
      restoringUndo = false;
      showToast(`Undid stroke · ${undoStack.length} undo${undoStack.length === 1 ? '' : 's'} left`);
    };
    img.src = snapshot;
  };

  // Capture phase runs before app.js drawing listeners.
  paintCanvas.addEventListener('pointerdown', e => {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size >= 2) {
      pinching = true;
      drawing = false;
      const pts = [...activePointers.values()].slice(0, 2);
      pinchStartDistance = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1;
      pinchStartScale = zoomScale;
      const r = canvasShell.getBoundingClientRect();
      const mx = (pts[0].x + pts[1].x) / 2 - r.left;
      const my = (pts[0].y + pts[1].y) / 2 - r.top;
      const ox = Math.max(0, Math.min(100, mx / Math.max(1, r.width) * 100));
      const oy = Math.max(0, Math.min(100, my / Math.max(1, r.height) * 100));
      paintCanvas.style.transformOrigin = `${ox}% ${oy}%`;
      lineCanvas.style.transformOrigin = `${ox}% ${oy}%`;
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    snapshotForUndo();
  }, true);

  function setZoom(value, announce = true) {
    zoomScale = Math.max(1, Math.min(3.5, value));
    const transform = `scale(${zoomScale})`;
    paintCanvas.style.transform = transform;
    lineCanvas.style.transform = transform;
    const pct = Math.round(zoomScale * 100);
    resetZoomBtn.textContent = `${pct}% zoom`;
    zoomBadge.textContent = `${pct}%`;
    if (announce) {
      zoomBadge.classList.add('show');
      clearTimeout(zoomBadge._timer);
      zoomBadge._timer = setTimeout(() => zoomBadge.classList.remove('show'), 900);
    }
  }

  function resetZoom() {
    paintCanvas.style.transformOrigin = '50% 50%';
    lineCanvas.style.transformOrigin = '50% 50%';
    setZoom(1);
  }
  resetZoomBtn.onclick = resetZoom;

  paintCanvas.addEventListener('pointermove', e => {
    if (!activePointers.has(e.pointerId)) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!pinching || activePointers.size < 2) return;
    const pts = [...activePointers.values()].slice(0, 2);
    const d = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1;
    setZoom(pinchStartScale * (d / pinchStartDistance));
    drawing = false;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  function releasePointer(e) {
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) pinching = false;
  }
  paintCanvas.addEventListener('pointerup', releasePointer, true);
  paintCanvas.addEventListener('pointercancel', releasePointer, true);

  // Reset editing state for a fresh page.
  document.querySelector('#colorBtn').addEventListener('click', () => { clearUndoHistory(); resetZoom(); }, true);
  document.querySelector('#newPageBtn').addEventListener('click', () => { clearUndoHistory(); resetZoom(); }, true);

  // Make Clear undoable as one action.
  const clearBtn = document.querySelector('#clearBtn');
  clearBtn.onclick = () => {
    snapshotForUndo();
    clearPaint();
    showToast('Page cleared · Undo is available');
  };

  // ---------- Conservative artwork fitting: always center with safe margins ----------
  drawLineArt = function () {
    const w = lineCanvas.width, h = lineCanvas.height;
    lineCtx.setTransform(1, 0, 0, 1, 0, 0);
    lineCtx.clearRect(0, 0, w, h);
    lineCtx.fillStyle = '#fff';
    lineCtx.fillRect(0, 0, w, h);
    if (!lineArtImage.complete || !lineArtImage.naturalWidth) {
      lineArtImage.onload = drawLineArt;
      return;
    }
    // 15% safe margin on every edge; this intentionally sacrifices some size to guarantee containment.
    const padX = w * 0.15;
    const padY = h * 0.15;
    const availableW = Math.max(1, w - padX * 2);
    const availableH = Math.max(1, h - padY * 2);
    const scale = Math.min(availableW / lineArtImage.naturalWidth, availableH / lineArtImage.naturalHeight);
    const dw = lineArtImage.naturalWidth * scale;
    const dh = lineArtImage.naturalHeight * scale;
    const dx = (w - dw) / 2;
    const dy = (h - dh) / 2;
    lineCtx.drawImage(lineArtImage, dx, dy, dw, dh);
  };

  // ---------- Save location + visible saved-page browser ----------
  function mergedCanvas() {
    const merged = document.createElement('canvas');
    merged.width = lineCanvas.width;
    merged.height = lineCanvas.height;
    const ctx = merged.getContext('2d');
    ctx.drawImage(lineCanvas, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(paintCanvas, 0, 0);
    ctx.restore();
    return merged;
  }

  function longToast(message, ms = 4300) {
    const t = document.querySelector('#toast');
    t.textContent = message;
    t.style.opacity = '1';
    t.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(t._longTimer);
    t._longTimer = setTimeout(() => {
      t.style.opacity = '0';
      t.style.transform = 'translateX(-50%) translateY(16px)';
    }, ms);
  }

  saveBtn.onclick = async () => {
    const merged = mergedCanvas();
    const png = merged.toDataURL('image/png');
    const id = activeSaveId || `${characters[selectedIndex].name}-${Date.now()}`;
    activeSaveId = id;
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({
        id,
        character: characters[selectedIndex].name,
        characterIndex: selectedIndex,
        pageVariant,
        png,
        paint: paintCanvas.toDataURL('image/png'),
        savedAt: new Date().toISOString()
      });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    longToast('Saved locally on this device/browser → IndexedDB → dandy-coloring-studio → pages. Tap “Saved Pages” to reopen it.');
  };

  async function getAllSavedPages() {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function loadSavedPage(item) {
    modal.classList.add('hidden');
    clearUndoHistory();
    resetZoom();
    selectCharacter(Number.isInteger(item.characterIndex) ? item.characterIndex : 0, false);
    pageVariant = item.pageVariant || 1;
    activeSaveId = item.id;
    pickerScreen.classList.add('hidden');
    colorScreen.classList.remove('hidden');
    pageTitle.textContent = item.character || characters[selectedIndex].name;
    pageNumber.textContent = `Page ${pageVariant}`;
    requestAnimationFrame(() => {
      resizeCanvases(false);
      const img = new Image();
      img.onload = () => {
        paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
        paintCtx.drawImage(img, 0, 0, paintCanvas.width, paintCanvas.height);
        longToast(`Loaded saved page: ${item.character || 'coloring page'}`, 2200);
      };
      img.src = item.paint || item.png;
    });
  }

  savedBtn.onclick = async () => {
    const grid = modal.querySelector('#savedGrid');
    grid.innerHTML = '<div class="saved-empty">Loading saved pages…</div>';
    modal.classList.remove('hidden');
    try {
      const items = (await getAllSavedPages()).sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
      grid.innerHTML = '';
      if (!items.length) {
        grid.innerHTML = '<div class="saved-empty">No saved pages yet. Saved pages stay only in this browser on this device.</div>';
        return;
      }
      items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'saved-card';
        const img = document.createElement('img');
        img.src = item.png;
        img.alt = `${item.character || 'Character'} saved coloring page`;
        const meta = document.createElement('div');
        meta.className = 'saved-meta';
        const date = item.savedAt ? new Date(item.savedAt).toLocaleString() : 'Saved locally';
        meta.textContent = `${item.character || 'Character'} · ${date}`;
        const open = document.createElement('button');
        open.type = 'button';
        open.textContent = 'Open page';
        open.onclick = () => loadSavedPage(item);
        card.append(img, meta, open);
        grid.appendChild(card);
      });
    } catch (_) {
      grid.innerHTML = '<div class="saved-empty">Could not read saved pages from this browser.</div>';
    }
  };
})();
