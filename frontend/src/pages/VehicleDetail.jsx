import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { CaretLeft, ClipboardText, Wrench, ShareNetwork, Copy, X as XIcon } from "@phosphor-icons/react";
import { toast } from "sonner";

const money = (n) => `$${(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default function VehicleDetail() {
  const { id } = useParams();
  const [v, setV] = useState(null);
  const [insp, setInsp] = useState([]);
  const [maint, setMaint] = useState([]);
  const [shareUrl, setShareUrl] = useState(null);
  const [showShare, setShowShare] = useState(false);

  useEffect(() => {
    api.get(`/vehicles/${id}`).then(r => setV(r.data));
    api.get(`/inspections`, { params: { vehicle_id: id } }).then(r => setInsp(r.data));
    api.get(`/maintenance`).then(r => setMaint(r.data.filter(m => m.vehicle_id === id)));
  }, [id]);

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
        </div>

        <div className="space-y-6">
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
