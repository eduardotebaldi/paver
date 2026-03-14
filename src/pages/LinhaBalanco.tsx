import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, Building2, Loader2, FolderTree, Layers, Calendar, History, Link2, Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { fetchObras, fetchEapItems } from '@/services/api';
import { bulkUpdateEapItems, calculateDependencyDates } from '@/services/eapApi';
import type { EapItem } from '@/services/api';
import EapMassDateEditor from '@/components/EapMassDateEditor';
import BaselineManager from '@/components/BaselineManager';
import LinhaBalancoChart from '@/components/LinhaBalanco';

type GroupMode = 'pacote' | 'servico';

export default function LinhaBalancoPage() {
  const [selectedObra, setSelectedObra] = useState<string>('');
  const [mode, setMode] = useState<GroupMode>('pacote');
  const [selectedPacote, setSelectedPacote] = useState<string>('all');
  const [selectedServico, setSelectedServico] = useState<string>('all');
  const [massDateOpen, setMassDateOpen] = useState(false);
  const [baselineOpen, setBaselineOpen] = useState(false);
  const [pacotePopoverOpen, setPacotePopoverOpen] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();
  const canEdit = hasRole('admin') || hasRole('engenharia');

  const { data: obras = [] } = useQuery({
    queryKey: ['obras'],
    queryFn: fetchObras,
  });

  const { data: eapItems = [], isLoading } = useQuery({
    queryKey: ['eap-items-balance', selectedObra],
    queryFn: () => fetchEapItems(selectedObra),
    enabled: !!selectedObra,
  });

  const uniquePacotes = useMemo(() => {
    const set = new Set<string>();
    eapItems.forEach(i => { if (i.pacote) set.add(i.pacote); });
    return Array.from(set).sort();
  }, [eapItems]);

  const uniqueServicos = useMemo(() => {
    const set = new Set<string>();
    eapItems.forEach(i => { if (i.lote) set.add(i.lote); });
    return Array.from(set).sort();
  }, [eapItems]);

  const filteredItems = useMemo(() => {
    let items = eapItems;
    if (selectedPacote !== 'all') items = items.filter(i => i.pacote === selectedPacote);
    if (selectedServico !== 'all') items = items.filter(i => i.lote === selectedServico);
    return items;
  }, [eapItems, selectedPacote, selectedServico]);

  const obraName = obras.find(o => o.id === selectedObra)?.nome;

  const handleBulkSave = async (changes: { id: string; updates: Partial<EapItem> }[]) => {
    await bulkUpdateEapItems(changes);
    queryClient.invalidateQueries({ queryKey: ['eap-items-balance', selectedObra] });
    toast({ title: `${changes.length} itens atualizados!` });
  };

  const handleRecalcDeps = async () => {
    const calculated = calculateDependencyDates(eapItems);
    const changes: { id: string; updates: Partial<EapItem> }[] = [];
    calculated.forEach((dates, itemId) => {
      changes.push({
        id: itemId,
        updates: {
          data_inicio_prevista: dates.inicio,
          data_fim_prevista: dates.fim,
        },
      });
    });
    if (changes.length > 0) {
      await bulkUpdateEapItems(changes);
      queryClient.invalidateQueries({ queryKey: ['eap-items-balance', selectedObra] });
      toast({ title: `Datas recalculadas para ${changes.length} itens!` });
    } else {
      toast({ title: 'Nenhum item com dependências para recalcular', variant: 'destructive' });
    }
  };

  // No obra selected — show selector prompt
  if (!selectedObra) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] gap-6">
        <BarChart3 className="h-16 w-16 text-muted-foreground/30" />
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-heading font-bold text-foreground">Linha de Balanço</h1>
          <p className="text-muted-foreground font-body">Selecione uma obra para visualizar</p>
        </div>
        <Select value="" onValueChange={(v) => { setSelectedObra(v); setSelectedPacote('all'); setSelectedServico('all'); }}>
          <SelectTrigger className="w-72 font-body">
            <Building2 className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Escolha uma obra" />
          </SelectTrigger>
          <SelectContent>
            {obras.map(o => (
              <SelectItem key={o.id} value={o.id} className="font-body">{o.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] gap-3">
      {/* Compact header + filters */}
      <div className="flex flex-wrap items-end gap-3 shrink-0">
        <div className="space-y-1">
          <Label className="text-xs font-body text-muted-foreground">Obra</Label>
          <Select value={selectedObra} onValueChange={(v) => { setSelectedObra(v); setSelectedPacote('all'); setSelectedServico('all'); }}>
            <SelectTrigger className="w-52 font-body">
              <Building2 className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {obras.map(o => (
                <SelectItem key={o.id} value={o.id} className="font-body">{o.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs font-body text-muted-foreground">Agrupar por</Label>
          <div className="flex items-center rounded-md border border-border overflow-hidden">
            <button
              onClick={() => setMode('pacote')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-body transition-colors ${
                mode === 'pacote'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              <FolderTree className="h-3.5 w-3.5" />
              Pacote
            </button>
            <button
              onClick={() => setMode('servico')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-body transition-colors ${
                mode === 'servico'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              Serviço
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs font-body text-muted-foreground">Pacote</Label>
          <Select value={selectedPacote} onValueChange={setSelectedPacote}>
            <SelectTrigger className="w-48 font-body">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="font-body">Todos</SelectItem>
              {uniquePacotes.map(p => (
                <SelectItem key={p} value={p} className="font-body">{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs font-body text-muted-foreground">Tipo Serviço</Label>
          <Select value={selectedServico} onValueChange={setSelectedServico}>
            <SelectTrigger className="w-48 font-body">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="font-body">Todos</SelectItem>
              {uniqueServicos.map(s => (
                <SelectItem key={s} value={s} className="font-body">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Action buttons — moved from EAP */}
        {canEdit && selectedObra && (
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" size="sm" onClick={() => setMassDateOpen(true)} className="font-body">
              <Calendar className="h-4 w-4 mr-1.5" />
              Datas
            </Button>
            <Button variant="outline" size="sm" onClick={() => setBaselineOpen(true)} className="font-body">
              <History className="h-4 w-4 mr-1.5" />
              Baselines
            </Button>
            <Button variant="outline" size="sm" onClick={handleRecalcDeps} className="font-body">
              <Link2 className="h-4 w-4 mr-1.5" />
              Recalcular
            </Button>
          </div>
        )}
      </div>

      {/* Chart — fills remaining space */}
      <div className="flex-1 min-h-0">
        {isLoading ? (
          <div className="flex justify-center items-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
          </div>
        ) : (
          <LinhaBalancoFullChart eapItems={filteredItems} mode={mode} obraName={obraName} />
        )}
      </div>

      {/* Mass date editor */}
      <EapMassDateEditor
        open={massDateOpen}
        onOpenChange={setMassDateOpen}
        items={eapItems}
        onSave={handleBulkSave}
      />

      {/* Baseline manager */}
      <BaselineManager
        open={baselineOpen}
        onOpenChange={setBaselineOpen}
        obraId={selectedObra}
        eapItems={eapItems}
      />
    </div>
  );
}

/* Full-height version of the chart */
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from 'recharts';

const chartConfig: ChartConfig = {
  previsto: { label: 'Previsto', color: 'hsl(var(--primary))' },
  realizado: { label: 'Realizado', color: 'hsl(var(--accent))' },
  base: { label: 'Base', color: 'hsl(var(--muted-foreground))' },
};

function LinhaBalancoFullChart({ eapItems, mode, obraName }: { eapItems: EapItem[]; mode: GroupMode; obraName?: string }) {
  const items = eapItems.filter(i => i.tipo === 'item');

  const chartData = useMemo(() => {
    const map = new Map<string, { base: number[]; previsto: number[]; realizado: number[] }>();
    for (const item of items) {
      const key = mode === 'pacote' ? (item.pacote || 'Sem pacote') : (item.lote || 'Sem classificação');
      if (!map.has(key)) map.set(key, { base: [], previsto: [], realizado: [] });
      const entry = map.get(key)!;
      entry.base.push(item.avanco_base || 0);
      entry.previsto.push(item.avanco_previsto || 0);
      entry.realizado.push(item.avanco_realizado || 0);
    }
    return Array.from(map.entries()).map(([name, data]) => {
      const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
      return {
        name: name.length > 30 ? name.substring(0, 27) + '...' : name,
        fullName: name,
        base: Number(avg(data.base).toFixed(1)),
        previsto: Number(avg(data.previsto).toFixed(1)),
        realizado: Number(avg(data.realizado).toFixed(1)),
        count: data.base.length,
      };
    });
  }, [items, mode]);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <BarChart3 className="h-12 w-12 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground font-body">Importe uma EAP para visualizar a Linha de Balanço</p>
      </div>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardContent className="flex-1 min-h-0 p-4">
        <ChartContainer config={chartConfig} className="h-full w-full">
          <ComposedChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
              fontSize={11}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={200}
              fontSize={11}
              tick={{ fill: 'hsl(var(--foreground))' }}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) => {
                    const item = payload?.[0]?.payload;
                    return item?.fullName || '';
                  }}
                  formatter={(value, name) => {
                    return [`${value}%`, chartConfig[name as keyof typeof chartConfig]?.label || name];
                  }}
                />
              }
            />
            <Legend
              formatter={(value) => chartConfig[value as keyof typeof chartConfig]?.label || value}
            />
            <Bar dataKey="base" fill="hsl(var(--muted-foreground))" opacity={0.3} barSize={10} radius={[0, 4, 4, 0]} />
            <Bar dataKey="previsto" fill="hsl(var(--primary))" barSize={10} radius={[0, 4, 4, 0]} />
            <Bar dataKey="realizado" fill="hsl(var(--accent))" barSize={10} radius={[0, 4, 4, 0]} />
          </ComposedChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
