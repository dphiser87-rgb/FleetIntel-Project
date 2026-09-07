-- 3D Pre-Trip Inspection: lets a checklist answer be tied to a named 3D model component
-- (component_node) and creates a real, queryable defects row from a failed 3D-inspection answer,
-- instead of that data staying trapped in one inspection's answers jsonb. Both new defects columns
-- are nullable so the existing manual POST /defects flow (which never sets them) is unaffected.
alter table defects add column component_node text;
alter table defects add column inspection_id uuid references inspections(id) on delete set null;
create index idx_defects_inspection on defects(inspection_id);
create index idx_defects_component_node on defects(vehicle_id, component_node) where status in ('open', 'acknowledged');

-- A template stays a flat sections-based checklist unless asset_class/node_checklist are set, in
-- which case it's a 3D template for that vehicle class: node_checklist maps a glTF node name (e.g.
-- "EXT_windscreen") to the list of checks for that component, {"key","label","required"} each,
-- mirroring ChecklistItem's shape but keyed by node instead of living inside a flat section.
alter table templates add column asset_class text;
alter table templates add column node_checklist jsonb;
