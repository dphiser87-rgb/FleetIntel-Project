import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft, Paperclip, X as XIcon, User, Truck, CurrencyCircleDollar, ChartBar, DeviceMobile, DotsThree,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import { api, formatApiErrorDetail } from "@/lib/api";

const ISSUE_TYPES = [
  { key: "account", label: "Account", icon: User },
  { key: "vehicle", label: "Vehicle", icon: Truck },
  { key: "billing", label: "Billing", icon: CurrencyCircleDollar },
  { key: "reports_data", label: "Reports & Data", icon: ChartBar },
  { key: "mobile_app", label: "Mobile App", icon: DeviceMobile },
  { key: "other", label: "Other", icon: DotsThree },
];

// Reasonable per-type category lists per the spec -- Account and Vehicle are prescribed exactly;
// Billing/Reports & Data/Mobile App/Other follow the same generic Subject/Description/Priority shape
// with a category list sized to that type.
const CATEGORIES = {
  account: ["Login / Access", "User Permissions", "Account Configuration", "Subscription", "General Account Issue", "Other"],
  vehicle: ["Maintenance", "Fuel", "Downtime", "Parts", "Vehicle Information", "Cost Data", "Checklist / Inspection", "Other"],
  billing: ["Invoice", "Payment", "Subscription Plan", "Pricing Question", "Other"],
  reports_data: ["Report Accuracy", "Missing Data", "Export Issue", "Dashboard Display", "Other"],
  mobile_app: ["Login / Access", "App Crash", "Sync Issue", "Feature Request", "Other"],
  other: ["General Inquiry", "Feedback", "Other"],
};

const PRIORITIES = ["low", "normal", "high", "critical"];

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onloadend = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

