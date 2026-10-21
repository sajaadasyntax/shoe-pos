'use client';

import { useActionState } from 'react';
import { beginSupportAccess, endSupportAccess, setSubscription, type ActionState } from './actions';

const initialState: ActionState = { message: '', error: false };

export function SubscriptionForm(props: {
  organizationId: string;
  planCode: string | null;
  status: string | null;
  periodEnd: string | null;
  notes: string | null;
}) {
  const [state, action, pending] = useActionState(setSubscription, initialState);
  return (
    <form action={action} className="operator-form">
      <input type="hidden" name="organizationId" value={props.organizationId} />
      <label>Plan
        <select name="plan" defaultValue={props.planCode ?? 'starter'}>
          <option value="starter">Starter</option><option value="growth">Growth</option><option value="enterprise">Enterprise</option>
        </select>
      </label>
      <label>Status
        <select name="status" defaultValue={props.status ?? 'trialing'}>
          <option value="trialing">Trial</option><option value="active">Active</option><option value="past_due">Past due</option><option value="canceled">Canceled</option>
        </select>
      </label>
      <label>Period end
        <input type="date" name="periodEnd" defaultValue={props.periodEnd?.slice(0, 10) ?? ''} />
      </label>
      <label>Internal notes
        <textarea name="notes" rows={2} maxLength={1000} defaultValue={props.notes ?? ''} />
      </label>
      <button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save subscription'}</button>
      {state.message && <p className={state.error ? 'message error' : 'message success'} role="status">{state.message}</p>}
    </form>
  );
}

export function SupportAccessForm(props: { organizationId: string }) {
  const [state, action, pending] = useActionState(beginSupportAccess, initialState);
  return (
    <form action={action} className="operator-form support-form">
      <input type="hidden" name="organizationId" value={props.organizationId} />
      <label>Reason (required)
        <input name="reason" minLength={10} maxLength={500} required placeholder="Describe the support request" />
      </label>
      <label>Access duration
        <select name="duration" defaultValue="30">
          <option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">60 minutes</option><option value="120">120 minutes</option>
        </select>
      </label>
      <button className="button-secondary" type="submit" disabled={pending}>{pending ? 'Starting…' : 'Start audited support access'}</button>
      {state.message && <p className={state.error ? 'message error' : 'message success'} role="status">{state.message}</p>}
    </form>
  );
}

export function EndSupportForm(props: { sessionId: string }) {
  const [state, action, pending] = useActionState(endSupportAccess, initialState);
  return (
    <form action={action} className="inline-form">
      <input type="hidden" name="sessionId" value={props.sessionId} />
      <button className="button-danger" type="submit" disabled={pending}>{pending ? 'Ending…' : 'End access'}</button>
      {state.message && <span className={state.error ? 'message error' : 'message success'}>{state.message}</span>}
    </form>
  );
}
