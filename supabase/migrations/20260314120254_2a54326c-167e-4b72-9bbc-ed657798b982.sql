
-- Baseline versioning table
CREATE TABLE public.paver_eap_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id uuid NOT NULL REFERENCES public.paver_obras(id) ON DELETE CASCADE,
  nome text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Baseline items snapshot
CREATE TABLE public.paver_eap_baseline_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  baseline_id uuid NOT NULL REFERENCES public.paver_eap_baselines(id) ON DELETE CASCADE,
  eap_item_id uuid NOT NULL REFERENCES public.paver_eap_items(id) ON DELETE CASCADE,
  avanco_previsto numeric DEFAULT 0,
  data_inicio_prevista date,
  data_fim_prevista date,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE public.paver_eap_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paver_eap_baseline_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View baselines" ON public.paver_eap_baselines FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert baselines" ON public.paver_eap_baselines FOR INSERT TO authenticated WITH CHECK (paver_has_role(auth.uid(), 'admin') OR paver_has_role(auth.uid(), 'engenharia'));
CREATE POLICY "Delete baselines" ON public.paver_eap_baselines FOR DELETE TO authenticated USING (paver_has_role(auth.uid(), 'admin'));

CREATE POLICY "View baseline items" ON public.paver_eap_baseline_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert baseline items" ON public.paver_eap_baseline_items FOR INSERT TO authenticated WITH CHECK (paver_has_role(auth.uid(), 'admin') OR paver_has_role(auth.uid(), 'engenharia'));
CREATE POLICY "Delete baseline items" ON public.paver_eap_baseline_items FOR DELETE TO authenticated USING (paver_has_role(auth.uid(), 'admin'));
