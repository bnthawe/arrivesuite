'use client';

import { useCallback, useEffect, useState } from 'react';

interface Contract {
  id: string;
  title: string;
  status: string;
  signerName: string | null;
  signedAt: string | null;
  createdAt: string;
}

const btn = 'bg-[#003580] hover:bg-[#005799] text-white font-semibold rounded-lg px-4 py-2 text-sm';
const input = 'border border-[#e3e3e3] rounded-lg px-3 py-2 text-sm w-full';

export default function ContractsManager() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [signingId, setSigningId] = useState<string | null>(null);
  const [signerName, setSignerName] = useState('');
  const [signatureData, setSignatureData] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/v1/supplier/contracts');
    if (res.ok) {
      const data = await res.json();
      setContracts(data.contracts ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function signContract(id: string) {
    setNotice('');
    const res = await fetch(`/api/v1/supplier/contracts/${id}/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signerName, signatureData: signatureData || 'signed' }),
    });
    const data = await res.json();
    if (!res.ok) {
      setNotice(data.error ?? 'Signing failed');
      return;
    }
    setSigningId(null);
    setSignerName('');
    setSignatureData('');
    setNotice('Contract signed successfully');
    await load();
  }

  if (loading) return <div className="mt-6 text-sm text-[#666]">Loading contracts...</div>;

  return (
    <div className="mt-6">
      <h3 className="font-semibold mb-3">Contracts</h3>
      {contracts.length === 0 ? (
        <p className="text-sm text-[#666]">No contracts yet.</p>
      ) : (
        <div className="grid gap-3">
          {contracts.map((contract) => (
            <div key={contract.id} className="border border-[#e3e3e3] rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div>
                  <p className="font-medium text-sm">{contract.title}</p>
                  <p className="text-xs text-[#666]">
                    {contract.status === 'signed' && contract.signedAt
                      ? `Signed by ${contract.signerName} on ${new Date(contract.signedAt).toLocaleDateString()}`
                      : `Created ${new Date(contract.createdAt).toLocaleDateString()}`}
                  </p>
                </div>
                <span
                  className={`ml-auto text-xs px-2 py-1 rounded-full ${
                    contract.status === 'signed'
                      ? 'bg-[#e7f9ed] text-[#0a7a2a] border border-[#d0e8d0]'
                      : 'bg-[#fff7e6] text-[#b45309] border border-[#f59e0b]'
                  }`}
                >
                  {contract.status}
                </span>
              </div>
              {contract.status !== 'signed' && signingId !== contract.id && (
                <button className={btn} onClick={() => setSigningId(contract.id)}>
                  Sign contract
                </button>
              )}
              {contract.status !== 'signed' && signingId === contract.id && (
                <div className="mt-3 grid gap-2">
                  <input
                    className={input}
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    placeholder="Full name"
                  />
                  <textarea
                    className={input}
                    value={signatureData}
                    onChange={(e) => setSignatureData(e.target.value)}
                    placeholder="Type your name or paste signature (text-based signing)"
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <button className={btn} onClick={() => signContract(contract.id)}>
                      Confirm signature
                    </button>
                    <button
                      className="border border-[#e3e3e3] rounded-lg px-4 py-2 text-sm"
                      onClick={() => setSigningId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {notice && <p className="mt-3 text-sm text-[#0071C2]">{notice}</p>}
    </div>
  );
}
