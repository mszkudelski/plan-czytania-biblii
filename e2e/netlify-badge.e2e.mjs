import { test, expect } from './fixtures.mjs';
import { createPlan, openPlan, tab } from './helpers.mjs';

for (const width of [320, 390, 700]) {
  test(`hosting badge stays clickable above mobile tabs at ${width}px`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 844 });
    const session = await createPlan(request, 'hosting-badge');
    await openPlan(page, session);
    // Real Netlify badge when present; otherwise reproduce its collapsed iframe
    // geometry. The application and its API still use the real deployed backend.
    if (!(await page.locator('#nl-badge-frame').count())) {
      await page.evaluate(() => {
        const frame = document.createElement('iframe');
        frame.id = 'nl-badge-frame';
        frame.title = 'Hosting badge regression fixture';
        frame.dataset.regressionFixture = '1';
        frame.style.cssText = 'position:fixed;right:0;bottom:0;width:192px;height:64px;border:0;z-index:2147483645';
        frame.srcdoc = '<body style="margin:0"><button onclick="this.textContent=\'Badge opened\'" style="width:100%;height:64px">Hosting badge fixture</button></body>';
        document.body.append(frame);
      });
    }
    const badge = page.locator('#nl-badge-frame');
    await expect(badge).toBeVisible();
    await expect.poll(async () => {
      const frame = await badge.boundingBox();
      const nav = await page.locator('.mobile-tabs').boundingBox();
      return frame.y + frame.height <= nav.y;
    }).toBe(true);
    for (const name of ['Ustawienia', 'Grupa', 'Plan', 'Czytaj']) {
      await tab(page, name).click();
      await expect(tab(page, name)).toHaveClass(/active/);
    }
    const recovery = page.getByRole('complementary', { name: 'Propozycja nadrabiania', exact: true });
    if (await recovery.isVisible()) {
      await recovery.getByRole('button', { name: 'Nie teraz', exact: true }).click();
      await expect(recovery).toBeHidden();
    }
    if (await badge.getAttribute('data-regression-fixture')) {
      const button = page.frameLocator('#nl-badge-frame').getByRole('button');
      await button.click();
      await expect(button).toHaveText('Badge opened');
    }
    // No force-click, removal, hidden frame or disabled pointer events.
    expect(await badge.evaluate(frame => getComputedStyle(frame).pointerEvents)).not.toBe('none');
  });
}
