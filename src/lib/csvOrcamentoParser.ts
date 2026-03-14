/**
 * Parser for budget CSV files with hierarchical codes.
 * 
 * Code structure:
 *   1 level  (e.g. "3")             → Level 1 group
 *   2 levels (e.g. "3.001")         → Level 2 group (tipo de serviço)
 *   3 levels (e.g. "3.001.001")     → Level 3 group (pacote de trabalho)
 *   4 levels (e.g. "3.001.001.001") → Actual service item
 */

export type GrupoTipo = 'tipo_servico' | 'pacote_trabalho' | 'nenhum';

export interface OrcamentoGroup {
  codigo: string;
  descricao: string;
  nivel: number; // 1, 2, or 3
  grupoTipo: GrupoTipo;
  precoTotal: number;
}

export interface OrcamentoItem {
  codigo: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  precoUnitario: number;
  precoTotal: number;
  ativo: boolean;
  // Parent references
  grupo1Codigo: string; // Level 1 parent
  grupo2Codigo: string; // Level 2 parent
  grupo3Codigo: string; // Level 3 parent
}

export interface ParsedOrcamento {
  groups: OrcamentoGroup[];
  items: OrcamentoItem[];
}

function parseDecimalBR(val: string): number {
  if (!val || val.trim() === '') return 0;
  let s = val.trim().replace(/\s/g, '');
  // Brazilian format: 1.234,56 → 1234.56
  if (s.includes(',') && s.includes('.')) {
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > lastDot) {
      return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
    }
    return parseFloat(s.replace(/,/g, '')) || 0;
  }
  if (s.includes(',') && !s.includes('.')) {
    return parseFloat(s.replace(',', '.')) || 0;
  }
  return parseFloat(s) || 0;
}

function getCodeLevel(codigo: string): number {
  return codigo.split('.').length;
}

export function parseCsvOrcamento(csvText: string): ParsedOrcamento {
  // Detect separator (semicolon or comma)
  const firstLine = csvText.split('\n')[0];
  const separator = firstLine.includes(';') ? ';' : ',';

  const lines = csvText.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    throw new Error('Arquivo CSV vazio ou inválido');
  }

  // Skip header
  const dataLines = lines.slice(1);

  const groups: OrcamentoGroup[] = [];
  const items: OrcamentoItem[] = [];

  let currentL1 = '';
  let currentL2 = '';
  let currentL3 = '';

  for (const line of dataLines) {
    const cols = line.split(separator).map(c => c.trim());
    if (cols.length < 2) continue;

    const codigo = cols[0];
    const descricao = cols[1];
    if (!codigo || !descricao) continue;

    const nivel = getCodeLevel(codigo);

    if (nivel <= 3) {
      // It's a group
      const precoTotal = cols.length >= 6 ? parseDecimalBR(cols[5]) : 0;

      if (nivel === 1) {
        currentL1 = codigo;
        currentL2 = '';
        currentL3 = '';
      } else if (nivel === 2) {
        currentL2 = codigo;
        currentL3 = '';
      } else {
        currentL3 = codigo;
      }

      // Default classification: level 2 = tipo_servico, level 3 = pacote_trabalho
      const grupoTipo: GrupoTipo = nivel <= 2 ? 'tipo_servico' : 'pacote_trabalho';

      groups.push({
        codigo,
        descricao,
        nivel,
        grupoTipo,
        precoTotal,
      });
    } else {
      // nivel >= 4 → actual item
      const unidade = cols.length >= 3 ? cols[2] : '';
      const quantidade = cols.length >= 4 ? parseDecimalBR(cols[3]) : 0;
      const precoUnitario = cols.length >= 5 ? parseDecimalBR(cols[4]) : 0;
      const precoTotal = cols.length >= 6 ? parseDecimalBR(cols[5]) : 0;

      items.push({
        codigo,
        descricao,
        unidade,
        quantidade,
        precoUnitario,
        precoTotal,
        ativo: true,
        grupo1Codigo: currentL1,
        grupo2Codigo: currentL2,
        grupo3Codigo: currentL3,
      });
    }
  }

  // Second pass: auto-generate missing level 3 groups for items whose L3 prefix doesn't exist
  const existingGroupCodes = new Set(groups.map(g => g.codigo));
  const syntheticL3 = new Map<string, OrcamentoGroup>();

  for (const item of items) {
    // Derive the expected level 3 code from the item code (first 3 segments)
    const parts = item.codigo.split('.');
    if (parts.length >= 4) {
      const expectedL3 = parts.slice(0, 3).join('.');
      if (!existingGroupCodes.has(expectedL3) && !syntheticL3.has(expectedL3)) {
        // Find the level 2 parent to derive a description
        const l2Code = parts.slice(0, 2).join('.');
        const l2Group = groups.find(g => g.codigo === l2Code);
        const desc = l2Group ? l2Group.descricao : 'Serviços';

        const synth: OrcamentoGroup = {
          codigo: expectedL3,
          descricao: desc,
          nivel: 3,
          grupoTipo: 'pacote_trabalho',
          precoTotal: 0,
        };
        syntheticL3.set(expectedL3, synth);
        existingGroupCodes.add(expectedL3);
      }
      // Also fix the item's grupo3Codigo if it's missing or wrong
      if (!item.grupo3Codigo || item.grupo3Codigo !== expectedL3) {
        item.grupo3Codigo = expectedL3;
        // Also fix L1 and L2 if needed
        if (!item.grupo1Codigo) item.grupo1Codigo = parts[0];
        if (!item.grupo2Codigo) item.grupo2Codigo = parts.slice(0, 2).join('.');
      }
    }
  }

  // Add synthetic groups
  for (const g of syntheticL3.values()) {
    groups.push(g);
  }

  // Third pass: promote leaf level-3 groups (with price data and no child items) to items
  const itemsByL3 = new Set(items.map(i => i.grupo3Codigo));
  for (const g of groups) {
    if (g.nivel === 3 && !itemsByL3.has(g.codigo) && g.precoTotal > 0) {
      const l1Code = g.codigo.split('.')[0];
      const l2Code = g.codigo.split('.').slice(0, 2).join('.');
      items.push({
        codigo: g.codigo,
        descricao: g.descricao,
        unidade: '',
        quantidade: 1,
        precoUnitario: g.precoTotal,
        precoTotal: g.precoTotal,
        ativo: true,
        grupo1Codigo: l1Code,
        grupo2Codigo: l2Code,
        grupo3Codigo: g.codigo,
      });
    }
  }

  return { groups, items };
}

/**
 * Read a File as text, trying common encodings for Brazilian CSV files.
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    // Try latin1 first since Brazilian CSVs often use it
    reader.readAsText(file, 'windows-1252');
  });
}
