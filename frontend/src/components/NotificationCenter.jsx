import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Bell } from "@phosphor-icons/react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

const timeAgo = (iso) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export default function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const navigate = useNavigate();

  const load = () => api.get("/notifications").then((r) => setItems(r.data || [])).catch(() => {});
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const unread = items.filter((n) => !n.read).length;

  const view = async (n) => {
    if (!n.read) {
      await api.post(`/notifications/${n.id}/read`).catch(() => {});
      load();
    }
    setOpen(false);
    if (n.related_maintenance_id) navigate(`/maintenance?job=${n.related_maintenance_id}`);
    else if (n.related_ticket_id) navigate(`/help/tickets/${n.related_ticket_id}`);
  };

  const markAllRead = async () => {
    await api.post("/notifications/read-all").catch(() => {});
    load();
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        data-testid="notification-bell"
        className="relative w-8 h-8 shrink-0 flex items-center justify-center text-muted-foreground hover:text-primary"
        aria-label="Notifications"
      >
        <Bell size={18} weight={unread > 0 ? "fill" : "regular"} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-primary text-primary-foreground text-[9px] mono font-bold rounded-full flex items-center justify-center" data-testid="notification-badge">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="border-border bg-[#0b0b0d] w-full sm:max-w-md flex flex-col" data-testid="notification-center">
          <SheetHeader>
            <SheetTitle className="font-display text-2xl">Notifications</SheetTitle>
            <SheetDescription>Approval and workflow updates for your account.</SheetDescription>
          </SheetHeader>
          {unread > 0 && (
            <button onClick={markAllRead} className="self-start text-xs text-primary hover:underline mt-2" data-testid="mark-all-read">
              Mark all read
            </button>
          )}
          <div className="mt-4 flex-1 overflow-y-auto space-y-2 pr-1">
            {items.length === 0 && <div className="text-sm text-muted-foreground text-center py-12">No notifications yet.</div>}
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => view(n)}
                data-testid={`notification-${n.id}`}
                className={`w-full text-left border p-3 transition-colors ${n.read ? "border-border/60 text-muted-foreground" : "border-primary/40 bg-primary/5"}`}
              >
                <div className="text-sm">{n.message}</div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">{timeAgo(n.created_at)}</div>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
