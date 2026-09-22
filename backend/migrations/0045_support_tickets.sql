-- Help & Support module (V1). Customer-facing ticket system, scoped by workspace (= "account" in the
-- spec's terms -- this codebase has no separate Account entity). No internal FleetIntel-staff role or
-- in-app support queue exists yet and this pass deliberately doesn't add one (per the user: tickets
-- route to FleetIntel's support email inbox instead) -- support-side reply/status-change actions are a
-- small shared-secret-gated endpoint (see SUPPORT_API_KEY in server.py), not a new RBAC layer, so the
-- schema stays ready for a real internal view later without rework.
create table support_tickets (
    id uuid primary key default gen_random_uuid(),
    ticket_number text not null unique,          -- "FI-1048", generated in server.py, not here
    workspace_id uuid not null references workspaces(id) on delete cascade,
    user_id uuid references user_profiles(id),   -- reporter
    vehicle_id uuid references vehicles(id) on delete set null,
    category text not null,                       -- account | vehicle | billing | reports_data | mobile_app | other
    subcategory text,
    subject text not null,
    description text not null,
    priority text not null default 'normal',       -- low | normal | high | critical
    status text not null default 'open',           -- open | in_progress | waiting_on_customer | resolved | closed
    source_module text,                             -- set when created via context-aware "Report an Issue"
    source_screen text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    resolved_at timestamptz,
    closed_at timestamptz
);
create index idx_support_tickets_workspace on support_tickets(workspace_id);
create index idx_support_tickets_user on support_tickets(user_id);
create index idx_support_tickets_vehicle on support_tickets(vehicle_id);

-- Customer <-> Support conversation, chronological. author_type distinguishes the two sides; author_id
-- is nullable because a support reply (via the key-gated endpoint) has no user_profiles row to point to.
create table support_ticket_messages (
    id uuid primary key default gen_random_uuid(),
    ticket_id uuid not null references support_tickets(id) on delete cascade,
    author_type text not null,                      -- customer | support
    author_id uuid references user_profiles(id),
    author_name text,
    body text not null,
    created_at timestamptz not null default now()
);
create index idx_support_ticket_messages_ticket on support_ticket_messages(ticket_id);

-- Attachment on the original ticket (message_id null) or on a specific reply.
create table support_ticket_attachments (
    id uuid primary key default gen_random_uuid(),
    ticket_id uuid not null references support_tickets(id) on delete cascade,
    message_id uuid references support_ticket_messages(id) on delete cascade,
    file_name text not null,
    file_type text,
    file_size integer,
    data_url text not null,                          -- base64 data: URL, same pattern as quotes/PO attachments
    uploaded_by uuid references user_profiles(id),
    created_at timestamptz not null default now()
);
create index idx_support_ticket_attachments_ticket on support_ticket_attachments(ticket_id);

-- Powers the unified activity feed (Phase 6): status/priority changes interleaved with messages by
-- created_at. event_type: created | status_change | priority_change.
create table support_ticket_activity (
    id uuid primary key default gen_random_uuid(),
    ticket_id uuid not null references support_tickets(id) on delete cascade,
    event_type text not null,
    old_value text,
    new_value text,
    actor_type text not null,                        -- customer | support | system
    actor_name text,
    created_at timestamptz not null default now()
);
create index idx_support_ticket_activity_ticket on support_ticket_activity(ticket_id);

-- Never queried by any customer-facing endpoint -- kept in its own table specifically so a customer
-- route can't accidentally join/select it. Unused until a real internal view exists, but costs nothing
-- to have ready.
create table support_ticket_internal_notes (
    id uuid primary key default gen_random_uuid(),
    ticket_id uuid not null references support_tickets(id) on delete cascade,
    author_name text not null,
    body text not null,
    created_at timestamptz not null default now()
);
create index idx_support_ticket_internal_notes_ticket on support_ticket_internal_notes(ticket_id);

alter table support_tickets enable row level security;
alter table support_ticket_messages enable row level security;
alter table support_ticket_attachments enable row level security;
alter table support_ticket_activity enable row level security;
alter table support_ticket_internal_notes enable row level security;

-- Extends the existing notifications table (additive column) so ticket events can use the same
-- in-app bell/Sheet the rest of the app already has, instead of inventing a parallel mechanism.
alter table notifications add column related_ticket_id uuid references support_tickets(id) on delete cascade;
