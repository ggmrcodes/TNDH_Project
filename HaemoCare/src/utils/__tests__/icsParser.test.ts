import { parseIcs } from '../icsParser';

const THAI_HOSPITAL_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Bangkok Hospital//Appointments//TH
METHOD:PUBLISH
BEGIN:VEVENT
UID:appt-2026-05-07-0900@bangkokhospital.com
DTSTART;TZID=Asia/Bangkok:20260507T090000
DTEND;TZID=Asia/Bangkok:20260507T100000
SUMMARY:Monthly transfusion follow-up
LOCATION:Bangkok Hospital\\, Bangkok 10310
DESCRIPTION:Blood work required\\n\\nBring previous transfusion record.
END:VEVENT
BEGIN:VEVENT
UID:appt-2026-05-21-1300@bangkokhospital.com
DTSTART;TZID=Asia/Bangkok:20260521T130000
SUMMARY:Iron chelation therapy review — Dr. Pranee
LOCATION:โรงพยาบาลกรุงเทพ
DESCRIPTION:Discuss ferritin trend
END:VEVENT
END:VCALENDAR`;

const UTC_ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:utc-evt@example.com
DTSTART:20260601T083000Z
SUMMARY:UTC appointment
END:VEVENT
END:VCALENDAR`;

const DATE_ONLY_ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:all-day@example.com
DTSTART;VALUE=DATE:20260615
SUMMARY:All-day review
END:VEVENT
END:VCALENDAR`;

const FOLDED_ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:folded@example.com
DTSTART:20260710T140000Z
SUMMARY:This summary wraps onto
  the next line per RFC 5545 folding
END:VEVENT
END:VCALENDAR`;

describe('parseIcs', () => {
  it('extracts multiple Thai hospital VEVENTs with TZID', () => {
    const events = parseIcs(THAI_HOSPITAL_ICS);
    expect(events).toHaveLength(2);
    expect(events[0].uid).toBe('appt-2026-05-07-0900@bangkokhospital.com');
    expect(events[0].summary).toBe('Monthly transfusion follow-up');
    expect(events[0].dtstartIso).toBe('2026-05-07T09:00:00');
    expect(events[0].kind).toBe('date-time');
    expect(events[0].dtstartRaw).toContain('TZID=Asia/Bangkok');
    expect(events[0].location).toBe('Bangkok Hospital, Bangkok 10310'); // escaped \, reversed
    expect(events[0].description).toContain('Blood work required');
    expect(events[0].description).toContain('\n'); // \n escape reversed
    expect(events[1].location).toBe('โรงพยาบาลกรุงเทพ');
  });

  it('parses UTC DTSTART with Z suffix', () => {
    const events = parseIcs(UTC_ICS);
    expect(events).toHaveLength(1);
    expect(events[0].dtstartIso).toBe('2026-06-01T08:30:00Z');
    expect(events[0].kind).toBe('date-time-utc');
    expect(new Date(events[0].dtstartIso).toISOString()).toBe('2026-06-01T08:30:00.000Z');
  });

  it('parses date-only events (VALUE=DATE)', () => {
    const events = parseIcs(DATE_ONLY_ICS);
    expect(events).toHaveLength(1);
    expect(events[0].dtstartIso).toBe('2026-06-15');
    expect(events[0].kind).toBe('date');
  });

  it('unfolds continuation lines per RFC 5545', () => {
    const events = parseIcs(FOLDED_ICS);
    expect(events[0].summary).toBe('This summary wraps onto the next line per RFC 5545 folding');
  });

  it('returns empty array on non-calendar input', () => {
    expect(parseIcs('not an ICS')).toEqual([]);
  });

  it('skips events missing UID or DTSTART', () => {
    const noUid = `BEGIN:VCALENDAR
BEGIN:VEVENT
DTSTART:20260101T000000Z
SUMMARY:Missing UID
END:VEVENT
END:VCALENDAR`;
    expect(parseIcs(noUid)).toEqual([]);

    const noDtStart = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:no-dtstart@example.com
SUMMARY:Missing DTSTART
END:VEVENT
END:VCALENDAR`;
    expect(parseIcs(noDtStart)).toEqual([]);
  });
});
