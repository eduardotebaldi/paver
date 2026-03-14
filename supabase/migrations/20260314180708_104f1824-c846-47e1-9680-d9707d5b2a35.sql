-- Add clima_manha and clima_tarde columns
ALTER TABLE public.paver_diarios 
  ADD COLUMN clima_manha text NOT NULL DEFAULT 'ensolarado',
  ADD COLUMN clima_tarde text NOT NULL DEFAULT 'ensolarado';

-- Migrate existing clima data to clima_manha
UPDATE public.paver_diarios SET clima_manha = clima, clima_tarde = clima;

-- Change mao_de_obra from integer to text (equipes de trabalho)
ALTER TABLE public.paver_diarios ALTER COLUMN mao_de_obra TYPE text USING mao_de_obra::text;
ALTER TABLE public.paver_diarios ALTER COLUMN mao_de_obra SET DEFAULT '';

-- Create table for diary EAP activity updates
CREATE TABLE public.paver_diario_atividades (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  diario_id uuid NOT NULL REFERENCES public.paver_diarios(id) ON DELETE CASCADE,
  eap_item_id uuid NOT NULL REFERENCES public.paver_eap_items(id) ON DELETE CASCADE,
  avanco_percentual numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.paver_diario_atividades ENABLE ROW LEVEL SECURITY;

-- RLS policies using paver_has_role
CREATE POLICY "View diario atividades"
  ON public.paver_diario_atividades FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Insert diario atividades"
  ON public.paver_diario_atividades FOR INSERT
  TO authenticated
  WITH CHECK (paver_has_role(auth.uid(), 'admin') OR paver_has_role(auth.uid(), 'engenharia'));

CREATE POLICY "Delete diario atividades"
  ON public.paver_diario_atividades FOR DELETE
  TO authenticated
  USING (paver_has_role(auth.uid(), 'admin'));