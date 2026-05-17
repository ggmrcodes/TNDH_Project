import {
  validateLabField,
  validateLabs,
  isEmptyLabs,
  HB_MIN,
  HB_MAX,
  HCT_MIN,
  HCT_MAX,
  FERRITIN_MIN,
  FERRITIN_MAX,
} from '../preTransfusionLabs';

describe('validateLabField', () => {
  it('treats empty / whitespace input as null (valid clear)', () => {
    expect(validateLabField('hb', '')).toEqual({ value: null });
    expect(validateLabField('hct', '   ')).toEqual({ value: null });
  });

  it('parses comma-decimal (Thai keyboard convention)', () => {
    expect(validateLabField('hb', '7,2')).toEqual({ value: 7.2 });
  });

  it('rejects non-numeric input', () => {
    const out = validateLabField('hb', 'abc');
    expect(out.error?.code).toBe('not_a_number');
  });

  it('rejects Hb above 25', () => {
    const out = validateLabField('hb', '25.1');
    expect(out.error?.code).toBe('too_high');
    expect(out.error?.field).toBe('hb');
    expect(out.error?.max).toBe(HB_MAX);
  });

  it('accepts Hb at the upper bound', () => {
    expect(validateLabField('hb', '25')).toEqual({ value: 25 });
  });

  it('rejects Hb below 0.1', () => {
    const out = validateLabField('hb', '0');
    expect(out.error?.code).toBe('too_low');
    expect(out.error?.min).toBe(HB_MIN);
  });

  it('rejects Hct above 75', () => {
    expect(validateLabField('hct', '76').error?.code).toBe('too_high');
  });

  it('rejects Hct below 1', () => {
    expect(validateLabField('hct', '0.5').error?.code).toBe('too_low');
  });

  it('rejects ferritin below 0', () => {
    expect(validateLabField('ferritin', '-1').error?.code).toBe('too_low');
    expect(validateLabField('ferritin', '-1').error?.min).toBe(FERRITIN_MIN);
  });

  it('rejects ferritin above 10000', () => {
    expect(validateLabField('ferritin', '10000.5').error?.code).toBe('too_high');
    expect(validateLabField('ferritin', '10000.5').error?.max).toBe(FERRITIN_MAX);
  });

  it('accepts the bounds inclusively', () => {
    expect(validateLabField('hct', String(HCT_MIN))).toEqual({ value: HCT_MIN });
    expect(validateLabField('hct', String(HCT_MAX))).toEqual({ value: HCT_MAX });
    expect(validateLabField('ferritin', String(FERRITIN_MIN))).toEqual({ value: FERRITIN_MIN });
    expect(validateLabField('ferritin', String(FERRITIN_MAX))).toEqual({ value: FERRITIN_MAX });
  });
});

describe('validateLabs', () => {
  it('returns no errors when all values are null', () => {
    expect(validateLabs({ hb: null, hct: null, ferritin: null })).toEqual([]);
  });

  it('returns no errors when every value is in range', () => {
    expect(validateLabs({ hb: 7.2, hct: 22, ferritin: 350 })).toEqual([]);
  });

  it('flags every out-of-range field', () => {
    const errors = validateLabs({ hb: 99, hct: 99, ferritin: -1 });
    expect(errors).toHaveLength(3);
    expect(errors.find(e => e.field === 'hb')?.code).toBe('too_high');
    expect(errors.find(e => e.field === 'hct')?.code).toBe('too_high');
    expect(errors.find(e => e.field === 'ferritin')?.code).toBe('too_low');
  });

  it('treats NaN as a validation error rather than silently accepting', () => {
    const errors = validateLabs({ hb: NaN, hct: null, ferritin: null });
    expect(errors).toEqual([
      expect.objectContaining({ field: 'hb', code: 'not_a_number' }),
    ]);
  });
});

describe('isEmptyLabs', () => {
  it('is empty when labs is null / undefined', () => {
    expect(isEmptyLabs(null)).toBe(true);
    expect(isEmptyLabs(undefined)).toBe(true);
  });

  it('is empty when every value is null', () => {
    expect(isEmptyLabs({ hb: null, hct: null, ferritin: null })).toBe(true);
  });

  it('is not empty when at least one value is present', () => {
    expect(isEmptyLabs({ hb: 7.2, hct: null, ferritin: null })).toBe(false);
  });
});
