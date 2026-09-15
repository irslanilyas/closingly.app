-- Applied 2026-08-26.
--
-- A template is a validated design spec, not generated code. `component_source`
-- assumed we would store React/HTML authored by a model and execute or inject
-- it; the public share page is opened by the user's *client*, so rendering
-- AI-authored markup there puts an XSS bug one prompt injection away. A closed
-- set of enums plus three hex colours covers the same range of looks, cannot
-- carry a payload, and leaves fields editable and data-section hooks intact.
alter table templates
  add column if not exists design jsonb not null default '{}'::jsonb;

alter table templates drop column if exists component_source;

insert into templates (user_id, name, description, design, is_builtin)
values
  (null, 'Studio', 'Quiet and modern. Matches the app.',
   '{"heading_font":"sans","body_font":"sans","density":"normal","paper":"#fdfdfc","ink":"#26241f","accent":"#5c7a5c","header":"minimal","section_label":"caps","divider":"none","bullet":"dot","investment":"plain","corners":"soft"}'::jsonb,
   true),
  (null, 'Editorial', 'Serif and spacious, like a printed brief.',
   '{"heading_font":"display","body_font":"serif","density":"spacious","paper":"#fbf9f4","ink":"#1f1c17","accent":"#8a5a2b","header":"centered","section_label":"serif","divider":"hairline","bullet":"dot","investment":"hero","corners":"square"}'::jsonb,
   true),
  (null, 'Corporate', 'Structured and direct. Numbered sections.',
   '{"heading_font":"sans","body_font":"sans","density":"compact","paper":"#ffffff","ink":"#101828","accent":"#1d4ed8","header":"block","section_label":"numbered","divider":"rule","bullet":"number","investment":"boxed","corners":"square"}'::jsonb,
   true)
on conflict do nothing;
