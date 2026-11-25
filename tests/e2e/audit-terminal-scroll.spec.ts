import { test, expect } from '@playwright/test';

const VIEWPORT_WIDTHS = [375, 768, 1280, 1440] as const;

/**
 * AuditLogEvidence terminal block must fit cleanly inside its container
 * without horizontal overflow or a scrollbar at common mobile, tablet,
 * and desktop widths.
 */
test.describe('audit terminal block overflow', () => {
  for (const width of VIEWPORT_WIDTHS) {
    test(`fits without horizontal scrollbar at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/', { waitUntil: 'load' });
      await page.locator('.v2-term-body').waitFor({ state: 'visible' });
      await page.evaluate(() => document.fonts.ready);

      const metrics = await page.evaluate(() => {
        const doc = document.documentElement;
        const section = document.querySelector('#audit');
        const term = document.querySelector('.v2-term');
        const body = document.querySelector('.v2-term-body');
        return {
          docScrollWidth: doc.scrollWidth,
          docClientWidth: doc.clientWidth,
          sectionScrollWidth: section?.scrollWidth ?? 0,
          sectionClientWidth: section?.clientWidth ?? 0,
          termScrollWidth: term?.scrollWidth ?? 0,
          termClientWidth: term?.clientWidth ?? 0,
          bodyScrollWidth: body?.scrollWidth ?? 0,
          bodyClientWidth: body?.clientWidth ?? 0,
        };
      });

      expect(metrics.docScrollWidth).toBeLessThanOrEqual(metrics.docClientWidth);
      expect(metrics.sectionScrollWidth).toBeLessThanOrEqual(metrics.sectionClientWidth);
      expect(metrics.termScrollWidth).toBeLessThanOrEqual(metrics.termClientWidth);
      expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.bodyClientWidth);
    });
  }
});
