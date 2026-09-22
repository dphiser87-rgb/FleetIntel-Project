import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, BookOpen } from "@phosphor-icons/react";

// V1 placeholder per spec's non-goals -- no knowledge base content system yet.
export default function HelpCentre() {
  const navigate = useNavigate();
  return (
    <div className="p-8 max-w-2xl">
      <button onClick={() => navigate("/help")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-white mb-6">
        <ArrowLeft size={15} /> Help
      </button>
      <div className="bg-[#121214] border border-border p-10 text-center">
        <BookOpen size={32} className="text-primary mx-auto" />
        <h1 className="font-display text-xl font-bold mt-4">Help Centre is coming soon</h1>
        <p className="text-sm text-muted-foreground mt-2">Guides and common questions will live here. For now, create a support ticket and we'll help directly.</p>
        <button onClick={() => navigate("/help/new")} className="mt-6 bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:bg-primary/90">
          Create Support Ticket
        </button>
      </div>
    </div>
  );
}
