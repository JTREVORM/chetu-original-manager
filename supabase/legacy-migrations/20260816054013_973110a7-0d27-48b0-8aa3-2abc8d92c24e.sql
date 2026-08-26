ALTER TABLE public.client_groups
  ADD COLUMN IF NOT EXISTS meeting_frequency text NOT NULL DEFAULT 'Weekly',
  ADD COLUMN IF NOT EXISTS formation_date date;

ALTER TABLE public.client_groups
  DROP CONSTRAINT IF EXISTS client_groups_meeting_frequency_check;

ALTER TABLE public.client_groups
  ADD CONSTRAINT client_groups_meeting_frequency_check
  CHECK (meeting_frequency IN ('Daily','Weekly','Monthly'));

UPDATE public.client_groups SET formation_date = created_at::date WHERE formation_date IS NULL;