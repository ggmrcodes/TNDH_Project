export interface ReleaseManifest {
  latest_version: string;
  minimum_supported_version: string;
  apk_url: string;
  release_notes_url?: string;
  released_at?: string;
}

export interface UpdateStatus {
  state: 'current' | 'optional_update' | 'required_update' | 'unknown';
  installedVersion: string;
  latestVersion?: string;
  apkUrl?: string;
  releaseNotesUrl?: string;
}

function normalize(v: string): number[] {
  const cleaned = v.replace(/^v/i, '');
  return cleaned.split('.').map(part => {
    const n = parseInt(part, 10);
    return Number.isFinite(n) ? n : 0;
  });
}

export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const aParts = normalize(a);
  const bParts = normalize(b);
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const av = aParts[i] ?? 0;
    const bv = bParts[i] ?? 0;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return 0;
}

export function evaluateUpdateStatus(
  installedVersion: string | null,
  manifest: ReleaseManifest | null
): UpdateStatus {
  if (!installedVersion || !manifest) {
    return { state: 'unknown', installedVersion: installedVersion ?? '' };
  }
  const vsLatest = compareSemver(installedVersion, manifest.latest_version);
  const vsMin = compareSemver(installedVersion, manifest.minimum_supported_version);

  const shared = {
    installedVersion,
    latestVersion: manifest.latest_version,
    apkUrl: manifest.apk_url,
    releaseNotesUrl: manifest.release_notes_url,
  };

  if (vsMin < 0) return { state: 'required_update', ...shared };
  if (vsLatest < 0) return { state: 'optional_update', ...shared };
  return { state: 'current', ...shared };
}
