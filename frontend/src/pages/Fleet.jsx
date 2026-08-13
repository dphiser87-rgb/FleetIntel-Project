import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Truck, ClipboardText, Camera } from "@phosphor-icons/react";

const StatusBadge = ({ status }) => {
  const map = {
    active: { c: "border-[#34C759] text-[#34C759] bg-[#34C759]/10", l: "Active" },
    maintenance: { c: "border-[#FFCC00] text-[#FFCC00] bg-[#FFCC00]/10", l: "In maintenance" },
    idle: { c: "border-muted-foreground text-muted-foreground bg-white/5", l: "Idle" },
  };
  const s = map[status] || map.idle;
  return <span className={`text-[10px] mono uppercase tracking-widest px-2 py-1 border ${s.c}`}>{s.l}</span>;
};

export default function Fleet() {
  const [vehicles, setVehicles] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", plate: "", make: "", model: "", year: 2023, type: "truck", odometer: 0, fuel_cost_per_km: 0.35 });

  const load = () => api.get("/vehicles").then(r => setVehicles(r.data));
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.post("/vehicles", { ...form, year: Number(form.year), odometer: Number(form.odometer), fuel_cost_per_km: Number(form.fuel_cost_per_km) });
      toast.success("Vehicle added");
      setShowAdd(false);
      setForm({ name: "", plate: "", make: "", model: "", year: 2023, type: "truck", odometer: 0, fuel_cost_per_km: 0.35 });
      load();
    } catch { toast.error("Failed to add vehicle"); }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="noise-bg min-h-screen">
      <header className="border-b border-border px-8 py-6 flex items-end justify-between">
        <div>
          <div className="overline">Assets</div>
          <h1 className="font-display font-black text-4xl tracking-tight mt-1" data-testid="fleet-title">Fleet</h1>
        </div>
        <button data-testid="add-vehicle-btn" onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-2 bg-primary px-3 py-2 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90 transition-colors">
          <Plus size={14} weight="bold" /> Add vehicle
        </button>
      </header>

      {showAdd && (
        <form onSubmit={save} className="border-b border-border bg-[#0d0d0f] p-6 grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="add-vehicle-form">
          {[
            ["name", "Name", "text"], ["plate", "Plate", "text"], ["make", "Make", "text"], ["model", "Model", "text"],
            ["year", "Year", "number"], ["odometer", "Odometer (km)", "number"], ["fuel_cost_per_km", "Fuel $/km", "number"],
          ].map(([k, l, t]) => (
            <div key={k}>
              <label className="overline block mb-1">{l}</label>
              <div className="flex gap-1">
                <input required type={t} value={form[k]} onChange={set(k)} data-testid={`v-${k}`}
                  className="flex-1 w-full bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                {(k === "plate" || k === "odometer") && (
                  <label className="cursor-pointer border border-border px-2 py-1.5 text-xs text-muted-foreground hover:border-primary hover:text-primary flex items-center" data-testid={`ocr-${k}`} title={`Scan ${k} from photo`}>
                    <Camera size={14} />
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => {
                      const file = e.target.files?.[0]; if (!file) return;
                      const reader = new FileReader();
                      reader.onloadend = async () => {
                        try {
                          const { data } = await api.post("/ocr", { image_base64: reader.result, mode: k === "plate" ? "plate" : "odometer" });
                          setForm(f => ({ ...f, [k]: data.value }));
                          toast.success(`Scanned: ${data.value}`);
                        } catch { toast.error("OCR failed"); }
                      };
                      reader.readAsDataURL(file);
                    }} />
                  </label>
                )}
              </div>
            </div>
          ))}
          <div>
            <label className="overline block mb-1">Type</label>
            <select value={form.type} onChange={set("type")} className="w-full bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
              {["truck","van","car","bus","trailer"].map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="col-span-2 lg:col-span-4 flex gap-2">
            <button type="submit" data-testid="save-vehicle" className="bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90">Save vehicle</button>
            <button type="button" onClick={() => setShowAdd(false)} className="border border-border px-4 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary">Cancel</button>
          </div>
        </form>
      )}

      <div className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6" data-testid="vehicle-grid">
          {vehicles.map(v => (
            <div key={v.id} className="bg-[#121214] border border-border overflow-hidden hover:border-primary/60 transition-colors group" data-testid={`vehicle-${v.plate}`}>
              <div className="aspect-video bg-[#0b0b0d] relative overflow-hidden">
                {v.image_url ? (
                  <img src={v.image_url} alt={v.name} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Truck size={64} weight="thin" className="text-muted-foreground" />
                  </div>
                )}
                <div className="absolute top-3 right-3"><StatusBadge status={v.status} /></div>
                <div className="absolute bottom-3 left-3 overline text-white">{v.plate}</div>
              </div>
              <div className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-display text-xl font-bold tracking-tight">{v.name}</div>
                    <div className="text-xs text-muted-foreground">{v.year} · {v.make} {v.model}</div>
                  </div>
                  <div className="text-right">
                    <div className="mono text-sm">{(v.odometer || 0).toLocaleString()} km</div>
                    <div className="overline mt-1">{v.type}</div>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Link to={`/fleet/${v.id}`} className="flex-1 border border-border px-3 py-2 text-xs uppercase tracking-widest text-center hover:border-primary hover:text-primary transition-colors" data-testid={`view-${v.plate}`}>View</Link>
                  <Link to={`/inspection/${v.id}`} className="flex-1 flex items-center justify-center gap-1 bg-primary/10 border border-primary/40 text-primary px-3 py-2 text-xs uppercase tracking-widest hover:bg-primary hover:text-primary-foreground transition-colors" data-testid={`inspect-${v.plate}`}>
                    <ClipboardText size={12} /> Inspect
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
        {vehicles.length === 0 && <div className="text-center text-muted-foreground py-24">No vehicles. Add one to get started.</div>}
      </div>
    </div>
  );
}
