import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileBarChart, Loader2, Download, Filter } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fetchObras, fetchAllEapItems, Obra, EapItem } from '@/services/api';

export default function Relatorios() {
  const [selectedObra, setSelectedObra] = useState<string>('all');

  const { data: obras = [], isLoading: loadingObras } = useQuery({
    queryKey: ['obras'],
    queryFn: fetchObras,
  });

  const { data: allEapItems = [], isLoading: loadingEap } = useQuery({
    queryKey: ['eap-all'],
    queryFn: fetchAllEapItems,
  });

  const filteredItems = selectedObra === 'all'
    ? allEapItems
    : allEapItems.filter(i => i.obra_id === selectedObra);

  const obraMap = Object.fromEntries(obras.map(o => [o.id, o]));

  // Group by obra
  const groupedByObra: Record<string, EapItem[]> = {};
  filteredItems.forEach(item => {
    if (!groupedByObra[item.obra_id]) groupedByObra[item.obra_id] = [];
    groupedByObra[item.obra_id].push(item);
  });

  const totalItems = filteredItems.length;
  const avgBase = totalItems > 0 ? filteredItems.reduce((s, i) => s + (i.avanco_base || 0), 0) / totalItems : 0;
  const avgPrevisto = totalItems > 0 ? filteredItems.reduce((s, i) => s + (i.avanco_previsto || 0), 0) / totalItems : 0;
  const avgRealizado = totalItems > 0 ? filteredItems.reduce((s, i) => s + (i.avanco_realizado || 0), 0) / totalItems : 0;

  const handleExportCSV = () => {
    const headers = ['Obra', 'Código', 'Descrição', 'Lote', 'Unidade', 'Qtd', 'Base %', 'Previsto %', 'Realizado %'];
    const rows = filteredItems.map(item => [
      obraMap[item.obra_id]?.nome || '',
      item.codigo || '',
      item.descricao,
      item.lote || '',
      item.unidade || '',
      String(item.quantidade || 0),
      String(item.avanco_base || 0),
      String(item.avanco_previsto || 0),
      String(item.avanco_realizado || 0),
    ]);

    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-avanco-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isLoading = loadingObras || loadingEap;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Relatórios</h1>
          <p className="text-muted-foreground font-body">Relatórios de avanço físico e medições</p>
        </div>
        <Button
          variant="outline"
          onClick={handleExportCSV}
          disabled={filteredItems.length === 0}
          className="font-body"
        >
          <Download className="h-4 w-4 mr-2" />
          Exportar CSV
        </Button>
      </div>

      {/* Filter */}
      <div className="flex gap-3">
        <Select value={selectedObra} onValueChange={setSelectedObra}>
          <SelectTrigger className="w-64 font-body">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filtrar por obra" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="font-body">Todas as obras</SelectItem>
            {obras.map(o => (
              <SelectItem key={o.id} value={o.id} className="font-body">{o.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground font-body">Itens de Serviço</p>
            <p className="text-2xl font-bold font-heading">{totalItems}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground font-body">Avanço Base</p>
            <div className="flex items-center gap-3">
              <p className="text-2xl font-bold font-heading">{avgBase.toFixed(1)}%</p>
              <Progress value={avgBase} className="flex-1" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground font-body">Avanço Previsto</p>
            <div className="flex items-center gap-3">
              <p className="text-2xl font-bold font-heading">{avgPrevisto.toFixed(1)}%</p>
              <Progress value={avgPrevisto} className="flex-1" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground font-body">Avanço Realizado</p>
            <div className="flex items-center gap-3">
              <p className="text-2xl font-bold font-heading">{avgRealizado.toFixed(1)}%</p>
              <Progress value={avgRealizado} className="flex-1" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      ) : filteredItems.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileBarChart className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-heading font-semibold text-muted-foreground">
              Nenhum item de EAP encontrado
            </h3>
            <p className="text-sm text-muted-foreground/70 mt-1 font-body">
              Importe uma EAP em uma obra para gerar relatórios
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-heading">Obra</TableHead>
                  <TableHead className="font-heading">Código</TableHead>
                  <TableHead className="font-heading">Descrição</TableHead>
                  <TableHead className="font-heading">Lote</TableHead>
                  <TableHead className="font-heading text-right">Base</TableHead>
                  <TableHead className="font-heading text-right">Previsto</TableHead>
                  <TableHead className="font-heading text-right">Realizado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map(item => (
                  <TableRow key={item.id}>
                    <TableCell className="font-body text-xs">{obraMap[item.obra_id]?.nome || '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{item.codigo || '—'}</TableCell>
                    <TableCell className="font-body text-sm">{item.descricao}</TableCell>
                    <TableCell>
                      {item.lote ? <Badge variant="outline" className="text-[10px]">{item.lote}</Badge> : '—'}
                    </TableCell>
                    <TableCell className="text-right font-body text-sm">{(item.avanco_base || 0).toFixed(1)}%</TableCell>
                    <TableCell className="text-right font-body text-sm">{(item.avanco_previsto || 0).toFixed(1)}%</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Progress value={item.avanco_realizado || 0} className="w-16 h-1.5" />
                        <span className="font-body text-sm font-medium">{(item.avanco_realizado || 0).toFixed(1)}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
