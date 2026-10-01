import React, { useEffect, useState } from "react";
import { ChartBar, X, CaretRight } from "@phosphor-icons/react";

const SECTIONS = [
  { key: "kpi", label: "KPI" },
  { key: "chart", label: "Chart type" },
  { key: "time", label: "Time" },
  { key: "vehicles", label: "Vehicles" },
  { key: "thresholds", label: "Thresholds" },
  { key: "size", label: "Tile size" },
];

const PERIODS = [
  { value: "all", label: "All time" },
  { value: "12m", label: "Last 12 months" },
  { value: "6m", label: "Last 6 months" },
  { value: "90d", label: "Last 90 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "7d", label: "Last 7 days" },
];

// "Gauge" and "Bar" drew the value against a fixed maximum that was a guess, not a target, so they
// were retired; tiles saved with either now show as "Trend".
// `requires` hides a style the selected KPI can't honestly draw: ranked bars need a per-vehicle
// breakdown, a dial needs a real 0-100 scale (a percentage or a score), not a guessed maximum, and a
// line needs a monthly history -- offered without one it looked exactly like the default (checked
// across all 32 KPIs: only 2 have history). The default is called "Trend" only where there's a
// trend to show; elsewhere it's "Standard".
const CHART_TYPES = [
  { value: "trend", label: "Trend", desc: "The value, with six months of history",
    labelFor: t => (t?.series ? null : { label: "Standard", desc: "The value and what it covers" }) },
  { value: "ranked", label: "Ranked bars", desc: "What makes up the number -- vehicles, drivers, parts or suppliers -- worst first", requires: t => !!t?.ranking },
  { value: "number", label: "Big number", desc: "Just the value, large" },
  { value: "dial", label: "Dial", desc: "The value on its 0–100 scale", requires: t => !!t?.scale },
  { value: "line", label: "Line", desc: "Six months of history as a line", requires: t => !!t?.spark },
];
const normalizeChartType = (t, tile) => {
  const def = CHART_TYPES.find(c => c.value === t);
  return def && (!def.requires || def.requires(tile)) ? t : "trend";
};

const SIZES = [
  { value: "sm", label: "Small", desc: "Compact — fits more tiles on screen" },
  { value: "md", label: "Medium", desc: "Standard tile size" },
  { value: "lg", label: "Large", desc: "Spans two columns" },
];

// Charts and panels have a fixed design: the only thing to choose is how wide they are.
const WIDGET_SIZES = [
  { value: "md", label: "One column", desc: "Sits beside other tiles" },
  { value: "lg", label: "Two columns", desc: "More room for charts and lists" },
];
const WIDGET_SECTIONS = new Set(["kpi", "size"]);

function tileSubtitle(tile) {
  if (tile.widget) return tile.desc;
  return tile.higher_better ? "Higher is better" : "Lower is better";
}

export default function CreateTileModal({
  open, mode = "create", allTiles, activeKeys, initialConfig, groups,
  currency, atCap, onClose, onSave, onRemove, onManageGroups,
}) {
  const [section, setSection] = useState("kpi");
  const [selectedKey, setSelectedKey] = useState(null);
  const [chartType, setChartType] = useState("trend");
  const [period, setPeriod] = useState("all");
  const [viewBy, setViewBy] = useState("none");
  const [groupId, setGroupId] = useState(null);
  const [threshold, setThreshold] = useState("");
  const [size, setSize] = useState("md");

  useEffect(() => {
    if (!open) return;
    setSection("kpi");
    if (mode === "edit" && initialConfig) {
      setSelectedKey(initialConfig.key);
      setChartType(normalizeChartType(initialConfig.chart_type, allTiles.find(t => t.key === initialConfig.key)));
      setPeriod(initialConfig.period || "all");
      setViewBy(initialConfig.view_by || "none");
      setGroupId(initialConfig.group_id || null);
      setThreshold(initialConfig.threshold ?? "");
      setSize(initialConfig.size || "md");
    } else {
      setSelectedKey(null);
      setChartType("trend"); setPeriod("all"); setViewBy("none");
      setGroupId(null); setThreshold(""); setSize("md");
    }
  }, [open, mode, initialConfig, allTiles]);

  if (!open) return null;

  const selectedTile = allTiles.find(t => t.key === selectedKey);
  // Editing keeps the item's kind: a KPI tile can be switched to another KPI, a panel to another panel.
  const availableTiles = mode === "edit"
    ? allTiles.filter(t => !!t.widget === !!selectedTile?.widget && (t.key === selectedKey || !activeKeys.includes(t.key)))
    : allTiles.filter(t => !activeKeys.includes(t.key));
  const kpiOptions = availableTiles.filter(t => !t.widget);
  const widgetOptions = availableTiles.filter(t => t.widget);
  const isWidget = !!selectedTile?.widget;
  const sections = isWidget ? SECTIONS.filter(s => WIDGET_SECTIONS.has(s.key)) : SECTIONS;
  const sizes = isWidget ? WIDGET_SIZES : SIZES;

  const choose = (t) => {
    setSelectedKey(t.key);
    if (t.widget) {
      setSize(t.span || "md");
    } else if (selectedTile?.widget) {
      setSize("md");
    }
  };

  const renderOption = (t) => {
    const on = selectedKey === t.key;
    return (
      <button
        type="button"
        key={t.key}
        onClick={() => choose(t)}
        data-testid={`kpi-option-${t.key}`}
        className={`w-full text-left flex items-center gap-3 border rounded-xl px-4 py-3 transition-colors ${
          on ? "bg-emerald-50 border-emerald-500" : "bg-white border-gray-200 hover:border-gray-300"
        }`}
      >
        <span className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${on ? "border-emerald-600" : "border-gray-300"}`}>
          {on && <span className="w-2 h-2 rounded-full bg-emerald-600" />}
        </span>
        <span className="min-w-0">
          <div className={`text-sm font-bold ${on ? "text-emerald-700" : "text-gray-900"}`}>{t.label}</div>
          <div className="text-xs text-gray-500 mt-0.5">{tileSubtitle(t)}</div>
        </span>
      </button>
    );
  };

  const save = () => {
    if (!selectedKey) { setSection("kpi"); return; }
    onSave({
      key: selectedKey,
      chart_type: normalizeChartType(chartType, selectedTile),
      period,
      view_by: viewBy,
      group_id: viewBy === "group" ? groupId : null,
      threshold: threshold === "" ? null : Number(threshold),
      size,
    });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60" onClick={onClose} data-testid="create-tile-modal">
      <div
        className="bg-white text-gray-900 w-full max-w-3xl rounded-2xl overflow-hidden shadow-2xl flex flex-col"
        style={{ height: 620, maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-emerald-950 px-6 py-5 flex items-start gap-4 shrink-0">
          <div className="w-10 h-10 rounded-lg bg-emerald-800 flex items-center justify-center shrink-0">
            <ChartBar size={20} weight="bold" className="text-emerald-200" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold tracking-widest uppercase text-emerald-300">Tile configuration</div>
            <h2 className="text-white font-bold text-2xl mt-0.5">{mode === "edit" ? "Edit Tile" : "Create New Tile"}</h2>
          </div>
          <button onClick={onClose} className="text-emerald-300 hover:text-white p-1" data-testid="create-tile-close">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          {/* Left nav */}
          <div className="w-[200px] shrink-0 border-r border-gray-200 bg-white py-5 px-3 overflow-y-auto">
            <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400 px-2 mb-2">Sections</div>
            <nav className="space-y-1">
              {sections.map(s => (
                <button
                  key={s.key}
                  onClick={() => setSection(s.key)}
                  data-testid={`section-${s.key}`}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    section === s.key
                      ? "bg-emerald-50 border-l-4 border-emerald-600 font-bold text-emerald-700 pl-2"
                      : "text-gray-500 hover:text-gray-800 border-l-4 border-transparent pl-2"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Right content */}
          <div className="flex-1 min-w-0 flex flex-col px-6 py-5 overflow-hidden">
            {section === "kpi" && (
              <>
                <h3 className="text-lg font-bold text-gray-900">KPI</h3>
                <div className="border-b border-gray-200 mt-2 mb-2" />
                <p className="text-sm text-gray-500 mb-3">Select the metric or chart to put on your dashboard.</p>
                <div className="flex-1 overflow-y-auto space-y-2 pr-1" data-testid="kpi-option-list">
                  {kpiOptions.map(renderOption)}
                  {widgetOptions.length > 0 && (
                    <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400 pt-3 pb-1" data-testid="widget-option-heading">Charts &amp; panels</div>
                  )}
                  {widgetOptions.map(renderOption)}
                  {availableTiles.length === 0 && (
                    <div className="text-sm text-gray-400 text-center py-10">Everything is already on your dashboard.</div>
                  )}
                </div>
              </>
            )}

            {section === "chart" && (
              <>
                <h3 className="text-lg font-bold text-gray-900">Chart type</h3>
                <div className="border-b border-gray-200 mt-2 mb-2" />
                <p className="text-sm text-gray-500 mb-3">Choose how this tile visualizes its value.</p>
                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {CHART_TYPES.filter(c => !c.requires || c.requires(selectedTile)).map(c => {
                    const on = chartType === c.value;
                    const { label, desc } = c.labelFor?.(selectedTile) || c;
                    return (
                      <button type="button" key={c.value} onClick={() => setChartType(c.value)} data-testid={`chart-type-${c.value}`}
                        className={`w-full text-left flex items-center gap-3 border rounded-xl px-4 py-3 transition-colors ${on ? "bg-emerald-50 border-emerald-500" : "bg-white border-gray-200 hover:border-gray-300"}`}>
                        <span className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${on ? "border-emerald-600" : "border-gray-300"}`}>
                          {on && <span className="w-2 h-2 rounded-full bg-emerald-600" />}
                        </span>
                        <span>
                          <div className={`text-sm font-bold ${on ? "text-emerald-700" : "text-gray-900"}`}>{label}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{desc}</div>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {section === "time" && (
              <>
                <h3 className="text-lg font-bold text-gray-900">Time</h3>
                <div className="border-b border-gray-200 mt-2 mb-2" />
                <p className="text-sm text-gray-500 mb-3">Default time period when investigating this tile.</p>
                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {PERIODS.map(p => {
                    const on = period === p.value;
                    return (
                      <button type="button" key={p.value} onClick={() => setPeriod(p.value)} data-testid={`period-${p.value}`}
                        className={`w-full text-left flex items-center gap-3 border rounded-xl px-4 py-3 transition-colors ${on ? "bg-emerald-50 border-emerald-500" : "bg-white border-gray-200 hover:border-gray-300"}`}>
                        <span className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${on ? "border-emerald-600" : "border-gray-300"}`}>
                          {on && <span className="w-2 h-2 rounded-full bg-emerald-600" />}
                        </span>
                        <span className={`text-sm font-bold ${on ? "text-emerald-700" : "text-gray-900"}`}>{p.label}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {section === "vehicles" && (
              <>
                <h3 className="text-lg font-bold text-gray-900">Vehicles</h3>
                <div className="border-b border-gray-200 mt-2 mb-2" />
                <p className="text-sm text-gray-500 mb-3">
                  {selectedTile?.breakdown ? "Break this tile's drill-down down by:" : "This KPI doesn't support a vehicle/group breakdown."}
                </p>
                {selectedTile?.breakdown && (
                  <div className="space-y-2">
                    {[
                      ["none", "Flat list"],
                      ...(selectedTile.breakdown === "both" ? [["vehicle", "By vehicle"]] : []),
                      ...(selectedTile.breakdown !== "driver" ? [["group", "By group"]] : []),
                      ...(selectedTile.breakdown === "driver" ? [["driver", "By driver"]] : []),
                    ].map(([val, label]) => {
                      const on = viewBy === val;
                      return (
                        <button type="button" key={val} onClick={() => setViewBy(val)} data-testid={`viewby-${val}`}
                          className={`w-full text-left flex items-center gap-3 border rounded-xl px-4 py-3 transition-colors ${on ? "bg-emerald-50 border-emerald-500" : "bg-white border-gray-200 hover:border-gray-300"}`}>
                          <span className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${on ? "border-emerald-600" : "border-gray-300"}`}>
                            {on && <span className="w-2 h-2 rounded-full bg-emerald-600" />}
                          </span>
                          <span className={`text-sm font-bold ${on ? "text-emerald-700" : "text-gray-900"}`}>{label}</span>
                        </button>
                      );
                    })}
                    {viewBy === "group" && (
                      <select value={groupId || ""} onChange={(e) => setGroupId(e.target.value || null)} data-testid="viewby-group-select"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-2">
                        <option value="">All groups</option>
                        {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </select>
                    )}
                  </div>
                )}
                <button onClick={onManageGroups} className="mt-4 flex items-center gap-1 text-sm text-emerald-700 font-bold hover:text-emerald-800 w-fit" data-testid="manage-groups-link">
                  Manage vehicle groups <CaretRight size={12} />
                </button>
              </>
            )}

            {section === "thresholds" && (
              <>
                <h3 className="text-lg font-bold text-gray-900">Thresholds</h3>
                <div className="border-b border-gray-200 mt-2 mb-2" />
                <p className="text-sm text-gray-500 mb-3">
                  When set, this tile turns red once it crosses the threshold, {selectedTile?.higher_better ? "if the value drops below it" : "if the value rises above it"}.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={threshold}
                    onChange={(e) => setThreshold(e.target.value)}
                    placeholder={selectedTile?.money ? "e.g. 5000" : "e.g. 80"}
                    data-testid="threshold-input"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                  {threshold !== "" && (
                    <button onClick={() => setThreshold("")} className="text-gray-400 hover:text-gray-700 p-1" data-testid="threshold-clear">
                      <X size={16} />
                    </button>
                  )}
                </div>
              </>
            )}

            {section === "size" && (
              <>
                <h3 className="text-lg font-bold text-gray-900">Tile size</h3>
                <div className="border-b border-gray-200 mt-2 mb-2" />
                <p className="text-sm text-gray-500 mb-3">How much space this tile takes on the dashboard grid.</p>
                <div className="space-y-2">
                  {sizes.map(s => {
                    const on = size === s.value;
                    return (
                      <button type="button" key={s.value} onClick={() => setSize(s.value)} data-testid={`size-${s.value}`}
                        className={`w-full text-left flex items-center gap-3 border rounded-xl px-4 py-3 transition-colors ${on ? "bg-emerald-50 border-emerald-500" : "bg-white border-gray-200 hover:border-gray-300"}`}>
                        <span className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${on ? "border-emerald-600" : "border-gray-300"}`}>
                          {on && <span className="w-2 h-2 rounded-full bg-emerald-600" />}
                        </span>
                        <span>
                          <div className={`text-sm font-bold ${on ? "text-emerald-700" : "text-gray-900"}`}>{s.label}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{s.desc}</div>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3 shrink-0">
          {mode === "edit" && (
            <button onClick={() => { onRemove(selectedKey); onClose(); }} data-testid="remove-tile-btn" className="mr-auto text-sm text-red-600 hover:text-red-700 font-bold">
              Remove tile
            </button>
          )}
          <button onClick={onClose} data-testid="create-tile-cancel" className="bg-white border border-gray-300 text-gray-700 rounded-full px-5 py-2 text-sm font-bold hover:bg-gray-100">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={mode === "create" && atCap && !selectedKey}
            data-testid="create-tile-save"
            className="bg-emerald-600 text-white rounded-full px-5 py-2 text-sm font-bold hover:bg-emerald-700 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
