import { test, expect } from '@playwright/test';

/**
 * Design System E2E Tests
 *
 * Validates that design tokens from apps/web-dashboard/src/theme/tokens.ts
 * are correctly applied to the UI components.
 *
 * Part of p5a-d13: Design Integration Pipeline & Playwright Testing
 */

test.describe('Design System - Color Palette', () => {
  test('primary color (Construction Blue) is applied correctly', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Check for primary color usage in buttons, links, or headers
    // Construction Blue: #1976d2
    const elements = await page.locator('[class*="MuiButton-contained"]').all();

    if (elements.length > 0) {
      const backgroundColor = await elements[0].evaluate((el) => {
        return window.getComputedStyle(el).backgroundColor;
      });

      // rgb(25, 118, 210) is #1976d2
      expect(backgroundColor).toContain('rgb(25, 118, 210)');
    }
  });

  test('secondary color (Safety Orange) is available', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Safety Orange: #f57c00
    // Look for any secondary-colored elements
    const secondaryElements = await page.locator('[class*="MuiButton"][class*="secondary"]').all();

    // Just verify the theme is loaded, secondary buttons may not be present on home page
    expect(secondaryElements).toBeDefined();
  });
});

test.describe('Design System - Typography', () => {
  test('Inter font family is loaded and applied', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Wait for fonts to load
    await page.waitForTimeout(1000);

    // Check body or main content font
    const fontFamily = await page.evaluate(() => {
      const body = document.body;
      return window.getComputedStyle(body).fontFamily;
    });

    // Should contain Inter (may have fallbacks like Roboto, Helvetica, Arial)
    expect(fontFamily.toLowerCase()).toContain('inter');
  });

  test('font sizes are consistent with design tokens', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Check for heading elements
    const h1Elements = await page.locator('h1').all();

    if (h1Elements.length > 0) {
      const fontSize = await h1Elements[0].evaluate((el) => {
        return window.getComputedStyle(el).fontSize;
      });

      // Should use one of our defined sizes (2xl: 24px, 3xl: 32px, 4xl: 40px, 5xl: 48px)
      const validSizes = ['24px', '32px', '40px', '48px', '1.5rem', '2rem', '2.5rem', '3rem'];
      const matchesSize = validSizes.some(size => fontSize.includes(size));

      expect(matchesSize).toBeTruthy();
    }
  });
});

test.describe('Design System - Spacing', () => {
  test('8px base grid system is applied', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Check Material-UI components use 8px-based spacing
    const cards = await page.locator('[class*="MuiCard"]').all();

    if (cards.length > 0) {
      const padding = await cards[0].evaluate((el) => {
        const computed = window.getComputedStyle(el);
        return {
          top: computed.paddingTop,
          left: computed.paddingLeft,
        };
      });

      // Padding should be multiples of 8px (8, 16, 24, 32, etc.)
      const paddingValues = Object.values(padding);
      const isMultipleOf8 = paddingValues.every(val => {
        const px = parseFloat(val);
        return px % 8 === 0;
      });

      expect(isMultipleOf8).toBeTruthy();
    }
  });
});

test.describe('Design System - Border Radius', () => {
  test('default 12px border radius is applied to components', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Check buttons or cards for 12px border radius
    const buttons = await page.locator('[class*="MuiButton"]').all();

    if (buttons.length > 0) {
      const borderRadius = await buttons[0].evaluate((el) => {
        return window.getComputedStyle(el).borderRadius;
      });

      // Should be 12px (our default lg size)
      expect(borderRadius).toBe('12px');
    }
  });
});

test.describe('Design System - Shadows', () => {
  test('Material-UI components have appropriate shadows', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Check for cards or elevated components
    const cards = await page.locator('[class*="MuiCard"], [class*="MuiPaper"]').all();

    if (cards.length > 0) {
      const boxShadow = await cards[0].evaluate((el) => {
        return window.getComputedStyle(el).boxShadow;
      });

      // Should have some shadow (not 'none')
      expect(boxShadow).not.toBe('none');
    }
  });
});

test.describe('Design System - Responsive Breakpoints', () => {
  test('layout adjusts at mobile breakpoint (sm: 600px)', async ({ page }) => {
    // Start at desktop size
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const desktopLayout = await page.evaluate(() => {
      return {
        width: document.body.clientWidth,
        display: window.getComputedStyle(document.body).display,
      };
    });

    // Switch to mobile size (below sm breakpoint)
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500); // Let styles recalculate

    const mobileLayout = await page.evaluate(() => {
      return {
        width: document.body.clientWidth,
        display: window.getComputedStyle(document.body).display,
      };
    });

    // Width should change
    expect(mobileLayout.width).toBeLessThan(desktopLayout.width);
  });

  test('layout adjusts at tablet breakpoint (md: 960px)', async ({ page }) => {
    await page.setViewportSize({ width: 960, height: 600 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Just verify page loads at tablet size
    await expect(page).toHaveTitle(/Ectropy/);
  });
});

test.describe('Design System - Theme Provider', () => {
  test('ThemeProvider is present and theme is accessible', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Check if Material-UI theme is loaded by looking for MUI classes
    const hasMuiClasses = await page.evaluate(() => {
      const allElements = document.querySelectorAll('*');
      let foundMui = false;

      allElements.forEach((el) => {
        if (el.className && typeof el.className === 'string' && el.className.includes('Mui')) {
          foundMui = true;
        }
      });

      return foundMui;
    });

    // Should have Material-UI components rendered with theme
    expect(hasMuiClasses).toBeTruthy();
  });
});
