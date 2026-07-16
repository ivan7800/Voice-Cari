/* ═══════════════════════════════════════════════════════════════════
   VOICE CARI v2.0.0 — Authorized Voice Studio · Universo 404
   Estático · sin backend · sin claves API · datos solo en este navegador.
   Compatible con datos de v1.x (mismas claves voiceCari:*).
   ═══════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const APP_VERSION = '3.3.0';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  /* ── Persistencia (localStorage con cuota controlada) ─────────── */
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(`voiceCari:${key}`);
        return raw === null ? fallback : (JSON.parse(raw) ?? fallback);
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(`voiceCari:${key}`, JSON.stringify(value)); return true; }
      catch { showToast('Almacenamiento local lleno o bloqueado. Exporta y libera espacio.'); return false; }
    }
  };

  /* ── Utilidades ───────────────────────────────────────────────── */
  const escapeHtml = value => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const uid = () => (crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);

  const slugify = value => (value || 'voice-cari')
    .toString()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '') || 'voice-cari';

  const debounce = (fn, wait = 300) => {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
  };

  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  const downloadText = (filename, content, mime = 'application/json') =>
    downloadBlob(filename, new Blob([content], { type: `${mime};charset=utf-8` }));

  /* ── Estado global ────────────────────────────────────────────── */
  const state = {
    voices: [],
    speaking: false,
    utteranceQueue: [],
    queueIndex: 0,
    recorder: null,
    chunks: [],
    audioBlob: null,
    audioUrl: null,
    audioExt: 'webm',
    timerStart: null,
    timerInterval: null,
    audioCtx: null,
    analyser: null,
    meterAnim: null,
    stream: null
  };

  /* ── Toast ────────────────────────────────────────────────────── */
  const toast = $('#toast');
  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  /* ── Puerta legal (consentimiento con focus trap) ─────────────── */
  const legalGate = $('#legalGate');

  function setAppInert(isInert) {
    ['header.topbar', 'main.shell', 'footer.footer'].forEach(sel => {
      const el = $(sel);
      if (!el) return;
      if ('inert' in el) el.inert = isInert;
      el.setAttribute('aria-hidden', String(isInert));
    });
  }

  function trapFocus(event) {
    if (event.key !== 'Tab' || legalGate.classList.contains('hide')) return;
    const focusables = $$('input, button, [href]', legalGate).filter(el => !el.disabled);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  }

  function updateLegalButton() {
    const ok = ['#legalOwnVoice', '#legalSynthetic', '#legalLocal'].every(id => $(id)?.checked);
    $('#acceptLegal').disabled = !ok;
  }

  function initLegal() {
    if (store.get('legalAccepted', false)) {
      legalGate.classList.add('hide');
    } else {
      setAppInert(true);
      legalGate.addEventListener('keydown', trapFocus);
      $('#legalOwnVoice')?.focus();
    }

    ['#legalOwnVoice', '#legalSynthetic', '#legalLocal']
      .forEach(id => $(id).addEventListener('change', updateLegalButton));

    $('#acceptLegal').addEventListener('click', () => {
      store.set('legalAccepted', { acceptedAt: new Date().toISOString(), version: APP_VERSION });
      legalGate.classList.add('hide');
      setAppInert(false);
      $('#scriptText')?.focus();
      showToast('Modo seguro activado. Bienvenido a Voice Cari.');
    });

    $('#readLegal').addEventListener('click', () => {
      const panel = $('#legalFull');
      panel.hidden = !panel.hidden;
      $('#readLegal').setAttribute('aria-expanded', String(!panel.hidden));
      $('#readLegal').textContent = panel.hidden ? 'Ver aviso completo' : 'Ocultar aviso';
    });
  }

  /* ── Navegación por secciones (whitelist) ─────────────────────── */
  const SECTIONS = ['studio', 'recorder', 'clone', 'profiles', 'library', 'integrations', 'help'];

  function showSection(id) {
    if (!SECTIONS.includes(id)) return;
    $$('.section').forEach(section => section.classList.toggle('active', section.id === id));
    $$('.nav-link').forEach(btn => {
      const active = btn.dataset.section === id;
      btn.classList.toggle('active', active);
      if (active) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
    try { history.replaceState(null, '', `#${id}`); } catch { /* file:// o sandbox */ }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  }

  function initNavigation() {
    $$('.nav-link').forEach(btn => btn.addEventListener('click', () => showSection(btn.dataset.section)));
    $$('[data-jump]').forEach(btn => btn.addEventListener('click', () => showSection(btn.dataset.jump)));
    const initial = decodeURIComponent(location.hash.replace('#', ''));
    if (SECTIONS.includes(initial)) showSection(initial);

    // Cambios de hash en caliente (enlaces externos, edición manual de la URL).
    window.addEventListener('hashchange', () => {
      const target = decodeURIComponent(location.hash.replace('#', ''));
      if (SECTIONS.includes(target) && !$(`#${target}`).classList.contains('active')) {
        showSection(target);
      }
    });
  }

  /* ── Skins ────────────────────────────────────────────────────── */
  function initTheme() {
    const saved = store.get('theme', 'gold');
    document.documentElement.dataset.theme = saved;
    $('#themeSelect').value = saved;
    $('#themeSelect').addEventListener('change', event => {
      document.documentElement.dataset.theme = event.target.value;
      store.set('theme', event.target.value);
      showToast(`Skin ${event.target.selectedOptions[0].textContent} aplicada.`);
    });
  }

  /* ── Editor ───────────────────────────────────────────────────── */
  const saveDraft = debounce(value => store.set('draftText', value), 400);

  function updateTextStats() {
    const text = $('#scriptText').value.trim();
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
    $('#charCount').textContent = text.length.toLocaleString('es-ES');
    $('#wordCount').textContent = words.toLocaleString('es-ES');
    $('#readingTime').textContent = String(Math.ceil(words / 155));
  }

  const PRESETS = {
    terror: 'La ciudad respiraba como un animal dormido. Bajo la lluvia, cada ventana parecía observarme desde otro tiempo. Entonces escuché la voz: no venía de la calle, sino del interior de mi propio nombre.',
    trailer: 'Este invierno, una señal imposible atraviesa la red. Nadie sabe quién la envió. Nadie recuerda haberla recibido. Voice Cari presenta: una voz que nunca debió despertar.',
    audiobook: 'Capítulo uno. La mañana llegó sin ruido, como si el mundo hubiera aprendido a contener la respiración. Abrí el cuaderno y encontré una frase escrita con mi letra, aunque yo jamás la había escrito.',
    corporate: 'Bienvenido a esta guía de soporte. En los próximos minutos revisaremos el procedimiento recomendado, los puntos críticos y las acciones de verificación antes de cerrar la incidencia.'
  };

  const SAMPLE_TEXT = 'Esta es una muestra autorizada para Voice Cari. Confirmo que la voz grabada me pertenece o tengo permiso explícito para usarla. La noche cae sobre la ciudad, y cada palabra conserva su propia sombra.';

  function initEditor() {
    const textarea = $('#scriptText');
    textarea.value = store.get('draftText', '');
    updateTextStats();

    textarea.addEventListener('input', () => {
      updateTextStats();
      saveDraft(textarea.value);
    });

    $('#clearText').addEventListener('click', () => {
      textarea.value = '';
      updateTextStats();
      saveDraft('');
      textarea.focus();
      showToast('Texto limpiado.');
    });

    $$('.chip[data-preset]').forEach(btn => btn.addEventListener('click', () => {
      textarea.value = PRESETS[btn.dataset.preset] || '';
      updateTextStats();
      saveDraft(textarea.value);
      showToast(`Preset «${btn.textContent.trim()}» insertado.`);
    }));

    $('#insertSampleText').addEventListener('click', () => {
      textarea.value = SAMPLE_TEXT;
      updateTextStats();
      saveDraft(textarea.value);
      showSection('studio');
      showToast('Texto de prueba insertado en el editor.');
    });
  }

  /* ── SpeechSynthesis (troceo anticorte Chrome + Safari/Android) ── */
  const ttsSupported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

  function setTransportEnabled(enabled) {
    ['#speakBtn', '#pauseBtn', '#resumeBtn', '#stopBtn'].forEach(id => { $(id).disabled = !enabled; });
  }

  function populateVoices() {
    if (!ttsSupported) return;
    const previous = store.get('voiceURI', null);
    state.voices = speechSynthesis.getVoices()
      .slice()
      .sort((a, b) => `${a.lang} ${a.name}`.localeCompare(`${b.lang} ${b.name}`));

    const select = $('#voiceSelect');
    select.innerHTML = '';

    if (!state.voices.length) {
      const option = document.createElement('option');
      option.textContent = 'Cargando voces del sistema…';
      option.disabled = true;
      select.appendChild(option);
      $('#voiceSupport').textContent = 'Esperando voces';
      return;
    }

    const isSpanish = v => /^es[-_]/i.test(v.lang);
    const ordered = [...state.voices.filter(isSpanish), ...state.voices.filter(v => !isSpanish(v))];
    ordered.forEach(voice => {
      const option = document.createElement('option');
      option.value = voice.voiceURI;
      option.textContent = `${voice.name} · ${voice.lang}${voice.localService ? ' · local' : ''}`;
      select.appendChild(option);
    });

    const match = previous && state.voices.some(v => v.voiceURI === previous);
    select.value = match ? previous : ordered[0].voiceURI;
    $('#voiceSupport').textContent = `${state.voices.length} voces`;
  }

  const selectedVoice = () =>
    state.voices.find(v => v.voiceURI === $('#voiceSelect').value) || null;

  // Chrome desktop corta utterances largos (~15 s): troceamos por frases.
  function chunkText(text, maxLen = 220) {
    const sentences = text.match(/[^.!?…\n]+[.!?…\n]*/g) || [text];
    const chunks = [];
    let current = '';
    for (const sentence of sentences) {
      if ((current + sentence).length > maxLen && current.trim()) {
        chunks.push(current.trim());
        current = sentence;
      } else {
        current += sentence;
      }
      while (current.length > maxLen) {
        chunks.push(current.slice(0, maxLen).trim());
        current = current.slice(maxLen);
      }
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks;
  }

  const setSpeakStatus = text => { $('#speakStatus').textContent = text; };

  function speakNextChunk() {
    if (!state.speaking || state.queueIndex >= state.utteranceQueue.length) {
      state.speaking = false;
      setSpeakStatus('Listo');
      if (state.queueIndex >= state.utteranceQueue.length && state.utteranceQueue.length) {
        showToast('Lectura finalizada.');
      }
      return;
    }
    const utterance = new SpeechSynthesisUtterance(state.utteranceQueue[state.queueIndex]);
    const voice = selectedVoice();
    if (voice) { utterance.voice = voice; utterance.lang = voice.lang; }
    utterance.rate = Number($('#rate').value);
    utterance.pitch = Number($('#pitch').value);
    utterance.volume = Number($('#volume').value);
    utterance.onend = () => { state.queueIndex += 1; speakNextChunk(); };
    utterance.onerror = event => {
      if (event.error === 'interrupted' || event.error === 'canceled') return;
      state.speaking = false;
      setSpeakStatus('Error');
      showToast('El navegador interrumpió la voz. Prueba otra voz o recarga.');
    };
    speechSynthesis.speak(utterance);
  }

  function speak() {
    if (!ttsSupported) return showToast('Este navegador no soporta lectura de voz.');
    const text = $('#scriptText').value.trim();
    if (!text) return showToast('Escribe un texto antes de reproducir.');
    speechSynthesis.cancel();
    state.utteranceQueue = chunkText(text);
    state.queueIndex = 0;
    state.speaking = true;
    setSpeakStatus(`Leyendo (${state.utteranceQueue.length} bloques)`);
    speakNextChunk();
  }

  function initSpeech() {
    ['rate', 'pitch', 'volume'].forEach(id => {
      const el = $(`#${id}`);
      const out = $(`#${id}Out`);
      const update = () => { out.value = Number(el.value).toFixed(2); store.set(id, el.value); };
      el.value = store.get(id, el.value);
      update();
      el.addEventListener('input', update);
    });

    if (!ttsSupported) {
      $('#voiceSupport').textContent = 'No soportado';
      $('#voiceSelect').innerHTML = '<option disabled>Tu navegador no soporta voces locales</option>';
      setTransportEnabled(false);
      setSpeakStatus('Sin soporte');
      return;
    }

    populateVoices();
    speechSynthesis.addEventListener?.('voiceschanged', populateVoices);
    speechSynthesis.onvoiceschanged = populateVoices; // fallback navegadores antiguos

    $('#voiceSelect').addEventListener('change', () => store.set('voiceURI', $('#voiceSelect').value));
    $('#speakBtn').addEventListener('click', speak);
    $('#pauseBtn').addEventListener('click', () => {
      if (!speechSynthesis.speaking) return;
      speechSynthesis.pause();
      setSpeakStatus('En pausa');
    });
    $('#resumeBtn').addEventListener('click', () => {
      if (!speechSynthesis.paused) return;
      speechSynthesis.resume();
      setSpeakStatus('Leyendo');
    });
    $('#stopBtn').addEventListener('click', () => {
      state.speaking = false;
      state.utteranceQueue = [];
      speechSynthesis.cancel();
      setSpeakStatus('Listo');
      showToast('Reproducción detenida.');
    });
    window.addEventListener('beforeunload', () => speechSynthesis.cancel());
  }

  /* ── Medidor de audio ─────────────────────────────────────────── */
  function accentColor() {
    return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#e8b44a';
  }

  function drawIdleMeter() {
    const canvas = $('#meter');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255,255,255,.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, canvas.height / 2);
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();
  }

  function drawMeter() {
    const canvas = $('#meter');
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    const accent = accentColor();
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, 'rgba(255,255,255,.15)');
    gradient.addColorStop(.5, accent);
    gradient.addColorStop(1, 'rgba(255,255,255,.15)');
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 2;
    ctx.beginPath();

    const data = new Uint8Array(state.analyser.fftSize);
    state.analyser.getByteTimeDomainData(data);
    const slice = width / data.length;
    for (let i = 0; i < data.length; i++) {
      const y = (data[i] / 255) * height;
      if (i === 0) ctx.moveTo(0, y); else ctx.lineTo(i * slice, y);
    }
    ctx.stroke();
    state.meterAnim = requestAnimationFrame(drawMeter);
  }

  function formatTime(ms) {
    const total = Math.floor(ms / 1000);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  /* ── Grabador (Chrome/Edge/Firefox/Safari) ────────────────────── */
  function pickMimeType() {
    const candidates = [
      'audio/webm;codecs=opus', 'audio/webm',
      'audio/mp4;codecs=mp4a.40.2', 'audio/mp4',
      'audio/ogg;codecs=opus'
    ];
    for (const type of candidates) {
      if (window.MediaRecorder?.isTypeSupported?.(type)) return type;
    }
    return '';
  }

  const extFromMime = mime => /mp4/.test(mime) ? 'm4a' : (/ogg/.test(mime) ? 'ogg' : 'webm');

  function setRecordingUi(recording) {
    $('#recLed').classList.toggle('is-recording', recording);
    $('#startRec').disabled = recording;
    $('#stopRec').disabled = !recording;
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      return showToast('Tu navegador no soporta grabación local. Prueba Chrome, Edge o Safari 14.1+.');
    }
    try {
      state.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      state.chunks = [];

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        state.audioCtx = new AudioCtx();
        if (state.audioCtx.state === 'suspended') await state.audioCtx.resume().catch(() => {});
        const source = state.audioCtx.createMediaStreamSource(state.stream);
        state.analyser = state.audioCtx.createAnalyser();
        state.analyser.fftSize = 2048;
        source.connect(state.analyser);
        drawMeter();
      }

      const mimeType = pickMimeType();
      state.recorder = mimeType ? new MediaRecorder(state.stream, { mimeType }) : new MediaRecorder(state.stream);
      state.audioExt = extFromMime(state.recorder.mimeType || mimeType);
      $('#qFormat').textContent = state.audioExt === 'm4a' ? 'MP4/AAC' : (state.audioExt === 'ogg' ? 'Ogg/Opus' : 'WebM/Opus');

      state.recorder.ondataavailable = e => { if (e.data && e.data.size) state.chunks.push(e.data); };
      state.recorder.onstop = finishRecording;
      state.recorder.onerror = () => { showToast('Error de grabación del navegador.'); cleanupRecording(); };
      state.recorder.start(500);

      state.timerStart = Date.now();
      $('#timer').textContent = '00:00';
      state.timerInterval = setInterval(() => {
        $('#timer').textContent = formatTime(Date.now() - state.timerStart);
      }, 250);

      $('#recordStatus').textContent = 'Grabando';
      setRecordingUi(true);
      $('#downloadRec').disabled = true;
      $('#deleteRec').disabled = true;
      $('#saveToBank').disabled = true;
      showToast('Grabación iniciada. Habla con claridad.');
    } catch (error) {
      cleanupRecording();
      if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
        showToast('Micrófono bloqueado. Concede permiso en el candado de la barra de direcciones.');
      } else if (error?.name === 'NotFoundError') {
        showToast('No se detectó ningún micrófono en este dispositivo.');
      } else {
        showToast('No se pudo iniciar la grabación. Revisa permisos y dispositivo.');
      }
    }
  }

  function cleanupRecording() {
    clearInterval(state.timerInterval);
    if (state.meterAnim) cancelAnimationFrame(state.meterAnim);
    state.meterAnim = null;
    state.analyser = null;
    state.stream?.getTracks().forEach(track => track.stop());
    state.stream = null;
    if (state.audioCtx && state.audioCtx.state !== 'closed') state.audioCtx.close().catch(() => {});
    state.audioCtx = null;
    drawIdleMeter();
    setRecordingUi(false);
  }

  function stopRecording() {
    if (state.recorder && state.recorder.state !== 'inactive') state.recorder.stop();
  }

  function finishRecording() {
    const mime = state.recorder?.mimeType || 'audio/webm';
    cleanupRecording();
    if (!state.chunks.length) {
      $('#recordStatus').textContent = 'Inactivo';
      return showToast('La grabación quedó vacía. Vuelve a intentarlo.');
    }
    state.audioBlob = new Blob(state.chunks, { type: mime });
    if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
    state.audioUrl = URL.createObjectURL(state.audioBlob);

    const player = $('#recordedAudio');
    player.src = state.audioUrl;
    player.hidden = false;
    $('#recordStatus').textContent = 'Muestra lista';
    $('#downloadRec').disabled = false;
    $('#deleteRec').disabled = false;
    $('#saveToBank').disabled = false;
    showToast('Muestra grabada. Escúchala, descárgala o añádela al banco de voz.');
  }

  function initRecorder() {
    drawIdleMeter();
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      $('#recordStatus').textContent = 'No soportado';
      $('#startRec').disabled = true;
    }
    $('#startRec').addEventListener('click', startRecording);
    $('#stopRec').addEventListener('click', stopRecording);
    $('#downloadRec').addEventListener('click', () => {
      if (!state.audioBlob) return;
      downloadBlob(`voice-cari-muestra-${new Date().toISOString().slice(0, 10)}.${state.audioExt}`, state.audioBlob);
    });
    $('#deleteRec').addEventListener('click', () => {
      if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
      state.audioBlob = null;
      state.audioUrl = null;
      const player = $('#recordedAudio');
      player.removeAttribute('src');
      player.hidden = true;
      $('#downloadRec').disabled = true;
      $('#deleteRec').disabled = true;
      $('#saveToBank').disabled = true;
      $('#recordStatus').textContent = 'Inactivo';
      $('#timer').textContent = '00:00';
      showToast('Muestra borrada de la memoria.');
    });
  }

  /* ── Perfiles vocales (con delegación de eventos) ─────────────── */
  const getProfiles = () => store.get('profiles', []);
  function setProfiles(profiles) { store.set('profiles', profiles); renderProfiles(); }

  function renderProfiles() {
    const list = $('#profileList');
    const profiles = getProfiles();
    if (!profiles.length) {
      list.className = 'cards-list is-empty';
      list.textContent = 'Aún no hay perfiles. Crea el primero con el formulario.';
      return;
    }
    list.className = 'cards-list';
    list.innerHTML = profiles.map(profile => `
      <div class="card-item">
        <header>
          <strong>${escapeHtml(profile.name)}</strong>
          <span class="pill pill-safe">${escapeHtml(profile.consentLabel)}</span>
        </header>
        <p><b>Uso:</b> ${escapeHtml(profile.use)} · <b>Tono:</b> ${escapeHtml(profile.tone || 'No especificado')}</p>
        <p><b>Creado:</b> ${escapeHtml(new Date(profile.createdAt).toLocaleString('es-ES'))}</p>
        <div class="card-actions">
          <button class="btn btn-danger btn-small" data-delete-profile="${escapeHtml(profile.id)}">Eliminar</button>
        </div>
      </div>`).join('');
  }

  function initProfiles() {
    renderProfiles();

    // Delegación: un solo listener para toda la lista.
    $('#profileList').addEventListener('click', event => {
      const btn = event.target.closest('[data-delete-profile]');
      if (!btn) return;
      setProfiles(getProfiles().filter(p => p.id !== btn.dataset.deleteProfile));
      showToast('Perfil eliminado.');
    });

    $('#saveProfile').addEventListener('click', () => {
      const name = $('#profileName').value.trim();
      if (!name) { $('#profileName').focus(); return showToast('Pon un nombre al perfil vocal.'); }
      const consent = $('#profileConsent').value;
      const profile = {
        id: uid(),
        name,
        use: $('#profileUse').value,
        tone: $('#profileTone').value.trim(),
        consent,
        consentLabel: consent === 'own' ? 'Voz propia' : 'Permiso documentado',
        createdAt: new Date().toISOString()
      };
      setProfiles([profile, ...getProfiles()]);
      $('#profileName').value = '';
      $('#profileTone').value = '';
      showToast(`Perfil «${name}» guardado.`);
    });

    $('#exportProfiles').addEventListener('click', () => {
      const profiles = getProfiles();
      if (!profiles.length) return showToast('No hay perfiles que exportar todavía.');
      downloadText('voice-cari-perfiles.json', JSON.stringify({
        app: 'Voice Cari',
        exportedAt: new Date().toISOString(),
        profiles
      }, null, 2));
      showToast('Perfiles exportados como JSON.');
    });
  }

  /* ── Proyectos ────────────────────────────────────────────────── */
  function currentProjectPayload() {
    const voice = selectedVoice();
    const text = $('#scriptText').value;
    const trimmed = text.trim();
    return {
      app: 'Voice Cari',
      version: APP_VERSION,
      exportedAt: new Date().toISOString(),
      legal: store.get('legalAccepted', null),
      project: $('#projectName').value.trim() || 'Proyecto Voice Cari',
      text,
      stats: {
        chars: trimmed.length,
        words: trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0
      },
      browserVoice: voice ? { name: voice.name, lang: voice.lang, localService: voice.localService } : null,
      settings: { rate: $('#rate').value, pitch: $('#pitch').value, volume: $('#volume').value },
      profiles: getProfiles(),
      safety: {
        consentRequired: true,
        syntheticDisclosureRequired: true,
        noImpersonation: true,
        noPublicApiKeyInGithubPages: true
      }
    };
  }

  const getProjects = () => store.get('projects', []);
  function setProjects(projects) { store.set('projects', projects); renderProjects(); }

  function renderProjects() {
    const list = $('#projectList');
    const projects = getProjects();
    if (!projects.length) {
      list.className = 'cards-list is-empty';
      list.textContent = 'No hay proyectos guardados. Escribe en el Studio y guarda tu primera sesión.';
      return;
    }
    list.className = 'cards-list';
    list.innerHTML = projects.map(project => {
      const preview = (project.text || '').slice(0, 150);
      return `
      <div class="card-item">
        <header>
          <strong>${escapeHtml(project.project)}</strong>
          <span class="pill">${escapeHtml(String(project.stats?.words ?? 0))} palabras</span>
        </header>
        <p>${escapeHtml(preview)}${(project.text || '').length > 150 ? '…' : ''}</p>
        <p><b>Guardado:</b> ${escapeHtml(new Date(project.exportedAt).toLocaleString('es-ES'))}</p>
        <div class="card-actions">
          <button class="btn btn-outline btn-small" data-load-project="${escapeHtml(project.id)}">Cargar</button>
          <button class="btn btn-outline btn-small" data-export-project="${escapeHtml(project.id)}">Exportar</button>
          <button class="btn btn-danger btn-small" data-delete-project="${escapeHtml(project.id)}">Eliminar</button>
        </div>
      </div>`;
    }).join('');
  }

  function initProjects() {
    renderProjects();

    // Delegación: un solo listener para cargar / exportar / eliminar.
    $('#projectList').addEventListener('click', event => {
      const loadBtn = event.target.closest('[data-load-project]');
      const exportBtn = event.target.closest('[data-export-project]');
      const deleteBtn = event.target.closest('[data-delete-project]');

      if (loadBtn) {
        const project = getProjects().find(p => p.id === loadBtn.dataset.loadProject);
        if (!project) return;
        $('#projectName').value = project.project;
        $('#scriptText').value = project.text || '';
        ['rate', 'pitch', 'volume'].forEach(id => {
          if (project.settings?.[id] !== undefined) {
            $(`#${id}`).value = project.settings[id];
            $(`#${id}Out`).value = Number(project.settings[id]).toFixed(2);
          }
        });
        updateTextStats();
        saveDraft(project.text || '');
        showSection('studio');
        showToast(`Proyecto «${project.project}» cargado en el Studio.`);
      } else if (exportBtn) {
        const project = getProjects().find(p => p.id === exportBtn.dataset.exportProject);
        if (project) downloadText(`${slugify(project.project)}.json`, JSON.stringify(project, null, 2));
      } else if (deleteBtn) {
        setProjects(getProjects().filter(p => p.id !== deleteBtn.dataset.deleteProject));
        showToast('Proyecto eliminado.');
      }
    });

    $('#saveProject').addEventListener('click', () => {
      if (!$('#scriptText').value.trim()) return showToast('El proyecto necesita texto. Escribe algo en el Studio.');
      const payload = currentProjectPayload();
      payload.id = uid();
      setProjects([payload, ...getProjects()].slice(0, 30));
      showToast(`Proyecto «${payload.project}» guardado localmente.`);
    });

    $('#exportProject').addEventListener('click', () => {
      const payload = currentProjectPayload();
      downloadText(`${slugify(payload.project)}.json`, JSON.stringify(payload, null, 2));
      showToast('Paquete JSON exportado.');
    });

    $('#clearProjects').addEventListener('click', () => {
      if (!getProjects().length) return showToast('La biblioteca ya está vacía.');
      if (confirm('¿Vaciar la biblioteca local de Voice Cari? Esta acción no se puede deshacer.')) {
        setProjects([]);
        showToast('Biblioteca vaciada.');
      }
    });
  }

  /* ── Integraciones (payload seguro, sin claves) ───────────────── */
  function initIntegrations() {
    $('#buildApiPack').addEventListener('click', () => {
      const payload = currentProjectPayload();
      payload.integration = {
        provider: $('#apiProvider').value,
        externalVoiceId: $('#externalVoiceId').value.trim() || null,
        recommendedFlow: [
          'Verificar consentimiento antes de procesar la voz.',
          'Enviar muestra vocal solo a un backend seguro o proveedor autorizado.',
          'No guardar claves API en GitHub Pages ni en repositorios públicos.',
          'Etiquetar el audio final como voz sintética cuando corresponda.'
        ],
        exampleRequestShape: {
          text: payload.text.slice(0, 5000),
          voice_id: $('#externalVoiceId').value.trim() || 'VOICE_ID_AUTORIZADO',
          model: 'external-authorized-tts-or-clone-engine',
          output_format: 'mp3_or_wav'
        }
      };
      $('#payloadOut').textContent = JSON.stringify(payload, null, 2);
      showToast('Paquete API-ready generado.');
    });

    $('#copyPayload').addEventListener('click', async () => {
      const content = $('#payloadOut').textContent;
      if (!content || content.startsWith('Aún no')) return showToast('Genera primero un paquete API-ready.');
      try {
        await navigator.clipboard.writeText(content);
        showToast('Payload copiado al portapapeles.');
      } catch {
        showToast('No se pudo copiar automáticamente. Selecciona y copia manualmente.');
      }
    });
  }


  /* ── Banco de voz (IndexedDB) ─────────────────────────────────── */
  const idb = {
    open() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open('voiceCariDB', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('samples', { keyPath: 'id' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    },
    async tx(mode, fn) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('samples', mode);
        transaction.oncomplete = transaction.onabort = () => db.close();
        const req = fn(transaction.objectStore('samples'));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    },
    all() { return this.tx('readonly', s => s.getAll()); },
    get(id) { return this.tx('readonly', s => s.get(id)); },
    put(sample) { return this.tx('readwrite', s => s.put(sample)); },
    del(id) { return this.tx('readwrite', s => s.delete(id)); }
  };

  /* ── Conversión a WAV (mono, 24 kHz, PCM16) ───────────────────── */
  /* ── Pipeline de audio: decodificar → Float32 mono a targetRate ── */
  const TARGET_RATE = 24000;

  async function blobToFloat(blob, targetRate = TARGET_RATE) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const decoder = new AudioCtx();
    const decoded = await decoder.decodeAudioData(await blob.arrayBuffer());
    decoder.close().catch(() => {});
    const frames = Math.max(1, Math.ceil(decoded.duration * targetRate));
    const offline = new OfflineAudioContext(1, frames, targetRate);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return { pcm: Float32Array.from(rendered.getChannelData(0)), rate: targetRate };
  }

  function floatToWav(pcm, rate = TARGET_RATE) {
    const buffer = new ArrayBuffer(44 + pcm.length * 2);
    const view = new DataView(buffer);
    const writeStr = (offset, str) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };
    writeStr(0, 'RIFF'); view.setUint32(4, 36 + pcm.length * 2, true); writeStr(8, 'WAVE');
    writeStr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    writeStr(36, 'data'); view.setUint32(40, pcm.length * 2, true);
    let offset = 44;
    for (let i = 0; i < pcm.length; i++, offset += 2) {
      const sample = Math.max(-1, Math.min(1, pcm[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }
    return new Blob([buffer], { type: 'audio/wav' });
  }

  /* ── Análisis de calidad de muestra ───────────────────────────── */
  function analyzeSample(pcm, rate = TARGET_RATE) {
    const n = pcm.length;
    const duration = n / rate;
    let peak = 0;
    let sumSquares = 0;
    let clipped = 0;
    for (let i = 0; i < n; i++) {
      const abs = Math.abs(pcm[i]);
      if (abs > peak) peak = abs;
      sumSquares += pcm[i] * pcm[i];
      if (abs >= 0.999) clipped++;
    }
    const rms = Math.sqrt(sumSquares / Math.max(1, n));
    const peakDb = peak > 0 ? 20 * Math.log10(peak) : -Infinity;

    // Estimación de ruido de fondo: RMS del percentil 10 de ventanas de 50 ms.
    // Ventanas largas evitan confundir los cruces por cero de un tono con silencio real.
    const frame = Math.max(1, Math.floor(rate * 0.05)); // 50 ms
    const energies = [];
    for (let i = 0; i + frame <= n; i += frame) {
      let e = 0;
      for (let j = 0; j < frame; j++) e += pcm[i + j] * pcm[i + j];
      energies.push(Math.sqrt(e / frame));
    }
    energies.sort((a, b) => a - b);
    const noiseFloor = energies.length ? energies[Math.floor(energies.length * 0.1)] : 0;
    // Si el "silencio" no es mucho más bajo que el RMS global, no hay pausas reales:
    // tratamos la señal como continua y limpia (SNR alta) en vez de penalizarla.
    const snr = (noiseFloor > 0 && rms > 0 && noiseFloor < rms * 0.5)
      ? 20 * Math.log10(rms / noiseFloor)
      : Infinity;

    const clipPct = (clipped / Math.max(1, n)) * 100;
    const issues = [];
    if (duration < 6) issues.push({ level: 'warn', text: `Muy corta (${duration.toFixed(1)}s). Ideal: 15–30 s o más.` });
    else if (duration < 10) issues.push({ level: 'info', text: `Algo corta (${duration.toFixed(1)}s). Más audio mejora la clonación.` });
    if (clipPct > 0.5) issues.push({ level: 'warn', text: `Saturación (clipping) en ${clipPct.toFixed(1)}% del audio. Baja el volumen al grabar.` });
    if (peakDb < -18) issues.push({ level: 'warn', text: `Nivel muy bajo (pico ${peakDb.toFixed(0)} dB). Acerca el micrófono.` });
    if (snr < 15) issues.push({ level: 'warn', text: `Mucho ruido de fondo (SNR ${isFinite(snr) ? snr.toFixed(0) : '∞'} dB). Busca un sitio más silencioso.` });
    else if (snr < 25) issues.push({ level: 'info', text: `Ruido de fondo perceptible (SNR ${snr.toFixed(0)} dB).` });

    let score = 100;
    if (duration < 6) score -= 30; else if (duration < 10) score -= 12; else if (duration < 15) score -= 4;
    if (clipPct > 0.5) score -= 25; else if (clipPct > 0.1) score -= 8;
    if (peakDb < -18) score -= 15; else if (peakDb < -12) score -= 5;
    if (isFinite(snr)) { if (snr < 15) score -= 25; else if (snr < 25) score -= 10; }
    score = Math.max(0, Math.min(100, Math.round(score)));

    return { duration, peakDb, snr, clipPct, score, issues };
  }

  /* ── Recorte de silencios en los extremos ─────────────────────── */
  function trimSilence(pcm, rate = TARGET_RATE, thresholdDb = -40, padMs = 120) {
    const threshold = Math.pow(10, thresholdDb / 20);
    const frame = Math.max(1, Math.floor(rate * 0.01)); // 10 ms
    const isLoud = idx => {
      let e = 0;
      const end = Math.min(pcm.length, idx + frame);
      for (let j = idx; j < end; j++) e += pcm[j] * pcm[j];
      return Math.sqrt(e / Math.max(1, end - idx)) > threshold;
    };
    let start = 0;
    let end = pcm.length;
    while (start < pcm.length && !isLoud(start)) start += frame;
    while (end > start && !isLoud(Math.max(0, end - frame))) end -= frame;
    const pad = Math.floor(rate * padMs / 1000);
    start = Math.max(0, start - pad);
    end = Math.min(pcm.length, end + pad);
    if (end <= start) return pcm; // todo silencio: no tocar
    return pcm.slice(start, end);
  }

  /* ── Normalización de pico (headroom para evitar clipping) ────── */
  function normalizePeak(pcm, targetDb = -1) {
    let peak = 0;
    for (let i = 0; i < pcm.length; i++) { const a = Math.abs(pcm[i]); if (a > peak) peak = a; }
    if (peak === 0) return pcm;
    const gain = Math.pow(10, targetDb / 20) / peak;
    const out = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) out[i] = Math.max(-1, Math.min(1, pcm[i] * gain));
    return out;
  }

  /* ── Fusión de varias muestras (0,4 s de silencio entre ellas) ── */
  function concatSamples(pcmList, rate = TARGET_RATE, gapMs = 400) {
    const gap = Math.floor(rate * gapMs / 1000);
    const total = pcmList.reduce((sum, p) => sum + p.length, 0) + gap * Math.max(0, pcmList.length - 1);
    const out = new Float32Array(total);
    let offset = 0;
    pcmList.forEach((p, index) => {
      out.set(p, offset);
      offset += p.length + (index < pcmList.length - 1 ? gap : 0);
    });
    return out;
  }

  async function blobToWav(blob, targetRate = TARGET_RATE, opts = {}) {
    let { pcm } = await blobToFloat(blob, targetRate);
    if (opts.trim) pcm = trimSilence(pcm, targetRate);
    if (opts.normalize) pcm = normalizePeak(pcm);
    return { wav: floatToWav(pcm, targetRate), duration: pcm.length / targetRate, pcm };
  }

  const CONSENT_TEXT = 'Confirmo que esta voz es mía o de una persona que me ha dado permiso explícito para clonarla (por ejemplo, un familiar). Entiendo que solo debe usarse con su consentimiento.';

  // Estado del modal de calidad
  let pendingPcm = null;
  let pendingKind = 'sample'; // 'sample' | 'consent' | 'merge'
  let pendingPreviewUrl = null;

  function verdictFor(score) {
    if (score >= 85) return { text: 'Excelente para clonar', cls: 'good' };
    if (score >= 65) return { text: 'Buena, utilizable', cls: 'ok' };
    if (score >= 40) return { text: 'Mejorable — revisa los avisos', cls: 'warn' };
    return { text: 'Baja calidad — mejor regrabar', cls: 'bad' };
  }

  async function openQualityModal(blob, suggestedName, kind = 'sample') {
    try {
      const { pcm } = await blobToFloat(blob);
      pendingPcm = pcm;
      pendingKind = kind;
    } catch {
      return showToast('No se pudo leer el audio. Prueba con otro archivo o vuelve a grabar.');
    }
    const analysis = analyzeSample(pendingPcm);
    const verdict = verdictFor(analysis.score);

    $('#qualityTitle').textContent = kind === 'consent' ? 'CONSENTIMIENTO GRABADO' : 'REVISIÓN DE MUESTRA';
    $('#qualityValue').textContent = analysis.score;
    const gauge = $('#qualityGauge');
    gauge.className = `gauge gauge-${verdict.cls}`;
    $('#qualityVerdict').textContent = verdict.text;
    $('#qualityVerdict').className = `quality-verdict verdict-${verdict.cls}`;
    $('#qualityStats').textContent =
      `Duración ${analysis.duration.toFixed(1)}s · Pico ${analysis.peakDb.toFixed(0)} dB · ` +
      `Ruido ${isFinite(analysis.snr) ? 'SNR ' + analysis.snr.toFixed(0) + ' dB' : 'muy bajo'} · ` +
      `Saturación ${analysis.clipPct.toFixed(1)}%`;

    const issues = $('#qualityIssues');
    issues.innerHTML = analysis.issues.length
      ? analysis.issues.map(i => `<li class="issue issue-${i.level}">${escapeHtml(i.text)}</li>`).join('')
      : '<li class="issue issue-ok">Sin problemas detectados.</li>';

    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    pendingPreviewUrl = URL.createObjectURL(blob);
    const preview = $('#qualityPreview');
    preview.src = pendingPreviewUrl;
    preview.hidden = false;

    $('#qualityName').value = kind === 'consent'
      ? `Consentimiento · ${new Date().toLocaleDateString('es-ES')}`
      : (suggestedName || '');
    $('#qualityConsent').checked = false;
    // El consentimiento grabado ES la prueba: la casilla queda premarcada e informativa
    const consentLine = $('#qualityConsent').closest('.consent-line');
    if (kind === 'consent') { $('#qualityConsent').checked = true; consentLine.style.display = 'none'; }
    else consentLine.style.display = '';

    $('#qualityModal').classList.remove('hide');
    $('#qualityName').focus();
  }

  function closeQualityModal() {
    $('#qualityModal').classList.add('hide');
    if (pendingPreviewUrl) { URL.revokeObjectURL(pendingPreviewUrl); pendingPreviewUrl = null; }
    pendingPcm = null;
  }

  async function confirmQualitySave() {
    if (!pendingPcm) return;
    const name = $('#qualityName').value.trim();
    if (!name) { $('#qualityName').focus(); return showToast('Ponle un nombre a la muestra.'); }
    if (!$('#qualityConsent').checked) { $('#qualityConsent').focus(); return showToast('Confirma el consentimiento para guardar.'); }

    let pcm = pendingPcm;
    if ($('#optTrim').checked) pcm = trimSilence(pcm);
    if ($('#optNormalize').checked) pcm = normalizePeak(pcm);
    const analysis = analyzeSample(pcm);
    const wav = floatToWav(pcm);

    try {
      await idb.put({
        id: uid(), name, createdAt: new Date().toISOString(),
        duration: Math.round(analysis.duration * 10) / 10, bytes: wav.size,
        quality: analysis.score, kind: pendingKind === 'consent' ? 'consent' : 'sample',
        processed: { trim: $('#optTrim').checked, normalize: $('#optNormalize').checked },
        consent: { confirmed: true, at: new Date().toISOString(), recorded: pendingKind === 'consent' },
        wav
      });
      await renderBank();
      showToast(pendingKind === 'consent'
        ? 'Consentimiento grabado y guardado en el banco.'
        : `Muestra «${name}» guardada (calidad ${analysis.score}/100).`);
    } catch {
      showToast('No se pudo guardar la muestra.');
    }
    closeQualityModal();
  }

  // Punto de entrada usado por grabador e importación de audio suelto
  async function addSampleToBank(blob, suggestedName) {
    return openQualityModal(blob, suggestedName, 'sample');
  }


  /* ── ZIP estándar sin compresión (STORE) — escritor y lector ──── */
  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function dosDateTime(date = new Date()) {
    return {
      time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
      date: (((date.getFullYear() - 1980) & 0x7F) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
    };
  }

  // files: [{ name: string, data: Uint8Array }] → Blob application/zip
  function buildZip(files) {
    const encoder = new TextEncoder();
    const { time, date } = dosDateTime();
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const file of files) {
      const nameBytes = encoder.encode(file.name);
      const crc = crc32(file.data);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);           // versión mínima
      local.setUint16(6, 0x0800, true);       // flag: nombres UTF-8
      local.setUint16(8, 0, true);            // método: STORE
      local.setUint16(10, time, true);
      local.setUint16(12, date, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, file.data.length, true);
      local.setUint32(22, file.data.length, true);
      local.setUint16(26, nameBytes.length, true);
      local.setUint16(28, 0, true);
      localParts.push(new Uint8Array(local.buffer), nameBytes, file.data);

      const central = new DataView(new ArrayBuffer(46));
      central.setUint32(0, 0x02014b50, true);
      central.setUint16(4, 20, true);
      central.setUint16(6, 20, true);
      central.setUint16(8, 0x0800, true);
      central.setUint16(10, 0, true);
      central.setUint16(12, time, true);
      central.setUint16(14, date, true);
      central.setUint32(16, crc, true);
      central.setUint32(20, file.data.length, true);
      central.setUint32(24, file.data.length, true);
      central.setUint16(28, nameBytes.length, true);
      central.setUint32(42, offset, true);    // offset del local header
      centralParts.push(new Uint8Array(central.buffer), nameBytes);

      offset += 30 + nameBytes.length + file.data.length;
    }

    const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
    const eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054b50, true);
    eocd.setUint16(8, files.length, true);
    eocd.setUint16(10, files.length, true);
    eocd.setUint32(12, centralSize, true);
    eocd.setUint32(16, offset, true);
    return new Blob([...localParts, ...centralParts, new Uint8Array(eocd.buffer)], { type: 'application/zip' });
  }

  // ArrayBuffer → [{ name, data: Uint8Array }] (solo entradas sin comprimir)
  function parseZip(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const view = new DataView(arrayBuffer);
    const decoder = new TextDecoder();

    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65536); i--) {
      if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('No es un ZIP válido.');
    const count = view.getUint16(eocd + 10, true);
    let pointer = view.getUint32(eocd + 16, true);

    const entries = [];
    for (let i = 0; i < count; i++) {
      if (view.getUint32(pointer, true) !== 0x02014b50) throw new Error('Directorio central corrupto.');
      const method = view.getUint16(pointer + 10, true);
      const compSize = view.getUint32(pointer + 20, true);
      const nameLen = view.getUint16(pointer + 28, true);
      const extraLen = view.getUint16(pointer + 30, true);
      const commentLen = view.getUint16(pointer + 32, true);
      const localOffset = view.getUint32(pointer + 42, true);
      const name = decoder.decode(bytes.subarray(pointer + 46, pointer + 46 + nameLen));

      if (method !== 0) throw new Error(`Entrada comprimida no soportada: ${name}. Usa un ZIP exportado por Voice Cari.`);
      const localNameLen = view.getUint16(localOffset + 26, true);
      const localExtraLen = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + localNameLen + localExtraLen;
      entries.push({ name, data: bytes.slice(dataStart, dataStart + compSize) });
      pointer += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  }

  // Duración de un WAV PCM leyendo sus chunks (fmt → byteRate, data → tamaño)
  function wavDuration(bytes) {
    try {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      if (view.getUint32(0, false) !== 0x52494646) return 0; // "RIFF"
      let pointer = 12;
      let byteRate = 0;
      while (pointer + 8 <= bytes.length) {
        const chunkId = view.getUint32(pointer, false);
        const chunkSize = view.getUint32(pointer + 4, true);
        if (chunkId === 0x666d7420) byteRate = view.getUint32(pointer + 16, true);      // "fmt "
        if (chunkId === 0x64617461 && byteRate) return Math.round((chunkSize / byteRate) * 10) / 10; // "data"
        pointer += 8 + chunkSize + (chunkSize % 2);
      }
    } catch { /* cabecera rara */ }
    return 0;
  }

  /* ── Exportar / importar banco completo ───────────────────────── */
  async function exportBank() {
    let samples = [];
    try { samples = await idb.all(); } catch { /* sin IDB */ }
    if (!samples.length) return showToast('El banco está vacío: no hay nada que exportar.');

    const files = [];
    const manifest = {
      app: 'Voice Cari', kind: 'voice-bank', version: APP_VERSION,
      exportedAt: new Date().toISOString(), samples: []
    };
    for (const sample of samples) {
      const filename = `muestras/${slugify(sample.name)}-${String(sample.id).slice(0, 8)}.wav`;
      files.push({ name: filename, data: new Uint8Array(await sample.wav.arrayBuffer()) });
      manifest.samples.push({
        file: filename, name: sample.name, createdAt: sample.createdAt,
        duration: sample.duration, consent: sample.consent
      });
    }
    files.unshift({ name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) });
    downloadBlob(`voice-cari-banco-${new Date().toISOString().slice(0, 10)}.zip`, buildZip(files));
    showToast(`Banco exportado: ${samples.length} muestra${samples.length === 1 ? '' : 's'} + registro de consentimiento. Guárdalo en varios sitios.`);
  }

  async function importBank(file) {
    let entries;
    try { entries = parseZip(await file.arrayBuffer()); }
    catch (error) { return showToast(`No se pudo leer el ZIP: ${error.message}`); }

    const manifestEntry = entries.find(entry => entry.name === 'manifest.json');
    let manifest = null;
    if (manifestEntry) {
      try { manifest = JSON.parse(new TextDecoder().decode(manifestEntry.data)); } catch { /* manifest ilegible */ }
    }
    const wavEntries = entries.filter(entry => /\.wav$/i.test(entry.name) && entry.data.length > 44);
    if (!wavEntries.length) return showToast('El ZIP no contiene muestras WAV.');

    // Si el ZIP no trae registro de consentimiento propio, se confirma una vez para todas.
    if (!manifest?.samples?.length && !confirm(CONSENT_TEXT)) {
      return showToast('Importación cancelada: se requiere confirmar el consentimiento.');
    }

    let existing = [];
    try { existing = await idb.all(); } catch { /* sin IDB */ }
    let added = 0;
    let skipped = 0;
    for (const entry of wavEntries) {
      const meta = manifest?.samples?.find(sampleMeta => sampleMeta.file === entry.name);
      const name = (meta?.name || entry.name.replace(/^muestras\//, '').replace(/\.wav$/i, '')).trim() || 'Muestra importada';
      if (existing.some(sample => sample.name === name && sample.bytes === entry.data.length)) { skipped++; continue; }
      await idb.put({
        id: uid(), name,
        createdAt: meta?.createdAt || new Date().toISOString(),
        duration: meta?.duration ?? wavDuration(entry.data),
        bytes: entry.data.length,
        consent: meta?.consent || { confirmed: true, at: new Date().toISOString(), importedWithoutManifest: true },
        wav: new Blob([entry.data], { type: 'audio/wav' })
      });
      added++;
    }
    await renderBank();
    showToast(`Banco importado: ${added} añadida${added === 1 ? '' : 's'}${skipped ? `, ${skipped} duplicada${skipped === 1 ? '' : 's'} omitida${skipped === 1 ? '' : 's'}` : ''}.`);
  }

  async function renderBank() {
    const list = $('#bankList');
    const select = $('#cloneSample');
    let samples = [];
    try { samples = (await idb.all()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); } catch { /* IDB bloqueado */ }
    $('#bankCount').textContent = `${samples.length} muestra${samples.length === 1 ? '' : 's'}`;

    const previous = select.value;
    select.innerHTML = '<option value="">— elige una muestra del banco —</option>';
    samples.forEach(sample => {
      const option = document.createElement('option');
      option.value = sample.id;
      option.textContent = `${sample.name} · ${sample.duration}s`;
      select.appendChild(option);
    });
    if (samples.some(sample => sample.id === previous)) select.value = previous;

    const selectableCount = samples.filter(s => s.kind !== 'consent').length;
    $('#mergeSamples').disabled = selectableCount < 2;

    if (!samples.length) {
      list.className = 'cards-list is-empty';
      list.textContent = 'El banco está vacío. Graba o importa la primera muestra.';
      return;
    }
    list.className = 'cards-list';
    list.innerHTML = samples.map(sample => {
      const isConsent = sample.kind === 'consent';
      const q = typeof sample.quality === 'number' ? sample.quality : null;
      const qClass = q === null ? '' : q >= 85 ? 'q-good' : q >= 65 ? 'q-ok' : q >= 40 ? 'q-warn' : 'q-bad';
      return `
      <div class="card-item${isConsent ? ' card-consent' : ''}">
        <header>
          <label class="card-select">
            ${isConsent ? '' : `<input type="checkbox" class="sample-check" data-check="${escapeHtml(sample.id)}" aria-label="Seleccionar ${escapeHtml(sample.name)}" />`}
            <strong>${escapeHtml(sample.name)}</strong>
          </label>
          ${isConsent
            ? '<span class="pill pill-consent">Consentimiento grabado</span>'
            : `<span class="pill pill-safe">Consentida</span>${q !== null ? `<span class="pill ${qClass}">${q}/100</span>` : ''}`}
        </header>
        <p><b>Duración:</b> ${escapeHtml(String(sample.duration))} s · <b>Tamaño:</b> ${escapeHtml(String(Math.round(sample.bytes / 1024)))} KB${sample.processed?.normalize ? ' · normalizada' : ''}${sample.processed?.trim ? ' · recortada' : ''}</p>
        <p><b>Guardada:</b> ${escapeHtml(new Date(sample.createdAt).toLocaleString('es-ES'))}</p>
        <div class="card-actions">
          <button class="btn btn-outline btn-small" data-play-sample="${escapeHtml(sample.id)}">Escuchar</button>
          <button class="btn btn-outline btn-small" data-export-sample="${escapeHtml(sample.id)}">Descargar</button>
          <button class="btn btn-danger btn-small" data-delete-sample="${escapeHtml(sample.id)}">Eliminar</button>
        </div>
      </div>`;
    }).join('');
  }

  /* ── Motor local de clonación ─────────────────────────────────── */
  const engineBase = () => ($('#engineUrl').value.trim() || 'http://127.0.0.1:8020').replace(/\/+$/, '');
  const setEngineStatus = (text, ok) => {
    const pill = $('#engineStatus');
    pill.textContent = text;
    pill.classList.toggle('pill-safe', !!ok);
  };
  const setCloneStatus = text => { $('#cloneStatus').textContent = text; };

  async function testEngine() {
    setEngineStatus('Comprobando…', false);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${engineBase()}/health`, { signal: controller.signal });
      clearTimeout(timer);
      const data = await response.json();
      if (data.status !== 'ok') throw new Error('estado inesperado');
      const mode = data.demo ? 'demo' : (data.device || 'cpu');
      setEngineStatus(`Conectado (${mode})`, true);
      showToast(data.model_loaded
        ? `Motor listo en ${mode.toUpperCase()}.`
        : 'Motor conectado. El modelo se cargará en la primera generación.');
      return true;
    } catch {
      setEngineStatus('Sin conexión', false);
      showToast('No se pudo conectar. Arranca el motor local: python server/xtts_server.py');
      return false;
    }
  }

  /* ── Etiqueta de procedencia "voz sintética" en el WAV (chunk INFO) ─ */
  async function tagSyntheticProvenance(blob) {
    try {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const view = new DataView(bytes.buffer);
      if (view.getUint32(0, false) !== 0x52494646) return blob; // no es RIFF: se deja igual

      const enc = new TextEncoder();
      const fields = [
        ['ISFT', 'Voice Cari'],
        ['ICMT', 'Voz sintetica generada por IA (clonacion de voz). Synthetic AI-generated voice.'],
        ['IGNR', 'Synthetic speech'],
        ['ICRD', new Date().toISOString().slice(0, 10)]
      ];
      // Construir subchunks INFO (id + tamaño LE + datos NUL-terminados, con padding par)
      const infoParts = [enc.encode('INFO')];
      let infoLen = 4;
      for (const [id, value] of fields) {
        let data = enc.encode(value + '\0');
        if (data.length % 2) data = new Uint8Array([...data, 0]);
        const head = new Uint8Array(8);
        new DataView(head.buffer).setUint32(0, 0, false); // placeholder id
        head.set(enc.encode(id), 0);
        new DataView(head.buffer).setUint32(4, data.length, true);
        infoParts.push(head, data);
        infoLen += 8 + data.length;
      }
      const listHead = new Uint8Array(8);
      listHead.set(enc.encode('LIST'), 0);
      new DataView(listHead.buffer).setUint32(4, infoLen, true);

      const listChunk = new Uint8Array(8 + infoLen);
      listChunk.set(listHead, 0);
      let off = 8;
      for (const part of infoParts) { listChunk.set(part, off); off += part.length; }

      // Insertar el chunk LIST al final y actualizar el tamaño RIFF
      const out = new Uint8Array(bytes.length + listChunk.length);
      out.set(bytes, 0);
      out.set(listChunk, bytes.length);
      new DataView(out.buffer).setUint32(4, out.length - 8, true);
      return new Blob([out], { type: 'audio/wav' });
    } catch {
      return blob; // ante cualquier duda, devolvemos el audio intacto
    }
  }

  let cloneUrl = null;
  let cloneBlob = null;
  let cloning = false;

  async function generateClone() {
    if (cloning) return showToast('Ya hay una generación en curso.');
    if (!$('#cloneConsent').checked) {
      $('#cloneConsent').focus();
      return showToast('Marca la casilla de consentimiento antes de generar.');
    }
    const text = $('#scriptText').value.trim();
    if (!text) { showSection('studio'); return showToast('Escribe primero el texto en el Studio.'); }
    if (text.length > 2000) return showToast('Texto demasiado largo para una sola generación (máx. 2000 caracteres). Divídelo.');
    const sampleId = $('#cloneSample').value;
    if (!sampleId) return showToast('Elige una muestra del banco de voz.');

    let sample;
    try { sample = await idb.get(sampleId); } catch { /* sin IDB */ }
    if (!sample) return showToast('La muestra ya no existe. Recarga el banco.');

    cloning = true;
    $('#cloneGo').disabled = true;
    setCloneStatus('Generando…');
    const startedAt = performance.now();
    try {
      const form = new FormData();
      form.append('text', text);
      form.append('language', $('#cloneLang').value);
      form.append('reference', sample.wav, 'reference.wav');
      const response = await fetch(`${engineBase()}/clone`, { method: 'POST', body: form });
      if (!response.ok) throw new Error((await response.text().catch(() => '')) || `HTTP ${response.status}`);
      let audio = await response.blob();
      audio = await tagSyntheticProvenance(audio); // marca "voz sintética" en los metadatos
      if (cloneUrl) URL.revokeObjectURL(cloneUrl);
      cloneBlob = audio;
      cloneUrl = URL.createObjectURL(audio);
      const player = $('#cloneAudio');
      player.src = cloneUrl;
      player.hidden = false;
      $('#cloneDownload').disabled = false;
      const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);
      setCloneStatus(`Listo (${seconds}s)`);
      showToast(`Audio generado en ${seconds} s. Recuerda: es voz sintética.`);
      player.play().catch(() => {});
    } catch (error) {
      setCloneStatus('Error');
      const detail = String(error?.message || '').slice(0, 120);
      showToast(detail.includes('Failed to fetch')
        ? 'Motor no accesible. Comprueba que está arrancado y prueba la conexión.'
        : `El motor devolvió un error: ${detail || 'desconocido'}`);
    } finally {
      cloning = false;
      $('#cloneGo').disabled = false;
    }
  }

  /* ── Fusión de muestras seleccionadas en una referencia larga ──── */
  async function mergeSelected() {
    const ids = [...document.querySelectorAll('.sample-check:checked')].map(c => c.dataset.check);
    if (ids.length < 2) return showToast('Selecciona al menos dos muestras para fusionar.');
    let all = [];
    try { all = await idb.all(); } catch { /* sin IDB */ }
    const chosen = ids.map(id => all.find(s => s.id === id)).filter(Boolean);
    if (chosen.length < 2) return showToast('No se encontraron las muestras seleccionadas.');

    showToast('Fusionando muestras…');
    try {
      const pcmList = [];
      for (const sample of chosen) {
        const { pcm } = await blobToFloat(sample.wav);
        pcmList.push(pcm);
      }
      const merged = normalizePeak(concatSamples(pcmList)); // normaliza el conjunto
      const analysis = analyzeSample(merged);
      const wav = floatToWav(merged);
      const name = `Fusión (${chosen.length}) · ${new Date().toLocaleDateString('es-ES')}`;
      await idb.put({
        id: uid(), name, createdAt: new Date().toISOString(),
        duration: Math.round(analysis.duration * 10) / 10, bytes: wav.size,
        quality: analysis.score, kind: 'sample',
        processed: { trim: false, normalize: true, merged: chosen.map(s => s.name) },
        consent: { confirmed: true, at: new Date().toISOString(), fromMerge: true },
        wav
      });
      await renderBank();
      showToast(`Muestra fusionada creada: ${analysis.duration.toFixed(0)}s, calidad ${analysis.score}/100.`);
    } catch {
      showToast('No se pudo fusionar. Revisa las muestras seleccionadas.');
    }
  }

  function initClone() {
    renderBank();
    $('#engineUrl').value = store.get('engineUrl', 'http://127.0.0.1:8020');
    $('#engineUrl').addEventListener('change', () => store.set('engineUrl', $('#engineUrl').value.trim()));
    $('#testEngine').addEventListener('click', testEngine);
    $('#exportBank').addEventListener('click', exportBank);
    $('#cloneGo').addEventListener('click', generateClone);
    $('#mergeSamples').addEventListener('click', mergeSelected);

    // Modal de calidad
    $('#qualityClose').addEventListener('click', closeQualityModal);
    $('#qualityCancel').addEventListener('click', closeQualityModal);
    $('#qualitySave').addEventListener('click', confirmQualitySave);
    $('#qualityModal').addEventListener('click', event => { if (event.target === $('#qualityModal')) closeQualityModal(); });

    // Consentimiento grabado: reutiliza el grabador y abre el modal en modo 'consent'
    $('#recordConsent').addEventListener('click', () => {
      if (!state.audioBlob) {
        showSection('recorder');
        return showToast('Graba en el Grabador la frase de consentimiento y vuelve a pulsar aquí.');
      }
      openQualityModal(state.audioBlob, '', 'consent');
    });

    $('#saveToBank').addEventListener('click', () => {
      if (!state.audioBlob) return showToast('Primero graba una muestra en el Grabador.');
      addSampleToBank(state.audioBlob, `Muestra ${new Date().toLocaleDateString('es-ES')}`);
    });

    $('#bankImport').addEventListener('change', async event => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      if (file.size > 300 * 1024 * 1024) return showToast('Archivo demasiado grande (máx. 300 MB).');
      const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
      if (head[0] === 0x50 && head[1] === 0x4b) return importBank(file); // "PK" → banco completo
      if (file.size > 60 * 1024 * 1024) return showToast('Audio demasiado grande (máx. 60 MB).');
      addSampleToBank(file, file.name.replace(/\.[^.]+$/, ''));
    });

    $('#bankList').addEventListener('change', event => {
      if (event.target.classList.contains('sample-check')) {
        const checked = document.querySelectorAll('.sample-check:checked').length;
        $('#mergeSamples').disabled = checked < 2;
        $('#mergeSamples').textContent = checked >= 2 ? `Fusionar ${checked} muestras` : 'Fusionar seleccionadas';
      }
    });

    $('#bankList').addEventListener('click', async event => {
      const play = event.target.closest('[data-play-sample]');
      const exportBtn = event.target.closest('[data-export-sample]');
      const del = event.target.closest('[data-delete-sample]');
      if (play) {
        const sample = await idb.get(play.dataset.playSample);
        if (!sample) return;
        const url = URL.createObjectURL(sample.wav);
        const audio = new Audio(url);
        audio.addEventListener('ended', () => URL.revokeObjectURL(url));
        audio.play().catch(() => URL.revokeObjectURL(url));
      } else if (exportBtn) {
        const sample = await idb.get(exportBtn.dataset.exportSample);
        if (sample) downloadBlob(`${slugify(sample.name)}.wav`, sample.wav);
      } else if (del) {
        if (!confirm('¿Eliminar esta muestra del banco de voz?')) return;
        await idb.del(del.dataset.deleteSample);
        renderBank();
        showToast('Muestra eliminada.');
      }
    });

    $('#cloneDownload').addEventListener('click', () => {
      if (cloneBlob) downloadBlob(`voice-cari-clon-${new Date().toISOString().slice(0, 10)}.wav`, cloneBlob);
    });
  }

  /* ── Reset ────────────────────────────────────────────────────── */
  function initReset() {
    $('#resetApp').addEventListener('click', () => {
      if (!confirm('¿Resetear Voice Cari en este navegador? Se borrarán texto, perfiles, proyectos y consentimiento local.')) return;
      Object.keys(localStorage)
        .filter(k => k.startsWith('voiceCari:'))
        .forEach(k => localStorage.removeItem(k));
      const wipe = indexedDB.deleteDatabase('voiceCariDB');
      wipe.onsuccess = wipe.onerror = wipe.onblocked = () => location.reload();
      setTimeout(() => location.reload(), 1500);
    });
  }

  /* ── PWA ──────────────────────────────────────────────────────── */
  function initPwa() {
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('./sw.js').catch(() => { /* PWA opcional */ });
    }
  }

  /* ── Arranque ─────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    initLegal();
    initNavigation();
    initTheme();
    initEditor();
    initSpeech();
    initRecorder();
    initProfiles();
    initProjects();
    initIntegrations();
    initClone();
    initReset();
    initPwa();
  });
})();
