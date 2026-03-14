ALTER TABLE public.paver_diario_atividades
  ADD COLUMN IF NOT EXISTS quantidade_dia numeric NOT NULL DEFAULT 0;