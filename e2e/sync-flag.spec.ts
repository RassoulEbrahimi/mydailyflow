import { expect, test } from './fixtures/app';

test('the default production build keeps P2-9 completely inert', async ({ app }) => {
  const supabaseRequests: string[] = [];
  app.page.on('request', request => {
    if (new URL(request.url()).hostname.endsWith('.supabase.co')) supabaseRequests.push(request.url());
  });

  await app.page.reload();
  await expect(app.page.locator('nav')).toBeVisible();
  await app.openSettings();

  await expect(app.page.getByRole('heading', { name: 'SYNCHRONISIERUNG' })).toHaveCount(0);
  await expect(app.page.getByRole('heading', { name: 'HINTERGRUND-ERINNERUNGEN' })).toHaveCount(0);
  await expect(app.page.getByText('Demo-Umgebung · Nicht sicher')).toBeVisible();
  expect(supabaseRequests, 'no identity, sync, or push endpoint is contacted without explicit flags').toEqual([]);
});
