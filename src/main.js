import { centsBetween, estimatePitch, frequencyToMidi, NOTE_NAMES, TEMPERAMENTS, targetForMidi } from "./pitch.js";
import { createDial } from "./dial.js";

const byId = (id) => document.getElementById(id);
const ui = {
  button: byId("toggleMic"), buttonLabel: byId("toggleMic").querySelector("span"),
  temperament: byId("temperament"), root: byId("root"), a4: byId("a4"),
  rootHint: byId("rootHint"), a4Error: byId("a4Error"), footerA4: byId("footerA4"),
  note: byId("noteName"), octave: byId("noteOct"), hz: byId("hzOut"), cents: byId("centsOut"),
  target: byId("targetOut"), status: byId("statusLine"), live: byId("liveIndicator"), liveLabel: byId("liveLabel"),
  canvas: byId("dial"),
};

const dial = createDial(ui.canvas);
const analyserBuffer = new Float32Array(4096);
const decimatedBuffer = new Float32Array(analyserBuffer.length / 4);
let state = "idle";
let generation = 0;
let stream = null;
let audioContext = null;
let source = null;
let analyser = null;
let animationFrame = 0;
let lastAnalysisAt = 0;
let lockedMidi = null;
let smoothCents = 0;
let lastSignalAt = 0;
let frequencyHistory = [];
let hasNote = false;
let priorVisibilityState = "running";

function setStatus(message, tone = "") {
  ui.status.textContent = message;
  ui.status.dataset.tone = tone;
}

function setState(next) {
  state = next;
  ui.live.dataset.state = next === "idle" ? "paused" : next;
  const labels = { idle: "En pausa", starting: "Conectando", listening: "Escuchando", paused: "En pausa", error: "Sin acceso" };
  ui.liveLabel.textContent = labels[next] || "En pausa";
  ui.button.setAttribute("aria-pressed", String(next === "listening" || next === "paused"));
  ui.buttonLabel.textContent = next === "starting" ? "Cancelar inicio" : next === "listening" || next === "paused" ? "Detener micrófono" : "Activar micrófono";
}

function getA4() {
  const value = Number(ui.a4.value);
  const valid = Number.isInteger(value) && value >= 392 && value <= 494;
  ui.a4.setAttribute("aria-invalid", String(!valid));
  ui.a4Error.textContent = valid ? "" : "Usa un valor entre 392 y 494 Hz.";
  if (valid) {
    ui.footerA4.textContent = `${value} Hz`;
    ui.a4Error.textContent = "";
    ui.a4.setAttribute("aria-invalid", "false");
    return value;
  }
  return null;
}

function currentTuning() {
  return { a4: getA4(), tonic: Number(ui.root.value), centsByDegree: TEMPERAMENTS[ui.temperament.value] || TEMPERAMENTS.equal };
}

