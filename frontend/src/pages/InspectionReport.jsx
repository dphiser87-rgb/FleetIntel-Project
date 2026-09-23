import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, downloadFile } from "@/lib/api";
import { CaretLeft, DownloadSimple } from "@phosphor-icons/react";
import InspectionDetailContent from "@/components/InspectionDetailContent";

export default function InspectionReport() {
  const { id } = useParams();
  const [insp, setInsp] = useState(null);
  const [target, setTarget] = useState(null);
  const [templateName, setTemplateName] = useState("");
  const isVehicle = !!insp?.vehicle_id;

  useEffect(() => {
    api.get(`/inspections/${id}`).then(async ({ data }) => {
      setInsp(data);
      const [t, v] = await Promise.all([
        data.template_snapshot ? Promise.resolve({ data: data.template_snapshot }) : api.get(`/templates/${data.template_id}`),
        data.vehicle_id ? api.get(`/vehicles/${data.vehicle_id}`) : api.get(`/assets/${data.asset_id}`),
      ]);
      setTemplateName(t.data.name);
      setTarget(v.data);
    });
  }, [id]);

  const downloadPdf = () => downloadFile(`/inspections/${id}/pdf`, `inspection-${id}.pdf`);

  if (!insp || !target) return <div className="p-12 text-muted-foreground">Loading…</div>;

  return (
    <div className="noise-bg min-h-screen">
      <header className="border-b border-border px-8 py-6">
        <Link to={isVehicle ? `/fleet/${target.id}` : "/assets"} className="overline flex items-center gap-1 mb-3 hover:text-primary"><CaretLeft size={12}/> Back to {isVehicle ? "vehicle" : "assets"}</Link>
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="overline">Checklist submission</div>
            <h1 className="font-display font-black text-4xl tracking-tight mt-1">{templateName}</h1>
            <div className="text-sm text-muted-foreground mt-2">
              {target.name} · {isVehicle ? target.plate : (target.identifier || target.kind)} · Driver {insp.inspector_name} · {new Date(insp.completed_at || insp.created_at).toLocaleString()}
            </div>
          </div>
          <button data-testid="download-pdf" onClick={downloadPdf} className="flex items-center gap-2 bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90">
            <DownloadSimple size={14} weight="bold" /> Download PDF
          </button>
        </div>
      </header>

      <div className="p-8 max-w-4xl">
        <InspectionDetailContent id={id} />
      </div>
    </div>
  );
}
