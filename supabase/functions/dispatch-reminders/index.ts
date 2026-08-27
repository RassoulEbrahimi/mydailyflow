// Supabase Edge Functions run on Deno, outside the app's browser tsconfig.
// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import webpush from 'npm:web-push@3.6.7';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
});

const secretKey = () => {
  return Deno.env.get('SUPABASE_SECRET_KEY')
    ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
};

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  const dispatchToken = Deno.env.get('P2_PUSH_DISPATCH_TOKEN');
  if (!dispatchToken || request.headers.get('authorization') !== `Bearer ${dispatchToken}`) {
    return json({ error: 'unauthorized' }, 401);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const key = secretKey();
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT');
  if (!url || !key || !publicKey || !privateKey || !subject) return json({ error: 'server misconfigured' }, 503);

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  webpush.setVapidDetails(subject, publicKey, privateKey);
  const { data, error } = await supabase.rpc('claim_due_reminder_deliveries', {
    p_limit: 100,
    p_lease_seconds: 45,
  });
  if (error) return json({ error: 'claim failed' }, 500);

  const outcomes: Record<string, number> = { sent: 0, retry: 0, expired: 0 };
  for (const delivery of data ?? []) {
    let outcome = 'retry';
    let errorCode: string | null = null;
    try {
      const ttl = Math.max(0, Math.min(900, Math.floor((Date.parse(delivery.expires_at) - Date.now()) / 1000)));
      await webpush.sendNotification(delivery.subscription, JSON.stringify({ tag: delivery.notification_tag }), {
        TTL: ttl,
        urgency: 'normal',
      });
      outcome = 'sent';
      outcomes.sent += 1;
    } catch (sendError) {
      const statusCode = Number(sendError?.statusCode ?? 0);
      errorCode = statusCode ? `push-${statusCode}` : 'push-error';
      if (statusCode === 404 || statusCode === 410) {
        outcome = 'expired-subscription';
        outcomes.expired += 1;
      } else {
        outcomes.retry += 1;
      }
    }
    const completion = await supabase.rpc('complete_reminder_delivery', {
      p_delivery_id: delivery.delivery_id,
      p_lease_token: delivery.lease_token,
      p_outcome: outcome,
      p_error_code: errorCode,
    });
    if (completion.error) return json({ error: 'completion failed' }, 500);
  }
  return json({ claimed: (data ?? []).length, outcomes });
});
