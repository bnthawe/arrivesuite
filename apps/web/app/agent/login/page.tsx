'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const input = 'border border-[#e3e3e3] rounded-lg px-3 py-2 text-sm w-full';
const btn = 'bg-[#003580] hover:bg-[#005799] text-white font-semibold rounded-lg px-5 py-2.5 text-sm';

export default function AgentLoginPage() {
  const [email, setEmail] = useState('agent@arrivesuite.com');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  async function login() {
    setError('');
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'Login failed');
      return;
    }
    if (data.account.realm !== 'agent' && data.account.realm !== 'admin') {
      setError('Agent account required');
      return;
    }
    router.push('/agent');
  }

  return (
    <main className="min-h-screen bg-[#f5f5f5] grid place-items-center">
      <div className="bg-white border border-[#e3e3e3] rounded-[16px] p-6 w-full max-w-sm">
        <h1 className="text-xl font-bold mb-1">Agent sign in</h1>
        <p className="text-xs text-[#666] mb-4">Book on credit for your agency.</p>
        <div className="grid gap-3">
          <input className={input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
          <input className={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
          {error && <p className="text-sm text-[#b91c1c]">{error}</p>}
          <button className={btn} onClick={login}>Sign in</button>
        </div>
      </div>
    </main>
  );
}
