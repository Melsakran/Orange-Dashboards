-- Admin-written tag shown next to the PE Development project type toggle
-- (e.g. "October/November"). Re-runnable.

alter table public.workspaces
  add column if not exists tag_label text;

alter table public.workspaces
  drop constraint if exists workspaces_tag_label_length;

alter table public.workspaces
  add constraint workspaces_tag_label_length
    check (tag_label is null or char_length(tag_label) <= 60);
