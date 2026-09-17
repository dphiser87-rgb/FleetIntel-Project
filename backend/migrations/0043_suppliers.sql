-- Supplier master data, owned by Finance -- "how we can know which supplier is costing more"
-- (user's own framing). Purchase orders link to a supplier via supplier_id; the pre-existing
-- purchase_orders.supplier free-text column is kept as a display fallback for POs created before this
-- migration (and any future manually-created PO that still sets it directly), but new code assigns
-- suppliers through this table instead.
create table suppliers (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references workspaces(id) on delete cascade,
    name text not null,
    contact_name text,
    contact_email text,
    contact_phone text,
    notes text,
    created_by uuid references user_profiles(id),
    created_at timestamptz not null default now()
);
create index idx_suppliers_workspace on suppliers(workspace_id);
-- Case-insensitive uniqueness per workspace -- this is curated master data (Finance creates suppliers
-- deliberately), so silently allowing "Auto Parts SA" and "auto parts sa" as two rows would defeat the
-- point of having a canonical list to roll spend up against.
create unique index idx_suppliers_workspace_name on suppliers(workspace_id, lower(name));
alter table suppliers enable row level security;

alter table purchase_orders add column supplier_id uuid references suppliers(id) on delete set null;
create index idx_purchase_orders_supplier on purchase_orders(supplier_id);
