import React from "react";
import { useNavigate } from "react-router-dom";
import { Plus, ClipboardText, Ticket, BookOpen, CaretRight } from "@phosphor-icons/react";

const TILES = [
  { to: "/help/new", icon: ClipboardText, title: "Create Support Ticket", body: "Report a new problem or request assistance." },
  { to: "/help/tickets", icon: Ticket, title: "My Tickets", body: "View existing and previous support requests." },
  { to: "/help/centre", icon: BookOpen, title: "Help Centre", body: "Access guides and common questions." },
];

export default function Help() {
  const navigate = useNavigate();
  return (
    <div className="p-8 max-w-5xl">
      <h1 className="font-display text-3xl font-black tracking-tight">FleetIntel Help</h1>
      <p className="text-muted-foreground mt-1">How can we help?</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
        {TILES.map((t) => (
          <button
            key={t.to}
            onClick={() => navigate(t.to)}
            data-testid={`help-tile-${t.to.split("/").pop()}`}
            className="bg-[#121214] border border-border p-6 text-left hover:border-primary transition-colors group"
          >
            <t.icon size={24} className="text-primary" />
            <div className="font-display font-bold text-lg mt-4 flex items-center justify-between">
              {t.title}
              <CaretRight size={16} className="text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <div className="text-sm text-muted-foreground mt-1">{t.body}</div>
          </button>
        ))}
      </div>

      <button
        onClick={() => navigate("/help/new")}
        data-testid="help-create-ticket-cta"
        className="mt-8 bg-primary text-primary-foreground px-5 py-3 text-sm font-semibold flex items-center gap-2 hover:bg-primary/90"
      >
        <Plus size={16} weight="bold" /> Create Support Ticket
      </button>
    </div>
  );
}
