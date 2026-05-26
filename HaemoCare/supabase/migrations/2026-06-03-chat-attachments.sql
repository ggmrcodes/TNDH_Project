-- ============================================
-- In-app chat — image attachments (Phase 3)
-- ============================================
-- Spec: docs/superpowers/specs/2026-05-26-in-app-chat-design.md

-- Private bucket for chat images.
insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', false)
on conflict (id) do nothing;

-- Path convention: '{link_id}/{timestamp}.jpg'. Read if party to the link
-- (any status); upload only if the link is active.
create policy "Chat parties read attachments" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat-attachments'
    and public.is_link_party((split_part(name, '/', 1))::uuid)
  );

create policy "Active chat parties upload attachments" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat-attachments'
    and public.is_active_link_party((split_part(name, '/', 1))::uuid)
  );
