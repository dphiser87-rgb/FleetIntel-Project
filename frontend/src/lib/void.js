import { api } from "@/lib/api";
import { toast } from "sonner";

// Records with history are never deleted: a wrong entry is voided. It stays on record with who voided
// it, when and why, and every total leaves it out. Returns true when the record was voided.
export async function voidRecord(path, what) {
  const reason = window.prompt(`Void this ${what}? It stays on record, marked as voided, and leaves every total.\n\nReason:`);
  if (reason === null) return false;
  if (reason.trim().length < 3) {
    toast.error("Give a reason of at least 3 characters");
    return false;
  }
  try {
    await api.post(path, { reason: reason.trim() });
    toast.success(`${what[0].toUpperCase()}${what.slice(1)} voided`);
    return true;
  } catch (e) {
    toast.error(e.response?.data?.detail || `Couldn't void the ${what}`);
    return false;
  }
}

// How a voided record reads wherever it's listed.
export const voidedLabel = (r) => (r?.voided_at ? `Voided${r.void_reason ? ` · ${r.void_reason}` : ""}` : "");
