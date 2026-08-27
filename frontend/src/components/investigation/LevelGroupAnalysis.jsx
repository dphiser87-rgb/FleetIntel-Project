import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";

const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default function LevelGroupAnalysis({ groupId, onDrillVehicle }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(null);
    api.get(`/vehicle-groups/${groupId}/analysis`)
      .then((r) => setData(r.data))
      .catch(() => toast.error("Unable to load group analysis"));
  }, [groupId]);

  if (!data) return <div className="p-12 text-muted-foreground text-sm">Loading group analysis…</div>;

  const { group, vehicle_count, driver_count, fuel_cost, maintenance_cost, tyre_cost, vehicles } = data;

  return (
    <div className="p-6 space-y-6" data-testid="level-group-analysis">
      <div className="flex items-center gap-2">
        <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: group.color || "#636366" }} />
        <h3 className="font-display text-xl font-bold">{group.name}</h3>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          ["Vehicles", vehicle_count],
          ["Driver count", driver_count],
          ["Fuel cost", money(fuel_cost)],
          ["Maintenance cost", money(maintenance_cost)],
          ["Tyre cost", money(tyre_cost)],
        ].map(([label, value]) => (
          <div key={label} className="bg-[#121214] border border-border p-4">
            <div className="overline">{label}</div>
            <div className="mono text-xl font-bold mt-1">{value}</div>
          </div>
        ))}
      </div>

      <div>
        <div className="overline mb-2">Vehicles in group</div>
        <div className="overflow-x-auto border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border">
              <tr className="text-left overline">
                <th className="p-2">Vehicle</th>
                <th className="p-2">Licence Plate</th>
                <th className="p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => (
                <tr key={v.id} className="border-b border-border/50 hover:bg-primary/5 cursor-pointer"
                  onClick={() => onDrillVehicle(v)} data-testid={`group-analysis-vehicle-${v.id}`}>
                  <td className="p-2">{v.name}</td>
                  <td className="p-2 mono">{v.plate}</td>
                  <td className="p-2 text-xs uppercase text-muted-foreground">{v.status}</td>
                </tr>
              ))}
              {vehicles.length === 0 && (
                <tr><td colSpan={3} className="p-8 text-center text-muted-foreground">No vehicles in this group yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
