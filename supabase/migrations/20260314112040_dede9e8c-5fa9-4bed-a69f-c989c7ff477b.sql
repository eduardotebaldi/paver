
-- Add date fields to paver_eap_items for Gantt/Balance Line
ALTER TABLE public.paver_eap_items 
  ADD COLUMN IF NOT EXISTS data_inicio_prevista date,
  ADD COLUMN IF NOT EXISTS data_fim_prevista date,
  ADD COLUMN IF NOT EXISTS data_inicio_real date,
  ADD COLUMN IF NOT EXISTS data_fim_real date;

-- Add pacote, tipo_servico and diario_id to paver_fotos_localizadas
ALTER TABLE public.paver_fotos_localizadas
  ADD COLUMN IF NOT EXISTS pacote text,
  ADD COLUMN IF NOT EXISTS tipo_servico text,
  ADD COLUMN IF NOT EXISTS diario_id uuid REFERENCES public.paver_diarios(id) ON DELETE SET NULL;
