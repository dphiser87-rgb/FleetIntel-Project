import React, { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import ScheduleAssetList from "./ScheduleAssetList";
import AssetMaintenanceTimeline from "./AssetMaintenanceTimeline";
import MaintEventDetail from "./MaintEventDetail";
import MaintCostBreakdown from "./MaintCostBreakdown";

// Same stacked-panel shell as components/investigation/InvestigationHub.jsx — the module spec
// requires "Investigation without navigation loss" (Tile -> List -> Asset -> Event -> Cost/Root
// Cause -> Action) and that pattern already exists in the codebase for cost investigation, so this
// mirrors it exactly rather than introducing a second drill-down mechanism. Every visited panel
// stays mounted (hidden) so popping back via breadcrumb restores state instead of remounting.
export default function MaintenanceSchedulingHub({ root, schedules, vehicles, assets, onClose, onDataChanged }) {
  const [stack, setStack] = useState([]);

  useEffect(() => {
    if (root) setStack([root]);
    else setStack([]);
  }, [root]);

  const push = (entry) => setStack((s) => [...s, entry]);
  const popTo = (i) => setStack((s) => s.slice(0, i + 1));

  return (
    <Sheet open={!!root} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="border-border bg-[#0b0b0d] w-full sm:max-w-4xl flex flex-col overflow-hidden p-0" data-testid="maintenance-scheduling-hub">
        <SheetTitle className="sr-only">{stack[stack.length - 1]?.label || "Maintenance investigation"}</SheetTitle>
        <SheetDescription className="sr-only">Drill-down maintenance schedule investigation panel</SheetDescription>
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
                        <button type="button" onClick={() => popTo(i)} className="overline hover:text-primary" data-testid={`maint-crumb-${i}`}>{s.label}</button>
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
                {s.type === "asset-list" && (
                  <ScheduleAssetList
                    schedules={schedules} filter={s.filter} scheduleId={s.scheduleId}
                    onDrillAsset={(a) => push({ type: "timeline", kind: a.kind, id: a.id, label: a.name })}
                  />
                )}
                {s.type === "timeline" && (
                  <AssetMaintenanceTimeline
                    kind={s.kind} id={s.id} schedules={schedules}
                    onDrillEvent={(job) => push({ type: "event", job, label: job.title })}
                  />
                )}
                {s.type === "event" && (
                  <MaintEventDetail
                    job={s.job} vehicles={vehicles} assets={assets} onDataChanged={onDataChanged}
                    onDrillCost={(job) => push({ type: "cost", job, label: "Cost breakdown" })}
                  />
                )}
                {s.type === "cost" && <MaintCostBreakdown job={s.job} />}
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
