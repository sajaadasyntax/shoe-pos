'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type ActionState = { message: string; error: boolean };

export async function sendSignInLink(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { message: 'Enter a valid operator email address.', error: true };
  }
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) return { message: 'NEXT_PUBLIC_SITE_URL is not configured.', error: true };

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: new URL('/auth/callback', siteUrl).toString(),
      },
    });
    if (error) return { message: error.message, error: true };
    return { message: 'Sign-in link sent. Open it on this browser to continue.', error: false };
  } catch (error) {
    return { message: error instanceof Error ? error.message : 'Could not send the sign-in link.', error: true };
  }
}

export async function signOut() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
  redirect('/');
}

export async function setSubscription(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const organizationId = String(formData.get('organizationId') ?? '');
  const plan = String(formData.get('plan') ?? '');
  const status = String(formData.get('status') ?? '');
  const periodEndValue = String(formData.get('periodEnd') ?? '').trim();
  const notes = String(formData.get('notes') ?? '').trim();

  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) return { message: 'Invalid shop identifier.', error: true };
  if (!['starter', 'growth', 'enterprise'].includes(plan)) return { message: 'Choose a valid plan.', error: true };
  if (!['trialing', 'active', 'past_due', 'canceled'].includes(status)) return { message: 'Choose a valid subscription status.', error: true };
  if (notes.length > 1000) return { message: 'Notes must be 1000 characters or fewer.', error: true };
  const periodEnd = periodEndValue ? new Date(periodEndValue) : null;
  if (periodEndValue && (!periodEnd || Number.isNaN(periodEnd.getTime()))) {
    return { message: 'Enter a valid subscription end date.', error: true };
  }

  try {
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return { message: 'Sign in is required.', error: true };
    const { error } = await supabase.rpc('operator_set_subscription', {
      target_org: organizationId,
      selected_plan: plan,
      selected_status: status,
      period_end: periodEnd?.toISOString() ?? null,
      operator_notes: notes,
    });
    if (error) return { message: error.message, error: true };
    revalidatePath('/');
    return { message: 'Subscription record updated.', error: false };
  } catch (error) {
    return { message: error instanceof Error ? error.message : 'Could not update the subscription.', error: true };
  }
}

export async function beginSupportAccess(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const organizationId = String(formData.get('organizationId') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();
  const duration = Number(formData.get('duration') ?? 30);
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) return { message: 'Invalid shop identifier.', error: true };
  if (reason.length < 10 || reason.length > 500) return { message: 'Give a support reason between 10 and 500 characters.', error: true };
  if (!Number.isInteger(duration) || duration < 5 || duration > 120) return { message: 'Access duration must be from 5 to 120 minutes.', error: true };

  try {
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return { message: 'Sign in is required.', error: true };
    const { error } = await supabase.rpc('begin_support_access', {
      target_org: organizationId,
      access_reason: reason,
      duration_minutes: duration,
    });
    if (error) return { message: error.message, error: true };
    revalidatePath('/');
    return { message: 'Temporary support access started and recorded.', error: false };
  } catch (error) {
    return { message: error instanceof Error ? error.message : 'Could not start support access.', error: true };
  }
}

export async function endSupportAccess(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const sessionId = String(formData.get('sessionId') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return { message: 'Invalid support session.', error: true };
  try {
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return { message: 'Sign in is required.', error: true };
    const { error } = await supabase.rpc('end_support_access', { target_session: sessionId });
    if (error) return { message: error.message, error: true };
    revalidatePath('/');
    return { message: 'Support access ended.', error: false };
  } catch (error) {
    return { message: error instanceof Error ? error.message : 'Could not end support access.', error: true };
  }
}
