import {
  evaluateSymptoms,
  isHematuriaColor,
  URINE_COLOR_OPTIONS,
  SYMPTOM_CATALOG,
} from '../clinicalThresholds';
import type { UrineColor } from '../../types/database';

// These tests pin the clinically-meaningful urine-color behavior added
// 2026-05-17. The under-flagging failure mode (a true hematuria episode
// evaluating to anything other than `urgent`) is the highest-stakes
// regression we can ship, so each red-flag color gets its own assertion.

describe('SYMPTOM_CATALOG', () => {
  it('no longer surfaces dark_urine in the new-log picker', () => {
    // Replaced by the structured urine_color field. Legacy logs that
    // already wrote `dark_urine` remain readable via the i18n key, but
    // patients should never be offered the binary toggle again.
    expect(SYMPTOM_CATALOG.find(s => s.key === 'dark_urine')).toBeUndefined();
  });
});

describe('URINE_COLOR_OPTIONS', () => {
  it('exposes exactly the four clinically-abnormal categories (picker pruned)', () => {
    // Picker was pruned to only show abnormal colors. Legacy values
    // (clear/yellow/dark_yellow/pink/red/brown_tea/cola) intentionally
    // dropped from the picker — they remain readable in history via
    // URINE_COLOR_HEX + i18n but cannot be picked for new logs.
    expect(URINE_COLOR_OPTIONS.map(o => o.key)).toEqual([
      'red_pink',
      'cola_dark',
      'cloudy_white',
      'green_blue',
    ]);
  });

  it('marks every picker option as a red flag (only abnormal colors remain)', () => {
    const flagged = URINE_COLOR_OPTIONS.filter(o => o.isRedFlag).map(o => o.key);
    expect(flagged.sort()).toEqual(['cloudy_white', 'cola_dark', 'green_blue', 'red_pink']);
  });

  it('exposes a hex value for every color', () => {
    URINE_COLOR_OPTIONS.forEach(o => {
      expect(o.hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  });
});

describe('isHematuriaColor', () => {
  it('returns true for the new picker abnormal categories', () => {
    expect(isHematuriaColor('red_pink')).toBe(true);
    expect(isHematuriaColor('cola_dark')).toBe(true);
    expect(isHematuriaColor('cloudy_white')).toBe(true);
    expect(isHematuriaColor('green_blue')).toBe(true);
  });

  it('still returns true for legacy abnormal colors (backward compat)', () => {
    expect(isHematuriaColor('pink')).toBe(true);
    expect(isHematuriaColor('red')).toBe(true);
    expect(isHematuriaColor('brown_tea')).toBe(true);
    expect(isHematuriaColor('cola')).toBe(true);
  });

  it('returns false for legacy hydration-range colors', () => {
    expect(isHematuriaColor('clear')).toBe(false);
    expect(isHematuriaColor('yellow')).toBe(false);
    expect(isHematuriaColor('dark_yellow')).toBe(false);
  });

  it('returns false for null / undefined (the optional field is absent)', () => {
    expect(isHematuriaColor(null)).toBe(false);
    expect(isHematuriaColor(undefined)).toBe(false);
  });
});

describe('evaluateSymptoms — urine color mapping', () => {
  const NON_HEMATURIA: UrineColor[] = ['clear', 'yellow', 'dark_yellow'];
  // Includes both the new picker categories AND legacy abnormal colors,
  // since old logs must still escalate the same way they did when stored.
  const HEMATURIA: UrineColor[] = [
    'red_pink', 'cola_dark', 'cloudy_white', 'green_blue',
    'pink', 'red', 'brown_tea', 'cola',
  ];

  describe.each(HEMATURIA)('abnormal color: %s', color => {
    it('produces urgent outcome even with no other symptoms', () => {
      const r = evaluateSymptoms({}, color);
      expect(r.outcome).toBe('urgent');
      expect(r.messageKey).toBe('status.urgent.message');
    });

    it(`emits "urine_color:${'<color>'}" trigger so dashboards can attribute the escalation`, () => {
      const r = evaluateSymptoms({}, color);
      expect(r.triggeringSymptoms).toContain(`urine_color:${color}`);
    });

    it('escalates a would-be-normal log to urgent', () => {
      const r = evaluateSymptoms({ fatigue: 2 }, color);
      expect(r.outcome).toBe('urgent');
    });

    it('escalates a would-be-monitor log to urgent', () => {
      const r = evaluateSymptoms({ fever: 5, fatigue: 3 }, color);
      expect(r.outcome).toBe('urgent');
    });
  });

  describe.each(NON_HEMATURIA)('non-hematuria color: %s', color => {
    it('does not on its own escalate to urgent', () => {
      const r = evaluateSymptoms({}, color);
      expect(r.outcome).toBe('normal');
      expect(r.triggeringSymptoms).not.toContain(`urine_color:${color}`);
    });

    it('does not turn a monitor log into urgent', () => {
      const r = evaluateSymptoms({ fever: 5, fatigue: 3 }, color);
      expect(r.outcome).toBe('monitor');
    });
  });

  it('treats null urineColor identically to omitting the argument', () => {
    const a = evaluateSymptoms({ fever: 5 });
    const b = evaluateSymptoms({ fever: 5 }, null);
    expect(a.outcome).toBe(b.outcome);
    expect(a.triggeringSymptoms).toEqual(b.triggeringSymptoms);
  });
});

describe('evaluateSymptoms — legacy dark_urine handling', () => {
  // Historical pilot logs wrote `dark_urine` into severity_scores. Those
  // logs must continue to evaluate to the same outcome as when they
  // were stored, regardless of whether `urine_color` is present.
  it('still escalates legacy dark_urine > 3 to urgent', () => {
    const r = evaluateSymptoms({ dark_urine: 4 });
    expect(r.outcome).toBe('urgent');
    expect(r.triggeringSymptoms).toContain('dark_urine');
  });

  it('does not double-trigger when both legacy dark_urine and a new urine color are present', () => {
    const r = evaluateSymptoms({ dark_urine: 5 }, 'red');
    expect(r.outcome).toBe('urgent');
    expect(r.triggeringSymptoms).toContain('dark_urine');
    expect(r.triggeringSymptoms).toContain('urine_color:red');
  });
});

describe('evaluateSymptoms — pre-existing rules still hold', () => {
  it('fever >= 7 with chills is still urgent', () => {
    const r = evaluateSymptoms({ fever: 8, chills: 3 });
    expect(r.outcome).toBe('urgent');
  });

  it('jaundice > 3 is still urgent', () => {
    const r = evaluateSymptoms({ jaundice: 5 });
    expect(r.outcome).toBe('urgent');
  });

  it('empty input + null urine color is normal', () => {
    const r = evaluateSymptoms({}, null);
    expect(r.outcome).toBe('normal');
  });
});
