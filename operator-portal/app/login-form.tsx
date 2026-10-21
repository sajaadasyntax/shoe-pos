'use client';

import { useActionState } from 'react';
import { sendSignInLink, type ActionState } from './actions';

const initialState: ActionState = { message: '', error: false };

export function LoginForm() {
  const [state, action, pending] = useActionState(sendSignInLink, initialState);
  return (
    <form action={action} className="form-stack">
      <label htmlFor="email">Operator email</label>
      <input id="email" name="email" type="email" autoComplete="email" required placeholder="operator@example.com" />
      <button type="submit" disabled={pending}>{pending ? 'Sending link…' : 'Send secure sign-in link'}</button>
      {state.message && <p className={state.error ? 'message error' : 'message success'} role="status">{state.message}</p>}
    </form>
  );
}
