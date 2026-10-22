'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Rule {
  id: string;
  origin: string | null;
  destination: string | null;
  pctBps: number;
  fixedCents: number;
  active: boolean;
  note: string | null;
}

interface Tier {
  channel: string;
  mode: string;
  pctBps: number;
  active: boolean;
}

interface Agency {
  id: string;
  name: string;
  creditLimitCents: number;
  paymentTerms: string | null;
  status: string;
}

const input = 'border border-[#e3e3e3] rounded-lg px-3 py-2 text-sm';
const btn = 'bg-[#003580] hover:bg-[#005799] text-white font-semibold rounded-lg px-4 py-2 text-sm';
const danger = 'border border-[#ffb4b4] text-[#b91c1c] rounded-lg px-3 py-1.5 text-xs';

export default function AdminPage() {
  const [ready, setReady] = useState(false);
  const [rules, setRules] = useState<Rule[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [notice, setNotice] = useState('');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [pct, setPct] = useState('10');
  const [fixed, setFixed] = useState('0');
  const [note, setNote] = useState('');
  const router = useRouter();

  const [agencyName, setAgencyName] = useState('');
  const [agencyLimit, setAgencyLimit] = useState('500000');
  const [memberAgencyId, setMemberAgencyId] = useState('');
  const [memberAccountId, setMemberAccountId] = useState('');

  const load = useCallback(async () => {
    const [r, t, a] = await Promise.all([
      fetch('/api/v1/admin/route-rules'),
      fetch('/api/v1/admin/channel-tiers'),
      fetch('/api/v1/admin/agencies'),
    ]);
    if (r.status === 401 || t.status === 401 || a.status === 401) {
      router.push('/admin/login');
      return;
    }
    setRules((await r.json()).rules ?? []);
    setTiers((await t.json()).tiers ?? []);
    setAgencies((await a.json()).agencies ?? []);
    setReady(true);
  }, [router]);

  useEffect(() => {
    // Initial admin data load.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function addRule() {
    setNotice('');
    const res = await fetch('/api/v1/admin/route-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: origin || null,
        destination: destination || null,
        pctBps: Math.round(Number(pct) * 100),
        fixedCents: Number(fixed),
        note: note || undefined,
      }),
    });
    if (!res.ok) {
      setNotice((await res.json()).error ?? 'Failed');
      return;
    }
    setOrigin('');
    setDestination('');
    setNote('');
    await load();
  }

  async function toggleRule(rule: Rule) {
    await fetch(`/api/v1/admin/route-rules/${rule.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !rule.active }),
    });
    await load();
  }

  async function deleteRule(id: string) {
    if (!confirm('Delete this rule?')) return;
    await fetch(`/api/v1/admin/route-rules/${id}`, { method: 'DELETE' });
    await load();
  }

  async function saveTier(tier: Tier) {
    setNotice('');
    const res = await fetch('/api/v1/admin/channel-tiers', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tier),
    });
    if (!res.ok) setNotice('Tier save failed');
    await load();
  }

  async function logout() {
    await fetch('/api/v1/auth/logout', { method: 'POST' });
    router.push('/admin/login');
  }

  async function addAgency() {
    setNotice('');
    const res = await fetch('/api/v1/admin/agencies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: agencyName, creditLimitCents: Number(agencyLimit) }),
    });
    if (!res.ok) {
      setNotice((await res.json()).error ?? 'Failed');
      return;
    }
    setAgencyName('');
    await load();
  }

  async function setAgencyStatus(id: string, status: string) {
    await fetch(`/api/v1/admin/agencies/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await load();
  }

  async function addMember() {
    setNotice('');
    const res = await fetch(`/api/v1/admin/agencies/${memberAgencyId}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: memberAccountId }),
    });
    if (!res.ok) {
      setNotice((await res.json()).error ?? 'Failed');
      return;
    }
    setMemberAccountId('');
    await load();
  }

  if (!ready) return <main className="min-h-screen grid place-items-center text-sm">Loading…</main>;

  return (
    <main className="min-h-screen bg-[#f5f5f5]">
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <h1 className="text-2xl font-bold">Markup admin</h1>
          <button onClick={() => router.push('/admin/bookings')} className="text-sm text-[#0071C2]">
            Bookings
          </button>
          <button onClick={logout} className="ml-auto text-sm text-[#0071C2]">Sign out</button>
        </div>

        <h2 className="font-semibold mb-2">Route rules</h2>
        <div className="bg-white border border-[#e3e3e3] rounded-[16px] overflow-hidden mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#fafafa] text-left text-xs text-[#666]">
                <th className="px-4 py-2">Route</th>
                <th className="px-4 py-2">Percent</th>
                <th className="px-4 py-2">Fixed</th>
                <th className="px-4 py-2">Active</th>
                <th className="px-4 py-2">Note</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className="border-t border-[#eee]">
                  <td className="px-4 py-2 font-mono">{r.origin ?? '*'}→{r.destination ?? '*'}</td>
                  <td className="px-4 py-2">{(r.pctBps / 100).toFixed(1)}%</td>
                  <td className="px-4 py-2">{r.fixedCents}</td>
                  <td className="px-4 py-2">{r.active ? 'yes' : 'no'}</td>
                  <td className="px-4 py-2 text-xs text-[#666]">{r.note ?? ''}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <button onClick={() => toggleRule(r)} className="text-xs text-[#0071C2] mr-3">
                      {r.active ? 'disable' : 'enable'}
                    </button>
                    <button onClick={() => deleteRule(r.id)} className={danger}>delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white border border-[#e3e3e3] rounded-[16px] p-4 mb-8 grid md:grid-cols-6 gap-2">
          <input className={input} value={origin} onChange={(e) => setOrigin(e.target.value.toUpperCase())} placeholder="ORG" maxLength={3} />
          <input className={input} value={destination} onChange={(e) => setDestination(e.target.value.toUpperCase())} placeholder="DST" maxLength={3} />
          <input className={input} type="number" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="%" title="Percent" />
          <input className={input} type="number" value={fixed} onChange={(e) => setFixed(e.target.value)} placeholder="Fixed" title="Fixed cents" />
          <input className={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" />
          <button className={btn} onClick={addRule}>Add rule</button>
        </div>

        <h2 className="font-semibold mb-2">Channel tiers</h2>
        <div className="bg-white border border-[#e3e3e3] rounded-[16px] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#fafafa] text-left text-xs text-[#666]">
                <th className="px-4 py-2">Channel</th>
                <th className="px-4 py-2">Mode</th>
                <th className="px-4 py-2">Percent (bps)</th>
                <th className="px-4 py-2">Active</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {tiers.map((t) => (
                <tr key={t.channel} className="border-t border-[#eee]">
                  <td className="px-4 py-2 font-mono">{t.channel}</td>
                  <td className="px-4 py-2">
                    <select
                      className={input}
                      value={t.mode}
                      onChange={(e) => setTiers((ts) => ts.map((x) => (x.channel === t.channel ? { ...x, mode: e.target.value } : x)))}
                    >
                      <option value="route">route</option>
                      <option value="route_minus_pct">route_minus_pct</option>
                      <option value="route_plus_pct">route_plus_pct</option>
                      <option value="flat">flat</option>
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      className={input}
                      type="number"
                      value={t.pctBps}
                      onChange={(e) => setTiers((ts) => ts.map((x) => (x.channel === t.channel ? { ...x, pctBps: Number(e.target.value) } : x)))}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={t.active}
                      onChange={(e) => setTiers((ts) => ts.map((x) => (x.channel === t.channel ? { ...x, active: e.target.checked } : x)))}
                    />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button className={btn} onClick={() => saveTier(t)}>save</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h2 className="font-semibold mb-2 mt-8">Agencies</h2>
        <div className="bg-white border border-[#e3e3e3] rounded-[16px] overflow-hidden mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#fafafa] text-left text-xs text-[#666]">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Credit limit</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {agencies.map((a) => (
                <tr key={a.id} className="border-t border-[#eee]">
                  <td className="px-4 py-2">{a.name}</td>
                  <td className="px-4 py-2 font-mono">{(a.creditLimitCents / 100).toFixed(2)}</td>
                  <td className="px-4 py-2">{a.status}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {a.status !== 'active' && (
                      <button onClick={() => setAgencyStatus(a.id, 'active')} className="text-xs text-[#0071C2] mr-3">activate</button>
                    )}
                    {a.status === 'active' && (
                      <button onClick={() => setAgencyStatus(a.id, 'suspended')} className="text-xs text-[#0071C2] mr-3">suspend</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white border border-[#e3e3e3] rounded-[16px] p-4 mb-4 grid md:grid-cols-3 gap-2">
          <input className={input} value={agencyName} onChange={(e) => setAgencyName(e.target.value)} placeholder="Agency name" />
          <input className={input} type="number" value={agencyLimit} onChange={(e) => setAgencyLimit(e.target.value)} placeholder="Credit limit (cents)" title="Credit limit in minor units" />
          <button className={btn} onClick={addAgency}>Add agency</button>
        </div>

        <div className="bg-white border border-[#e3e3e3] rounded-[16px] p-4 mb-4 grid md:grid-cols-3 gap-2">
          <input className={input} value={memberAgencyId} onChange={(e) => setMemberAgencyId(e.target.value)} placeholder="Agency ID" title="Agency ID (uuid)" />
          <input className={input} value={memberAccountId} onChange={(e) => setMemberAccountId(e.target.value)} placeholder="Agent account ID" title="Must be an agent-realm account" />
          <button className={btn} onClick={addMember}>Add agent member</button>
        </div>
        {notice && <p className="mt-3 text-sm text-[#b91c1c]">{notice}</p>}
      </div>
    </main>
  );
}
