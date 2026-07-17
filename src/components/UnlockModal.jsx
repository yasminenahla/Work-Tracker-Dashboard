// Password prompt that unlocks editing. The actual check happens
// server-side (any write call returns 401 on a wrong password) — this
// modal just calls onSubmit and shows whatever error comes back.
import { useState } from 'react';
import { ModalShell } from './Common.jsx';

export function UnlockModal({ onClose, onSubmit, error, busy }) {
  const [password, setPassword] = useState('');
  return (
    <ModalShell onClose={onClose} size="sm" title="Unlock editing" ariaLabel="Unlock editing" subtitle="Enter the shared editor password to add, edit, or delete items.">
      <form
        onSubmit={(e) => { e.preventDefault(); onSubmit(password); }}
      >
        <input
          type="password" className="wt-field-input" autoFocus placeholder="Editor password"
          value={password} onChange={(e) => setPassword(e.target.value)}
        />
        {error ? <div className="wt-field-error" style={{ marginTop: 8 }}>{error}</div> : null}
        <div className="wt-modal__footer">
          <button type="button" className="wt-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="wt-btn-primary" style={{ background: 'var(--c-brand-blue)' }} disabled={busy || !password}>
            {busy ? 'Checking…' : 'Unlock'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
