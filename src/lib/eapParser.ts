import * as XLSX from 'xlsx';
import { EapItem } from '@/services/api';

interface RawRow {
  [key: string]: any;
}

export function parseEapExcel(file: File): Promise<Omit<EapItem, 'id' | 'created_at' | 'obra_id'>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: RawRow[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        const items: Omit<EapItem, 'id' | 'created_at' | 'obra_id'>[] = [];

        rows.forEach((row, index) => {
          // Find columns (case-insensitive)
          const findCol = (keywords: string[]) => {
            const key = Object.keys(row).find(k =>
              keywords.some(kw => k.toLowerCase().includes(kw.toLowerCase()))
            );
            return key ? row[key] : '';
          };

          const servico = findCol(['Serviço', 'Servico', 'Descrição', 'Descricao', 'Item']);
          const lote = findCol(['Lote', 'Pacote']);
          const codigo = findCol(['Código', 'Codigo', 'ID', 'Cód']);
          const unidade = findCol(['Unidade', 'Und', 'Un']);
          const quantidade = findCol(['Quantidade', 'Qtd', 'Quant']);
          const predecessoras = findCol(['Predecessora', 'Pred']);
          const sucessoras = findCol(['Sucessora', 'Suc']);
          const avancoBase = findCol(['Base', 'Avanço Base', 'Avanco Base']);
          const avancoPrevisto = findCol(['Previsto', 'Avanço Previsto', 'Avanco Previsto']);
          const avancoRealizado = findCol(['Realizado', 'Avanço Realizado', 'Avanco Realizado']);

          const isAgrupador = String(servico).trim() === '-' || String(servico).trim() === '';
          const descricao = isAgrupador
            ? (String(lote || codigo || `Grupo ${index + 1}`)).trim()
            : String(servico).trim();

          if (!descricao) return;

          items.push({
            codigo: String(codigo).trim() || undefined,
            descricao,
            lote: String(lote).trim() || undefined,
            tipo: isAgrupador ? 'agrupador' : 'item',
            unidade: String(unidade).trim() || undefined,
            quantidade: Number(quantidade) || 0,
            predecessoras: predecessoras ? String(predecessoras).split(/[,;]/).map((s: string) => s.trim()).filter(Boolean) : undefined,
            sucessoras: sucessoras ? String(sucessoras).split(/[,;]/).map((s: string) => s.trim()).filter(Boolean) : undefined,
            avanco_base: Number(avancoBase) || 0,
            avanco_previsto: Number(avancoPrevisto) || 0,
            avanco_realizado: Number(avancoRealizado) || 0,
            ordem: index,
          });
        });

        resolve(items);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}
