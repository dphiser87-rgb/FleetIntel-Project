import React, { useEffect, useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import Level2Ranking from "./Level2Ranking";
import Level3Vehicle from "./Level3Vehicle";
import Level4Detail from "./Level4Detail";

export default function InvestigationHub({ root, groups, onClose }) {
  const [stack, setStack] = useState([]);

  useEffect(() => {
    if (root) {
      setStack([{ level: 2, kpiKey: root.key, groupBy: root.groupBy, label: root.label }]);
    } else {
      setStack([]);
    }
  }, [root]);

  const push = (entry) => setStack((s) => [...s, entry]);
  const popTo = (i) => setStack((s) => s.slice(0, i + 1));
  const top = stack[stack.length - 1];

  return (
    <Sheet open={!!root} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="border-border bg-[#0b0b0d] w-full sm:max-w-4xl flex flex-col overflow-hidden p-0" data-testid="investigation-hub">
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
        <div className="flex-1 overflow-y-auto">
          {top?.level === 2 && (
            <Level2Ranking
              kpiKey={top.kpiKey}
              initialGroupBy={top.groupBy}
              groups={groups}
              onDrillVehicle={(v) => push({ level: 3, vehicleId: v.id, label: v.name })}
            />
          )}
          {top?.level === 3 && (
            <Level3Vehicle
              vehicleId={top.vehicleId}
              onDrillEvent={(e) => push({ level: 4, event: e, label: e.title })}
            />
          )}
          {top?.level === 4 && <Level4Detail event={top.event} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
