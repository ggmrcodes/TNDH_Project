// Visual verification for HaemoCare web build.
// Usage: npx expo start --web --port 8083   (in another terminal)
//        node scripts/visual-check.mjs
// Screenshots land under scripts/screenshots/.

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(__dirname, 'screenshots');
const APP_URL = process.env.APP_URL || 'http://localhost:8083';
const EMAIL = 'demo@haemocare.app';
const PASSWORD = 'HaemoDemo2024';

async function shot(page, name) {
  const path = join(SHOTS, name);
  await page.screenshot({ path, fullPage: true });
  console.log(`wrote ${path}`);
}

async function run() {
  await mkdir(SHOTS, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
  });
  const page = await ctx.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') console.log('[browser:error]', msg.text());
  });

  console.log(`goto ${APP_URL}`);
  await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  await shot(page, '00-landing.png');

  // Helper: find an element matching text whose ancestor chain contains a pressable
  // (role=button, tabindex>=0, or cursor:pointer) — this rules out plain text / page
  // titles that happen to share the label. Then click the pressable ancestor's center
  // with Playwright's real mouse.
  async function tapByText(re, label) {
    const box = await page.evaluate(({ pattern, flags }) => {
      const rx = new RegExp(pattern, flags);
      const candidates = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
      while (walker.nextNode()) {
        const el = walker.currentNode;
        const t = (el.textContent || '').trim();
        if (!t || t.length > 80) continue;
        if (!rx.test(t)) continue;
        // Walk up to find a pressable ancestor
        let node = el;
        let pressable = null;
        for (let i = 0; i < 10 && node; i++) {
          const style = getComputedStyle(node);
          if (
            node.getAttribute && (node.getAttribute('role') === 'button' || node.getAttribute('role') === 'tab') ||
            (node.tabIndex != null && node.tabIndex >= 0) ||
            style.cursor === 'pointer'
          ) {
            pressable = node;
            break;
          }
          node = node.parentElement;
        }
        if (pressable) candidates.push({ el, pressable });
      }
      // Prefer the pressable (the actual button/tab wrapper)
      const pick = candidates[0]?.pressable;
      if (!pick) return null;
      pick.scrollIntoView({ block: 'center', inline: 'center' });
      const r = pick.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, { pattern: re.source, flags: re.flags });
    if (!box) throw new Error(`no pressable match for "${label}"`);
    await page.mouse.move(box.x, box.y);
    await page.mouse.down();
    await page.waitForTimeout(50);
    await page.mouse.up();
  }

  // --- Login via mock credentials ---
  // Use pressSequentially so React's onChange fires per-keystroke (fill() alone can leave
  // RN Web's TextInput state out of sync).
  try {
    const emailInput = page.locator('input[type="email"], input[placeholder*="mail" i]').first();
    await emailInput.waitFor({ timeout: 10000 });
    await emailInput.click();
    await emailInput.pressSequentially(EMAIL, { delay: 10 });

    const pwInput = page.locator('input[type="password"]').first();
    await pwInput.click();
    await pwInput.pressSequentially(PASSWORD, { delay: 10 });

    await tapByText(/^(Sign In|Log In|Login|เข้าสู่ระบบ)$/i, 'sign-in');
  } catch (e) {
    console.log('login step failed:', e.message);
    await shot(page, '99-login-failed.png');
    throw e;
  }

  await page.waitForTimeout(3000);
  await shot(page, '01-passport.png');

  // Clicks the back arrow of the stack navigator header (top-left of screen).
  async function tapBack() {
    // The back arrow lives around (20, 42) in a 390x844 viewport. A real mouse
    // click on it triggers React Navigation's pop cleanly.
    await page.mouse.click(24, 44);
    await page.waitForTimeout(800);
  }

  // --- Appointments tab → Import hub → ICS → FHIR (do first, while tab bar is visible) ---
  try {
    await tapByText(/^(Appointments|นัดหมาย)$/i, 'appointments-tab');
    await page.waitForTimeout(1500);
    await shot(page, '02-appointments.png');

    await tapByText(/^(Import|นำเข้า)$/i, 'import-cta');
    await page.waitForTimeout(1200);
    await shot(page, '08-import-hub.png');

    await tapByText(/(Import \.ics Calendar|นำเข้าปฏิทิน \.ics)/i, 'ics-card');
    await page.waitForTimeout(1000);
    await shot(page, '09-ics-import.png');

    await tapBack();

    await tapByText(/(Connect TH Core FHIR|เชื่อมต่อ TH Core FHIR)/i, 'fhir-card');
    await page.waitForTimeout(1000);
    await shot(page, '10-fhir-import.png');

    await tapBack(); // back to hub
    await tapBack(); // back to appointments tab
  } catch (e) {
    console.log('import flow failed:', e.message);
    await shot(page, '98-import-failed.png');
  }

  // --- Tap Prepare for Visit CTA (Thai: เตรียมพบแพทย์) ---
  try {
    await tapByText(/(Prepare for Visit|เตรียมพบแพทย์)/i, 'prepare-for-visit');
    await page.waitForTimeout(2500);
    await shot(page, '03-previsit-top.png');

    // Expo RN Web's ScrollView uses an inner div with overflow; find the deepest scrollable and scroll it.
    const scrollInner = (y) =>
      page.evaluate((top) => {
        const els = Array.from(document.querySelectorAll('*'));
        let best = null;
        let bestH = 0;
        for (const el of els) {
          const s = getComputedStyle(el);
          if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
            if (el.scrollHeight > bestH) {
              best = el;
              bestH = el.scrollHeight;
            }
          }
        }
        if (best) best.scrollTop = top;
        return best ? best.scrollTop : -1;
      }, y);

    const p1 = await scrollInner(800);
    console.log('scrolled to', p1);
    await page.waitForTimeout(400);
    await page.screenshot({
      path: new URL('./screenshots/04-previsit-mid.png', import.meta.url).pathname,
    });
    console.log('wrote 04-previsit-mid.png');

    const p2 = await scrollInner(1600);
    console.log('scrolled to', p2);
    await page.waitForTimeout(400);
    await page.screenshot({
      path: new URL('./screenshots/05-previsit-bottom.png', import.meta.url).pathname,
    });
    console.log('wrote 05-previsit-bottom.png');

    await tapBack();
  } catch (e) {
    console.log('previsit tap failed:', e.message);
    await shot(page, '97-previsit-failed.png');
  }

  // --- Transfusion History tab → Scan (end of script, no back-out needed) ---
  try {
    await tapByText(/^(Transfusions|ประวัติ|ประวัติการให้เลือด)$/i, 'transfusion-tab');
    await page.waitForTimeout(1500);
    await shot(page, '06-transfusion-history.png');

    await tapByText(/^(Scan|สแกน)$/i, 'scan-cta');
    await page.waitForTimeout(1500);
    await shot(page, '07-scan-entry.png');
  } catch (e) {
    console.log('scan nav failed:', e.message);
    await shot(page, '96-scan-failed.png');
  }


  await browser.close();
  console.log('done');
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
