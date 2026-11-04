import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const url = Deno.env.get('SUPABASE_URL')!;
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const reply = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers });

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return reply(405, { error: 'Method not allowed' });
  const bearer = request.headers.get('authorization') || '';
  if (!/^Bearer\s+\S+$/i.test(bearer)) return reply(401, { error: 'Sign in required' });
  const { data: auth, error: authError } = await admin.auth.getUser(bearer.replace(/^Bearer\s+/i, ''));
  if (authError || !auth.user) return reply(401, { error: 'Sign in required' });

  try {
    const draftId = 'elleng-cup';
    // The Players directory is a signed-in, app-wide listing. A golfer can
    // view it before being added to the tournament's active draft or captain
    // table. Do not use draft participation as a directory permission check.
    const { data: draft, error: draftError } = await admin.from('elleng_drafts')
      .select('state').eq('id', draftId).single();
    if (draftError || !draft) throw new Error('Roster unavailable');
    const { data: accounts, error: accountsError } = await admin.from('elleng_player_accounts')
      .select('golfer_index,username,display_name,photo_url').eq('draft_id', draftId).limit(1000);
    if (accountsError) throw new Error('Roster unavailable');
    const golfers = Array.isArray(draft.state?.golfers) ? draft.state.golfers : [];
    const players = (accounts || []).map((account) => {
      const index = account.golfer_index == null ? NaN : Number(account.golfer_index);
      const golfer = Number.isInteger(index) && index >= 0 ? golfers[index] : null;
      const displayName = String(golfer?.name || account.display_name || account.username || '').trim();
      return { displayName, photoUrl: String(golfer?.photo_url || account.photo_url || ''), participating: !!golfer?.name && golfer.participating !== false, golferIndex: golfer?.name ? index : null, accountIndex: Number.isInteger(index) ? index : null };
    }).filter((p) => p.displayName).sort((a, b) => a.displayName.localeCompare(b.displayName));
    return reply(200, { players });
  } catch {
    return reply(500, { error: 'Roster unavailable' });
  }
});
