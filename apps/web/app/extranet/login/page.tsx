'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const input = 'border border-[#e3e3e3] rounded-lg px-3 py-2 text-sm w-full';
const btn = 'bg-[#003580] hover:bg-[#005799] text-white font-semibold rounded-lg px-5 py-2.5 text-sm';

export default function ExtranetLoginPage() {
  const [mode, setMode] = useState<'password' | 'otp'>('password');
  const [email, setEmail] = useState('supplier@arrivesuite.com');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const router = useRouter();

  async function loginPassword() {
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
    if (data.account.realm !== 'supplier' && data.account.realm !== 'admin') {
      setError('Supplier account required');
      return;
    }
    router.push('/extranet');
  }

  async function requestOtp() {
    setError('');
    setNotice('');
    const res = await fetch('/api/v1/auth/whatsapp-otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'Failed to send OTP');
      return;
    }
    setOtpSent(true);
    setNotice('OTP sent via WhatsApp. Enter the 6-digit code.');
  }

  async function verifyOtp() {
    setError('');
    const res = await fetch('/api/v1/auth/whatsapp-otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'Verification failed');
      return;
    }
    if (data.account.realm !== 'supplier' && data.account.realm !== 'admin') {
      setError('Supplier account required');
      return;
    }
    router.push('/extranet');
  }

  return (
    <main className="min-h-screen bg-[#f5f5f5] grid place-items-center">
      <div className="bg-white border border-[#e3e3e3] rounded-[16px] p-6 w-full max-w-sm">
        <h1 className="text-xl font-bold mb-1">Supplier sign in</h1>
        <p className="text-xs text-[#666] mb-4">Manage your properties on ArriveSuite.</p>

        <div className="flex gap-2 mb-4">
          <button
            className={mode === 'password' ? btn : 'border border-[#e3e3e3] rounded-lg px-3 py-1.5 text-xs'}
            onClick={() => setMode('password')}
          >
            Email
          </button>
          <button
            className={mode === 'otp' ? btn : 'border border-[#e3e3e3] rounded-lg px-3 py-1.5 text-xs'}
            onClick={() => setMode('otp')}
          >
            WhatsApp OTP
          </button>
        </div>

        {mode === 'password' && (
          <div className="grid gap-3">
            <input className={input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
            <input className={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
            {error && <p className="text-sm text-[#b91c1c]">{error}</p>}
            <button className={btn} onClick={loginPassword}>Sign in</button>
          </div>
        )}

        {mode === 'otp' && (
          <div className="grid gap-3">
            <input
              className={input}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone (e.g. +26771234567)"
              disabled={otpSent}
            />
            {!otpSent && (
              <button className={btn} onClick={requestOtp}>Send OTP via WhatsApp</button>
            )}
            {otpSent && (
              <>
                <input
                  className={input}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="6-digit OTP"
                  maxLength={6}
                />
                {notice && <p className="text-sm text-[#0071C2]">{notice}</p>}
                {error && <p className="text-sm text-[#b91c1c]">{error}</p>}
                <button className={btn} onClick={verifyOtp}>Verify &amp; Sign in</button>
                <button
                  className="text-xs text-[#0071C2] underline"
                  onClick={() => { setOtpSent(false); setCode(''); setNotice(''); setError(''); }}
                >
                  Resend / change number
                </button>
              </>
            )}
            {error && !otpSent && <p className="text-sm text-[#b91c1c]">{error}</p>}
          </div>
        )}
      </div>
    </main>
  );
}