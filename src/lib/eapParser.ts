import * as XLSX from 'xlsx';
import { EapItem } from '@/services/api';

interface RawRow {
  [key: string]: any;
}

function normalizeKey(key: string): string {
  return key.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function findColumn(row: RawRow, keywords: string[]): string {
  const keys = Object.keys(row);
  for (const kw of keywords) {
    const nkw = normalizeKey(kw);
    const found = keys.find(k => normalizeKey(k).includes(nkw));
    if (found) return String(row[found]).trim();
  }
  return '';
}

function parseNumber(val: any): number {
  if (typeof val === 'number') return val;
  const str = String(val).trim().replace(/\s/g, '');
  if (!str || str === '-') return 0;
  // Handle locale: 1.234,56 → 1234.56
  if (str.includes(',') && str.includes('.')) {
    const lastComma = str.lastIndexOf(',');
    const lastDot = str.lastIndexOf('.');
    if (lastComma > lastDot) {
      return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
    }
    return parseFloat(str.replace(/,/g, '')) || 0;
  }
  if (str.includes(',') && !str.includes('.')) {
    return parseFloat(str.replace(',', '.')) || 0;
  }
  return parseFloat(str) || 0;
}

function detectHeaderRow(sheet: XLSX.WorkSheet): number {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  const targetKeywords = ['servico', 'serviço', 'pacote', 'lote', 'id'];
  
  for (let r = range.s.r; r <= Math.min(range.s.r + 10, range.e.r); r++) {
    let matchCount = 0;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (cell) {
        const val = normalizeKey(String(cell.v || ''));
        if (targetKeywords.some(kw => val.includes(kw))) {
          matchCount++;
        }
      }
    }
    if (matchCount >= 2) return r;
  }
  return 0; // fallback to first row
}

export function parseEapExcel(file: File): Promise<Omit<EapItem, 'id' | 'created_at' | 'obra_id'>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];

        // Detect the actual header row
        const headerRow = detectHeaderRow(sheet);
        
        // Convert to JSON starting from the detected header row
        const rows: RawRow[] = XLSX.utils.sheet_to_json(sheet, {
          defval: '',
          range: headerRow,
        });

        const items: Omit<EapItem, 'id' | 'created_at' | 'obra_id'>[] = [];

        rows.forEach((row, index) => {
          const id = findColumn(row, ['ID']);
          const pacote = findColumn(row, ['Pacote de trabalho', 'Pacote', 'Tarefa', 'Atividade']);
          const servico = findColumn(row, ['Serviço', 'Servico']);
          const lote = findColumn(row, ['Lote']);
          const predecessoras = findColumn(row, ['Predecessoras', 'Predecessora', 'Pred']);
          const sucessoras = findColumn(row, ['Sucessoras', 'Sucessora', 'Suc']);
          const avancoBase = findColumn(row, ['Base']);
          const avancoPrevisto = findColumn(row, ['Previsto']);
          const avancoRealizado = findColumn(row, ['Realizado']);

          // Skip empty rows or header remnants
          if (!id && !pacote && !servico) return;
          if (id === 'ID') return; // skip duplicate header

          // Agrupador: Serviço is "-" or empty, but has a Pacote name
          const isAgrupador = servico === '-' || servico === '';
          
          const descricao = isAgrupador
            ? (pacote || lote || `Grupo ${index + 1}`)
            : servico;

          if (!descricao || descricao === '-') return;

          items.push({
            codigo: id || undefined,
            descricao,
            lote: lote || undefined,
            tipo: isAgrupador ? 'agrupador' : 'item',
            unidade: undefined,
            quantidade: 0,
            predecessoras: predecessoras && predecessoras !== '-'
              ? predecessoras.split(/[,;]/).map(s => s.trim()).filter(Boolean)
              : undefined,
            sucessoras: sucessoras && sucessoras !== '-'
              ? sucessoras.split(/[,;]/).map(s => s.trim()).filter(Boolean)
              : undefined,
            avanco_base: parseNumber(avancoBase),
            avanco_previsto: parseNumber(avancoPrevisto),
            avanco_realizado: parseNumber(avancoRealizado),
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
