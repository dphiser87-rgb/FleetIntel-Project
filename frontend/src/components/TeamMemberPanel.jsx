import React, { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Trash, Prohibit, Key, Copy, PencilSimple } from "@phosphor-icons/react";
import { ROLE_COLOR } from "@/lib/access";

const LEVELS = ["none", "read", "full"];
const LEVEL_LABEL = { none: "No access", read: "Read only", full: "Full access" };
const ACCOUNT_TYPES = ["business", "system"];
const FALLBACK_ROLES = ["admin", "manager", "inspector", "mechanic"];

const roleColor = (r) => ROLE_COLOR[r] || "border-muted-foreground text-muted-foreground";

const isLocked = (m) => m?.locked_until && new Date(m.locked_until) > new Date();

const scopeSummary = (groupIds, itemIds) => {
  const g = (groupIds || []).length, i = (itemIds || []).length;
  if (!g && !i) return "All";
  const parts = [];
  if (g) parts.push(`${g} group(s)`);
  if (i) parts.push(`${i} individual`);
  return parts.join(" + ");
};

const emptyPermissions = {
  modules: {}, vehicle_group_ids: [], vehicle_ids: [], asset_group_ids: [], asset_ids: [],
  driver_group_ids: [], trip_data_access: true, address_access: true,
};

const emptyForm = {
  name: "", username: "", email: "", company_department: "", cell: "", additional_info: "",
  role: "manager", active_from: "", active_until: "", account_type: "",
  permissions: emptyPermissions,
};

