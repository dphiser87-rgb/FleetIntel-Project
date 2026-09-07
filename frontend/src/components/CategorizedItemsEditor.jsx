import React, { useMemo, useRef, useState } from "react";
import { Plus, Trash, CaretUp, CaretDown } from "@phosphor-icons/react";
import ToggleSwitch from "@/components/ToggleSwitch";

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const CATEGORIES = [
  { key: "interior", label: "Interiors", sectionTitle: "Interiors Cab Checks" },
  { key: "exterior", label: "Exteriors", sectionTitle: "Exteriors" },
  { key: "trailer", label: "Trailer", sectionTitle: "Trailer" },
];

// Preset pool per category — toggling one on writes a real ChecklistItem into the template;
// toggling off removes it. Matches the source spec's preset list (icons are emoji defaults,
// replaceable per-item by uploading a real image).
const PRESET_ITEMS = {
  interior: [
    ["Mirrors", "🪞"], ["Wipers", "⬡"], ["Windscreen wiper system", "💧"], ["Steering", "⭕"],
    ["Horn", "📢"], ["Park brake", "🅿️"], ["Warning lamps / MIL", "⚠️"], ["Seat belts", "🔗"],
    ["Air conditioner", "❄️"], ["Speedometer", "📊"], ["GPS / Navigation", "🗺️"],
    ["Fire extinguisher", "🔴"], ["First aid kit", "➕"], ["Vehicle documents", "📄"],
  ],
  exterior: [
    ["Engine oil", "🛢️"], ["Coolant level", "🌡️"], ["Power steering fluid", "💧"], ["Brake fluid", "🔵"],
    ["Fuel", "⛽"], ["Wheel rim & nuts", "⚙️"], ["Tyres", "⭕"], ["Tyre pressure", "💨"],
    ["Head / stop lights", "💡"], ["Tail / dash lights", "🔴"], ["Indicators", "🟡"], ["Reverse lights", "⬜"],
    ["Body exterior", "🚛"], ["Windscreen chips / cracks", "🔲"], ["Exterior mirrors", "🪞"],
  ],
  trailer: [
    ["Coupling / fifth wheel", "🔗"], ["Trailer lights", "💡"], ["Trailer tyres", "⭕"], ["Trailer body", "📦"],
    ["Load securing", "⛓️"], ["Trailer brakes", "⛔"], ["Reflectors", "🔆"], ["Trailer doors / seals", "🚪"],
  ],
};

