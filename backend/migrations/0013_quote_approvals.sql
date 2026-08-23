-- Two-stage quote approval workflow (Workshop -> Operations Manager -> Finance), the Purchase Orders
-- it issues into, and an in-app notification feed for the transitions between them.

create table quotes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  maintenance_id uuid not null references maintenance(id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  attachments jsonb not null default '[]'::jsonb,
  subtotal numeric not null default 0,
  vat_total numeric not null default 0,
  total numeric not null default 0,
  stage text not null default 'pending_ops',
  submitted_by uuid references user_profiles(id),
  submitted_by_name text,
  submitted_at timestamptz not null default now(),
  ops_decision jsonb,
  finance_decision jsonb,
  po_id uuid,
  created_at timestamptz not null default now()
);
create index idx_quotes_workspace on quotes(workspace_id);
create index idx_quotes_maintenance on quotes(maintenance_id);

create table purchase_orders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  po_number text not null,
  quote_id uuid references quotes(id) on delete set null,
  maintenance_id uuid references maintenance(id) on delete set null,
  supplier text,
  amount numeric not null default 0,
  status text not null default 'po_issued',
  notes text,
  created_by uuid references user_profiles(id),
  created_at timestamptz not null default now()
);
create index idx_po_workspace on purchase_orders(workspace_id);

alter table quotes add constraint quotes_po_fk foreign key (po_id) references purchase_orders(id) on delete set null;

create table notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  recipient_user_id uuid references user_profiles(id) on delete cascade,
  type text not null,
  message text not null,
  related_maintenance_id uuid references maintenance(id) on delete cascade,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_notifications_recipient on notifications(recipient_user_id, read);
