import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { API } from "@/lib/api";
import axios from "axios";
import { ShieldCheck, XCircle, ChartLine, DownloadSimple } from "@phosphor-icons/react";

const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const SEVERITY_STYLES = {
  severe: "border-primary text-primary bg-primary/10",
  moderate: "border-[#FFCC00] text-[#FFCC00] bg-[#FFCC00]/10",
  minor: "border-muted-foreground text-muted-foreground bg-white/5",
};

export default function PublicIncident() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    axios.get(`${API}/public/incident/${token}`)
      .then(r => setData(r.data))
      .catch(e => setErr(e.response?.data?.detail || "Link not valid"));
  }, [token]);

  if (err) return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="text-center">
        <XCircle size={48} className="text-primary mx-auto mb-4" />
        <h1 className="font-display font-black text-3xl">Link invalid</h1>
        <p className="text-muted-foreground mt-2">{err}</p>
      </div>
    </div>
  );
  if (!data) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  const { workspace, incident, vehicle, driver } = data;

  return (
    <div className="min-h-screen bg-background noise-bg">
      <header className="border-b-2 border-primary/60 px-8 py-6 flex items-center justify-between flex-wrap gap-4 bg-[#0b0b0d]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary flex items-center justify-center">
            <ChartLine size={22} weight="bold" color="#000" />
          </div>
          <div>
            <div className="font-display font-black text-xl leading-none">FleetIntel</div>
            <div className="overline mt-1">Insurance report · shared by {workspace.name}</div>
          </div>
        </div>
        <button
          onClick={() => window.open(`${API}/public/incident/${token}/pdf`, "_blank")}
          data-testid="public-incident-download-pdf"
          className="flex items-center gap-2 bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90"
        >
          <DownloadSimple size={14} weight="bold" /> Download PDF
        </button>
      </header>

      <div className="max-w-4xl mx-auto p-8 space-y-6" data-testid="public-incident-report">
        <div>
          <div className="overline">Incident report</div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className={`text-xs mono uppercase tracking-widest px-2 py-1 border ${SEVERITY_STYLES[incident.severity] || ""}`}>{incident.severity}</span>
            <span className="text-xs mono uppercase tracking-widest text-muted-foreground">{incident.kind}</span>
          </div>
          <h1 className="font-display font-black text-4xl tracking-tight mt-3">{vehicle ? `${vehicle.name} (${vehicle.plate})` : "Vehicle incident"}</h1>
          <div className="text-sm text-muted-foreground mt-2">{new Date(incident.occurred_at).toLocaleString()}{incident.location ? ` · ${incident.location}` : ""}</div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 border border-border grid-borders" data-testid="public-incident-summary">
          {[
            ["Driver", driver?.name || "Unassigned"],
            ["Reported cost", money(incident.reported_cost)],
            ["Status", incident.resolved ? "Resolved" : "Open"],
            ["Photos", (incident.photos || []).length],
          ].map(([l, v]) => (
            <div key={l} className="p-5 bg-[#121214]">
              <div className="overline">{l}</div>
              <div className="mono text-lg font-bold mt-2">{v}</div>
            </div>
          ))}
        </div>

        <div className="bg-[#121214] border border-border p-6">
          <div className="overline mb-2">Description</div>
          <p className="text-sm">{incident.description}</p>
          {incident.resolution_notes && (
            <>
              <div className="overline mb-2 mt-4">Resolution</div>
              <p className="text-sm text-muted-foreground">{incident.resolution_notes}</p>
            </>
          )}
        </div>

        {(incident.photos || []).length > 0 && (
          <div className="bg-[#121214] border border-border p-6">
            <div className="overline mb-4">Photos ({incident.photos.length})</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {incident.photos.map((p, i) => {
                const ext = (p.match(/^data:image\/(\w+)/) || [])[1] || "jpg";
                return (
                  <div key={i} className="relative group border border-border">
                    <img src={p} alt="" className="w-full h-40 object-cover" />
                    <a href={p} download={`incident-photo-${i + 1}.${ext}`}
                      className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/70 text-white text-[10px] uppercase tracking-widest px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary"
                      data-testid={`download-photo-${i}`}>
                      <DownloadSimple size={12} weight="bold" /> Download
                    </a>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="text-center text-xs text-muted-foreground py-6">
          <ShieldCheck size={16} className="inline mr-1 text-primary" />
          This report was shared as a read-only insurance view by <strong className="text-white">{workspace.name}</strong> via FleetIntel.
        </div>
      </div>
    </div>
  );
}
