// Keep export/save output consistent with the on-screen multiply blend.
(function () {
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

  document.querySelector('#saveBtn').onclick = async () => {
    const merged = mergedCanvas();
    const png = merged.toDataURL('image/png');
    const id = activeSaveId || `${characters[selectedIndex].name}-${Date.now()}`;
    activeSaveId = id;
    const db = await openDB();
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
    showToast('Saved on this device');
  };

  document.querySelector('#printBtn').onclick = () => {
    const merged = mergedCanvas();
    const w = window.open('', '_blank');
    if (!w) {
      showToast('Please allow pop-ups to print.');
      return;
    }
    w.document.write(`<html><head><title>${characters[selectedIndex].name} coloring page</title><style>html,body{margin:0}img{width:100vw;height:100vh;object-fit:contain}</style></head><body><img src="${merged.toDataURL('image/png')}" onload="window.print();setTimeout(()=>window.close(),500)"></body></html>`);
    w.document.close();
  };
})();
