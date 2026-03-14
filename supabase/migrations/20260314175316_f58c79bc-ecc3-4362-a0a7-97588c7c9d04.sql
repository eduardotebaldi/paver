
-- Dependency rules table for high-level dependency management
CREATE TABLE public.paver_dependency_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  obra_id UUID NOT NULL REFERENCES public.paver_obras(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('servico_em_pacote', 'pacote_em_servico')),
  predecessor TEXT NOT NULL,
  successor TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL,
  UNIQUE(obra_id, tipo, predecessor, successor)
);

-- RLS
ALTER TABLE public.paver_dependency_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view dependency rules"
  ON public.paver_dependency_rules FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert dependency rules"
  ON public.paver_dependency_rules FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Authenticated users can update dependency rules"
  ON public.paver_dependency_rules FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete dependency rules"
  ON public.paver_dependency_rules FOR DELETE
  TO authenticated
  USING (true);
