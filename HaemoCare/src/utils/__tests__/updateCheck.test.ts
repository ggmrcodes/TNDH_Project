import { compareSemver, evaluateUpdateStatus, type ReleaseManifest } from '../updateCheck';

describe('compareSemver', () => {
  it('returns 0 for equal versions', () => {
    expect(compareSemver('0.1.0', '0.1.0')).toBe(0);
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0);
  });

  it('returns -1 when a < b', () => {
    expect(compareSemver('0.1.0', '0.2.0')).toBe(-1);
    expect(compareSemver('0.1.0', '0.1.1')).toBe(-1);
    expect(compareSemver('0.9.0', '0.10.0')).toBe(-1);
  });

  it('returns 1 when a > b', () => {
    expect(compareSemver('0.2.0', '0.1.0')).toBe(1);
    expect(compareSemver('1.0.0', '0.99.99')).toBe(1);
  });

  it('strips a leading v', () => {
    expect(compareSemver('v0.1.0', '0.1.0')).toBe(0);
    expect(compareSemver('v0.2.0', 'v0.1.0')).toBe(1);
  });

  it('tolerates missing parts (treats as 0)', () => {
    expect(compareSemver('1', '1.0.0')).toBe(0);
    expect(compareSemver('1.2', '1.2.0')).toBe(0);
    expect(compareSemver('1', '1.0.1')).toBe(-1);
  });

  it('tolerates extra parts (compares prefix-by-prefix)', () => {
    expect(compareSemver('1.0.0.5', '1.0.0')).toBe(1);
  });
});

describe('evaluateUpdateStatus', () => {
  const manifest: ReleaseManifest = {
    latest_version: '0.2.0',
    minimum_supported_version: '0.1.0',
    apk_url: 'https://example.com/haemocare-v0.2.0.apk',
    release_notes_url: 'https://example.com/notes',
  };

  it('returns current when installed equals latest', () => {
    expect(evaluateUpdateStatus('0.2.0', manifest)).toEqual({
      state: 'current',
      installedVersion: '0.2.0',
      latestVersion: '0.2.0',
      apkUrl: 'https://example.com/haemocare-v0.2.0.apk',
      releaseNotesUrl: 'https://example.com/notes',
    });
  });

  it('returns current when installed is newer than latest (dev build)', () => {
    expect(evaluateUpdateStatus('0.3.0', manifest).state).toBe('current');
  });

  it('returns optional_update when installed is between minimum and latest', () => {
    const result = evaluateUpdateStatus('0.1.5', manifest);
    expect(result.state).toBe('optional_update');
    expect(result.apkUrl).toBe('https://example.com/haemocare-v0.2.0.apk');
    expect(result.latestVersion).toBe('0.2.0');
  });

  it('returns required_update when installed is below minimum', () => {
    const result = evaluateUpdateStatus('0.0.9', manifest);
    expect(result.state).toBe('required_update');
    expect(result.apkUrl).toBe('https://example.com/haemocare-v0.2.0.apk');
  });

  it('returns unknown when installedVersion is null', () => {
    expect(evaluateUpdateStatus(null, manifest).state).toBe('unknown');
  });

  it('returns unknown when manifest is null', () => {
    expect(evaluateUpdateStatus('0.1.0', null).state).toBe('unknown');
  });

  it('returns optional_update when installed equals minimum but below latest', () => {
    expect(evaluateUpdateStatus('0.1.0', manifest).state).toBe('optional_update');
  });
});
