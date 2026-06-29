-- Subcarpetas en Documentos Oficiales: jerarquía en official_document_folders.
-- parent_id se autorreferencia; ON DELETE CASCADE => borrar una carpeta arrastra
-- sus subcarpetas. Los documentos de ese subárbol quedan sin carpeta porque
-- official_documents.folder_id ya tiene ON DELETE SET NULL.
alter table public.official_document_folders
  add column if not exists parent_id uuid
  references public.official_document_folders(id) on delete cascade;

create index if not exists idx_official_document_folders_parent
  on public.official_document_folders(parent_id);