function VehicleSelector({ value, onChange }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const t = setTimeout(() => {
      api.get("/vehicles", { params: { search: query, limit: 20 } }).then((r) => setResults(r.data || [])).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  if (value) {
    return (
      <div className="border border-primary/40 bg-primary/5 px-3 py-2.5 flex items-center justify-between" data-testid="vehicle-selected">
        <div className="text-sm">
          <span className="font-semibold">{value.plate || "—"}</span> · {value.name}
          {value.type ? ` (${value.type})` : ""} · <span className="mono text-xs text-muted-foreground">VH-{value.id.slice(0, 6).toUpperCase()}</span>
        </div>
        <button onClick={() => onChange(null)} className="text-muted-foreground hover:text-white" data-testid="vehicle-clear">
          <XIcon size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <MagnifyingGlass size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search by registration or vehicle name…"
          data-testid="vehicle-search-input"
          className="w-full bg-[#0b0b0d] border border-border pl-9 pr-3 py-2.5 text-sm focus:border-primary focus:outline-none"
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-[#121214] border border-border max-h-64 overflow-y-auto">
          {results.map((v) => (
            <button
              key={v.id}
              onClick={() => { onChange(v); setOpen(false); setQuery(""); }}
              data-testid={`vehicle-option-${v.id}`}
              className="w-full text-left px-3 py-2.5 text-sm hover:bg-[#1a1a1c] border-b border-border/50 last:border-b-0"
            >
              <span className="font-semibold">{v.plate || "—"}</span> · {v.name}{v.type ? ` · ${v.type}` : ""}
              <div className="mono text-[10px] text-muted-foreground">VH-{v.id.slice(0, 6).toUpperCase()}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function HelpNewTicket() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const ctxVehicleId = searchParams.get("vehicle_id");
  const ctxModule = searchParams.get("source_module");
  const ctxScreen = searchParams.get("source_screen");
  const ctxPeriod = searchParams.get("period");
  const hasContext = !!(ctxVehicleId || ctxModule || ctxScreen);

  const [step, setStep] = useState(ctxVehicleId ? "category" : "type");
  const [type, setType] = useState(ctxVehicleId ? "vehicle" : null);
  const [category, setCategory] = useState(null);
  const [vehicle, setVehicle] = useState(null);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [attachments, setAttachments] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (ctxVehicleId) {
      api.get("/vehicles", { params: { search: "" } }).then((r) => {
        const v = (r.data || []).find((x) => x.id === ctxVehicleId);
        if (v) setVehicle(v);
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const contextSummary = useMemo(() => {
    const parts = [];
    if (vehicle) parts.push(`Vehicle: ${vehicle.name}${vehicle.plate ? ` (${vehicle.plate})` : ""}`);
    if (ctxModule) parts.push(`Module: ${ctxModule}`);
    if (ctxScreen) parts.push(`Screen: ${ctxScreen}`);
    if (ctxPeriod) parts.push(`Reporting Period: ${ctxPeriod}`);
    return parts.join(" · ");
  }, [vehicle, ctxModule, ctxScreen, ctxPeriod]);

  const addFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (attachments.length + files.length > 5) { toast.error("You can attach at most 5 files"); return; }
    for (const file of files) {
      const dataUrl = await fileToDataUrl(file);
      setAttachments((a) => [...a, { id: crypto.randomUUID(), file_name: file.name, file_type: file.type, file_size: file.size, uploaded_by: "", uploaded_at: new Date().toISOString(), data_url: dataUrl }]);
    }
  };
  const removeAttachment = (id) => setAttachments((a) => a.filter((f) => f.id !== id));

  const submit = async () => {
    if (!subject.trim() || !description.trim()) { toast.error("Add a subject and description"); return; }
    if (type === "vehicle" && !vehicle) { toast.error("Select the affected vehicle"); return; }
    setSubmitting(true);
    try {
      const { data } = await api.post("/support/tickets", {
        category: type,
        subcategory: category,
        vehicle_id: vehicle?.id || null,
        subject: subject.trim(),
        description: description.trim(),
        priority,
        attachments,
        source_module: ctxModule || null,
        source_screen: ctxScreen || null,
      });
      toast.success(`Ticket ${data.ticket_number} submitted`);
      navigate(`/help/tickets/${data.id}`);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setSubmitting(false);
    }
  };

  const back = () => {
    if (step === "form") setStep("category");
    else if (step === "category") { if (!hasContext) setStep("type"); else navigate("/help"); }
    else navigate("/help");
  };

  return (
    <div className="p-8 max-w-2xl">
      <button onClick={back} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-white mb-6" data-testid="help-new-back">
        <ArrowLeft size={15} /> Back
      </button>

      {step === "type" && (
        <>
          <h1 className="font-display text-2xl font-black tracking-tight">What is this issue related to?</h1>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-6">
            {ISSUE_TYPES.map((t) => (
              <button
                key={t.key}
                onClick={() => { setType(t.key); setStep("category"); }}
                data-testid={`issue-type-${t.key}`}
                className="bg-[#121214] border border-border p-5 text-left hover:border-primary transition-colors"
              >
                <t.icon size={22} className="text-primary" />
                <div className="text-sm font-semibold mt-3">{t.label}</div>
              </button>
            ))}
          </div>
        </>
      )}

      {step === "category" && type && (
        <>
          <h1 className="font-display text-2xl font-black tracking-tight">
            {type === "vehicle" ? "Which vehicle, and what kind of issue?" : "What kind of issue is this?"}
          </h1>

          {type === "vehicle" && (
            <div className="mt-6">
              <label className="overline block mb-2">Vehicle</label>
              <VehicleSelector value={vehicle} onChange={setVehicle} />
            </div>
          )}

          <label className="overline block mt-6 mb-2">Category</label>
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIES[type].map((c) => (
              <button
                key={c}
                onClick={() => { setCategory(c); setStep("form"); }}
                data-testid={`category-${c.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}
                className={`border px-3 py-2.5 text-sm text-left transition-colors ${category === c ? "border-primary text-primary" : "border-border hover:border-primary/50"}`}
              >
                {c}
              </button>
            ))}
          </div>
        </>
      )}

      {step === "form" && (
        <>
          <h1 className="font-display text-2xl font-black tracking-tight">Describe the issue</h1>

          {(hasContext || contextSummary) && (
            <div className="mt-4 border border-border bg-[#121214] px-4 py-3 text-xs text-muted-foreground" data-testid="ticket-context-summary">
              {contextSummary || "Context captured automatically."}
            </div>
          )}
          {!hasContext && category && (
            <div className="mt-4 text-xs text-muted-foreground">
              {ISSUE_TYPES.find((t) => t.key === type)?.label} · {category}
              {vehicle ? ` · ${vehicle.name}${vehicle.plate ? ` (${vehicle.plate})` : ""}` : ""}
            </div>
          )}

          <div className="mt-6 space-y-4">
            <div>
              <label className="overline block mb-2">Subject</label>
              <input
                value={subject} onChange={(e) => setSubject(e.target.value)}
                placeholder="Brief summary of the issue"
                data-testid="ticket-subject"
                className="w-full bg-[#0b0b0d] border border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="overline block mb-2">Describe the issue</label>
              <textarea
                value={description} onChange={(e) => setDescription(e.target.value)}
                rows={5}
                placeholder="What happened, what you expected, and any steps to reproduce"
                data-testid="ticket-description"
                className="w-full bg-[#0b0b0d] border border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none resize-none"
              />
            </div>
            <div>
              <label className="overline block mb-2">Priority</label>
              <div className="flex gap-2">
                {PRIORITIES.map((p) => (
                  <button
                    key={p} onClick={() => setPriority(p)}
                    data-testid={`priority-${p}`}
                    className={`flex-1 border px-3 py-2 text-xs uppercase tracking-widest transition-colors ${priority === p ? "border-primary text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between overline mb-2">
                <span className="flex items-center gap-1"><Paperclip size={12} /> Attachments ({attachments.length}/5)</span>
                {attachments.length < 5 && (
                  <label className="cursor-pointer text-primary hover:underline normal-case tracking-normal text-xs" data-testid="ticket-add-attachment">
                    + Add file
                    <input type="file" accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
                  </label>
                )}
              </div>
              {attachments.map((a) => (
                <div key={a.id} className="flex items-center justify-between text-xs border border-border px-2 py-1.5 mb-1" data-testid={`ticket-attachment-${a.id}`}>
                  <span className="truncate">{a.file_name}</span>
                  <button onClick={() => removeAttachment(a.id)} className="text-muted-foreground hover:text-white"><XIcon size={12} /></button>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={submit} disabled={submitting}
            data-testid="ticket-submit"
            className="mt-6 bg-primary text-primary-foreground px-5 py-3 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit Ticket"}
          </button>
        </>
      )}
    </div>
  );
}
