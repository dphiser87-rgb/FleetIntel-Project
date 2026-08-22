import React, { useEffect, useMemo, useState } from "react";
import { api, API } from "@/lib/api";
import { toast } from "sonner";
import { UserPlus, Copy, Trash, PencilSimple, ArrowUp, ArrowDown, DownloadSimple, Prohibit } from "@phosphor-icons/react";
import { formatApiErrorDetail } from "@/lib/api";
import TeamMemberPanel from "@/components/TeamMemberPanel";

const ROLES = ["admin", "manager", "inspector", "mechanic"];

const roleColor = (r) => ({
  admin: "border-primary text-primary",
  manager: "border-[#FFCC00] text-[#FFCC00]",
  inspector: "border-[#3B82F6] text-[#3B82F6]",
  mechanic: "border-[#34C759] text-[#34C759]",
}[r] || "border-muted-foreground text-muted-foreground");

export default function Team() {
  const [ws, setWs] = useState(null);
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [renaming, setRenaming] = useState(false);
  const [wsName, setWsName] = useState("");
  const [invite, setInvite] = useState({ email: "", role: "manager" });
  const [moduleKeys, setModuleKeys] = useState([]);
  const [presets, setPresets] = useState({});
  const [vehicleGroups, setVehicleGroups] = useState([]);
  const [driverGroups, setDriverGroups] = useState([]);
  const [selected, setSelected] = useState(null);

  const [statusFilter, setStatusFilter] = useState("all");
  const [profileFilter, setProfileFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [selectedIds, setSelectedIds] = useState(new Set());

  const load = async () => {
    const { data } = await api.get("/workspace");
    setWs(data.workspace); setMembers(data.members); setInvites(data.invites);
    setWsName(data.workspace.name);
  };
  useEffect(() => {
    load();
    api.get("/permissions/presets").then((r) => { setModuleKeys(r.data.module_keys); setPresets(r.data.presets); });
    api.get("/vehicle-groups").then((r) => setVehicleGroups(r.data || [])).catch(() => {});
    api.get("/driver-groups").then((r) => setDriverGroups(r.data || [])).catch(() => {});
  }, []);

  const saveName = async () => {
    await api.patch("/workspace", { name: wsName });
    toast.success("Workspace renamed");
    setRenaming(false); load();
  };

  const sendInvite = async (e) => {
    e.preventDefault();
    try {
      await api.post("/workspace/invites", invite);
      toast.success(`Invite created for ${invite.email}`);
      setInvite({ email: "", role: "manager" });
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed");
    }
  };

  const revoke = async (id) => {
    await api.delete(`/workspace/invites/${id}`);
    toast.success("Invite revoked");
    load();
  };

  const inviteLink = (code) => `${window.location.origin}/register?invite=${code}`;
  const copyLink = (code) => {
    navigator.clipboard.writeText(inviteLink(code));
    toast.success("Invite link copied");
  };

  const toggleSort = (k) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  };

  const filtered = useMemo(() => {
    let list = members;
    if (statusFilter !== "all") list = list.filter((m) => (m.status || "active") === statusFilter);
    if (profileFilter !== "all") list = list.filter((m) => m.role === profileFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((m) => m.name?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q) || m.username?.toLowerCase().includes(q));
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => String(a[sortKey] || "").localeCompare(String(b[sortKey] || "")) * dir);
  }, [members, statusFilter, profileFilter, search, sortKey, sortDir]);

  const toggleSelect = (id) => setSelectedIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const bulkDeactivate = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Deactivate ${selectedIds.size} member(s)?`)) return;
    await Promise.all(Array.from(selectedIds).map((id) => api.post(`/users/${id}/deactivate`)));
    toast.success("Members deactivated");
    setSelectedIds(new Set());
    load();
  };

  const exportCsv = () => {
    const token = localStorage.getItem("token");
    window.open(`${API}/export/users.csv?token=${encodeURIComponent(token)}`, "_blank");
  };

  const SortTh = ({ label, k }) => (
    <th className="p-3 cursor-pointer hover:text-primary" onClick={() => toggleSort(k)}>
      <span className="flex items-center gap-1">{label}{sortKey === k && (sortDir === "asc" ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}</span>
    </th>
  );

  if (!ws) return <div className="p-12 text-muted-foreground">Loading…</div>;

  return (
    <div className="noise-bg min-h-screen">
      <header className="border-b border-border px-8 py-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="overline">Workspace</div>
          {renaming ? (
            <div className="flex items-center gap-2 mt-1">
              <input value={wsName} onChange={(e) => setWsName(e.target.value)} data-testid="ws-name-input"
                className="bg-[#121214] border border-border px-3 py-2 text-2xl font-display font-black focus:border-primary focus:outline-none" />
              <button onClick={saveName} data-testid="save-ws-name" className="bg-primary px-3 py-2 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90">Save</button>
              <button onClick={() => { setRenaming(false); setWsName(ws.name); }} className="border border-border px-3 py-2 text-xs uppercase tracking-widest">Cancel</button>
            </div>
          ) : (
            <h1 className="font-display font-black text-4xl tracking-tight mt-1 flex items-center gap-3" data-testid="team-title">
              {ws.name}
              <button onClick={() => setRenaming(true)} className="text-muted-foreground hover:text-primary" data-testid="rename-ws"><PencilSimple size={16} /></button>
            </h1>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="mono text-xs text-muted-foreground">
            {members.length} member{members.length !== 1 && "s"} · {invites.filter(i => !i.used_by).length} pending invite{invites.filter(i => !i.used_by).length !== 1 && "s"}
          </div>
          <div className="flex items-center gap-2 border border-border px-3 py-2">
            <label className="overline">Licence warning window</label>
            <input type="number" min="1" value={ws.license_warning_days ?? 30} data-testid="license-warning-days-input"
              onChange={async (e) => {
                const days = Number(e.target.value) || 30;
                setWs({ ...ws, license_warning_days: days });
                await api.patch("/workspace", { license_warning_days: days });
              }}
              className="w-14 bg-[#0b0b0d] border border-border px-2 py-1 text-sm mono focus:border-primary focus:outline-none" />
            <span className="text-xs text-muted-foreground">days</span>
          </div>
        </div>
      </header>

      <div className="p-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-[#121214] border border-border">
            <div className="border-b border-border p-4 flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="overline">Members</div>
                <h3 className="font-display text-xl font-bold mt-1">Team access</h3>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" data-testid="team-search"
                  className="bg-[#0b0b0d] border border-border px-2 py-1.5 text-xs focus:border-primary focus:outline-none" />
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} data-testid="team-status-filter" className="bg-[#0b0b0d] border border-border px-2 py-1.5 text-xs uppercase tracking-widest focus:border-primary focus:outline-none">
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
                <select value={profileFilter} onChange={(e) => setProfileFilter(e.target.value)} data-testid="team-profile-filter" className="bg-[#0b0b0d] border border-border px-2 py-1.5 text-xs uppercase tracking-widest focus:border-primary focus:outline-none">
                  <option value="all">All profiles</option>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                {selectedIds.size > 0 && (
                  <button onClick={bulkDeactivate} data-testid="bulk-deactivate" className="flex items-center gap-1 border border-border px-2 py-1.5 text-xs uppercase tracking-widest hover:border-primary hover:text-primary">
                    <Prohibit size={12} /> Deactivate ({selectedIds.size})
                  </button>
                )}
                <button onClick={exportCsv} data-testid="download-team-csv" className="flex items-center gap-1 border border-border px-2 py-1.5 text-xs uppercase tracking-widest hover:border-primary hover:text-primary">
                  <DownloadSimple size={12} /> Download
                </button>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr className="text-left overline">
                  <th className="p-3 w-8"></th>
                  <SortTh label="Name" k="name" />
                  <th className="p-3">Username</th>
                  <th className="p-3">Email</th>
                  <SortTh label="Profile" k="role" />
                  <th className="p-3">Active period</th>
                  <SortTh label="Status" k="status" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(m => (
                  <tr key={m.id} className="border-b border-border/50 hover:bg-[#141416] cursor-pointer" data-testid={`member-${m.email}`}>
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedIds.has(m.id)} onChange={() => toggleSelect(m.id)} />
                    </td>
                    <td className="p-3" onClick={() => setSelected(m)}>{m.name}</td>
                    <td className="p-3 text-muted-foreground mono text-xs" onClick={() => setSelected(m)}>{m.username || "—"}</td>
                    <td className="p-3 text-muted-foreground mono text-xs" onClick={() => setSelected(m)}>{m.email}</td>
                    <td className="p-3" onClick={() => setSelected(m)}><span className={`text-[10px] mono uppercase tracking-widest px-2 py-1 border ${roleColor(m.role)}`}>{m.role}</span></td>
                    <td className="p-3 text-xs text-muted-foreground" onClick={() => setSelected(m)}>{m.active_from || m.active_until ? `${m.active_from || "…"} → ${m.active_until || "…"}` : "Unlimited"}</td>
                    <td className="p-3" onClick={() => setSelected(m)}>
                      <span className={`text-[10px] mono uppercase tracking-widest px-2 py-1 border ${(m.status || "active") === "active" ? "border-[#34C759] text-[#34C759]" : "border-muted-foreground text-muted-foreground"}`}>{m.status || "active"}</span>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No members match these filters.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="bg-[#121214] border border-border">
            <div className="border-b border-border p-4 flex items-center justify-between">
              <div>
                <div className="overline">Pending & used</div>
                <h3 className="font-display text-xl font-bold mt-1">Invites</h3>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr className="text-left overline">
                  <th className="p-3">Email</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Link</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {invites.map(i => (
                  <tr key={i.id} className="border-b border-border/50" data-testid={`invite-${i.email}`}>
                    <td className="p-3">{i.email}</td>
                    <td className="p-3"><span className={`text-[10px] mono uppercase tracking-widest px-2 py-1 border ${roleColor(i.role)}`}>{i.role}</span></td>
                    <td className="p-3 text-xs">{i.used_by ? <span className="text-[#34C759]">Accepted</span> : <span className="text-[#FFCC00]">Pending</span>}</td>
                    <td className="p-3">
                      {!i.used_by && (
                        <button onClick={() => copyLink(i.code)} className="flex items-center gap-1 border border-border px-2 py-1 text-xs uppercase tracking-widest hover:border-primary hover:text-primary" data-testid={`copy-invite-${i.email}`}>
                          <Copy size={12} /> Copy link
                        </button>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      {!i.used_by && (
                        <button onClick={() => revoke(i.id)} className="text-muted-foreground hover:text-primary" data-testid={`revoke-${i.email}`}><Trash size={14} /></button>
                      )}
                    </td>
                  </tr>
                ))}
                {invites.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No invites yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-[#121214] border border-border p-6 self-start">
          <div className="flex items-center gap-2 mb-4">
            <UserPlus size={22} className="text-primary" />
            <div>
              <div className="overline">Add a teammate</div>
              <div className="font-display text-xl font-bold">New user</div>
            </div>
          </div>
          <form onSubmit={sendInvite} className="space-y-3" data-testid="invite-form">
            <div>
              <label className="overline block mb-2">Email</label>
              <input required type="email" value={invite.email} onChange={(e) => setInvite({...invite, email: e.target.value})}
                data-testid="invite-email"
                className="w-full bg-[#0b0b0d] border border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
            </div>
            <div>
              <label className="overline block mb-2">Profile</label>
              <select value={invite.role} onChange={(e) => setInvite({...invite, role: e.target.value})} data-testid="invite-role"
                className="w-full bg-[#0b0b0d] border border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none">
                {ROLES.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <button type="submit" data-testid="create-invite" className="w-full bg-primary text-primary-foreground py-2.5 text-xs uppercase tracking-widest hover:bg-primary/90">Create invite</button>
          </form>
          <div className="text-xs text-muted-foreground mt-4 border-t border-border pt-4">
            The invitee registers at <span className="mono">/register?invite=CODE</span> and joins <strong className="text-white">{ws.name}</strong> with the profile you pick — it pre-fills their System Rights.
          </div>
        </div>
      </div>

      <TeamMemberPanel member={selected} moduleKeys={moduleKeys} presets={presets}
        vehicleGroups={vehicleGroups} driverGroups={driverGroups}
        onClose={() => setSelected(null)} onChange={load} />
    </div>
  );
}
