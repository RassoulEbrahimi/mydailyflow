// Supabase Edge Functions run on Deno, outside the app's browser tsconfig.
// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2.112.3';

const allowedOrigin = Deno.env.get('ACCOUNT_ALLOWED_ORIGIN')
  ?? 'https://rassoulebrahimi.github.io';

const corsHeaders = (origin: string | null) => ({
  ...(origin === allowedOrigin ? { 'access-control-allow-origin': origin } : {}),
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
  'vary': 'origin',
});

const json = (origin: string | null, body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders(origin), 'content-type': 'application/json; charset=utf-8' },
});

const secretKey = () => Deno.env.get('SUPABASE_SECRET_KEY')
  ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  if (origin && origin !== allowedOrigin) return json(origin, { error: 'origin not allowed' }, 403);
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (request.method !== 'POST') return json(origin, { error: 'method not allowed' }, 405);

  const authorization = request.headers.get('authorization');
  const url = Deno.env.get('SUPABASE_URL');
  const publicKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
    ?? Deno.env.get('SUPABASE_ANON_KEY');
  const adminKey = secretKey();
  if (!authorization?.startsWith('Bearer ') || !url || !publicKey || !adminKey) {
    return json(origin, { error: 'server misconfigured or unauthenticated' }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json(origin, { error: 'invalid request' }, 400);
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const confirmation = body.confirmation;
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId : '';
  if (confirmation !== 'KONTO LÖSCHEN' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(deviceId)) {
    return json(origin, { error: 'confirmation required' }, 400);
  }

  const userClient = createClient(url, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  const user = userData.user;
  if (userError || !user?.email) return json(origin, { error: 'unauthenticated' }, 401);
  if (user.email.toLowerCase() !== email) return json(origin, { error: 'account confirmation mismatch' }, 403);

  const { data: active, error: activeError } = await userClient.rpc('is_active_account_session', {
    p_device_id: deviceId,
  });
  if (activeError || active !== true) return json(origin, { error: 'inactive account session' }, 403);

  const admin = createClient(url, adminKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id, false);
  if (deleteError) return json(origin, { error: 'account deletion failed' }, 500);
  return json(origin, { deleted: true });
});
