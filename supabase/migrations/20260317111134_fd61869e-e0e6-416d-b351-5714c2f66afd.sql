
CREATE OR REPLACE FUNCTION public.get_eap_avanco_sums(p_obra_id uuid DEFAULT NULL)
RETURNS TABLE(eap_item_id uuid, sum_quantidade_dia numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT da.eap_item_id, SUM(da.quantidade_dia) as sum_quantidade_dia
  FROM paver_diario_atividades da
  JOIN paver_eap_items ei ON ei.id = da.eap_item_id
  WHERE (p_obra_id IS NULL OR ei.obra_id = p_obra_id)
  GROUP BY da.eap_item_id;
$$;
