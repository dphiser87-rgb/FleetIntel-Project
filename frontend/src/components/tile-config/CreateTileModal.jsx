import React, { useEffect, useState } from "react";
import { ChartBar, X, CaretRight } from "@phosphor-icons/react";
import { formatMoney } from "@/lib/currency";

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

const CHART_TYPES = [
  { value: "gauge", label: "Gauge", desc: "Radial progress against the tile's target" },
  { value: "bar", label: "Bar", desc: "Single horizontal progress bar" },
  { value: "line", label: "Line", desc: "Trend sparkline where available" },
  { value: "number", label: "Number only", desc: "Just the value, no chart" },
];

const SIZES = [
  { value: "sm", label: "Small", desc: "Compact — fits more tiles on screen" },
  { value: "md", label: "Medium", desc: "Standard tile size" },
  { value: "lg", label: "Large", desc: "Spans two columns" },
];

function tileSubtitle(tile, currency) {
  const dir = tile.higher_better ? "Higher is better" : "Lower is better";
  const maxVal = typeof tile.max === "function" ? tile.max({}) : tile.max;
  const maxDisplay = tile.money ? formatMoney(maxVal, currency) : `${(maxVal || 0).toLocaleString()}${tile.suffix || ""}`;
  return `${dir} · Max ${maxDisplay}`;
}

export default function CreateTileModal({
  open, mode = "create", allTiles, activeKeys, initialConfig, groups,
  currency, atCap, onClose, onSave, onRemove, onManageGroups,
}) {
  const [section, setSection] = useState("kpi");
  const [selectedKey, setSelectedKey] = useState(null);
  const [chartType, setChartType] = useState("gauge");
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
      setChartType(initialConfig.chart_type || "gauge");
      setPeriod(initialConfig.period || "all");
      setViewBy(initialConfig.view_by || "none");
      setGroupId(initialConfig.group_id || null);
      setThreshold(initialConfig.threshold ?? "");
      setSize(initialConfig.size || "md");
    } else {
      setSelectedKey(null);
      setChartType("gauge"); setPeriod("all"); setViewBy("none");
      setGroupId(null); setThreshold(""); setSize("md");
    }
  }, [open, mode, initialConfig]);

  if (!open) return null;

  const selectedTile = allTiles.find(t => t.key === selectedKey);
  const availableTiles = mode === "edit" ? allTiles : allTiles.filter(t => !activeKeys.includes(t.key));

  const save = () => {
    if (!selectedKey) { setSection("kpi"); return; }
    onSave({
      key: selectedKey,
      chart_type: chartType,
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
              {SECTIONS.map(s => (
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
                <p className="text-sm text-gray-500 mb-3">Select the metric to display in this tile.</p>
                <div className="flex-1 overflow-y-auto space-y-2 pr-1" data-testid="kpi-option-list">
                  {availableTiles.map(t => {
                    const on = selectedKey === t.key;
                    return (
                      <button
                        type="button"
                        key={t.key}
                        onClick={() => setSelectedKey(t.key)}
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
                          <div className="text-xs text-gray-500 mt-0.5">{tileSubtitle(t, currency)}</div>
                        </span>
                      </button>
                    );
                  })}
                  {availableTiles.length === 0 && (
                    <div className="text-sm text-gray-400 text-center py-10">Every KPI is already on your dashboard.</div>
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
                  {CHART_TYPES.map(c => {
                    const on = chartType === c.value;
                    return (
                      <button type="button" key={c.value} onClick={() => setChartType(c.value)} data-testid={`chart-type-${c.value}`}
                        className={`w-full text-left flex items-center gap-3 border rounded-xl px-4 py-3 transition-colors ${on ? "bg-emerald-50 border-emerald-500" : "bg-white border-gray-200 hover:border-gray-300"}`}>
                        <span className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${on ? "border-emerald-600" : "border-gray-300"}`}>
                          {on && <span className="w-2 h-2 rounded-full bg-emerald-600" />}
                        </span>
                        <span>
                          <div className={`text-sm font-bold ${on ? "text-emerald-700" : "text-gray-900"}`}>{c.label}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{c.desc}</div>
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
                  When set, this tile's gauge turns red once it crosses the threshold, {selectedTile?.higher_better ? "if the value drops below it" : "if the value rises above it"}.
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
                  {SIZES.map(s => {
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
