export const PINCH_TRAINING_SAMPLE_COUNT = 10;
export const GESTURE_PROFILE_STORAGE_KEY = 'airdrawio.gesture-profile.v1';

export interface PinchProfile {
  samples: number[];
  threshold: number;
  source: 'world' | 'image';
  calibratedAt: string;
}

export interface GestureProfile {
  version: 1;
  pinch: PinchProfile;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const percentile = (sorted: number[], proportion: number) => {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * proportion) - 1));
  return sorted[index];
};

export function learnPinchThreshold(samples: number[]): number {
  const sorted = samples
    .filter((sample) => Number.isFinite(sample) && sample > 0 && sample < 2)
    .sort((a, b) => a - b);

  if (sorted.length < 3) {
    throw new Error('At least three valid pinch samples are required.');
  }

  const median = percentile(sorted, 0.5);
  const upperComfortablePinch = percentile(sorted, 0.8);
  const deviations = sorted
    .map((sample) => Math.abs(sample - median))
    .sort((a, b) => a - b);
  const medianDeviation = percentile(deviations, 0.5);

  // Place the boundary above the user's looser comfortable pinches. The
  // robust spread prevents a single noisy landmark frame from dominating it.
  const margin = Math.max(0.035, medianDeviation * 2.5, median * 0.18);
  return Number(clamp(upperComfortablePinch + margin, 0.14, 0.78).toFixed(3));
}

export function createGestureProfile(
  samples: number[],
  source: 'world' | 'image',
): GestureProfile {
  return {
    version: 1,
    pinch: {
      samples: [...samples],
      threshold: learnPinchThreshold(samples),
      source,
      calibratedAt: new Date().toISOString(),
    },
  };
}

export function loadGestureProfile(): GestureProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(GESTURE_PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const profile = JSON.parse(raw) as GestureProfile;
    if (
      profile.version !== 1 ||
      !Array.isArray(profile.pinch?.samples) ||
      !Number.isFinite(profile.pinch?.threshold)
    ) return null;
    return profile;
  } catch {
    return null;
  }
}

export function saveGestureProfile(profile: GestureProfile): void {
  try {
    window.localStorage.setItem(GESTURE_PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Gesture recognition still updates for this session when storage is blocked.
  }
}

export function clearGestureProfile(): void {
  try {
    window.localStorage.removeItem(GESTURE_PROFILE_STORAGE_KEY);
  } catch {
    // Storage may be unavailable in strict privacy modes.
  }
}
