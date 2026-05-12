import { triageSymptoms } from '../triage';
import { SymptomLog, Transfusion } from '../../types/database';

const now = '2026-04-10T12:00:00Z';

function tx(date: string): Transfusion {
  return {
    id: 't', user_id: 'u', date, hospital: 'H',
    units_received: 2, reaction_noted: false, reaction_detail: '',
    notes: '', created_at: date,
  };
}

function log(loggedAt: string, outcome: 'normal' | 'monitor' | 'urgent'): SymptomLog {
  return {
    id: `sl-${loggedAt}`, user_id: 'u', transfusion_id: null,
    logged_at: loggedAt, symptoms: [], severity_scores: {},
    outcome, notes: '', created_at: loggedAt,
  };
}

describe('triageSymptoms', () => {
  it('self_monitor when no symptoms', () => {
    const r = triageSymptoms({}, { loggedAt: now });
    expect(r.tier).toBe('self_monitor');
    expect(r.outcome).toBe('normal');
  });

  it('seek_urgent_care for fever>=7 + chills', () => {
    const r = triageSymptoms({ fever: 8, chills: 4 }, { loggedAt: now });
    expect(r.tier).toBe('seek_urgent_care');
    expect(r.outcome).toBe('urgent');
    expect(r.triggeringSymptoms).toContain('fever');
  });

  it('seek_urgent_care for jaundice > 3', () => {
    const r = triageSymptoms({ jaundice: 5 }, { loggedAt: now });
    expect(r.tier).toBe('seek_urgent_care');
  });

  it('monitor tier + within 72h post-tx -> contact_clinic with observation', () => {
    const r = triageSymptoms(
      { fever: 5, fatigue: 6 },
      { loggedAt: now, recentTransfusion: tx('2026-04-09T12:00:00Z') } // 24h ago
    );
    expect(r.outcome).toBe('monitor');
    expect(r.tier).toBe('contact_clinic');
    expect(r.observations.some(o => o.includes('transfusion'))).toBe(true);
  });

  it('escalates self_monitor to contact_clinic when 2+ flagged logs in last 24h', () => {
    const r = triageSymptoms(
      { fatigue: 3 }, // would be normal on its own
      {
        loggedAt: now,
        recentLogs: [
          log('2026-04-10T06:00:00Z', 'monitor'),
          log('2026-04-10T10:00:00Z', 'urgent'),
        ],
      }
    );
    expect(r.tier).toBe('contact_clinic');
    expect(r.observations.some(o => o.includes('flagged'))).toBe(true);
  });

  it('post-tx observation is not added when the tx is >72h old', () => {
    const r = triageSymptoms(
      { fever: 5, fatigue: 6 },
      { loggedAt: now, recentTransfusion: tx('2026-04-01T12:00:00Z') } // 9 days ago
    );
    expect(r.observations.some(o => o.includes('transfusion'))).toBe(false);
  });
});
