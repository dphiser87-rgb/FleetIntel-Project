-- Parts requisition + approval workflow, and a payment lifecycle on Purchase Orders.
--
-- Design agreed with the user across two sessions: a technician (mechanic) requests parts against a
-- specific maintenance job; the request always goes to the Workshop Manager for approval regardless of
-- stock availability (an operational check-and-balance, not just a money-gate); whatever's in stock
-- deducts immediately and its cost attributes to the job; whatever's short escalates into the existing
-- quote -> Ops -> Finance -> PO chain, since money now has to leave the company. Job completion stays
-- fully independent of all of this the whole time.
--
-- `items`/`decision` follow the exact jsonb shapes already used by quotes.items/quotes.ops_decision — one
-- header row per submission (a "cart" of parts), not a child table, matching this codebase's convention.
create table parts_requisitions (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references workspaces(id) on delete cascade,
    maintenance_id uuid not null references maintenance(id) on delete cascade,
    items jsonb not null default '[]'::jsonb,        -- [{part_id, part_name, qty_requested, unit_cost}]
    status text not null default 'pending_approval',  -- pending_approval | approved | rejected
    requested_by uuid references user_profiles(id),
    requested_by_name text,
    decision jsonb,                                   -- {by, by_name, reason, at} — mirrors quotes.ops_decision
    resulting_quote_id uuid references quotes(id) on delete set null,  -- set if any shortfall was escalated
    created_at timestamptz not null default now()
);
create index idx_parts_requisitions_workspace on parts_requisitions(workspace_id);
create index idx_parts_requisitions_maintenance on parts_requisitions(maintenance_id);
alter table parts_requisitions enable row level security;

-- Purchase Orders had no payment status beyond 'po_issued' — Finance attaches proof-of-payment (same
-- base64-attachment pattern already used for quote attachments) before marking a PO paid. Scoped to
-- quote-generated POs (status='po_issued') only; the pre-existing manually-created PO 'pending_approval'
-- dead-end is a separate, unrelated gap not addressed here.
alter table purchase_orders add column paid_at timestamptz;
alter table purchase_orders add column paid_by uuid references user_profiles(id);
alter table purchase_orders add column proof_of_payment jsonb not null default '[]'::jsonb;
