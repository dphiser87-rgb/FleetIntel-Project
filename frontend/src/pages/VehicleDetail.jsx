import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { CaretLeft, ClipboardText, Wrench, ShareNetwork, Copy, X as XIcon, Warning as WarningIcon, ClockCounterClockwise, Heartbeat } from "@phosphor-icons/react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from "recharts";
import { toast } from "sonner";

const money = (n) => `$${(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default function VehicleDetail() {
  const { id } = useParams();
  const [v, setV] = useState(null);
  const [insp, setInsp] = useState([]);
  const [maint, setMaint] = useState([]);
  const [shareUrl, setShareUrl] = useState(null);
  const [showShare, setShowShare] = useState(false);
  const [timeline, setTimeline] = useState([]);
  const [showIncident, setShowIncident] = useState(false);
  const [drivers, setDrivers] = useState([]);
  const [healthTrend, setHealthTrend] = useState(null);
  const [incForm, setIncForm] = useState({ kind: "damage", severity: "minor", occurred_at: new Date().toISOString().slice(0, 16), location: "", description: "", reported_cost: 0, photos: [], driver_id: "" });

  useEffect(() => {
    api.get(`/vehicles/${id}`).then(r => setV(r.data));
    api.get(`/inspections`, { params: { vehicle_id: id } }).then(r => setInsp(r.data));
    api.get(`/maintenance`).then(r => setMaint(r.data.filter(m => m.vehicle_id === id)));
    api.get(`/vehicles/${id}/timeline`).then(r => setTimeline(r.data));
    api.get(`/drivers`).then(r => setDrivers(r.data)).catch(() => {});
    api.get(`/analytics/vehicle/${id}/health-trend`, { params: { days: 30 } }).then(r => setHealthTrend(r.data)).catch(() => {});
  }, [id]);

  const assignedDriver = useMemo(() => drivers.find(d => d.assigned_vehicle_id === id) || null, [drivers, id]);
  const currentScore = healthTrend?.trend?.[healthTrend.trend.length - 1];
  const scoreColor = currentScore ? (currentScore.status === "healthy" ? "#34C759" : currentScore.status === "watch" ? "#FFCC00" : "#FF3B30") : "#34C759";

  // Sync auto-assigned driver into the incident form if drivers load AFTER the modal is opened
  useEffect(() => {
    if (showIncident && assignedDriver && !incForm.driver_id) {
      setIncForm(f => ({ ...f, driver_id: assignedDriver.id }));
    }
  }, [showIncident, assignedDriver, incForm.driver_id]);

  const openIncidentModal = () => {
    // Auto-assign driver from the vehicle's currently assigned driver
    setIncForm(f => ({ ...f, driver_id: assignedDriver ? assignedDriver.id : "" }));
    setShowIncident(true);
  };

  const submitIncident = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...incForm, vehicle_id: id, driver_id: incForm.driver_id || null, occurred_at: new Date(incForm.occurred_at).toISOString(), reported_cost: Number(incForm.reported_cost) || 0 };
      await api.post("/incidents", payload);
      toast.success("Incident reported");
      setShowIncident(false);
      setIncForm({ kind: "damage", severity: "minor", occurred_at: new Date().toISOString().slice(0, 16), location: "", description: "", reported_cost: 0, photos: [], driver_id: "" });
      const [t, ht] = await Promise.all([
        api.get(`/vehicles/${id}/timeline`),
        api.get(`/analytics/vehicle/${id}/health-trend`, { params: { days: 30 } }).catch(() => null),
      ]);
      setTimeline(t.data);
      if (ht) setHealthTrend(ht.data);
    } catch { toast.error("Failed"); }
  };

  const addPhoto = (file) => {
    const r = new FileReader();
    r.onloadend = () => setIncForm(f => ({ ...f, photos: [...f.photos, r.result] }));
    r.readAsDataURL(file);
  };

  if (!v) return <div className="p-12 text-muted-foreground">Loading vehicle…</div>;
  const totalCost = maint.filter(m => m.status === "completed").reduce((s, m) => s + (m.actual_cost || 0), 0);

  return (
    <div className="noise-bg min-h-screen">
      <header className="border-b border-border px-8 py-6">
        <Link to="/fleet" className="overline flex items-center gap-1 mb-3 hover:text-primary"><CaretLeft size={12}/> Back to fleet</Link>
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="overline">{v.plate}</div>
            <h1 className="font-display font-black text-4xl tracking-tight mt-1">{v.name}</h1>
            <div className="text-sm text-muted-foreground mt-2">{v.year} · {v.make} {v.model} · {v.type}</div>
          </div>
          <div className="flex gap-2">
            <button onClick={openIncidentModal} data-testid="report-incident-btn" className="flex items-center gap-2 border border-primary/40 text-primary px-3 py-2 text-xs uppercase tracking-widest hover:bg-primary hover:text-primary-foreground">
              <WarningIcon size={14} weight="bold" /> Report incident
            </button>
            <button onClick={async () => {
              const { data } = await api.post(`/vehicles/${v.id}/share`);
              const url = window.location.origin + data.url;
              setShareUrl(url); setShowShare(true);
            }} data-testid="share-vehicle-btn" className="flex items-center gap-2 border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary">
              <ShareNetwork size={14} /> Share for insurance
            </button>
            <Link to={`/inspection/${v.id}`} className="flex items-center gap-2 border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary" data-testid="run-inspection-btn">
              <ClipboardText size={14}/> Run inspection
            </Link>
          </div>
        </div>
      </header>

      <div className="p-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {v.image_url && (
            <div className="bg-[#121214] border border-border aspect-video overflow-hidden">
              <img src={v.image_url} alt={v.name} className="w-full h-full object-cover" />
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 border border-border grid-borders">
            {[
              ["Odometer", `${(v.odometer || 0).toLocaleString()} km`],
              ["Fuel cost", `${money(v.fuel_cost_per_km)}/km`],
              ["Total spent", money(totalCost)],
              ["Inspections", insp.length],
            ].map(([l, val]) => (
              <div key={l} className="p-5 bg-[#121214]">
                <div className="overline">{l}</div>
                <div className="mono text-xl font-bold mt-2">{val}</div>
              </div>
            ))}
          </div>

          <div className="bg-[#121214] border border-border p-6">
            <div className="overline">History</div>
            <h3 className="font-display text-2xl font-bold tracking-tight mt-1 mb-4">Maintenance log</h3>
            <div className="space-y-2">
              {maint.map(m => (
                <div key={m.id} className="flex items-center justify-between border-b border-border/50 py-2">
                  <div>
                    <div className="text-sm">{m.title}</div>
                    <div className="overline mt-1">{m.status} · {new Date(m.created_at).toLocaleDateString()}</div>
                  </div>
                  <div className="mono">{money(m.actual_cost || m.estimated_cost)}</div>
                </div>
              ))}
              {maint.length === 0 && <div className="text-sm text-muted-foreground py-4">No maintenance records.</div>}
            </div>
          </div>

          {healthTrend && (
            <div className="bg-[#121214] border border-border p-6" data-testid="health-trend-card">
              <div className="flex items-end justify-between mb-4 flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <Heartbeat size={22} className="text-primary" />
                  <div>
                    <div className="overline">Predictive signal</div>
                    <h3 className="font-display text-2xl font-bold tracking-tight mt-1">Health trend (30d)</h3>
                  </div>
                </div>
                {currentScore && (
                  <div className="text-right">
                    <div className="overline">Current score</div>
                    <div className="mono text-3xl font-bold mt-1" style={{ color: scoreColor }} data-testid="current-health-score">{currentScore.score}</div>
                    <div className="overline mt-1" style={{ color: scoreColor }}>{currentScore.status.replace("_", " ")}</div>
                  </div>
                )}
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={healthTrend.trend} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                  <XAxis dataKey="date" stroke="#636366" tick={{ fontSize: 10, fontFamily: "JetBrains Mono" }} tickFormatter={(d) => d.slice(5)} />
                  <YAxis domain={[0, 100]} stroke="#636366" tick={{ fontSize: 11, fontFamily: "JetBrains Mono" }} />
                  <Tooltip contentStyle={{ background: "#0b0b0d", border: "1px solid #27272a", fontFamily: "JetBrains Mono", fontSize: 12 }} />
                  <ReferenceLine y={80} stroke="#34C759" strokeDasharray="4 4" label={{ value: "Healthy", fill: "#34C759", fontSize: 10 }} />
                  <ReferenceLine y={55} stroke="#FF3B30" strokeDasharray="4 4" label={{ value: "At risk", fill: "#FF3B30", fontSize: 10 }} />
                  <Line type="monotone" dataKey="score" stroke={scoreColor} strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-[#121214] border border-border p-6" data-testid="vehicle-timeline">
            <div className="flex items-center gap-2 mb-4">
              <ClockCounterClockwise size={20} className="text-primary" />
              <div>
                <div className="overline">Full history</div>
                <h3 className="font-display text-xl font-bold">Timeline</h3>
              </div>
            </div>
            <div className="relative space-y-3 max-h-96 overflow-y-auto pr-2">
              {timeline.map((e, i) => (
                <div key={i} className="border-l-2 border-primary/40 pl-3">
                  <div className="overline">{e.type}</div>
                  <div className="text-sm mt-0.5">{e.title}</div>
                  {e.by && <div className="text-xs text-muted-foreground mt-1">by {e.by}</div>}
                  {e.meta?.cost != null && <div className="mono text-xs mt-1">${e.meta.cost.toLocaleString()}</div>}
                  {e.meta?.description && <div className="text-xs text-muted-foreground mt-1">{e.meta.description}</div>}
                  <div className="text-[10px] mono text-muted-foreground mt-1">{(e.at || "").slice(0, 16).replace("T", " ")}</div>
                </div>
              ))}
              {timeline.length === 0 && <div className="text-sm text-muted-foreground text-center py-6">No events yet.</div>}
            </div>
          </div>
          <div className="bg-[#121214] border border-border p-6">
            <div className="overline">Recent inspections</div>
            <div className="mt-4 space-y-3">
              {insp.slice(0, 5).map(i => (
                <Link to={`/inspections/${i.id}`} key={i.id} className="block border-b border-border/50 pb-3 hover:bg-[#141416] -mx-2 px-2 py-1" data-testid={`inspection-${i.id}`}>
                  <div className="text-sm">By {i.inspector_name}</div>
                  <div className="overline mt-1">{new Date(i.created_at).toLocaleString()}</div>
                  {i.fail_count > 0 && <div className="mt-1 text-xs text-primary mono">{i.fail_count} failed items</div>}
                </Link>
              ))}
              {insp.length === 0 && <div className="text-sm text-muted-foreground">No inspections yet.</div>}
            </div>
          </div>
        </div>
      </div>
      {showIncident && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6" onClick={() => setShowIncident(false)}>
          <form onSubmit={submitIncident} className="bg-[#121214] border border-border max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()} data-testid="incident-form">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="overline">Insurance evidence</div>
                <h3 className="font-display font-bold text-2xl mt-1">Report an incident</h3>
              </div>
              <button type="button" onClick={() => setShowIncident(false)} className="text-muted-foreground hover:text-primary"><XIcon size={20} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="overline block mb-1">Kind</label>
                <select value={incForm.kind} onChange={(e) => setIncForm({...incForm, kind: e.target.value})} data-testid="incident-kind" className="w-full bg-[#0b0b0d] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
                  {["accident","damage","breakdown","citation","other"].map(k => <option key={k}>{k}</option>)}
                </select>
              </div>
              <div>
                <label className="overline block mb-1">Severity</label>
                <select value={incForm.severity} onChange={(e) => setIncForm({...incForm, severity: e.target.value})} data-testid="incident-severity" className="w-full bg-[#0b0b0d] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
                  {["minor","moderate","severe"].map(k => <option key={k}>{k}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="overline block mb-1 flex items-center justify-between">
                  <span>Driver</span>
                  {assignedDriver && incForm.driver_id === assignedDriver.id && <span className="text-[10px] text-primary normal-case tracking-normal">· auto-filled from vehicle</span>}
                </label>
                <select value={incForm.driver_id} onChange={(e) => setIncForm({...incForm, driver_id: e.target.value})} data-testid="incident-driver" className="w-full bg-[#0b0b0d] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
                  <option value="">Unassigned</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.name}{d.assigned_vehicle_id === id ? " · assigned to this vehicle" : ""}</option>)}
                </select>
              </div>
              <div>
                <label className="overline block mb-1">When</label>
                <input type="datetime-local" value={incForm.occurred_at} onChange={(e) => setIncForm({...incForm, occurred_at: e.target.value})} className="w-full bg-[#0b0b0d] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
              </div>
              <div>
                <label className="overline block mb-1">Location</label>
                <input value={incForm.location} onChange={(e) => setIncForm({...incForm, location: e.target.value})} className="w-full bg-[#0b0b0d] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
              </div>
              <div className="col-span-2">
                <label className="overline block mb-1">Description</label>
                <textarea required rows={3} value={incForm.description} onChange={(e) => setIncForm({...incForm, description: e.target.value})} data-testid="incident-desc" className="w-full bg-[#0b0b0d] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
              </div>
              <div>
                <label className="overline block mb-1">Estimated cost</label>
                <input type="number" value={incForm.reported_cost} onChange={(e) => setIncForm({...incForm, reported_cost: e.target.value})} className="w-full bg-[#0b0b0d] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
              </div>
              <div>
                <label className="overline block mb-1">Photo evidence</label>
                <label className="cursor-pointer border border-border px-3 py-2 text-xs text-muted-foreground hover:border-primary hover:text-primary block text-center" data-testid="incident-photo">
                  + Add photo ({incForm.photos.length})
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && addPhoto(e.target.files[0])} />
                </label>
              </div>
            </div>
            {incForm.photos.length > 0 && (
              <div className="flex gap-2 mt-3 overflow-x-auto">
                {incForm.photos.map((p, i) => <img key={i} src={p} alt="" className="w-16 h-16 object-cover border border-border" />)}
              </div>
            )}
            <div className="flex gap-2 mt-4 pt-4 border-t border-border">
              <button type="submit" data-testid="submit-incident" className="bg-primary text-primary-foreground px-4 py-2.5 text-xs uppercase tracking-widest hover:bg-primary/90">Report incident</button>
              <button type="button" onClick={() => setShowIncident(false)} className="border border-border px-4 py-2.5 text-xs uppercase tracking-widest hover:border-primary hover:text-primary">Cancel</button>
            </div>
          </form>
        </div>
      )}
      {showShare && shareUrl && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6" onClick={() => setShowShare(false)}>
          <div className="bg-[#121214] border border-border max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()} data-testid="share-modal">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="overline">Insurance & compliance</div>
                <h3 className="font-display font-bold text-2xl mt-1">Read-only public link</h3>
              </div>
              <button onClick={() => setShowShare(false)} className="text-muted-foreground hover:text-primary"><XIcon size={20} /></button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">Anyone with this link can view this vehicle's inspection & maintenance history. No login required. Revoke anytime.</p>
            <div className="flex gap-2">
              <input readOnly value={shareUrl} data-testid="share-url" className="flex-1 bg-[#0b0b0d] border border-border px-3 py-2.5 text-xs mono focus:border-primary focus:outline-none" />
              <button onClick={() => { navigator.clipboard.writeText(shareUrl); toast.success("Link copied"); }} data-testid="copy-share" className="flex items-center gap-1 bg-primary text-primary-foreground px-3 py-2.5 text-xs uppercase tracking-widest hover:bg-primary/90">
                <Copy size={12} /> Copy
              </button>
            </div>
            <div className="flex gap-2 mt-3">
              <a href={shareUrl} target="_blank" rel="noreferrer" className="flex-1 text-center border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary" data-testid="open-share">Open in new tab</a>
              <button onClick={async () => {
                await api.delete(`/vehicles/${v.id}/share`);
                toast.success("Link revoked");
                setShowShare(false); setShareUrl(null);
              }} data-testid="revoke-share" className="border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary">Revoke</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
