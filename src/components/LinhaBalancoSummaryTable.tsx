import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { BarChart3 } from 'lucide-react';
import type { EapItem } from '@/services/api';

type GroupMode = 'pacote' | 'servico';

interface Props {
  eapItems: EapItem[];
  mode: GroupMode;
}

interface SummaryRow {
  name: string;
  itemCount: number;
  avancoMedio: number;
  periodoInicio: string | null;
  periodoFim: string | null;
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

export default function LinhaBalancoSummaryTable({ eapItems, mode }: Props) {
  const rows = useMemo<SummaryRow[]>(() => {
    const items = eapItems.filter(i => i.tipo === 'item');
    const map = new Map<string, { avancos: number[]; starts: string[]; ends: string[] }>();

    for (const item of items) {
      const key = mode === 'pacote' ? (item.pacote || 'Sem pacote') : (item.lote || 'Sem classificação');
      if (!map.has(key)) map.set(key, { avancos: [], starts: [], ends: [] });
      const entry = map.get(key)!;
      entry.avancos.push(item.avanco_realizado || 0);
      if (item.data_inicio_prevista) entry.starts.push(item.data_inicio_prevista);
      if (item.data_fim_prevista) entry.ends.push(item.data_fim_prevista);
    }

    return Array.from(map.entries())
      .map(([name, data]) => ({
        name,
        itemCount: data.avancos.length,
        avancoMedio: data.avancos.length > 0
          ? Math.round(data.avancos.reduce((a, b) => a + b, 0) / data.avancos.length * 10) / 10
          : 0,
        periodoInicio: data.starts.length > 0 ? data.starts.sort()[0] : null,
        periodoFim: data.ends.length > 0 ? data.ends.sort().reverse()[0] : null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [eapItems, mode]);

  if (rows.length === 0) {
    return (
      <Card className="h-full">
        <CardContent className="flex h-full flex-col items-center justify-center py-12">
          <BarChart3 className="mb-3 h-12 w-12 text-muted-foreground/30" />
          <p className="font-body text-sm text-muted-foreground">
            Importe uma EAP para visualizar a Linha de Balanço
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardContent className="flex-1 min-h-0 overflow-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="font-body text-xs sticky top-0 bg-card z-10">
                {mode === 'pacote' ? 'Pacote de Trabalho' : 'Tipo de Serviço'}
              </TableHead>
              <TableHead className="font-body text-xs w-20 text-center sticky top-0 bg-card z-10">Itens</TableHead>
              <TableHead className="font-body text-xs w-64 sticky top-0 bg-card z-10">Avanço Médio</TableHead>
              <TableHead className="font-body text-xs w-48 sticky top-0 bg-card z-10">Período</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.name}>
                <TableCell className="font-body text-sm text-foreground">{row.name}</TableCell>
                <TableCell className="text-center font-body text-sm text-muted-foreground">{row.itemCount}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${Math.min(row.avancoMedio, 100)}%` }}
                      />
                    </div>
                    <span className="font-body text-xs text-muted-foreground w-12 text-right shrink-0">
                      {row.avancoMedio}%
                    </span>
                  </div>
                </TableCell>
                <TableCell className="font-body text-xs text-muted-foreground">
                  {row.periodoInicio && row.periodoFim
                    ? `${formatDate(row.periodoInicio)} → ${formatDate(row.periodoFim)}`
                    : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
