// Minimal ICS (RFC 5545) parser — just enough for hospital appointment imports.
// Handles: line unfolding, VEVENT extraction, DTSTART (with/without TZID, date-only
// or date-time, UTC 'Z' suffix), SUMMARY, LOCATION, DESCRIPTION, UID, and the
// escape sequences we actually see in hospital ICS files (\, \n, \;, \\).
//
// Intentionally does NOT:
// - Expand RRULE (recurring events) — hospitals rarely use this for appointments.
// - Compute time zone offsets from non-UTC TZIDs — we keep the local wall time +
//   the TZID label. Downstream code can treat "Asia/Bangkok" as +07:00 if needed.
// - Validate calendar structure beyond what's needed to extract events.

export interface ParsedIcsEvent {
  uid: string;
  summary: string;
  location: string;
  description: string;
  /** ISO-like string. If the source had a non-UTC TZID we prefix it: "TZID=Asia/Bangkok:2026-05-07T09:00:00" */
  dtstartRaw: string;
  /** Our best-effort ISO 8601 representation; always parseable by new Date(). */
  dtstartIso: string;
  /** Hint for downstream display; 'date' means date-only (no time). */
  kind: 'date-time' | 'date' | 'date-time-utc';
}

export function parseIcs(raw: string): ParsedIcsEvent[] {
  const unfolded = unfoldLines(raw);
  const events: ParsedIcsEvent[] = [];
  let current: Partial<ParsedIcsEvent> | null = null;
  let kind: ParsedIcsEvent['kind'] | null = null;

  for (const line of unfolded) {
    if (line === 'BEGIN:VEVENT') {
      current = { uid: '', summary: '', location: '', description: '', dtstartRaw: '', dtstartIso: '' };
      kind = null;
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current && current.dtstartIso && current.uid) {
        events.push({
          uid: current.uid,
          summary: current.summary ?? '',
          location: current.location ?? '',
          description: current.description ?? '',
          dtstartRaw: current.dtstartRaw ?? '',
          dtstartIso: current.dtstartIso,
          kind: kind ?? 'date-time',
        });
      }
      current = null;
      kind = null;
      continue;
    }
    if (!current) continue;

    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const head = line.slice(0, colon);       // e.g. "DTSTART;TZID=Asia/Bangkok"
    const value = line.slice(colon + 1);
    const [name, ...paramParts] = head.split(';');
    const params = Object.fromEntries(
      paramParts.map(p => {
        const eq = p.indexOf('=');
        return eq > 0 ? [p.slice(0, eq).toUpperCase(), p.slice(eq + 1)] : [p.toUpperCase(), ''];
      })
    );

    switch (name.toUpperCase()) {
      case 'UID':
        current.uid = value.trim();
        break;
      case 'SUMMARY':
        current.summary = unescapeIcsText(value);
        break;
      case 'LOCATION':
        current.location = unescapeIcsText(value);
        break;
      case 'DESCRIPTION':
        current.description = unescapeIcsText(value);
        break;
      case 'DTSTART': {
        current.dtstartRaw = params.TZID ? `TZID=${params.TZID}:${value}` : value;
        const parsed = toIso(value, params.TZID, params.VALUE);
        current.dtstartIso = parsed.iso;
        kind = parsed.kind;
        break;
      }
      default:
        break;
    }
  }

  return events;
}

/** RFC 5545 line unfolding: continuation lines start with a space or tab. */
function unfoldLines(raw: string): string[] {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if (line.startsWith(' ') || line.startsWith('\t')) {
      out[out.length - 1] = (out[out.length - 1] ?? '') + line.slice(1);
    } else if (line.length > 0) {
      out.push(line);
    }
  }
  return out;
}

/** Reverse RFC 5545 text escapes. */
function unescapeIcsText(v: string): string {
  return v
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

/**
 * Accepts:
 *   20260507T090000Z        -> '2026-05-07T09:00:00Z'       (UTC)
 *   20260507T090000         -> '2026-05-07T09:00:00'        (local; TZID preserved separately)
 *   20260507                -> '2026-05-07'                 (date-only; VALUE=DATE)
 */
function toIso(
  value: string,
  _tzid: string | undefined,
  valueType: string | undefined
): { iso: string; kind: ParsedIcsEvent['kind'] } {
  const v = value.trim();
  if (/^\d{8}$/.test(v) && valueType === 'DATE') {
    return {
      iso: `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`,
      kind: 'date',
    };
  }
  const dt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v);
  if (!dt) {
    // Fall back: try to keep the raw value (not ideal, but unblocks display).
    return { iso: v, kind: 'date-time' };
  }
  const [, y, mo, d, h, mi, s, z] = dt;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}${z}`;
  return { iso, kind: z === 'Z' ? 'date-time-utc' : 'date-time' };
}
