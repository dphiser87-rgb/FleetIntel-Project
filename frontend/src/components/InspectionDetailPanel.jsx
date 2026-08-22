import React from "react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { API } from "@/lib/api";
import { DownloadSimple } from "@phosphor-icons/react";
import InspectionDetailContent from "@/components/InspectionDetailContent";

export default function InspectionDetailPanel({ inspection, onClose, onActioned }) {
  const downloadPdf = () => {
    const token = localStorage.getItem("token");
    const url = `${API}/inspections/${inspection.id}/pdf?token=${encodeURIComponent(token)}`;
    window.open(url, "_blank");
  };

  return (
    <Sheet open={!!inspection} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="border-border bg-[#0b0b0d] w-full sm:max-w-2xl flex flex-col overflow-hidden p-0" data-testid="inspection-detail-panel">
        <SheetTitle className="sr-only">Checklist submission detail</SheetTitle>
        <SheetDescription className="sr-only">Full detail of a completed vehicle checklist submission</SheetDescription>
        <div className="border-b border-border px-6 py-4 shrink-0 flex items-center justify-between">
          <div>
            <div className="overline">{inspection?.target_name} · {inspection?.target_plate}</div>
            <h2 className="font-display text-xl font-bold mt-0.5">{inspection?.template_name}</h2>
          </div>
          <button onClick={downloadPdf} data-testid="panel-download-pdf" className="flex items-center gap-2 border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary">
            <DownloadSimple size={14} /> PDF
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {inspection && <InspectionDetailContent id={inspection.id} onActioned={onActioned} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
