import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Profile, SymptomLog, Transfusion, Appointment } from '../types/database';
import { translations, Language } from '../i18n';

function tr(key: string, lang: Language): string {
  return (translations[lang] as Record<string, string>)[key] || key;
}

function outcomeColorRgb(outcome: string): [number, number, number] {
  switch (outcome) {
    case 'normal': return [16, 185, 129];
    case 'monitor': return [245, 158, 11];
    case 'urgent': return [239, 68, 68];
    default: return [107, 114, 128];
  }
}

function fmtDate(date: string): string {
  return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getPatientId(profile: Profile): string {
  if (profile.share_full_name) return `${profile.full_name} (${profile.patient_id})`;
  return `Patient ${profile.patient_id}`;
}

// ─── Palette ───
const C = {
  teal:      [13, 115, 119]  as [number, number, number],
  tealLight: [224, 242, 241] as [number, number, number],
  white:     [255, 255, 255] as [number, number, number],
  dark:      [26, 26, 46]    as [number, number, number],
  gray:      [107, 114, 128] as [number, number, number],
  grayLight: [156, 163, 175] as [number, number, number],
  border:    [229, 231, 235] as [number, number, number],
  cardBg:    [249, 250, 251] as [number, number, number],
  greenBg:   [240, 253, 244] as [number, number, number],
  greenBdr:  [187, 247, 208] as [number, number, number],
  greenTxt:  [22, 101, 52]   as [number, number, number],
  bloodBg:   [239, 246, 255] as [number, number, number],
  bloodBdr:  [191, 219, 254] as [number, number, number],
};

// ─── Thai font loader ───
let _fontCached = false;

async function loadThaiFont(doc: any): Promise<void> {
  if (_fontCached) { doc.setFont('Sarabun', 'normal'); return; }
  const load = async (url: string): Promise<string> => {
    const buf = await (await fetch(url)).arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  };
  const [r, b] = await Promise.all([load('/fonts/Sarabun-Regular.ttf'), load('/fonts/Sarabun-Bold.ttf')]);
  doc.addFileToVFS('Sarabun-Regular.ttf', r);
  doc.addFont('Sarabun-Regular.ttf', 'Sarabun', 'normal');
  doc.addFileToVFS('Sarabun-Bold.ttf', b);
  doc.addFont('Sarabun-Bold.ttf', 'Sarabun', 'bold');
  doc.setFont('Sarabun', 'normal');
  _fontCached = true;
}

// ─── Drawing primitives ───

interface Cur {
  y: number;
  doc: any;
  f: string; // font family
  pw: number; // page width
  ph: number; // page height
  ml: number; // margin left
  cw: number; // content width
}

function cur(doc: any, font: string): Cur {
  return { y: 18, doc, f: font, pw: 210, ph: 297, ml: 18, cw: 174 };
}

function pageCheck(c: Cur, need: number) {
  if (c.y + need > c.ph - 18) { c.doc.addPage(); c.y = 18; }
}

/** Full-width teal header banner */
function banner(c: Cur, line1: string, line2: string, line3: string) {
  const h = 36;
  c.doc.setFillColor(...C.teal);
  c.doc.roundedRect(c.ml, c.y, c.cw, h, 3, 3, 'F');

  c.doc.setTextColor(...C.white);
  c.doc.setFont(c.f, 'bold');
  c.doc.setFontSize(16);
  const t1 = c.doc.splitTextToSize(line1, c.cw - 20);
  c.doc.text(t1[0], c.ml + 10, c.y + 12);

  c.doc.setFont(c.f, 'normal');
  c.doc.setFontSize(10);
  c.doc.text(line2, c.ml + 10, c.y + 21);

  c.doc.setFontSize(8);
  c.doc.text(line3, c.ml + 10, c.y + 29);

  c.y += h + 8;
}

/** Bordered card box — returns the y where content should start (inside padding) */
function cardStart(c: Cur, title: string, height: number): number {
  pageCheck(c, height + 4);
  // Card border
  c.doc.setDrawColor(...C.border);
  c.doc.setLineWidth(0.4);
  c.doc.setFillColor(...C.white);
  c.doc.roundedRect(c.ml, c.y, c.cw, height, 3, 3, 'FD');

  // Title bar
  c.doc.setFillColor(...C.cardBg);
  c.doc.roundedRect(c.ml, c.y, c.cw, 10, 3, 3, 'F');
  // Cover bottom corners of title bar so they're square against card body
  c.doc.rect(c.ml, c.y + 7, c.cw, 3, 'F');
  // Separator line
  c.doc.setDrawColor(...C.border);
  c.doc.line(c.ml, c.y + 10, c.ml + c.cw, c.y + 10);

  c.doc.setFont(c.f, 'bold');
  c.doc.setFontSize(10);
  c.doc.setTextColor(...C.teal);
  c.doc.text(title, c.ml + 8, c.y + 7);

  return c.y + 16; // content start y (inside card with padding)
}

/** Label: value row inside a card */
function labelValue(c: Cur, x: number, y: number, label: string, value: string, maxW: number): number {
  c.doc.setFont(c.f, 'bold');
  c.doc.setFontSize(8);
  c.doc.setTextColor(...C.gray);
  c.doc.text(label, x, y);

  c.doc.setFont(c.f, 'normal');
  c.doc.setFontSize(10);
  c.doc.setTextColor(...C.dark);
  const lines = c.doc.splitTextToSize(value, maxW);
  c.doc.text(lines, x, y + 5);
  return y + 5 + lines.length * 4.5;
}

/** Chip pills */
function chips(c: Cur, x: number, y: number, items: string[]): number {
  c.doc.setFontSize(9);
  c.doc.setFont(c.f, 'normal');
  let cx = x;
  for (const item of items) {
    const tw = c.doc.getTextWidth(item) + 8;
    if (cx + tw > c.ml + c.cw - 8) { cx = x; y += 8; }
    c.doc.setFillColor(...C.tealLight);
    c.doc.roundedRect(cx, y - 4, tw, 7, 3, 3, 'F');
    c.doc.setTextColor(...C.teal);
    c.doc.text(item, cx + 4, y);
    cx += tw + 3;
  }
  return y + 8;
}

/** PDPA box */
function pdpa(c: Cur) {
  pageCheck(c, 20);
  c.doc.setFillColor(...C.greenBg);
  c.doc.setDrawColor(...C.greenBdr);
  c.doc.setLineWidth(0.4);
  c.doc.roundedRect(c.ml, c.y, c.cw, 16, 3, 3, 'FD');

  c.doc.setFont(c.f, 'bold');
  c.doc.setFontSize(7);
  c.doc.setTextColor(...C.greenTxt);
  c.doc.text('PDPA Notice:', c.ml + 6, c.y + 5);
  c.doc.setFont(c.f, 'normal');
  const txt = "This document contains personal health data protected under Thailand's Personal Data Protection Act (PDPA) B.E. 2562. Unauthorized distribution is prohibited.";
  const lines = c.doc.splitTextToSize(txt, c.cw - 12);
  c.doc.text(lines, c.ml + 6, c.y + 10);
  c.y += 22;
}

/** Footer line */
function footer(c: Cur) {
  pageCheck(c, 12);
  c.doc.setDrawColor(...C.border);
  c.doc.setLineWidth(0.3);
  c.doc.line(c.ml, c.y, c.ml + c.cw, c.y);
  c.y += 5;
  c.doc.setFontSize(7);
  c.doc.setTextColor(...C.grayLight);
  c.doc.setFont(c.f, 'normal');
  c.doc.text(`Generated on ${fmtDate(new Date().toISOString())}  \u00b7  HaemoCare App  \u00b7  For medical provider use`, c.pw / 2, c.y, { align: 'center' });
}

// ─── Symptom timeline drawing helpers ───

const C_OUTCOME: Record<string, { bg: [number, number, number]; text: [number, number, number]; border: [number, number, number] }> = {
  normal:  { bg: [236, 253, 245], text: [6, 95, 70],    border: [167, 243, 208] },
  monitor: { bg: [255, 251, 235], text: [146, 64, 14],   border: [253, 230, 138] },
  urgent:  { bg: [254, 242, 242], text: [185, 28, 28],   border: [254, 202, 202] },
};

/** Draw the symptom monitoring timeline grouped by transfusion */
function drawTimeline(c: Cur, transfusions: Transfusion[], symptomLogs: SymptomLog[], language: Language) {
  if (symptomLogs.length === 0) return;

  // Group logs by transfusion_id
  const logsByTx = new Map<string, SymptomLog[]>();
  const orphanLogs: SymptomLog[] = [];
  for (const log of symptomLogs) {
    if (log.transfusion_id) {
      const arr = logsByTx.get(log.transfusion_id) || [];
      arr.push(log);
      logsByTx.set(log.transfusion_id, arr);
    } else {
      orphanLogs.push(log);
    }
  }

  // Sort transfusions newest first
  const sortedTx = [...transfusions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // New page for timeline
  c.doc.addPage();
  c.y = 18;

  // Section header
  c.doc.setFont(c.f, 'bold');
  c.doc.setFontSize(14);
  c.doc.setTextColor(...C.teal);
  c.doc.text(`${tr('symptoms.title', language)} \u2014 Timeline`, c.ml, c.y);
  c.y += 3;
  c.doc.setDrawColor(...C.teal);
  c.doc.setLineWidth(0.6);
  c.doc.line(c.ml, c.y, c.ml + c.cw, c.y);
  c.y += 8;

  // Summary stats bar
  const totalLogs = symptomLogs.length;
  const normalN = symptomLogs.filter(l => l.outcome === 'normal').length;
  const monitorN = symptomLogs.filter(l => l.outcome === 'monitor').length;
  const urgentN = symptomLogs.filter(l => l.outcome === 'urgent').length;

  c.doc.setFillColor(...C.cardBg);
  c.doc.setDrawColor(...C.border);
  c.doc.setLineWidth(0.3);
  c.doc.roundedRect(c.ml, c.y, c.cw, 12, 3, 3, 'FD');
  c.doc.setFontSize(8); c.doc.setFont(c.f, 'normal'); c.doc.setTextColor(...C.gray);
  c.doc.text(`${totalLogs} total logs recorded`, c.ml + 6, c.y + 5);

  // Mini badges
  let bx = c.ml + 6;
  c.doc.setFontSize(7); c.doc.setFont(c.f, 'bold');
  const statY = c.y + 9.5;
  const stats = [
    { n: normalN, label: 'Normal', color: [16, 185, 129] as [number, number, number] },
    { n: monitorN, label: 'Monitor', color: [245, 158, 11] as [number, number, number] },
    { n: urgentN, label: 'Urgent', color: [239, 68, 68] as [number, number, number] },
  ];
  for (const s of stats) {
    const txt = `${s.n} ${s.label}`;
    const w = c.doc.getTextWidth(txt) + 6;
    c.doc.setFillColor(...s.color);
    c.doc.roundedRect(bx, statY - 3, w, 5.5, 2, 2, 'F');
    c.doc.setTextColor(...C.white);
    c.doc.text(txt, bx + 3, statY);
    bx += w + 3;
  }
  c.y += 18;

  // Timeline line x position
  const lineX = c.ml + 6;
  const contentX = c.ml + 14;
  const contentW = c.cw - 22;

  for (const tx of sortedTx) {
    const logs = (logsByTx.get(tx.id) || []).sort(
      (a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime()
    );
    if (logs.length === 0) continue;

    pageCheck(c, 20);

    // ── Transfusion marker (diamond) ──
    c.doc.setFillColor(...C.teal);
    // Diamond shape via rotated square
    const dx = lineX;
    const dy = c.y + 1;
    c.doc.setFillColor(...C.teal);
    c.doc.circle(dx, dy, 2.5, 'F');

    c.doc.setFont(c.f, 'bold');
    c.doc.setFontSize(9);
    c.doc.setTextColor(...C.teal);
    const txLabel = `${tr('history.title', language)} \u2014 ${fmtDate(tx.date)}`;
    c.doc.text(txLabel, contentX, c.y + 2);

    c.doc.setFont(c.f, 'normal');
    c.doc.setFontSize(7);
    c.doc.setTextColor(...C.gray);
    const txMeta = `${tx.units_received ?? '—'} units${tx.reaction_noted ? '  \u26a0 Reaction noted' : ''}`;
    c.doc.text(txMeta, contentX, c.y + 7);
    c.y += 12;

    // ── Log entries under this transfusion ──
    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];
      const oc = C_OUTCOME[log.outcome] || C_OUTCOME.normal;
      const isLast = i === logs.length - 1;

      // Estimate height needed for this entry
      const symText = log.symptoms.map(s => tr(`symptom.${s}`, language)).join(', ');
      const noteLines = log.notes ? c.doc.splitTextToSize(log.notes, contentW - 4) : [];
      const sevCount = Object.keys(log.severity_scores).length;
      const entryH = 10 + (sevCount > 0 ? 6 : 0) + (noteLines.length > 0 ? noteLines.length * 3.5 + 2 : 0) + 4;

      pageCheck(c, entryH + 4);

      // Vertical timeline line
      c.doc.setDrawColor(...C.border);
      c.doc.setLineWidth(0.5);
      if (!isLast) {
        c.doc.line(lineX, c.y - 2, lineX, c.y + entryH);
      } else {
        c.doc.line(lineX, c.y - 2, lineX, c.y + 3);
      }

      // Timeline dot
      c.doc.setFillColor(...oc.border);
      c.doc.circle(lineX, c.y + 2, 1.5, 'F');

      // Entry card
      c.doc.setFillColor(...oc.bg);
      c.doc.setDrawColor(...oc.border);
      c.doc.setLineWidth(0.3);
      c.doc.roundedRect(contentX, c.y - 2, contentW, entryH, 2, 2, 'FD');

      let ey = c.y + 3;

      // Time + outcome badge
      const logTime = new Date(log.logged_at);
      const timeStr = `${logTime.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ${logTime.getHours().toString().padStart(2, '0')}:${logTime.getMinutes().toString().padStart(2, '0')}`;
      c.doc.setFont(c.f, 'bold');
      c.doc.setFontSize(8);
      c.doc.setTextColor(...oc.text);
      c.doc.text(timeStr, contentX + 4, ey);

      // Outcome badge
      const outcomeLabel = tr(`status.${log.outcome}`, language);
      c.doc.setFontSize(6); c.doc.setFont(c.f, 'bold');
      const olw = c.doc.getTextWidth(outcomeLabel) + 6;
      const badgeX = contentX + contentW - olw - 4;
      c.doc.setFillColor(...outcomeColorRgb(log.outcome));
      c.doc.roundedRect(badgeX, ey - 3, olw, 5, 2, 2, 'F');
      c.doc.setTextColor(...C.white);
      c.doc.text(outcomeLabel, badgeX + 3, ey);
      ey += 5;

      // Symptoms list
      c.doc.setFont(c.f, 'normal');
      c.doc.setFontSize(8);
      c.doc.setTextColor(...C.dark);
      const symLines = c.doc.splitTextToSize(symText, contentW - 8);
      c.doc.text(symLines, contentX + 4, ey);
      ey += symLines.length * 3.5;

      // Severity bars
      if (sevCount > 0) {
        ey += 1;
        let sx = contentX + 4;
        c.doc.setFontSize(6);
        for (const [symptom, score] of Object.entries(log.severity_scores)) {
          const sLabel = `${tr(`symptom.${symptom}`, language)}: ${score}/10`;
          const slw = c.doc.getTextWidth(sLabel) + 4;
          if (sx + slw > contentX + contentW - 4) { sx = contentX + 4; ey += 4; }
          // Mini bar background
          c.doc.setFillColor(230, 230, 230);
          c.doc.rect(sx, ey - 1, 20, 2.5, 'F');
          // Fill
          const fillColor = (score as number) >= 7 ? [239, 68, 68] : (score as number) >= 4 ? [245, 158, 11] : [16, 185, 129];
          c.doc.setFillColor(...(fillColor as [number, number, number]));
          c.doc.rect(sx, ey - 1, (score as number) * 2, 2.5, 'F');
          // Label
          c.doc.setTextColor(...C.gray);
          c.doc.setFont(c.f, 'normal');
          c.doc.text(sLabel, sx + 22, ey + 1);
          sx += 22 + slw + 2;
        }
        ey += 4;
      }

      // Notes
      if (noteLines.length > 0) {
        ey += 1;
        c.doc.setFont(c.f, 'normal');
        c.doc.setFontSize(7);
        c.doc.setTextColor(...C.gray);
        c.doc.text(noteLines, contentX + 4, ey);
      }

      c.y += entryH + 3;
    }

    c.y += 4; // gap between transfusion groups
  }
}

// ═══════════════════════════════════════════════════
// PASSPORT PDF
// ═══════════════════════════════════════════════════

export async function generatePassportPdf(
  profile: Profile,
  language: Language,
  symptomLogs: SymptomLog[] = [],
  transfusions: Transfusion[] = [],
): Promise<void> {
  if (Platform.OS === 'web') {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    await loadThaiFont(doc);
    const c = cur(doc, 'Sarabun');
    const pid = getPatientId(profile);

    // Banner
    banner(c, `HaemoCare \u2014 ${tr('passport.title', language)}`, pid, `${tr('privacy.patientId', language)}: ${profile.patient_id}`);

    // ── Card 1: Blood Type (prominent) ──
    const btCardH = 30;
    const btY = cardStart(c, `${tr('passport.bloodType', language)} & ${tr('passport.rhFactor', language)}`, btCardH);
    const btBoxW = 55;
    doc.setFillColor(...C.bloodBg);
    doc.setDrawColor(...C.bloodBdr);
    doc.setLineWidth(0.4);
    doc.roundedRect(c.ml + 8, btY - 2, btBoxW, 18, 3, 3, 'FD');
    doc.setFont(c.f, 'bold');
    doc.setFontSize(28);
    doc.setTextColor(...C.teal);
    doc.text(profile.blood_type, c.ml + 14, btY + 11);
    const bw = doc.getTextWidth(profile.blood_type);
    doc.setFontSize(16);
    doc.text(`Rh${profile.rh_factor}`, c.ml + 16 + bw, btY + 11);
    c.y += btCardH + 6;

    // ── Card 2: Antibodies ──
    const abItems = profile.antibodies.length > 0 ? profile.antibodies : [];
    const abCardH = abItems.length > 0 ? 22 : 18;
    const abY = cardStart(c, tr('passport.antibodies', language), abCardH);
    if (abItems.length > 0) {
      chips(c, c.ml + 8, abY + 2, abItems);
    } else {
      doc.setFont(c.f, 'normal'); doc.setFontSize(10); doc.setTextColor(...C.gray);
      doc.text(tr('passport.noAntibodies', language), c.ml + 8, abY + 2);
    }
    c.y += abCardH + 6;

    // ── Card 3: Reactions ──
    const rxText = profile.known_reactions || tr('passport.noReactions', language);
    const rxLines = doc.splitTextToSize(rxText, c.cw - 16);
    const rxCardH = 10 + rxLines.length * 5 + 4;
    const rxY = cardStart(c, tr('passport.reactions', language), rxCardH);
    doc.setFont(c.f, 'normal'); doc.setFontSize(10); doc.setTextColor(...C.dark);
    doc.text(rxLines, c.ml + 8, rxY + 1);
    c.y += rxCardH + 6;

    // ── Card 4: Medications ──
    const medText = profile.medications || tr('passport.noMedications', language);
    const medLines = doc.splitTextToSize(medText, c.cw - 16);
    const medCardH = 10 + medLines.length * 5 + 4;
    const medY = cardStart(c, tr('passport.medications', language), medCardH);
    doc.setFont(c.f, 'normal'); doc.setFontSize(10); doc.setTextColor(...C.dark);
    doc.text(medLines, c.ml + 8, medY + 1);
    c.y += medCardH + 8;

    pdpa(c);
    footer(c);

    // ── Page 2: Symptom Monitoring Timeline ──
    if (symptomLogs.length > 0) {
      drawTimeline(c, transfusions, symptomLogs, language);
      pdpa(c);
      footer(c);
    }

    doc.save('HaemoCare-Transfusion-Passport.pdf');
    return;
  }

  // ─── Native: expo-print ───
  const abHtml = profile.antibodies.length > 0
    ? profile.antibodies.map(a => `<span class="chip">${a}</span>`).join('')
    : tr('passport.noAntibodies', language);

  // Build timeline HTML for native
  const timelineHtml = buildTimelineHtml(transfusions, symptomLogs, language);

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${nativeStyles}</style></head>
  <body>
    <div class="banner">
      <div class="banner-title">HaemoCare \u2014 ${tr('passport.title', language)}</div>
      <div class="banner-sub">${getPatientId(profile)}</div>
      <div class="banner-id">${tr('privacy.patientId', language)}: ${profile.patient_id}</div>
    </div>
    <div class="card">
      <div class="card-title">${tr('passport.bloodType', language)} & ${tr('passport.rhFactor', language)}</div>
      <div class="card-body">
        <div class="blood-type"><span class="bt-letter">${profile.blood_type}</span> <span class="bt-rh">Rh${profile.rh_factor}</span></div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">${tr('passport.antibodies', language)}</div>
      <div class="card-body">${abHtml}</div>
    </div>
    <div class="card">
      <div class="card-title">${tr('passport.reactions', language)}</div>
      <div class="card-body">${profile.known_reactions || tr('passport.noReactions', language)}</div>
    </div>
    <div class="card">
      <div class="card-title">${tr('passport.medications', language)}</div>
      <div class="card-body">${profile.medications || tr('passport.noMedications', language)}</div>
    </div>
    ${timelineHtml}
    <div class="pdpa">
      <strong>PDPA Notice:</strong> This document contains personal health data protected under Thailand's PDPA B.E. 2562. Unauthorized distribution is prohibited.
    </div>
    <div class="footer">Generated on ${fmtDate(new Date().toISOString())} \u00b7 HaemoCare App \u00b7 For medical provider use</div>
  </body></html>`;

  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Transfusion Passport' });
}

/** Build symptom timeline HTML for native PDF (expo-print) */
function buildTimelineHtml(transfusions: Transfusion[], symptomLogs: SymptomLog[], language: Language): string {
  if (symptomLogs.length === 0) return '';

  const logsByTx = new Map<string, SymptomLog[]>();
  for (const log of symptomLogs) {
    if (log.transfusion_id) {
      const arr = logsByTx.get(log.transfusion_id) || [];
      arr.push(log);
      logsByTx.set(log.transfusion_id, arr);
    }
  }

  const sortedTx = [...transfusions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalLogs = symptomLogs.length;
  const normalN = symptomLogs.filter(l => l.outcome === 'normal').length;
  const monitorN = symptomLogs.filter(l => l.outcome === 'monitor').length;
  const urgentN = symptomLogs.filter(l => l.outcome === 'urgent').length;

  let html = `
    <div style="page-break-before: always;"></div>
    <div class="card" style="margin-top:16px;">
      <div class="card-title">${tr('symptoms.title', language)} \u2014 Timeline</div>
      <div class="card-body">
        <div style="margin-bottom:10px; color:#6B7280; font-size:11px;">
          ${totalLogs} logs recorded \u00b7
          <span class="badge" style="background:#10B981;font-size:9px;">${normalN} Normal</span>
          <span class="badge" style="background:#F59E0B;font-size:9px;">${monitorN} Monitor</span>
          <span class="badge" style="background:#EF4444;font-size:9px;">${urgentN} Urgent</span>
        </div>`;

  for (const tx of sortedTx) {
    const logs = (logsByTx.get(tx.id) || []).sort(
      (a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime()
    );
    if (logs.length === 0) continue;

    html += `
        <div class="tl-tx">
          <div class="tl-tx-dot"></div>
          <div class="tl-tx-label">${tr('history.title', language)} \u2014 ${fmtDate(tx.date)}</div>
          <div class="tl-tx-meta">${tx.units_received ?? '—'} units${tx.reaction_noted ? ' \u26a0 Reaction noted' : ''}</div>
        </div>`;

    for (const log of logs) {
      const ocKey = log.outcome;
      const bgColor = ocKey === 'urgent' ? '#FEF2F2' : ocKey === 'monitor' ? '#FFFBEB' : '#ECFDF5';
      const borderColor = ocKey === 'urgent' ? '#FECACA' : ocKey === 'monitor' ? '#FDE68A' : '#A7F3D0';
      const textColor = ocKey === 'urgent' ? '#B91C1C' : ocKey === 'monitor' ? '#92400E' : '#065F46';
      const logTime = new Date(log.logged_at);
      const timeStr = `${logTime.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ${logTime.getHours().toString().padStart(2, '0')}:${logTime.getMinutes().toString().padStart(2, '0')}`;
      const symText = log.symptoms.map(s => tr(`symptom.${s}`, language)).join(', ');
      const oc = outcomeColorRgb(log.outcome);
      const outcomeLabel = tr(`status.${log.outcome}`, language);

      const sevHtml = Object.entries(log.severity_scores).map(([sym, score]) => {
        const barColor = (score as number) >= 7 ? '#EF4444' : (score as number) >= 4 ? '#F59E0B' : '#10B981';
        return `<span class="sev-item">
          <span class="sev-bar-bg"><span class="sev-bar-fill" style="width:${(score as number) * 10}%;background:${barColor};"></span></span>
          <span class="sev-label">${tr(`symptom.${sym}`, language)}: ${score}/10</span>
        </span>`;
      }).join('');

      html += `
        <div class="tl-entry" style="background:${bgColor};border-color:${borderColor};">
          <div class="tl-dot" style="background:${borderColor};"></div>
          <div class="tl-entry-header">
            <span style="color:${textColor};font-weight:700;font-size:11px;">${timeStr}</span>
            <span class="badge" style="background:rgb(${oc.join(',')});font-size:9px;">${outcomeLabel}</span>
          </div>
          <div class="tl-symptoms">${symText}</div>
          <div class="tl-sevs">${sevHtml}</div>
          ${log.notes ? `<div class="tl-notes">${log.notes}</div>` : ''}
        </div>`;
    }
  }

  html += '</div></div>';
  return html;
}

// ═══════════════════════════════════════════════════
// APPOINTMENT BRIEF PDF
// ═══════════════════════════════════════════════════

export async function generateAppointmentBriefPdf(
  profile: Profile,
  appointment: Appointment,
  symptomLogs: SymptomLog[],
  transfusions: Transfusion[],
  language: Language,
): Promise<void> {
  if (Platform.OS === 'web') {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    await loadThaiFont(doc);
    const c = cur(doc, 'Sarabun');
    const pid = getPatientId(profile);
    const lastTx = transfusions[0];

    banner(
      c,
      `HaemoCare \u2014 ${tr('appointments.brief', language)}`,
      `${pid}  \u00b7  ${tr('appointments.date', language)}: ${fmtDate(appointment.scheduled_date)}`,
      `${tr('privacy.patientId', language)}: ${profile.patient_id}`,
    );

    // ── Card: Patient Summary (2-column grid) ──
    const sumCardH = lastTx ? 50 : 40;
    const sumY = cardStart(c, tr('passport.title', language), sumCardH);
    const halfW = (c.cw - 24) / 2;
    let ly = sumY;
    ly = labelValue(c, c.ml + 8, ly, tr('passport.bloodType', language), `${profile.blood_type} Rh${profile.rh_factor}`, halfW);

    // Antibodies on right column
    doc.setFont(c.f, 'bold'); doc.setFontSize(8); doc.setTextColor(...C.gray);
    doc.text(tr('passport.antibodies', language), c.ml + 8 + halfW + 8, sumY);
    if (profile.antibodies.length > 0) {
      chips(c, c.ml + 8 + halfW + 8, sumY + 6, profile.antibodies);
    } else {
      doc.setFont(c.f, 'normal'); doc.setFontSize(10); doc.setTextColor(...C.dark);
      doc.text('None', c.ml + 8 + halfW + 8, sumY + 5);
    }

    ly = labelValue(c, c.ml + 8, ly + 2, tr('passport.medications', language), profile.medications || 'None', c.cw - 16);
    if (lastTx) {
      labelValue(c, c.ml + 8, ly + 1, tr('history.title', language), `${fmtDate(lastTx.date)} \u2014 ${lastTx.units_received ?? '—'} units at ${lastTx.hospital}`, c.cw - 16);
    }
    c.y += sumCardH + 6;

    // ── Card: Symptom Summary ──
    const nC = symptomLogs.filter(l => l.outcome === 'normal').length;
    const mC = symptomLogs.filter(l => l.outcome === 'monitor').length;
    const uC = symptomLogs.filter(l => l.outcome === 'urgent').length;
    const rowH = 7;
    const tableH = symptomLogs.length > 0 ? 14 + symptomLogs.length * rowH + 4 : 12;
    const symCardH = 10 + 12 + tableH;
    const symY = cardStart(c, `${tr('appointments.symptomSummary', language)} (${symptomLogs.length} ${tr('appointments.totalLogs', language)})`, symCardH);

    // Badges
    const badges: Array<{ label: string; color: [number, number, number] }> = [
      { label: `${nC} Normal`, color: [16, 185, 129] },
      { label: `${mC} Monitor`, color: [245, 158, 11] },
      { label: `${uC} Urgent`, color: [239, 68, 68] },
    ];
    let bx = c.ml + 8;
    doc.setFontSize(8); doc.setFont(c.f, 'bold');
    for (const bg of badges) {
      const bw = doc.getTextWidth(bg.label) + 8;
      doc.setFillColor(...bg.color);
      doc.roundedRect(bx, symY - 3, bw, 7, 2, 2, 'F');
      doc.setTextColor(...C.white);
      doc.text(bg.label, bx + 4, symY + 1);
      bx += bw + 3;
    }

    // Table
    if (symptomLogs.length > 0) {
      const tY = symY + 10;
      const cols = [30, 68, 22, 22];
      const hdrs = ['Date', 'Symptoms', 'Severity', 'Outcome'];
      let tx = c.ml + 8;

      // Header row
      doc.setFillColor(...C.cardBg);
      doc.rect(c.ml + 4, tY - 4, c.cw - 8, 8, 'F');
      doc.setFontSize(8); doc.setFont(c.f, 'bold'); doc.setTextColor(...C.gray);
      for (let i = 0; i < hdrs.length; i++) { doc.text(hdrs[i], tx, tY); tx += cols[i]; }

      let ry = tY + 8;
      for (const log of symptomLogs) {
        tx = c.ml + 8;
        const syms = (log.symptoms as string[]).join(', ');
        const maxS = Math.max(...Object.values(log.severity_scores), 0);
        const oc = outcomeColorRgb(log.outcome);

        doc.setFontSize(8); doc.setFont(c.f, 'normal'); doc.setTextColor(...C.dark);
        doc.text(fmtDate(log.logged_at), tx, ry); tx += cols[0];
        const sl = doc.splitTextToSize(syms, cols[1] - 4);
        doc.text(sl[0] || '', tx, ry); tx += cols[1];
        doc.text(`${maxS}/10`, tx, ry); tx += cols[2];

        const ol = tr(`status.${log.outcome}`, language);
        doc.setFont(c.f, 'bold');
        const ow = doc.getTextWidth(ol) + 6;
        doc.setFillColor(...oc);
        doc.roundedRect(tx, ry - 3, ow, 6, 2, 2, 'F');
        doc.setTextColor(...C.white); doc.setFontSize(7);
        doc.text(ol, tx + 3, ry);

        ry += rowH;
        doc.setDrawColor(...C.border); doc.setLineWidth(0.15);
        doc.line(c.ml + 8, ry - 3, c.ml + c.cw - 8, ry - 3);
      }
    } else {
      doc.setFont(c.f, 'normal'); doc.setFontSize(9); doc.setTextColor(...C.gray);
      doc.text('No symptom logs recorded since last transfusion.', c.ml + 8, symY + 12);
    }
    c.y += symCardH + 6;

    // ── Card: Notes ──
    const noteText = appointment.notes || 'No additional notes.';
    const noteLines = doc.splitTextToSize(noteText, c.cw - 16);
    const noteCardH = 10 + noteLines.length * 5 + 4;
    const noteY = cardStart(c, tr('appointments.notes', language), noteCardH);
    doc.setFont(c.f, 'normal'); doc.setFontSize(10); doc.setTextColor(...C.dark);
    doc.text(noteLines, c.ml + 8, noteY + 1);
    c.y += noteCardH + 8;

    pdpa(c);
    footer(c);
    doc.save('HaemoCare-Appointment-Brief.pdf');
    return;
  }

  // ─── Native: expo-print ───
  const logRows = symptomLogs.map(log => {
    const symptoms = (log.symptoms as string[]).join(', ');
    const maxSev = Math.max(...Object.values(log.severity_scores), 0);
    const oc = outcomeColorRgb(log.outcome);
    return `<tr>
      <td>${fmtDate(log.logged_at)}</td><td>${symptoms}</td><td>${maxSev}/10</td>
      <td><span class="badge" style="background:rgb(${oc.join(',')});">${tr(`status.${log.outcome}`, language)}</span></td>
    </tr>`;
  }).join('');

  const nC = symptomLogs.filter(l => l.outcome === 'normal').length;
  const mC = symptomLogs.filter(l => l.outcome === 'monitor').length;
  const uC = symptomLogs.filter(l => l.outcome === 'urgent').length;
  const lastTx = transfusions[0];

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${nativeStyles}</style></head>
  <body>
    <div class="banner">
      <div class="banner-title">HaemoCare \u2014 ${tr('appointments.brief', language)}</div>
      <div class="banner-sub">${getPatientId(profile)} \u00b7 ${tr('appointments.date', language)}: ${fmtDate(appointment.scheduled_date)}</div>
      <div class="banner-id">${tr('privacy.patientId', language)}: ${profile.patient_id}</div>
    </div>
    <div class="card">
      <div class="card-title">Patient Summary</div>
      <div class="card-body">
        <div class="row"><span class="lbl">${tr('passport.bloodType', language)}</span><strong>${profile.blood_type} Rh${profile.rh_factor}</strong></div>
        <div class="row"><span class="lbl">${tr('passport.antibodies', language)}</span>${profile.antibodies.length > 0 ? profile.antibodies.map(a => `<span class="chip">${a}</span>`).join('') : 'None'}</div>
        <div class="row"><span class="lbl">${tr('passport.medications', language)}</span>${profile.medications || 'None'}</div>
        ${lastTx ? `<div class="row"><span class="lbl">Last Transfusion</span>${fmtDate(lastTx.date)} \u2014 ${lastTx.units_received ?? '—'} units at ${lastTx.hospital}</div>` : ''}
      </div>
    </div>
    <div class="card">
      <div class="card-title">${tr('appointments.symptomSummary', language)} (${symptomLogs.length} ${tr('appointments.totalLogs', language)})</div>
      <div class="card-body">
        <div style="margin-bottom:10px;">
          <span class="badge" style="background:#10B981">${nC} Normal</span>
          <span class="badge" style="background:#F59E0B">${mC} Monitor</span>
          <span class="badge" style="background:#EF4444">${uC} Urgent</span>
        </div>
        ${symptomLogs.length > 0 ? `<table><thead><tr><th>Date</th><th>Symptoms</th><th>Severity</th><th>Outcome</th></tr></thead><tbody>${logRows}</tbody></table>` : '<p style="color:#6B7280">No symptom logs recorded.</p>'}
      </div>
    </div>
    <div class="card">
      <div class="card-title">${tr('appointments.notes', language)}</div>
      <div class="card-body">${appointment.notes || 'No additional notes.'}</div>
    </div>
    <div class="pdpa"><strong>PDPA Notice:</strong> Protected under Thailand's PDPA B.E. 2562. Unauthorized distribution is prohibited.</div>
    <div class="footer">Generated on ${fmtDate(new Date().toISOString())} \u00b7 HaemoCare App \u00b7 For medical provider use</div>
  </body></html>`;

  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Pre-Appointment Brief' });
}

// ─── Native HTML styles (card-based, matches jsPDF layout) ───
const nativeStyles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, 'Helvetica Neue', sans-serif; padding: 32px; color: #1A1A2E; line-height: 1.5; background: #fff; }
  .banner { background: #0D7377; color: #fff; padding: 18px 20px; border-radius: 6px; margin-bottom: 16px; }
  .banner-title { font-size: 20px; font-weight: 700; }
  .banner-sub { font-size: 12px; opacity: 0.9; margin-top: 4px; }
  .banner-id { font-size: 10px; opacity: 0.6; margin-top: 2px; }
  .card { border: 1px solid #E5E7EB; border-radius: 6px; margin-bottom: 12px; overflow: hidden; }
  .card-title { background: #F9FAFB; padding: 8px 14px; font-size: 12px; font-weight: 700; color: #0D7377; border-bottom: 1px solid #E5E7EB; text-transform: uppercase; letter-spacing: 0.5px; }
  .card-body { padding: 12px 14px; font-size: 13px; }
  .row { margin-bottom: 8px; }
  .lbl { display: block; font-size: 10px; font-weight: 600; color: #6B7280; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 2px; }
  .blood-type { padding: 8px 16px; background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 6px; display: inline-block; }
  .bt-letter { font-size: 32px; font-weight: 800; color: #0D7377; }
  .bt-rh { font-size: 20px; font-weight: 700; color: #0D7377; }
  .chip { display: inline-block; background: #E0F2F1; color: #0D7377; padding: 3px 10px; border-radius: 10px; font-size: 12px; margin: 2px 3px 2px 0; font-weight: 600; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 10px; color: #fff; font-size: 11px; font-weight: 600; margin-right: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 4px; }
  th { background: #F9FAFB; text-align: left; padding: 6px 10px; font-weight: 600; color: #6B7280; font-size: 10px; text-transform: uppercase; }
  td { padding: 6px 10px; border-bottom: 1px solid #F3F4F6; }
  .pdpa { background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 6px; padding: 10px 14px; margin-top: 16px; font-size: 10px; color: #166534; }
  .footer { margin-top: 20px; padding-top: 12px; border-top: 1px solid #E5E7EB; font-size: 9px; color: #9CA3AF; text-align: center; }

  /* Timeline styles */
  .tl-tx { position: relative; padding-left: 20px; margin-bottom: 6px; margin-top: 12px; border-left: 2px solid #E5E7EB; }
  .tl-tx-dot { position: absolute; left: -6px; top: 2px; width: 10px; height: 10px; border-radius: 50%; background: #0D7377; }
  .tl-tx-label { font-size: 13px; font-weight: 700; color: #0D7377; }
  .tl-tx-meta { font-size: 10px; color: #6B7280; margin-top: 2px; }
  .tl-entry { position: relative; padding: 8px 12px; margin-left: 20px; margin-bottom: 6px; border: 1px solid; border-radius: 6px; border-left: 3px solid; }
  .tl-dot { position: absolute; left: -14px; top: 12px; width: 8px; height: 8px; border-radius: 50%; }
  .tl-entry-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
  .tl-symptoms { font-size: 12px; color: #1A1A2E; margin-bottom: 4px; }
  .tl-sevs { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 4px; }
  .sev-item { display: inline-flex; align-items: center; gap: 4px; }
  .sev-bar-bg { display: inline-block; width: 40px; height: 5px; background: #E5E7EB; border-radius: 3px; overflow: hidden; }
  .sev-bar-fill { display: block; height: 100%; border-radius: 3px; }
  .sev-label { font-size: 9px; color: #6B7280; }
  .tl-notes { font-size: 10px; color: #6B7280; font-style: italic; margin-top: 2px; padding-top: 4px; border-top: 1px dashed #E5E7EB; }
`;
