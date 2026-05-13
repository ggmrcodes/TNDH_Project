import { buildSmsBody, digitsOnly, isValidPhone } from '../emergencySms';

function makeT(): (key: string, params?: Record<string, string | number>) => string {
  const dict: Record<string, string> = {
    'emergency.body.sos': '{name} needs help — sent from HaemoCare.',
    'emergency.body.urgentSymptom': '{name} just logged an urgent symptom in HaemoCare. Please check in.',
    'emergency.body.overdue': '{name} is {days} days overdue for their planned transfusion visit. Please remind them to book.',
  };
  return (key, params) => {
    let s = dict[key] ?? key;
    if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
}

describe('buildSmsBody', () => {
  const t = makeT();

  it('builds the SOS body with the patient name', () => {
    expect(buildSmsBody({ context: 'sos', patientName: 'Somchai', t: t as any }))
      .toBe('Somchai needs help — sent from HaemoCare.');
  });

  it('builds the urgent-symptom body with the patient name', () => {
    expect(buildSmsBody({ context: 'urgent_symptom', patientName: 'Niran', t: t as any }))
      .toBe('Niran just logged an urgent symptom in HaemoCare. Please check in.');
  });

  it('builds the overdue body with name + days', () => {
    expect(buildSmsBody({ context: 'overdue', patientName: 'Areeya', daysOverdue: 25, t: t as any }))
      .toBe('Areeya is 25 days overdue for their planned transfusion visit. Please remind them to book.');
  });

  it('falls back to 0 days when daysOverdue is missing in overdue context', () => {
    expect(buildSmsBody({ context: 'overdue', patientName: 'Boon', t: t as any }))
      .toBe('Boon is 0 days overdue for their planned transfusion visit. Please remind them to book.');
  });
});

describe('digitsOnly', () => {
  it('strips spaces, dashes, parens, plus signs', () => {
    expect(digitsOnly('+66 (81) 234-5678')).toBe('66812345678');
  });

  it('leaves a clean number alone', () => {
    expect(digitsOnly('0812345678')).toBe('0812345678');
  });

  it('returns empty string for letters-only input', () => {
    expect(digitsOnly('abc')).toBe('');
  });
});

describe('isValidPhone', () => {
  it('accepts 9 or more digits', () => {
    expect(isValidPhone('081234567')).toBe(true);
    expect(isValidPhone('0812345678')).toBe(true);
    expect(isValidPhone('+66 81 234 5678')).toBe(true);
  });

  it('rejects fewer than 9 digits', () => {
    expect(isValidPhone('12345678')).toBe(false);
    expect(isValidPhone('')).toBe(false);
    expect(isValidPhone('abc')).toBe(false);
  });
});
