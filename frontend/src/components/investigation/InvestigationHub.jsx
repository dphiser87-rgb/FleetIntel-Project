import React, { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import Level2Ranking from "./Level2Ranking";
import LevelGroupAnalysis from "./LevelGroupAnalysis";
import Level3Vehicle from "./Level3Vehicle";
import LevelCostBreakdown from "./LevelCostBreakdown";
import Level4Detail from "./Level4Detail";

// Stack entries are generic panel descriptors { type, label, ...params } — not fixed level numbers —
// so a 6th level can be added later without restructuring this shell. Every entry that's ever been
// pushed stays mounted (just hidden) so popping back via breadcrumb restores its filter/search state
// instead of remounting from scratch.
export default function InvestigationHub({ root, groups, onClose }) {
  const [stack, setStack] = useState([]);

  useEffect(() => {
    if (root) {
      setStack([{ type: "ranking", kpiKey: root.key, groupBy: root.groupBy, label: root.label }]);
    } else {
      setStack([]);
    }
  }, [root]);

  const push = (entry) => setStack((s) => [...s, entry]);
  const popTo = (i) => setStack((s) => s.slice(0, i + 1));

  return (
    <Sheet open={!!root} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="border-border bg-[#0b0b0d] w-full sm:max-w-4xl flex flex-col overflow-hidden p-0" data-testid="investigation-hub">
        <SheetTitle className="sr-only">{stack[stack.length - 1]?.label || "Cost investigation"}</SheetTitle>
        <SheetDescription className="sr-only">Drill-down cost investigation panel</SheetDescription>
        <div className="border-b border-border px-6 py-4 shrink-0">
          <Breadcrumb>
            <BreadcrumbList>
              {stack.map((s, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <BreadcrumbSeparator />}
                  <BreadcrumbItem>
                    {i === stack.length - 1 ? (
                      <BreadcrumbPage className="font-display font-bold text-lg text-foreground">{s.label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink asChild>
                        <button type="button" onClick={() => popTo(i)} className="overline hover:text-primary" data-testid={`crumb-${i}`}>{s.label}</button>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </React.Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        </div>
        <div className="flex-1 overflow-y-auto relative">
          {stack.map((s, i) => {
            const visible = i === stack.length - 1;
            return (
              <div key={i} className={visible ? "" : "hidden"}>
                {s.type === "ranking" && (
                  <Level2Ranking
                    kpiKey={s.kpiKey}
                    initialGroupBy={s.groupBy}
                    groups={groups}
                    onDrillVehicle={(v) => push({ type: "vehicle", vehicleId: v.id, label: v.name })}
                    onDrillGroup={(g) => push({ type: "group-analysis", groupId: g.id, label: g.name })}
                  />
                )}
                {s.type === "group-analysis" && (
                  <LevelGroupAnalysis
                    groupId={s.groupId}
                    onDrillVehicle={(v) => push({ type: "vehicle", vehicleId: v.id, label: v.name })}
                  />
                )}
                {s.type === "vehicle" && (
                  <Level3Vehicle
                    vehicleId={s.vehicleId}
                    onDrillEvent={(e) => push({ type: "transaction", event: e, label: e.title })}
                    onDrillCost={(category, { maintenance, fuelLogs, label }) =>
                      push({ type: "cost-breakdown", category, maintenance, fuelLogs, label })}
                  />
                )}
                {s.type === "cost-breakdown" && (
                  <LevelCostBreakdown
                    category={s.category}
                    maintenance={s.maintenance}
                    fuelLogs={s.fuelLogs}
                    onDrillTransaction={(e) => push({ type: "transaction", event: e, label: e.title })}
                  />
                )}
                {s.type === "transaction" && <Level4Detail event={s.event} />}
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
