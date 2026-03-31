-- 1. Create the storage bucket
insert into storage.buckets (id, name, public) 
values ('training-materials', 'training-materials', true);

-- 2. Create the metadata table
create table public.training_materials (
  id uuid default gen_random_uuid() primary key,
  level integer not null, -- 1 or 2
  department text, -- Population for Level 2 only
  category text not null, -- Training Name (L1) or Role Name (L2)
  display_name text not null,
  file_path text not null, -- Path inside the bucket
  created_at timestamptz default now()
);

-- 3. Enable RLS
alter table public.training_materials enable row level security;
create policy "Public read training_materials" on public.training_materials for select using (true);
create policy "Admin manage training_materials" on public.training_materials for all using (true); -- Note: For testing local migrations with Anon KEY you might temporarily use `using (true)` for all ops. Then restrict later.

-- Optional: Storage policies to allow public reads and uploads during migration
create policy "Public read training-materials bucket" on storage.objects for select using (bucket_id = 'training-materials');
create policy "Allow internal uploads to training-materials" on storage.objects for insert with check (bucket_id = 'training-materials');
create policy "Allow internal updates to training-materials" on storage.objects for update using (bucket_id = 'training-materials');