function clearReading() {
  ui.note.textContent = "···";
  ui.note.classList.add("is-empty");
  ui.octave.textContent = "";
  ui.hz.innerHTML = "– <small>Hz</small>";
  ui.cents.innerHTML = "– <small>¢</small>";
  ui.cents.dataset.tune = "";
  ui.target.innerHTML = "Objetivo <span>– Hz</span>";
  ui.canvas.setAttribute("aria-label", "Indicador de afinación, centrado. Activa el micrófono para detectar una nota.");
  hasNote = false;
  lockedMidi = null;
  smoothCents = 0;
  frequencyHistory = [];
  dial.draw(0, false, false);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function updateReading(frequency) {
  const { a4, tonic, centsByDegree } = currentTuning();
  if (!a4) { setStatus("Corrige la frecuencia de referencia para continuar.", "error"); return; }
  frequencyHistory.push(frequency);
  if (frequencyHistory.length > 5) frequencyHistory.shift();
  const stableFrequency = median(frequencyHistory);
  const candidate = Math.round(frequencyToMidi(stableFrequency, a4));
  if (lockedMidi === null) lockedMidi = candidate;
  else if (candidate !== lockedMidi) {
    const lockedTarget = targetForMidi(lockedMidi, a4, tonic, centsByDegree).frequency;
    if (Math.abs(centsBetween(stableFrequency, lockedTarget)) > 58) lockedMidi = candidate;
  }

  const { noteIndex, frequency: targetFrequency } = targetForMidi(lockedMidi, a4, tonic, centsByDegree);
  const cents = centsBetween(stableFrequency, targetFrequency);
  smoothCents += (cents - smoothCents) * 0.22;
  const octave = Math.floor(lockedMidi / 12) - 1;
  const roundedCents = Math.round(smoothCents);
  const inTune = Math.abs(roundedCents) <= 5;
  const noteName = NOTE_NAMES[noteIndex];

  ui.note.textContent = noteName;
  ui.note.classList.remove("is-empty");
  ui.octave.textContent = String(octave);
  ui.octave.setAttribute("aria-label", `octava ${octave}`);
  ui.hz.innerHTML = `${stableFrequency.toFixed(1)} <small>Hz</small>`;
  ui.cents.innerHTML = `${roundedCents > 0 ? "+" : ""}${roundedCents} <small>¢</small>`;
  ui.cents.dataset.tune = inTune ? "in" : roundedCents > 0 ? "sharp" : "flat";
  ui.target.innerHTML = `Objetivo <span>${targetFrequency.toFixed(2)} Hz</span>`;
  ui.canvas.setAttribute("aria-label", `${noteName}${octave}, ${stableFrequency.toFixed(1)} hercios, ${roundedCents} centésimas ${inTune ? "afinada" : roundedCents > 0 ? "aguda" : "grave"}.`);
  if (inTune) setStatus("Afinado", "good");
  else if (roundedCents > 0) setStatus("Agudo · baja el tono", "attention");
  else setStatus("Grave · sube el tono", "attention");
  dial.draw(smoothCents, true, inTune);
  hasNote = true;
}

function permissionMessage(error) {
  const name = error?.name;
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") return "Permite el acceso al micrófono en los ajustes de tu navegador.";
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return "No se encontró ningún micrófono conectado.";
  if (name === "NotReadableError" || name === "TrackStartError") return "El micrófono está ocupado o no se puede iniciar.";
  if (name === "OverconstrainedError") return "El micrófono no admite los ajustes de audio solicitados.";
  return "No se pudo iniciar el micrófono. Comprueba los permisos y vuelve a intentarlo.";
}

async function stopAudio({ reset = true } = {}) {
  generation += 1;
  if (animationFrame) cancelAnimationFrame(animationFrame);
  animationFrame = 0;
  if (source) { try { source.disconnect(); } catch {} }
  source = null;
  if (stream) stream.getTracks().forEach((track) => track.stop());
  stream = null;
  analyser = null;
  const contextToClose = audioContext;
  audioContext = null;
  if (contextToClose && contextToClose.state !== "closed") {
    try { await contextToClose.close(); } catch { /* Browser already closed the device context. */ }
  }
  setState("idle");
  if (reset) {
    clearReading();
    setStatus("Activa el micrófono y toca una nota");
  }
}

async function startAudio() {
  if (state === "starting" || state === "listening" || state === "paused") {
    await stopAudio();
    return;
  }
  if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
    setState("error");
    setStatus("El acceso al micrófono requiere HTTPS o localhost.", "error");
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || !(window.AudioContext || window.webkitAudioContext)) {
    setState("error");
    setStatus("Este navegador no admite la entrada de audio necesaria.", "error");
    return;
  }

  const requestId = ++generation;
  setState("starting");
  setStatus("Esperando permiso para usar el micrófono…");
  let acquiredStream;
  try {
    acquiredStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    if (requestId !== generation) { acquiredStream.getTracks().forEach((track) => track.stop()); return; }
    stream = acquiredStream;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContextClass();
    if (audioContext.state === "suspended") await audioContext.resume();
    if (requestId !== generation) { await stopAudio(); return; }
    source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = analyserBuffer.length;
    analyser.smoothingTimeConstant = 0;
    source.connect(analyser);
    const track = stream.getAudioTracks()[0];
    track?.addEventListener("ended", async () => {
      if (requestId === generation) {
        await stopAudio();
        setState("error");
        setStatus("El micrófono se desconectó.", "error");
      }
    }, { once: true });
    lockedMidi = null;
    frequencyHistory = [];
    setState("listening");
    setStatus("Escuchando… toca una nota sostenida");
    lastAnalysisAt = 0;
    animationFrame = requestAnimationFrame(analyseFrame);
  } catch (error) {
    if (requestId !== generation) {
      acquiredStream?.getTracks().forEach((track) => track.stop());
      return;
    }
    acquiredStream?.getTracks().forEach((track) => track.stop());
    await stopAudio({ reset: false });
    setState("error");
    setStatus(permissionMessage(error), "error");
  }
}

