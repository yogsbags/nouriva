/**
 * Persists messages to Supabase table `support_messages`.
 *
 * Run in Supabase SQL editor once:
 *
 * create table if not exists public.support_messages (
 *   id uuid primary key default gen_random_uuid(),
 *   user_id uuid not null references auth.users (id) on delete cascade,
 *   email text,
 *   subject text,
 *   body text not null,
 *   created_at timestamptz not null default now()
 * );
 *
 * alter table public.support_messages enable row level security;
 *
 * create policy "support_insert_own"
 *   on public.support_messages for insert to authenticated
 *   with check (auth.uid() = user_id);
 *
 * Optional: allow service role / dashboard reads for your team (e.g. separate admin policy).
 */
import { supabase } from './supabase';

export async function submitSupportMessage(params: {
  subject: string;
  body: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const body = params.body.trim();
  if (!body) return { ok: false, error: 'Please enter a message.' };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return { ok: false, error: 'You must be signed in to send a message.' };

  const { error } = await supabase.from('support_messages').insert({
    user_id: user.id,
    email: user.email ?? null,
    subject: params.subject.trim() || null,
    body,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