export default function CategorizedItemsEditor({ sections, onChange }) {
  const [activeCat, setActiveCat] = useState("interior");
  const [revealedCats, setRevealedCats] = useState(() => new Set());
  const [customLabel, setCustomLabel] = useState("");
  const fileInputRef = useRef(null);
  const uploadTargetRef = useRef(null);

  const itemsByCategory = useMemo(() => {
    const map = { interior: [], exterior: [], trailer: [] };
    for (const sec of sections) {
      for (const item of sec.items || []) {
        if (item.category && map[item.category]) map[item.category].push(item);
      }
    }
    return map;
  }, [sections]);

  // Rows that have appeared in this editing session stay visible even after being toggled off —
  // only ever grows, so switching a preset off never yanks it out from under the person clicking it.
  // Seeded once from whichever presets are actually enabled at mount (matches the source app's
  // "hide never-touched presets by default" declutter behaviour on first load).
  const [visibleByCategory, setVisibleByCategory] = useState(() => ({
    interior: new Set(itemsByCategory.interior.map((i) => i.label)),
    exterior: new Set(itemsByCategory.exterior.map((i) => i.label)),
    trailer: new Set(itemsByCategory.trailer.map((i) => i.label)),
  }));
  const revealAll = (category) => {
    setVisibleByCategory((v) => ({ ...v, [category]: new Set(PRESET_ITEMS[category].map(([label]) => label)) }));
  };

  const commit = (next) => {
    const newSections = CATEGORIES
      .filter((c) => next[c.key].length > 0)
      .map((c) => ({ id: uid(), title: c.sectionTitle, items: next[c.key] }));
    // Any section holding uncategorized items is left untouched — shouldn't occur once a template
    // is fully migrated to this editor, but keeps this safe on partially-migrated data.
    const legacySections = sections.filter((sec) => (sec.items || []).some((i) => !i.category));
    onChange([...newSections, ...legacySections]);
  };

  const togglePreset = (category, label, icon) => {
    const current = itemsByCategory[category];
    const existing = current.find((i) => i.label === label);
    const next = {
      ...itemsByCategory,
      [category]: existing
        ? current.filter((i) => i.id !== existing.id)
        : [...current, { id: uid(), label, type: "boolean", required: true, photo_required: false, category, icon }],
    };
    commit(next);
  };

  const removeCustom = (category, itemId) => {
    commit({ ...itemsByCategory, [category]: itemsByCategory[category].filter((i) => i.id !== itemId) });
  };

  const addCustom = (category, label) => {
    if (!label.trim()) return;
    commit({
      ...itemsByCategory,
      [category]: [...itemsByCategory[category], { id: uid(), label: label.trim(), type: "boolean", required: true, photo_required: false, category, icon: "✏️" }],
    });
  };

  const move = (category, itemId, dir) => {
    const arr = [...itemsByCategory[category]];
    const idx = arr.findIndex((i) => i.id === itemId);
    const swap = idx + dir;
    if (swap < 0 || swap >= arr.length) return;
    [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
    commit({ ...itemsByCategory, [category]: arr });
  };

  const setIconById = (category, itemId, icon) => {
    commit({ ...itemsByCategory, [category]: itemsByCategory[category].map((i) => (i.id === itemId ? { ...i, icon } : i)) });
  };

  // Uploading an icon for a preset that isn't enabled yet implicitly enables it with that icon —
  // customizing an item's picture only makes sense once it's actually part of the template.
  const setIconByLabel = (category, label, icon) => {
    const current = itemsByCategory[category];
    const existing = current.find((i) => i.label === label);
    const next = existing
      ? current.map((i) => (i.id === existing.id ? { ...i, icon } : i))
      : [...current, { id: uid(), label, type: "boolean", required: true, photo_required: false, category, icon }];
    commit({ ...itemsByCategory, [category]: next });
  };

  const openUpload = (category, target) => {
    uploadTargetRef.current = { category, ...target };
    fileInputRef.current?.click();
  };

  const onFileChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !uploadTargetRef.current) return;
    const { category, itemId, label } = uploadTargetRef.current;
    const reader = new FileReader();
    reader.onload = () => (itemId ? setIconById(category, itemId, reader.result) : setIconByLabel(category, label, reader.result));
    reader.readAsDataURL(file);
  };

  const preset = PRESET_ITEMS[activeCat];
  const enabledItems = itemsByCategory[activeCat];
  const customItems = enabledItems.filter((i) => !preset.some(([label]) => label === i.label));
  const visible = visibleByCategory[activeCat];
  const presetRows = preset.filter(([label]) => visible.has(label));
  const activeMeta = CATEGORIES.find((c) => c.key === activeCat);

  return (
    <div data-testid="categorized-items-editor">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} data-testid="item-icon-upload" />

      <div className="flex items-center gap-1 mb-4 border-b border-border">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => setActiveCat(c.key)}
            data-testid={`items-cat-${c.key}`}
            className={`px-3 py-2 text-xs uppercase tracking-widest font-semibold border-b-2 -mb-px ${
              activeCat === c.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {c.label} ({itemsByCategory[c.key].length})
          </button>
        ))}
      </div>

      <label className="flex items-center gap-2 mb-4 cursor-pointer text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={revealedCats.has(activeCat)}
          onChange={(e) => {
            const checked = e.target.checked;
            setRevealedCats((s) => { const next = new Set(s); checked ? next.add(activeCat) : next.delete(activeCat); return next; });
            if (checked) revealAll(activeCat);
          }}
          data-testid="show-disabled-items"
        />
        Show disabled items
      </label>

      <div className="border border-border">
        <div className="grid grid-cols-[40px_1fr_auto] gap-3 px-3 py-2 border-b border-border overline">
          <span>Icon</span><span>Item</span><span />
        </div>

        {presetRows.map(([label, defaultIcon]) => {
          const item = enabledItems.find((i) => i.label === label);
          const on = !!item;
          return (
            <div key={label} className="grid grid-cols-[40px_1fr_auto] gap-3 px-3 py-2.5 border-b border-border/50 items-center" data-testid={`item-row-${label}`}>
              <button type="button" onClick={() => openUpload(activeCat, { label })} className="w-8 h-8 flex items-center justify-center text-lg shrink-0" title="Click to upload an image">
                {item?.icon?.startsWith("data:") ? <img src={item.icon} alt="" className="w-8 h-8 object-cover rounded-full" /> : (item?.icon || defaultIcon)}
              </button>
              <div className="flex items-center gap-2 text-sm">
                <span>{label}</span>
                {on && (
                  <span className="flex flex-col -my-1 opacity-60 hover:opacity-100">
                    <button type="button" onClick={() => move(activeCat, item.id, -1)} className="text-muted-foreground hover:text-primary" data-testid={`move-up-${label}`}><CaretUp size={10} /></button>
                    <button type="button" onClick={() => move(activeCat, item.id, 1)} className="text-muted-foreground hover:text-primary" data-testid={`move-down-${label}`}><CaretDown size={10} /></button>
                  </span>
                )}
              </div>
              <ToggleSwitch on={on} onClick={() => togglePreset(activeCat, label, defaultIcon)} testId={`toggle-${label}`} />
            </div>
          );
        })}

        {customItems.map((item) => (
          <div key={item.id} className="grid grid-cols-[40px_1fr_auto] gap-3 px-3 py-2.5 border-b border-border/50 items-center" data-testid={`item-row-${item.id}`}>
            <button type="button" onClick={() => openUpload(activeCat, { itemId: item.id })} className="w-8 h-8 flex items-center justify-center text-lg shrink-0" title="Click to upload an image">
              {item.icon?.startsWith("data:") ? <img src={item.icon} alt="" className="w-8 h-8 object-cover rounded-full" /> : (item.icon || "✏️")}
            </button>
            <div className="flex items-center gap-2 text-sm">
              <span>{item.label}</span>
              <span className="flex flex-col -my-1 opacity-60 hover:opacity-100">
                <button type="button" onClick={() => move(activeCat, item.id, -1)} className="text-muted-foreground hover:text-primary"><CaretUp size={10} /></button>
                <button type="button" onClick={() => move(activeCat, item.id, 1)} className="text-muted-foreground hover:text-primary"><CaretDown size={10} /></button>
              </span>
            </div>
            <button type="button" onClick={() => removeCustom(activeCat, item.id)} className="text-muted-foreground hover:text-primary" data-testid={`remove-custom-${item.id}`}><Trash size={14} /></button>
          </div>
        ))}

        {presetRows.length === 0 && customItems.length === 0 && (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">No items yet.</div>
        )}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); addCustom(activeCat, customLabel); setCustomLabel(""); }} className="flex gap-2 mt-3">
        <input value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder={`Add ${activeMeta.label.toLowerCase()} item…`}
          data-testid="custom-item-input"
          className="flex-1 px-3 py-2 text-sm bg-[#0b0b0d] border border-border focus:border-primary focus:outline-none" />
        <button type="submit" data-testid="add-custom-item" className="flex items-center gap-1 px-3 py-2 text-xs uppercase tracking-widest font-semibold border border-border hover:border-primary hover:text-primary">
          <Plus size={14} /> Add {activeMeta.label.toLowerCase()} item
        </button>
      </form>
    </div>
  );
}
