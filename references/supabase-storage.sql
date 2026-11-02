-- Execute uma vez no SQL Editor do seu projeto Supabase.
-- Crie um usuário de upload dedicado no Auth e substitua o UUID abaixo pelo id dele.
-- Use o JWT de acesso desse usuário, nunca uma chave service_role/secret.
-- Se mudar o nome do bucket, ajuste o SQL e SUPABASE_STORAGE_BUCKET juntos.
-- As políticas permissivas existentes são combinadas com OR: revise/remova
-- políticas amplas que já concedam acesso a este usuário ou a outros buckets.
begin;

insert into storage.buckets (id, name, public, allowed_mime_types)
values ('flow-reel-media', 'flow-reel-media', false,
        array['video/mp4', 'image/jpeg', 'image/png', 'image/webp']);

create policy "flow_reel_upload_insert" on storage.objects
for insert to authenticated
with check (bucket_id = 'flow-reel-media'
  and (select auth.uid()) = '00000000-0000-0000-0000-000000000000'::uuid);

create policy "flow_reel_upload_select" on storage.objects
for select to authenticated
using (bucket_id = 'flow-reel-media'
  and (select auth.uid()) = '00000000-0000-0000-0000-000000000000'::uuid
  and owner_id = (select auth.uid())::text);

-- Sem UPDATE/DELETE: uploads usam nomes únicos e x-upsert=false.
commit;