function decimate(sourceBuffer, destination) {
  for (let i = 0; i < destination.length; i += 1) {
    const offset = i * 4;
    destination[i] = (sourceBuffer[offset] + sourceBuffer[offset + 1] + sourceBuffer[offset + 2] + sourceBuffer[offset + 3]) / 4;
  }
}

function analyseFrame(timestamp) {
  if (state !== "listening" || !analyser || !audioContext) return;
  animationFrame = requestAnimationFrame(analyseFrame);
  if (timestamp - lastAnalysisAt < 42) return;
  lastAnalysisAt = timestamp;
  analyser.getFloatTimeDomainData(analyserBuffer);
  decimate(analyserBuffer, decimatedBuffer);
  const frequency = estimatePitch(decimatedBuffer, audioContext.sampleRate / 4);
  if (frequency) {
    lastSignalAt = timestamp;
    updateReading(frequency);
  } else if (timestamp - lastSignalAt > 850) {
    if (hasNote) {
      clearReading();
      setStatus("Escuchando… toca una nota sostenida");
    }
  }
}

ui.button.addEventListener("click", () => { void startAudio(); });
ui.temperament.addEventListener("change", () => {
  ui.rootHint.hidden = ui.temperament.value === "equal";
  if (hasNote) updateReading(Number(ui.hz.textContent.replace(" Hz", "")));
});
ui.root.addEventListener("change", () => { if (hasNote) updateReading(Number(ui.hz.textContent.replace(" Hz", ""))); });
ui.a4.addEventListener("input", () => {
  const valid = getA4();
  if (valid && hasNote) updateReading(Number(ui.hz.textContent.replace(" Hz", "")));
});

document.addEventListener("visibilitychange", async () => {
  if (!audioContext || state === "idle" || state === "error" || state === "starting") return;
  if (document.hidden) {
    const contextToSuspend = audioContext;
    const runId = generation;
    if (state === "listening") priorVisibilityState = "listening";
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    try { await contextToSuspend.suspend(); } catch { /* The browser may suspend it first. */ }
    if (audioContext !== contextToSuspend || generation !== runId || state !== "listening") return;
    setState("paused");
    setStatus("Afinador en pausa mientras la pestaña está oculta.");
  } else if (priorVisibilityState === "listening" && audioContext.state !== "closed") {
    const contextToResume = audioContext;
    const runId = generation;
    try {
      await contextToResume.resume();
      if (audioContext === contextToResume && generation === runId && state === "paused") {
        setState("listening");
        setStatus("Escuchando… toca una nota sostenida");
        lastAnalysisAt = 0;
        animationFrame = requestAnimationFrame(analyseFrame);
      }
    } catch {
      if (audioContext !== contextToResume || generation !== runId) return;
      await stopAudio({ reset: false });
      setState("error");
      setStatus("El navegador pausó el audio. Vuelve a activar el micrófono.", "error");
    }
  }
});

const resizeObserver = new ResizeObserver(() => { dial.resize(); dial.draw(smoothCents, hasNote, Math.abs(smoothCents) <= 5); });
resizeObserver.observe(ui.canvas);
dial.resize();
dial.draw();
