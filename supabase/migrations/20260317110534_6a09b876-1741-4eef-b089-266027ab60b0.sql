
-- Reset avanco_realizado for EAP items that have no measurements
UPDATE paver_eap_items ei
SET avanco_realizado = 0,
    data_inicio_real = NULL,
    data_fim_real = NULL
WHERE ei.tipo = 'item'
  AND ei.avanco_realizado > 0
  AND NOT EXISTS (
    SELECT 1 FROM paver_diario_atividades da WHERE da.eap_item_id = ei.id
  );
