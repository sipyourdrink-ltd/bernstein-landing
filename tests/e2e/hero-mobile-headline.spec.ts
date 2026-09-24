import { test, expect } from '@playwright/test';

/**
 * W1 audit item (d): the hero H1 ("several ai agents. one governance
 * layer. every run provable.") must fit a 390 px viewport (iPhone 12/13
 * mini and similar) without wrapping past three visual lines. It
 * previously overflowed to a fourth line at that width - `node --test`
 * has no layout engine, so this needs a real browser rendering the real
 * CSS at the real width.
 */
test.describe('hero H1 at 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('does not wrap past three lines', async ({ page }) => {
    await page.goto('/');
    const heading = page.locator('#hero-heading');
    await expect(heading).toBeVisible();

    const { height, lineHeight } = await heading.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const lh = parseFloat(getComputedStyle(el).lineHeight);
      return { height: box.height, lineHeight: lh };
    });

    const lines = height / lineHeight;
    expect(lines).toBeLessThanOrEqual(3.1);
  });
});
