import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, API } from "@/lib/api";
import { CaretLeft, DownloadSimple, CheckCircle, XCircle } from "@phosphor-icons/react";

export default function InspectionReport() {
  const { id } = useParams();
  const [insp, setInsp] = useState(null);
  const [template, setTemplate] = useState(null);
  const [vehicle, setVehicle] = useState(null);

  useEffect(() => {
    api.get(`/inspections/${id}`).then(async ({ data }) => {
      setInsp(data);
      const [t, v] = await Promise.all([
        api.get(`/templates/${data.template_id}`),
        api.get(`/vehicles/${data.vehicle_id}`),
      ]);
      setTemplate(t.data); setVehicle(v.data);
    });
  }, [id]);

  const downloadPdf = () => {
    const token = localStorage.getItem("token");
    const url = `${API}/inspections/${id}/pdf?token=${encodeURIComponent(token)}`;
    window.open(url, "_blank");
  };

  if (!insp || !template || !vehicle) return <div className="p-12 text-muted-foreground">Loading…</div>;

  const ans = Object.fromEntries((insp.answers || []).map(a => [a.item_id, a]));

  return (
    <div className="noise-bg min-h-screen">
      <header className="border-b border-border px-8 py-6">
        <Link to={`/fleet/${vehicle.id}`} className="overline flex items-center gap-1 mb-3 hover:text-primary"><CaretLeft size={12}/> Back to vehicle</Link>
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="overline">Inspection report</div>
            <h1 className="font-display font-black text-4xl tracking-tight mt-1">{template.name}</h1>
            <div className="text-sm text-muted-foreground mt-2">
              {vehicle.name} · {vehicle.plate} · Inspector {insp.inspector_name} · {new Date(insp.created_at).toLocaleString()}
            </div>
          </div>
          <button data-testid="download-pdf" onClick={downloadPdf} className="flex items-center gap-2 bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90">
            <DownloadSimple size={14} weight="bold" /> Download PDF
          </button>
        </div>
      </header>

      <div className="p-8 max-w-4xl space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 border border-border grid-borders">
          {[
            ["Odometer", `${(insp.odometer || 0).toLocaleString()} km`],
            ["Failed items", insp.fail_count || 0],
            ["Total items", (insp.answers || []).length],
            ["Status", insp.status || "completed"],
          ].map(([l, v]) => (
            <div key={l} className="p-5 bg-[#121214]">
              <div className="overline">{l}</div>
              <div className="mono text-xl font-bold mt-2">{v}</div>
            </div>
          ))}
        </div>

        {template.sections.map((sec, si) => (
          <div key={sec.id} className="bg-[#121214] border border-border">
            <div className="border-b border-border p-4">
              <div className="overline">Section {si + 1}</div>
              <h3 className="font-display text-xl font-bold tracking-tight mt-1">{sec.title}</h3>
            </div>
            <div className="divide-y divide-border">
              {sec.items.map((it) => {
                const a = ans[it.id] || {};
                const v = String(a.value || "").toLowerCase();
                return (
                  <div key={it.id} className="p-4 flex items-start gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm">{it.label}</div>
                      {a.note && <div className="text-xs text-muted-foreground mt-1">{a.note}</div>}
                      {a.photo && <img src={a.photo} alt="evidence" className="mt-2 max-w-xs border border-border" />}
                    </div>
                    <div className="shrink-0">
                      {v === "pass" && <span className="flex items-center gap-1 text-[#34C759] text-xs mono uppercase tracking-widest"><CheckCircle size={12} weight="bold"/> Pass</span>}
                      {v === "fail" && <span className="flex items-center gap-1 text-primary text-xs mono uppercase tracking-widest"><XCircle size={12} weight="bold"/> Fail</span>}
                      {v && v !== "pass" && v !== "fail" && <span className="mono text-sm">{a.value}</span>}
                      {!v && <span className="mono text-xs text-muted-foreground">—</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {insp.notes && (
          <div className="bg-[#121214] border border-border p-6">
            <div className="overline mb-2">General notes</div>
            <p className="text-sm leading-relaxed">{insp.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
