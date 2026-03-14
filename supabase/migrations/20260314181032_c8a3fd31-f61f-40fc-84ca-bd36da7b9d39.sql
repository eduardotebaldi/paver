-- Update paver_diarios: allow creator to edit/delete within 2 days
DROP POLICY IF EXISTS "Update diarios" ON public.paver_diarios;
CREATE POLICY "Update diarios"
  ON public.paver_diarios FOR UPDATE
  TO authenticated
  USING (
    paver_has_role(auth.uid(), 'admin') 
    OR (
      created_by = auth.uid() 
      AND created_at > (now() - interval '2 days')
    )
  );

DROP POLICY IF EXISTS "Delete diarios" ON public.paver_diarios;
CREATE POLICY "Delete diarios"
  ON public.paver_diarios FOR DELETE
  TO authenticated
  USING (
    paver_has_role(auth.uid(), 'admin') 
    OR (
      created_by = auth.uid() 
      AND created_at > (now() - interval '2 days')
    )
  );

-- Update paver_diario_atividades
DROP POLICY IF EXISTS "Delete diario atividades" ON public.paver_diario_atividades;
CREATE POLICY "Delete diario atividades"
  ON public.paver_diario_atividades FOR DELETE
  TO authenticated
  USING (
    paver_has_role(auth.uid(), 'admin') 
    OR EXISTS (
      SELECT 1 FROM public.paver_diarios d
      WHERE d.id = paver_diario_atividades.diario_id
        AND d.created_by = auth.uid()
        AND d.created_at > (now() - interval '2 days')
    )
  );

CREATE POLICY "Update diario atividades"
  ON public.paver_diario_atividades FOR UPDATE
  TO authenticated
  USING (
    paver_has_role(auth.uid(), 'admin') 
    OR EXISTS (
      SELECT 1 FROM public.paver_diarios d
      WHERE d.id = paver_diario_atividades.diario_id
        AND d.created_by = auth.uid()
        AND d.created_at > (now() - interval '2 days')
    )
  );

-- Update paver_fotos_localizadas
DROP POLICY IF EXISTS "Delete fotos localizadas" ON public.paver_fotos_localizadas;
DROP POLICY IF EXISTS "Update fotos localizadas" ON public.paver_fotos_localizadas;

CREATE POLICY "Delete fotos localizadas"
  ON public.paver_fotos_localizadas FOR DELETE
  TO authenticated
  USING (
    paver_has_role(auth.uid(), 'admin') 
    OR (
      created_by = auth.uid() 
      AND created_at > (now() - interval '2 days')
    )
  );

CREATE POLICY "Update fotos localizadas"
  ON public.paver_fotos_localizadas FOR UPDATE
  TO authenticated
  USING (
    paver_has_role(auth.uid(), 'admin') 
    OR (
      created_by = auth.uid() 
      AND created_at > (now() - interval '2 days')
    )
  );