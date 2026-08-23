import React, { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Trash, Prohibit, Key, Copy, PencilSimple } from "@phosphor-icons/react";

const ROLES = ["admin", "manager", "inspector", "mechanic"];
const LEVELS = ["none", "read", "full"];
const LEVEL_LABEL = { none: "No access", read: "Read only", full: "Full access" };

const roleColor = (r) => ({
  admin: "border-primary text-primary",
  manager: "border-[#FFCC00] text-[#FFCC00]",
  inspector: "border-[#3B82F6] text-[#3B82F6]",
  mechanic: "border-[#34C759] text-[#34C759]",
}[r] || "border-muted-foreground text-muted-foreground");

const emptyForm = {
  name: "", username: "", email: "", company_department: "", cell: "", additional_info: "",
  role: "manager", active_from: "", active_until: "",
  permissions: { modules: {}, vehicle_group_ids: [], driver_group_ids: [], trip_data_access: true, address_access: true },
};

export default function TeamMemberPanel({ member, moduleKeys, presets, vehicleGroups, driverGroups, onClose, onChange }) {
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
    const perms = hasStoredPerms ? member.permissions : JSON.parse(JSON.stringify(presets[member.role] || { modules: {}, vehicle_group_ids: [], driver_group_ids: [], trip_data_access: true, address_access: true }));
    const f = {
      name: member.name || "", username: member.username || "", email: member.email || "",
      company_department: member.company_department || "", cell: member.cell || "",
      additional_info: member.additional_info || "", role: member.role || "manager",
      active_from: member.active_from || "", active_until: member.active_until || "",
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
    : (presets[member.role] || { modules: {}, vehicle_group_ids: [], driver_group_ids: [], trip_data_access: true, address_access: true });

  return (
    <Sheet open={!!member} onOpenChange={(o) => !o && (mode === "edit" ? cancelEdit() : onClose())}>
      <SheetContent side="right" className="border-border bg-[#0b0b0d] w-full sm:max-w-xl flex flex-col overflow-hidden p-0" data-testid="team-member-panel">
        <SheetTitle className="sr-only">{member.name}</SheetTitle>
        <SheetDescription className="sr-only">Team member details and rights</SheetDescription>
        <div className="border-b border-border px-6 py-4 shrink-0 flex items-center justify-between">
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
                    <div className="bg-[#121214] border border-border p-3"><div className="overline">Vehicle/asset scope</div><div className="mt-1">{(effectivePermissions.vehicle_group_ids || []).length ? `${effectivePermissions.vehicle_group_ids.length} group(s)` : "All"}</div></div>
                    <div className="bg-[#121214] border border-border p-3"><div className="overline">Driver scope</div><div className="mt-1">{(effectivePermissions.driver_group_ids || []).length ? `${effectivePermissions.driver_group_ids.length} group(s)` : "All"}</div></div>
                  </div>
                </>
              )}
            </div>
            <div className="border-t border-border p-4 flex gap-2 flex-wrap shrink-0">
              <button onClick={deactivate} data-testid="deactivate-member" className="flex items-center gap-1 border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary"><Prohibit size={14} /> Deactivate</button>
              <button onClick={resetPassword} data-testid="reset-password-member" className="flex items-center gap-1 border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary"><Key size={14} /> Reset password</button>
              <button onClick={duplicate} data-testid="duplicate-member" className="flex items-center gap-1 border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary"><Copy size={14} /> Duplicate</button>
              <button onClick={remove} data-testid="delete-member" className="flex items-center gap-1 border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary ml-auto"><Trash size={14} /> Delete</button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto flex">
            <div className="w-[180px] shrink-0 border-r border-border py-4 px-3">
              <div className="overline px-2 mb-2">Details</div>
              <button onClick={() => setTab("details")} className={`w-full text-left px-2 py-2 text-sm border-l-2 ${tab === "details" ? "border-primary text-primary bg-primary/10" : "border-transparent text-muted-foreground"}`}>User data</button>
              <div className="overline px-2 mb-2 mt-4">User Rights</div>
              <button onClick={() => setTab("rights")} className={`w-full text-left px-2 py-2 text-sm border-l-2 ${tab === "rights" ? "border-primary text-primary bg-primary/10" : "border-transparent text-muted-foreground"}`}>Permissions</button>
            </div>
            <div className="flex-1 p-6 space-y-4">
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
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
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
                    <label className="text-xs uppercase tracking-widest text-muted-foreground mb-1.5 block">Vehicle & asset access (empty = all)</label>
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
              <div className="flex gap-2 pt-4 border-t border-border">
                <button onClick={save} data-testid="save-member" className="bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90">Save</button>
                <button onClick={cancelEdit} className="border border-border px-4 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary">Cancel</button>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
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
