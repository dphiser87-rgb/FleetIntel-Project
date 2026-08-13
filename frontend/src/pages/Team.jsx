import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { UserPlus, Copy, Trash, PencilSimple } from "@phosphor-icons/react";
import { formatApiErrorDetail } from "@/lib/api";

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

  const load = async () => {
    const { data } = await api.get("/workspace");
    setWs(data.workspace); setMembers(data.members); setInvites(data.invites);
    setWsName(data.workspace.name);
  };
  useEffect(() => { load(); }, []);

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
        <div className="mono text-xs text-muted-foreground">
          {members.length} member{members.length !== 1 && "s"} · {invites.filter(i => !i.used_by).length} pending invite{invites.filter(i => !i.used_by).length !== 1 && "s"}
        </div>
      </header>

      <div className="p-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-[#121214] border border-border">
            <div className="border-b border-border p-4">
              <div className="overline">Members</div>
              <h3 className="font-display text-xl font-bold mt-1">Team access</h3>
            </div>
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr className="text-left overline">
                  <th className="p-3">Name</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Joined</th>
                </tr>
              </thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.id} className="border-b border-border/50 hover:bg-[#141416]" data-testid={`member-${m.email}`}>
                    <td className="p-3">{m.name}</td>
                    <td className="p-3 text-muted-foreground mono text-xs">{m.email}</td>
                    <td className="p-3"><span className={`text-[10px] mono uppercase tracking-widest px-2 py-1 border ${roleColor(m.role)}`}>{m.role}</span></td>
                    <td className="p-3 text-xs text-muted-foreground">{new Date(m.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
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
              <div className="font-display text-xl font-bold">Invite by email</div>
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
              <label className="overline block mb-2">Role</label>
              <select value={invite.role} onChange={(e) => setInvite({...invite, role: e.target.value})} data-testid="invite-role"
                className="w-full bg-[#0b0b0d] border border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none">
                {ROLES.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <button type="submit" data-testid="create-invite" className="w-full bg-primary text-primary-foreground py-2.5 text-xs uppercase tracking-widest hover:bg-primary/90">Create invite</button>
          </form>
          <div className="text-xs text-muted-foreground mt-4 border-t border-border pt-4">
            The invitee registers at <span className="mono">/register?invite=CODE</span> and joins <strong className="text-white">{ws.name}</strong> with the role you pick.
          </div>
        </div>
      </div>
    </div>
  );
}