export default function TeamMemberPanel({ member, moduleKeys, presets, vehicleGroups, driverGroups, assetGroups, vehicles, assets, onClose, onChange }) {
  const [mode, setMode] = useState("view"); // view | edit
  const [tab, setTab] = useState("details");
  const [form, setForm] = useState(emptyForm);
  const [initialSnapshot, setInitialSnapshot] = useState("");
  const [timePeriod, setTimePeriod] = useState("unlimited"); // unlimited | temporary

  useEffect(() => {
    if (!member) return;
    setMode("view");
    setTab("details");
  }, [member]);

  const startEdit = () => {
    // Members created before System Rights existed have empty stored permissions — fall back to
    // their role's preset rather than showing an all-"no access" matrix.
    const hasStoredPerms = member.permissions?.modules && Object.keys(member.permissions.modules).length > 0;
    const perms = hasStoredPerms ? member.permissions : JSON.parse(JSON.stringify(presets[member.role] || emptyPermissions));
    const f = {
      name: member.name || "", username: member.username || "", email: member.email || "",
      company_department: member.company_department || "", cell: member.cell || "",
      additional_info: member.additional_info || "", role: member.role || "manager",
      active_from: member.active_from || "", active_until: member.active_until || "",
      account_type: member.account_type || "",
      permissions: perms,
    };
    setForm(f);
    setTimePeriod(member.active_from || member.active_until ? "temporary" : "unlimited");
    setInitialSnapshot(JSON.stringify(f));
    setMode("edit");
  };

  const applyProfile = (role) => {
    const preset = presets[role] || { modules: {} };
    setForm((f) => ({ ...f, role, permissions: JSON.parse(JSON.stringify(preset)) }));
  };

  const setModuleLevel = (key, level) => setForm((f) => ({ ...f, permissions: { ...f.permissions, modules: { ...f.permissions.modules, [key]: level } } }));
  const toggleScopeId = (field, id) => setForm((f) => {
    const cur = f.permissions[field] || [];
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    return { ...f, permissions: { ...f.permissions, [field]: next } };
  });

  const isDirty = () => JSON.stringify(form) !== initialSnapshot;
  const cancelEdit = () => {
    if (isDirty() && !window.confirm("You have unsaved changes. Discard them?")) return;
    setMode("view");
  };

  const save = async () => {
    if (!form.name.trim() || !form.username.trim() || !form.email.trim()) {
      toast.error("Name, username, and email are required");
      return;
    }
    try {
      await api.patch(`/users/${member.id}`, {
        name: form.name, username: form.username, company_department: form.company_department,
        cell: form.cell, additional_info: form.additional_info, role: form.role,
        active_from: timePeriod === "temporary" ? (form.active_from || null) : null,
        active_until: timePeriod === "temporary" ? (form.active_until || null) : null,
        account_type: form.role === "admin" ? (form.account_type || null) : null,
        permissions: form.permissions,
      });
      toast.success("Team member updated");
      setMode("view");
      onChange();
    } catch { toast.error("Failed to save"); }
  };

  const deactivate = async () => {
    if (!window.confirm(`Deactivate ${member.name}?`)) return;
    await api.post(`/users/${member.id}/deactivate`);
    toast.success("Deactivated");
    onChange();
  };
  const resetPassword = async () => {
    await api.post(`/users/${member.id}/reset-password`);
    toast.success("Password reset email sent");
  };
  const unlock = async () => {
    await api.post(`/users/${member.id}/unlock`);
    toast.success("Account unlocked");
    onChange();
  };
  const duplicate = async () => {
    await api.post(`/users/${member.id}/duplicate`);
    toast.success("Invite created with the same profile — check pending invites");
    onChange();
  };
  const remove = async () => {
    if (!window.confirm(`Remove ${member.name} from the workspace? This can't be undone.`)) return;
    try {
      await api.delete(`/users/${member.id}`);
      toast.success("Removed");
      onClose();
      onChange();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed to remove"); }
  };

  if (!member) return null;

  const effectivePermissions = (member.permissions?.modules && Object.keys(member.permissions.modules).length > 0)
    ? member.permissions
    : (presets[member.role] || emptyPermissions);

  return (
    <Sheet open={!!member} onOpenChange={(o) => !o && (mode === "edit" ? cancelEdit() : onClose())}>
      <SheetContent side="right" className="border-border bg-[#0b0b0d] w-full sm:max-w-xl flex flex-col overflow-hidden p-0" data-testid="team-member-panel">
        <SheetTitle className="sr-only">{member.name}</SheetTitle>
        <SheetDescription className="sr-only">Team member details and rights</SheetDescription>
        <div className="border-b border-border px-6 py-4 pr-14 shrink-0 flex items-center justify-between">
          <div>
            <div className="overline">{member.username || member.email}</div>
            <h2 className="font-display text-xl font-bold mt-0.5">{member.name}</h2>
          </div>
          {mode === "view" && (
            <button onClick={startEdit} data-testid="edit-member-btn" className="flex items-center gap-2 bg-primary px-3 py-2 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90">
              <PencilSimple size={14} /> Edit
            </button>
          )}
        </div>

        {mode === "view" ? (
          <div className="flex-1 overflow-y-auto flex flex-col">
            <div className="flex border-b border-border shrink-0">
              {[["details", "Details"], ["rights", "User Rights"]].map(([k, l]) => (
                <button key={k} onClick={() => setTab(k)} data-testid={`view-tab-${k}`}
                  className={`px-4 py-3 text-xs uppercase tracking-widest border-b-2 ${tab === k ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
                  {l}
                </button>
              ))}
            </div>
            <div className="p-6 space-y-4 flex-1">
              {tab === "details" ? (
                <>
                  {isLocked(member) && (
                    <div className="bg-[#2A0F0F] border border-[#FF3B30]/40 p-4 flex items-center justify-between" data-testid="locked-banner">
                      <div>
                        <div className="overline text-[#FF3B30]">Locked out</div>
                        <div className="text-sm mt-1">Too many failed login attempts — locked until {new Date(member.locked_until).toLocaleTimeString()}.</div>
                      </div>
                      <button onClick={unlock} data-testid="unlock-member" className="shrink-0 flex items-center gap-1 border border-[#FF3B30]/60 text-[#FF3B30] px-3 py-2 text-xs uppercase tracking-widest hover:bg-[#FF3B30]/10">
                        Unlock now
                      </button>
                    </div>
                  )}
                  <div className="bg-[#121214] border border-border p-4 grid grid-cols-2 gap-3">
                    {[["Name", member.name], ["Username", member.username || "—"], ["Email", member.email],
                      ["Company/department", member.company_department || "—"],
                      ["Status", member.status || "active"]].map(([l, v]) => (
                      <div key={l}><div className="overline">{l}</div><div className="text-sm mt-1">{v}</div></div>
                    ))}
                    <div className="col-span-2">
                      <div className="overline">Additional information</div>
                      <div className="text-sm mt-1 text-muted-foreground">{member.additional_info || "—"}</div>
                    </div>
                  </div>
                  <div className="bg-[#121214] border border-border p-4">
                    <div className="overline mb-1">Active time period</div>
                    <div className="text-sm">{member.active_from || member.active_until ? `${member.active_from || "…"} → ${member.active_until || "…"}` : "Unlimited"}</div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] mono uppercase tracking-widest px-2 py-1 border ${roleColor(member.role)}`}>{member.role}</span>
                  </div>
                  <div className="bg-[#121214] border border-border overflow-hidden">
                    <table className="w-full text-sm">
                      <tbody>
                        {moduleKeys.map((k) => (
                          <tr key={k} className="border-b border-border/50 last:border-b-0">
                            <td className="p-2 capitalize">{k.replace(/_/g, " ")}</td>
                            <td className="p-2 text-right text-xs uppercase text-muted-foreground">{LEVEL_LABEL[effectivePermissions.modules?.[k] || "none"]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-[#121214] border border-border p-3"><div className="overline">Trip data access</div><div className="mt-1">{effectivePermissions.trip_data_access ? "Allowed" : "Restricted"}</div></div>
                    <div className="bg-[#121214] border border-border p-3"><div className="overline">Address access</div><div className="mt-1">{effectivePermissions.address_access ? "Allowed" : "Restricted"}</div></div>
                    <div className="bg-[#121214] border border-border p-3">
                      <div className="overline">Vehicle scope</div>
                      <div className="mt-1">{scopeSummary(effectivePermissions.vehicle_group_ids, effectivePermissions.vehicle_ids)}</div>
                    </div>
                    <div className="bg-[#121214] border border-border p-3">
                      <div className="overline">Asset scope</div>
                      <div className="mt-1">{scopeSummary(effectivePermissions.asset_group_ids, effectivePermissions.asset_ids)}</div>
                    </div>
                    <div className="bg-[#121214] border border-border p-3 col-span-2"><div className="overline">Driver scope</div><div className="mt-1">{(effectivePermissions.driver_group_ids || []).length ? `${effectivePermissions.driver_group_ids.length} group(s)` : "All"}</div></div>
                  </div>
                </>
              )}
            </div>
            <div className="border-t border-border p-4 flex gap-2 flex-wrap shrink-0">
              <button onClick={deactivate} data-testid="deactivate-member" className="flex items-center gap-1 border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary"><Prohibit size={14} /> Deactivate</button>
              <button
                onClick={resetPassword}
                disabled={member.role === "admin"}
                title={member.role === "admin" ? "Admin password resets must go through the FleetIntel team directly" : undefined}
                data-testid="reset-password-member"
                className="flex items-center gap-1 border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:text-inherit"
              ><Key size={14} /> Reset password</button>
              <button onClick={duplicate} data-testid="duplicate-member" className="flex items-center gap-1 border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary"><Copy size={14} /> Duplicate</button>
              <button onClick={remove} data-testid="delete-member" className="flex items-center gap-1 border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary ml-auto"><Trash size={14} /> Delete</button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 flex overflow-hidden">
              <div className="w-[180px] shrink-0 border-r border-border py-4 px-3 overflow-y-auto">
                <div className="overline px-2 mb-2">Details</div>
                <button onClick={() => setTab("details")} className={`w-full text-left px-2 py-2 text-sm border-l-2 ${tab === "details" ? "border-primary text-primary bg-primary/10" : "border-transparent text-muted-foreground"}`}>User data</button>
                <div className="overline px-2 mb-2 mt-4">User Rights</div>
                <button onClick={() => setTab("rights")} className={`w-full text-left px-2 py-2 text-sm border-l-2 ${tab === "rights" ? "border-primary text-primary bg-primary/10" : "border-transparent text-muted-foreground"}`}>Permissions</button>
              </div>
              <div className="flex-1 p-6 space-y-4 overflow-y-auto">
              {tab === "details" ? (
                <>
                  <Field label="Name *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
                  <Field label="Username *" value={form.username} onChange={(v) => setForm({ ...form, username: v })} />
                  <Field label="Email *" value={form.email} onChange={() => {}} disabled />
                  <Field label="Company / department" value={form.company_department} onChange={(v) => setForm({ ...form, company_department: v })} />
                  <Field label="Cell" value={form.cell} onChange={(v) => setForm({ ...form, cell: v })} />
                  <div>
                    <label className="text-xs uppercase tracking-widest text-muted-foreground">Additional information</label>
                    <textarea rows={2} value={form.additional_info} onChange={(e) => setForm({ ...form, additional_info: e.target.value })}
                      className="w-full mt-1 bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-widest text-muted-foreground mb-1.5 block">Active time period</label>
                    <div className="flex gap-2 mb-2">
                      {["unlimited", "temporary"].map((v) => (
                        <button key={v} onClick={() => setTimePeriod(v)} className={`px-3 py-1.5 text-xs uppercase tracking-widest border ${timePeriod === v ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground"}`}>{v}</button>
                      ))}
                    </div>
                    {timePeriod === "temporary" && (
                      <div className="grid grid-cols-2 gap-2">
                        <input type="date" value={form.active_from} onChange={(e) => setForm({ ...form, active_from: e.target.value })} className="bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                        <input type="date" value={form.active_until} onChange={(e) => setForm({ ...form, active_until: e.target.value })} className="bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                      </div>
                    )}
                  </div>
                  {form.role === "admin" && (
                    <div>
                      <label className="text-xs uppercase tracking-widest text-muted-foreground mb-1.5 block">Account type</label>
                      <select value={form.account_type} onChange={(e) => setForm({ ...form, account_type: e.target.value })} data-testid="account-type-select"
                        className="w-full bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
                        <option value="">Unset</option>
                        {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="text-xs text-muted-foreground bg-primary/5 border border-primary/20 px-3 py-2">
                    Choosing a profile pre-fills recommended rights, which you can then narrow — for security, revoke rights from a profile rather than add to it.
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-widest text-muted-foreground mb-1.5 block">Profile</label>
                    <select value={form.role} onChange={(e) => applyProfile(e.target.value)} data-testid="profile-select"
                      className="w-full bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
                      {(Object.keys(presets).length ? Object.keys(presets) : FALLBACK_ROLES).map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-widest text-muted-foreground mb-1.5 block">System rights</label>
                    <div className="border border-border overflow-hidden">
                      {moduleKeys.map((k) => (
                        <div key={k} className="flex items-center justify-between px-3 py-2 border-b border-border/50 last:border-b-0" data-testid={`module-${k}`}>
                          <span className="text-sm capitalize">{k.replace(/_/g, " ")}</span>
                          <select value={form.permissions.modules?.[k] || "none"} onChange={(e) => setModuleLevel(k, e.target.value)}
                            className="bg-[#0b0b0d] border border-border px-2 py-1 text-xs uppercase focus:border-primary focus:outline-none">
                            {LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex items-center gap-2 text-sm bg-[#121214] border border-border p-3">
                      <input type="checkbox" checked={form.permissions.trip_data_access} onChange={(e) => setForm({ ...form, permissions: { ...form.permissions, trip_data_access: e.target.checked } })} />
                      Trip data access
                    </label>
                    <label className="flex items-center gap-2 text-sm bg-[#121214] border border-border p-3">
                      <input type="checkbox" checked={form.permissions.address_access} onChange={(e) => setForm({ ...form, permissions: { ...form.permissions, address_access: e.target.checked } })} />
                      Address access
                    </label>
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-widest text-muted-foreground mb-1.5 block">Vehicle groups (empty = all)</label>
                    <div className="flex flex-wrap gap-2">
                      {vehicleGroups.map((g) => (
                        <button key={g.id} onClick={() => toggleScopeId("vehicle_group_ids", g.id)}
                          className={`px-2 py-1 text-xs border flex items-center gap-1 ${form.permissions.vehicle_group_ids?.includes(g.id) ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground"}`}>
                          <span className="w-2 h-2 rounded-sm" style={{ background: g.color || "#636366" }} /> {g.name}
                        </button>
                      ))}
                      {vehicleGroups.length === 0 && <span className="text-xs text-muted-foreground">No vehicle groups yet.</span>}
                    </div>
                  </div>
                  <ItemScopePicker label="Individual vehicles (in addition to groups above)" items={vehicles}
                    labelKey="name" subKey="plate" selected={form.permissions.vehicle_ids || []}
                    onToggle={(id) => toggleScopeId("vehicle_ids", id)} testId="vehicle-scope" />
                  <div>
                    <label className="text-xs uppercase tracking-widest text-muted-foreground mb-1.5 block">Asset groups (empty = all)</label>
                    <div className="flex flex-wrap gap-2">
                      {assetGroups.map((g) => (
                        <button key={g.id} onClick={() => toggleScopeId("asset_group_ids", g.id)}
                          className={`px-2 py-1 text-xs border flex items-center gap-1 ${form.permissions.asset_group_ids?.includes(g.id) ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground"}`}>
                          <span className="w-2 h-2 rounded-sm" style={{ background: g.color || "#636366" }} /> {g.name}
                        </button>
                      ))}
                      {assetGroups.length === 0 && <span className="text-xs text-muted-foreground">No asset groups yet.</span>}
                    </div>
                  </div>
                  <ItemScopePicker label="Individual assets (in addition to groups above)" items={assets}
                    labelKey="name" subKey="kind" selected={form.permissions.asset_ids || []}
                    onToggle={(id) => toggleScopeId("asset_ids", id)} testId="asset-scope" />
                  <div>
                    <label className="text-xs uppercase tracking-widest text-muted-foreground mb-1.5 block">Driver access (empty = all)</label>
                    <div className="flex flex-wrap gap-2">
                      {driverGroups.map((g) => (
                        <button key={g.id} onClick={() => toggleScopeId("driver_group_ids", g.id)}
                          className={`px-2 py-1 text-xs border flex items-center gap-1 ${form.permissions.driver_group_ids?.includes(g.id) ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground"}`}>
                          <span className="w-2 h-2 rounded-sm" style={{ background: g.color || "#636366" }} /> {g.name}
                        </button>
                      ))}
                      {driverGroups.length === 0 && <span className="text-xs text-muted-foreground">No driver groups yet.</span>}
                    </div>
                  </div>
                </>
              )}
              </div>
            </div>
            <div className="border-t border-border p-4 flex gap-2 shrink-0">
              <button onClick={save} data-testid="save-member" className="bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90">Save</button>
              <button onClick={cancelEdit} className="border border-border px-4 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary">Cancel</button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ItemScopePicker({ label, items, labelKey, subKey, selected, onToggle, testId }) {
  const [q, setQ] = useState("");
  const filtered = q ? items.filter((it) => (it[labelKey] || "").toLowerCase().includes(q.toLowerCase())) : items;
  return (
    <div>
      <label className="text-xs uppercase tracking-widest text-muted-foreground mb-1.5 block">{label}</label>
      {items.length > 8 && (
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" data-testid={`${testId}-search`}
          className="w-full mb-1.5 bg-[#121214] border border-border px-3 py-1.5 text-xs focus:border-primary focus:outline-none" />
      )}
      <div className="max-h-40 overflow-y-auto border border-border divide-y divide-border/50">
        {filtered.map((it) => (
          <label key={it.id} className="flex items-center gap-2 text-sm px-3 py-1.5 cursor-pointer hover:bg-[#141416]" data-testid={`${testId}-${it.id}`}>
            <input type="checkbox" checked={selected.includes(it.id)} onChange={() => onToggle(it.id)} />
            <span className="truncate">{it[labelKey]}</span>
            {it[subKey] && <span className="text-xs text-muted-foreground ml-auto shrink-0">{it[subKey]}</span>}
          </label>
        ))}
        {filtered.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">None found.</div>}
      </div>
      {selected.length > 0 && <div className="text-xs text-muted-foreground mt-1">{selected.length} selected</div>}
    </div>
  );
}

function Field({ label, value, onChange, disabled }) {
  return (
    <div>
      <label className="text-xs uppercase tracking-widest text-muted-foreground">{label}</label>
      <input value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
        className="w-full mt-1 bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none disabled:opacity-50" />
    </div>
  );
}
