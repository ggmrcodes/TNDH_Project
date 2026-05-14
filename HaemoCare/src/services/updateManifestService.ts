import type { ReleaseManifest } from '../utils/updateCheck';

// Stable hosting URL for the release manifest JSON.
// Default: a static file in the GitHub repo's main branch. Updating a release means
// pushing a new commit that changes update-manifest.json.
const DEFAULT_MANIFEST_URL =
  'https://raw.githubusercontent.com/ggmrcodes/TNDH_Project/main/update-manifest.json';

const MANIFEST_URL =
  process.env.EXPO_PUBLIC_UPDATE_MANIFEST_URL || DEFAULT_MANIFEST_URL;

const FETCH_TIMEOUT_MS = 8000;

/**
 * Fetches the release manifest from MANIFEST_URL.
 * Retries once on network/timeout errors. Does NOT retry on non-2xx or
 * invalid JSON (those are definitive failures, not transient network issues).
 */
export async function fetchReleaseManifest(): Promise<ReleaseManifest> {
  try {
    return await fetchManifestOnce();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isRetriable =
      msg === 'Update check timed out' ||
      msg === 'Network error checking for updates';
    if (!isRetriable) throw e;
    // One retry with a tiny backoff
    await new Promise(r => setTimeout(r, 1000));
    return await fetchManifestOnce();
  }
}

/**
 * Single attempt at fetching and validating the release manifest.
 * Throws on network error, timeout, non-2xx, or invalid JSON.
 * Throws if the parsed JSON is missing required fields.
 */
async function fetchManifestOnce(): Promise<ReleaseManifest> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(MANIFEST_URL, {
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch (e) {
    throw new Error(
      e instanceof Error && e.name === 'AbortError'
        ? 'Update check timed out'
        : 'Network error checking for updates'
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error(`Update manifest returned ${res.status}`);
  }

  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    throw new Error('Update manifest is not valid JSON');
  }

  if (!isReleaseManifest(parsed)) {
    throw new Error('Update manifest is missing required fields');
  }
  return parsed;
}

function isReleaseManifest(value: unknown): value is ReleaseManifest {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.latest_version === 'string' &&
    typeof v.minimum_supported_version === 'string' &&
    typeof v.apk_url === 'string'
  );
}

export function getManifestUrl(): string {
  return MANIFEST_URL;
}
