
-- Budget storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('paver-orcamentos', 'paver-orcamentos', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
CREATE POLICY "Authenticated can upload orcamentos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'paver-orcamentos');

CREATE POLICY "Authenticated can read orcamentos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'paver-orcamentos');

-- Main budget table
CREATE TABLE public.paver_orcamentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  obra_id UUID NOT NULL REFERENCES public.paver_obras(id) ON DELETE CASCADE,
  arquivo_url TEXT,
  nome_arquivo TEXT,
  valor_total NUMERIC NOT NULL DEFAULT 0,
  total_itens INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.paver_orcamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View orcamentos" ON public.paver_orcamentos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Insert orcamentos" ON public.paver_orcamentos
  FOR INSERT TO authenticated
  WITH CHECK (paver_has_role(auth.uid(), 'admin') OR paver_has_role(auth.uid(), 'engenharia'));

CREATE POLICY "Delete orcamentos" ON public.paver_orcamentos
  FOR DELETE TO authenticated
  USING (paver_has_role(auth.uid(), 'admin'));

-- Budget items table
CREATE TABLE public.paver_orcamento_itens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  orcamento_id UUID NOT NULL REFERENCES public.paver_orcamentos(id) ON DELETE CASCADE,
  obra_id UUID NOT NULL REFERENCES public.paver_obras(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  unidade TEXT,
  quantidade NUMERIC NOT NULL DEFAULT 0,
  preco_unitario NUMERIC NOT NULL DEFAULT 0,
  preco_total NUMERIC NOT NULL DEFAULT 0,
  pacote_trabalho TEXT,
  tipo_servico TEXT,
  nivel INTEGER NOT NULL DEFAULT 4,
  codigo_pai_n1 TEXT,
  codigo_pai_n2 TEXT,
  codigo_pai_n3 TEXT,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.paver_orcamento_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View orcamento_itens" ON public.paver_orcamento_itens
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Insert orcamento_itens" ON public.paver_orcamento_itens
  FOR INSERT TO authenticated
  WITH CHECK (paver_has_role(auth.uid(), 'admin') OR paver_has_role(auth.uid(), 'engenharia'));

CREATE POLICY "Delete orcamento_itens" ON public.paver_orcamento_itens
  FOR DELETE TO authenticated
  USING (paver_has_role(auth.uid(), 'admin'));
