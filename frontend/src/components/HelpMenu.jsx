import React from "react";
import { useNavigate } from "react-router-dom";
import { Question, Lifebuoy, Ticket, ClipboardText } from "@phosphor-icons/react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

// The three quick links from a small "?" icon, mirroring NotificationCenter's icon-in-the-sidebar-
// header position. NotificationCenter itself opens a full-height Sheet, but that's the wrong shape for
// three one-line links -- DropdownMenu (a shadcn primitive already in the codebase, just not yet wired
// up anywhere) is the closer fit, and its --popover CSS tokens are already dark-themed to match.
export default function HelpMenu() {
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          data-testid="help-menu-trigger"
          className="w-8 h-8 shrink-0 flex items-center justify-center text-muted-foreground hover:text-primary"
          aria-label="Help"
        >
          <Question size={18} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-[#121214] border-border text-foreground w-48">
        <DropdownMenuItem data-testid="help-menu-get-help" onClick={() => navigate("/help")} className="gap-2 cursor-pointer">
          <Lifebuoy size={15} /> Get Help
        </DropdownMenuItem>
        <DropdownMenuItem data-testid="help-menu-report-issue" onClick={() => navigate("/help/new")} className="gap-2 cursor-pointer">
          <ClipboardText size={15} /> Report an Issue
        </DropdownMenuItem>
        <DropdownMenuItem data-testid="help-menu-my-tickets" onClick={() => navigate("/help/tickets")} className="gap-2 cursor-pointer">
          <Ticket size={15} /> My Tickets
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
