export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export const TEMPERAMENTS = Object.freeze({
  equal: [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100],
  just: [0, 111.73, 203.91, 315.64, 386.31, 498.04, 590.22, 701.96, 813.69, 884.36, 1017.60, 1088.27],
  pythagorean: [0, 90.22, 203.91, 294.13, 407.82, 498.04, 611.73, 701.96, 792.18, 905.87, 996.09, 1109.78],
  meantone: [0, 76.05, 193.16, 310.26, 386.31, 503.42, 579.47, 696.58, 772.63, 889.74, 1006.84, 1082.89],
});

export function estimatePitch(samples, sampleRate, { minFrequency = 55, maxFrequency = 1100, threshold = 0.12 } = {}) {
  if (!samples?.length || !Number.isFinite(sampleRate) || sampleRate <= 0) return null;

  let rms = 0;
  for (let i = 0; i < samples.length; i += 1) rms += samples[i] * samples[i];
  rms = Math.sqrt(rms / samples.length);
  if (rms < 0.008) return null;

  // YIN's difference function is evaluated only over lags in the useful range.
  const minLag = Math.max(2, Math.floor(sampleRate / maxFrequency));
  const maxLag = Math.min(Math.ceil(sampleRate / minFrequency), Math.floor(samples.length / 2));
  if (maxLag <= minLag) return null;

  const difference = new Float32Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let sum = 0;
    const limit = samples.length - lag;
    for (let i = 0; i < limit; i += 1) {
      const delta = samples[i] - samples[i + lag];
      sum += delta * delta;
    }
    difference[lag] = sum;
  }

  let cumulative = 0;
  const normalized = new Float32Array(maxLag + 1);
  normalized[0] = 1;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    cumulative += difference[lag];
    normalized[lag] = cumulative === 0 ? 1 : difference[lag] * lag / cumulative;
  }

  let bestLag = -1;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    if (normalized[lag] < threshold) {
      while (lag + 1 <= maxLag && normalized[lag + 1] < normalized[lag]) lag += 1;
      bestLag = lag;
      break;
    }
  }
  if (bestLag < 0) {
    let best = threshold;
    for (let lag = minLag; lag <= maxLag; lag += 1) {
      if (normalized[lag] < best) { best = normalized[lag]; bestLag = lag; }
    }
  }
  if (bestLag < 0 || normalized[bestLag] > 0.45) return null;

  const left = normalized[bestLag - 1] ?? normalized[bestLag];
  const center = normalized[bestLag];
  const right = normalized[bestLag + 1] ?? normalized[bestLag];
  const denominator = 2 * (2 * center - right - left);
  const correction = denominator === 0 ? 0 : (right - left) / denominator;
  const refinedLag = bestLag + Math.max(-1, Math.min(1, correction));
  const frequency = sampleRate / refinedLag;
  return frequency >= minFrequency && frequency <= maxFrequency ? frequency : null;
}

export function targetForMidi(midi, a4, tonic, centsByDegree) {
  const noteIndex = ((midi % 12) + 12) % 12;
  const semitonesFromA4 = midi - 69;
  const equalFrequency = a4 * 2 ** (semitonesFromA4 / 12);
  const degree = ((noteIndex - tonic) % 12 + 12) % 12;
  const tonicFrequency = equalFrequency / 2 ** (degree / 12);
  return { noteIndex, frequency: tonicFrequency * 2 ** (centsByDegree[degree] / 1200) };
}

export const frequencyToMidi = (frequency, a4) => 69 + 12 * Math.log2(frequency / a4);
export const centsBetween = (frequency, reference) => 1200 * Math.log2(frequency / reference);
