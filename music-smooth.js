// Smooth background-music handoff using two preloaded audio elements and a gentle crossfade.
(function () {
  try { bgAudio.pause(); } catch (_) {}

  const tracks = [
    `${ASSET_ROOT}/music/carefree.mp3`,
    `${ASSET_ROOT}/music/hyperfun.mp3`
  ];
  const players = tracks.map(src => {
    const a = new Audio(src);
    a.preload = 'auto';
    a.volume = 0;
    return a;
  });

  let enabled = false;
  let active = 0;
  let transitioning = false;
  let masterVolume = Number(musicVolume.value || 0.22);
  const fadeSeconds = 3.25;

  musicVolume.value = String(Math.min(masterVolume, 0.24));
  masterVolume = Number(musicVolume.value);

  function setButton() {
    musicToggle.classList.toggle('active', enabled);
    musicToggle.setAttribute('aria-pressed', String(enabled));
    musicToggle.textContent = enabled ? '♫ Music on' : '♪ Music';
  }

  function stopAll() {
    players.forEach(p => p.pause());
    transitioning = false;
  }

  async function playCurrent() {
    enabled = true;
    setButton();
    const p = players[active];
    p.volume = masterVolume;
    try { await p.play(); }
    catch (_) { enabled = false; setButton(); }
  }

  function fade(from, to) {
    transitioning = true;
    const start = performance.now();
    to.currentTime = 0;
    to.volume = 0;
    to.play().catch(() => { transitioning = false; });

    function frame(now) {
      if (!enabled) { from.pause(); to.pause(); transitioning = false; return; }
      const t = Math.min(1, (now - start) / (fadeSeconds * 1000));
      from.volume = masterVolume * (1 - t);
      to.volume = masterVolume * t;
      if (t < 1) requestAnimationFrame(frame);
      else {
        from.pause();
        from.currentTime = 0;
        to.volume = masterVolume;
        active = players.indexOf(to);
        transitioning = false;
      }
    }
    requestAnimationFrame(frame);
  }

  setInterval(() => {
    if (!enabled || transitioning) return;
    const current = players[active];
    if (!Number.isFinite(current.duration) || current.duration <= 0) return;
    if (current.duration - current.currentTime <= fadeSeconds + 0.35) {
      const next = players[(active + 1) % players.length];
      fade(current, next);
    }
  }, 250);

  players.forEach((p, i) => {
    p.addEventListener('ended', () => {
      if (!enabled || transitioning || i !== active) return;
      active = (active + 1) % players.length;
      players[active].currentTime = 0;
      players[active].volume = masterVolume;
      players[active].play().catch(() => {});
    });
  });

  musicToggle.addEventListener('click', e => {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (enabled) {
      enabled = false;
      stopAll();
      setButton();
    } else {
      playCurrent();
    }
  }, true);

  musicVolume.addEventListener('input', e => {
    masterVolume = Number(e.target.value);
    players.forEach((p, i) => {
      if (!transitioning) p.volume = i === active && enabled ? masterVolume : 0;
    });
  });

  setButton();
})();
