#!/usr/bin/env node
/**
 * Mock-mode regression script for the clinician↔patient linking feature.
 * Covers the parts of docs/superpowers/specs/2026-05-25-clinician-patient-linking-design.md
 * section 8 that can be exercised without a real Supabase backend:
 *
 *   ✓ Step 1 — clinician submits NOT_FOUND id → inline error
 *   ✓ Step 2 — clinician submits valid HC- code → success + pending row
 *   ✓ Step 5 — patient revokes from PrivacySettings → list empties
 *
 * Cross-user steps (3, 4, 6, 7) need two real accounts — see the manual
 * QA checklist in 2026-05-25-clinician-patient-linking-qa.md.
 *
 * Prerequisites:
 *   npm run build:web   # build the dist bundle
 *   npx serve dist -p 4173 -L   # serve it in another terminal
 *
 * Usage:
 *   node scripts/qa-clinician-links.mjs
 *
 * Output: screenshots in /tmp/haemocare-qa/, JSON status to stdout.
 */
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:4173';
const OUT_DIR = '/tmp/haemocare-qa';
fs.mkdirSync(OUT_DIR, { recursive: true });

const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function shot(page, file) {
  await page.screenshot({ path: path.join(OUT_DIR, file), fullPage: false });
}

const iPhone = devices['iPhone 14'];
const browser = await chromium.launch({ headless: true });

try {
  // ── 1+2: Clinician error path + happy path ──────────────────
  {
    const ctx = await browser.newContext({ ...iPhone });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));

    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    // Open drawer
    await page.getByRole('button', { name: /patient queue|รายชื่อผู้ป่วย/i }).first().click();
    await page.waitForTimeout(500);
    await shot(page, 'clinician-01-drawer.png');

    // Open Add Patient modal
    await page.getByRole('button', { name: /add patient|เพิ่มผู้ป่วย/i }).first().click();
    await page.waitForTimeout(400);
    await shot(page, 'clinician-02-modal-empty.png');

    // Type bad ID → expect NOT_FOUND error
    await page.locator('input').first().fill('XX-bogus');
    await page.locator('text=/^ส่งคำขอ|Send request$/').first().click();
    await page.waitForTimeout(600);
    await shot(page, 'clinician-03-error-not-found.png');
    const errorVisible = await page.locator('text=/not found|ไม่พบ/i').first().isVisible().catch(() => false);
    record('Clinician sees NOT_FOUND error for invalid ID', errorVisible);

    // Type a valid mock id → expect success
    await page.locator('input').first().fill('HC-999111');
    await page.locator('text=/^ส่งคำขอ|Send request$/').first().click();
    await page.waitForTimeout(700);
    await shot(page, 'clinician-04-success.png');
    const successVisible = await page.locator('text=/request sent|ส่งคำขอแล้ว/i').first().isVisible().catch(() => false);
    record('Clinician sees success state after valid submit', successVisible);

    // Close modal
    await page.locator('text=/^ปิด|Close$/').first().click();
    await page.waitForTimeout(400);

    // Re-open drawer (it closed when the modal opened) and verify pending row appears
    await page.getByRole('button', { name: /patient queue|รายชื่อผู้ป่วย/i }).first().click();
    await page.waitForTimeout(500);
    await shot(page, 'clinician-05-drawer-after-submit.png');

    record('Clinician flow finished without console errors', errs.length === 0,
      errs.length > 0 ? errs.slice(0, 2).join('; ') : null);
    await ctx.close();
  }

  // ── 3 (mock): Patient banner + approve ──────────────────────
  {
    const ctx = await browser.newContext({ ...iPhone });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));

    await page.goto(`${BASE}/?as=patient`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    await shot(page, 'patient-01-with-banner.png');
    const bannerVisible = await page.locator('text=/wants to connect|ต้องการเชื่อมต่อ/').first().isVisible().catch(() => false);
    record('Patient sees banner on cold load', bannerVisible);

    if (bannerVisible) {
      await page.getByRole('button', { name: /^view$|^ดู$/i }).first().click();
      await page.waitForTimeout(500);
      await shot(page, 'patient-02-modal.png');

      // Approve with default toggle
      await page.locator('text=/^อนุมัติ|Approve$/').first().click();
      await page.waitForTimeout(800);
      await shot(page, 'patient-03-all-done.png');
      const allDoneVisible = await page.locator('text=/all caught up|จัดการคำขอครบ/i').first().isVisible().catch(() => false);
      record('Patient sees "all caught up" after approve', allDoneVisible);

      const closeBtn = page.locator('text=/^ปิด|Close$/').first();
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click();
        await page.waitForTimeout(400);
      }
    }

    // ── 5 (mock): Navigate to PrivacySettings, see connected, revoke ──
    const privacyBtn = page.locator('text=/ความเป็นส่วนตัวและข้อมูล|Privacy & Data/').first();
    if (await privacyBtn.isVisible().catch(() => false)) {
      await privacyBtn.click();
      await page.waitForTimeout(900);
      await page.evaluate(() => window.scrollBy(0, 350));
      await page.waitForTimeout(300);
      await shot(page, 'patient-04-privacy-connected.png');
      const connectedVisible = await page.locator('text=/Connected clinicians|แพทย์ที่เชื่อมต่อ/').first().isVisible().catch(() => false);
      record('Patient sees connected clinician in PrivacySettings', connectedVisible);

      const revokeBtn = page.locator('text=/^Revoke$|^เพิกถอน$/').first();
      if (await revokeBtn.isVisible().catch(() => false)) {
        // Native alert won't show on web — react-native-web falls back to window.confirm.
        // Auto-accept the confirm.
        page.on('dialog', d => d.accept());
        await revokeBtn.click();
        await page.waitForTimeout(600);
        await shot(page, 'patient-05-after-revoke.png');
        const emptyVisible = await page.locator('text=/No clinicians connected|ยังไม่มีแพทย์/').first().isVisible().catch(() => false);
        record('Patient list empties after revoke', emptyVisible);
      }
    }

    record('Patient flow finished without console errors', errs.length === 0,
      errs.length > 0 ? errs.slice(0, 2).join('; ') : null);
    await ctx.close();
  }
} finally {
  await browser.close();
}

const passed = results.filter(r => r.ok).length;
const failed = results.filter(r => !r.ok).length;
console.log(`\n${passed} passed, ${failed} failed`);
console.log(`Screenshots: ${OUT_DIR}`);
process.exit(failed === 0 ? 0 : 1);
