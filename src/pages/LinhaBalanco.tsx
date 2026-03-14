import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, Building2, Loader2, FolderTree, Layers, Calendar, History, Link2, Check, ChevronsUpDown, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
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
          <Popover open={pacotePopoverOpen} onOpenChange={setPacotePopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" role="combobox" className="w-48 justify-between font-body text-sm font-normal">
                <span className="truncate">
                  {selectedPacote === 'all' ? 'Todos' : selectedPacote}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-0" align="start">
              <Command>
                <CommandInput placeholder="Buscar pacote..." className="font-body" />
                <CommandList>
                  <CommandEmpty className="py-3 text-center text-xs font-body text-muted-foreground">Nenhum pacote encontrado</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value="all"
                      onSelect={() => { setSelectedPacote('all'); setPacotePopoverOpen(false); }}
                      className="font-body"
                    >
                      <Check className={cn("mr-2 h-4 w-4", selectedPacote === 'all' ? "opacity-100" : "opacity-0")} />
                      Todos
                    </CommandItem>
                    {uniquePacotes.map(p => (
                      <CommandItem
                        key={p}
                        value={p}
                        onSelect={() => { setSelectedPacote(p); setPacotePopoverOpen(false); }}
                        className="font-body"
                      >
                        <Check className={cn("mr-2 h-4 w-4", selectedPacote === p ? "opacity-100" : "opacity-0")} />
                        {p}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
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
  type ChartConfig,
} from '@/components/ui/chart';
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ReferenceArea,
  Tooltip,
  Rectangle,
} from 'recharts';


const chartConfig: ChartConfig = {
  previsto: { label: 'Previsto', color: 'hsl(var(--primary))' },
  realizado: { label: 'Realizado', color: 'hsl(var(--accent))' },
};

const DAY_MS = 86400000;
const WEEK_MS = DAY_MS * 7;

/** Generate Monday-aligned week intervals covering the given domain */
function getWeekBands(domainStart: number, domainEnd: number): { x1: number; x2: number; odd: boolean }[] {
  // Find first Monday at or before domainStart
  const startDate = new Date(domainStart);
  const day = startDate.getUTCDay(); // 0=Sun
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const firstMonday = new Date(domainStart);
  firstMonday.setDate(firstMonday.getDate() + diffToMonday);
  firstMonday.setHours(0, 0, 0, 0);

  const bands: { x1: number; x2: number; odd: boolean }[] = [];
  let current = firstMonday.getTime();
  let idx = 0;
  while (current < domainEnd) {
    const next = current + WEEK_MS;
    bands.push({ x1: current, x2: Math.min(next, domainEnd), odd: idx % 2 === 1 });
    current = next;
    idx++;
  }
  return bands;
}

function formatDateTick(ts: number) {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`;
}

function formatDateFull(ts: number) {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function LinhaBalancoFullChart({ eapItems, mode, obraName }: { eapItems: EapItem[]; mode: GroupMode; obraName?: string }) {
  const items = eapItems.filter(i => i.tipo === 'item');
  const todayTs = useMemo(() => new Date().setHours(0, 0, 0, 0), []);

  const { chartData, lastMeasurementTs, domainMin, domainMax } = useMemo(() => {
    const map = new Map<string, {
      previstoStarts: number[]; previstoEnds: number[];
      realizadoStarts: number[]; realizadoEnds: number[];
      avancoPrevistos: number[]; avancoRealizados: number[];
      quantidades: number[]; quantidadesRealizadas: number[];
      itemCount: number;
    }>();
    let lastMeasurement = 0;

    for (const item of items) {
      const key = mode === 'pacote' ? (item.pacote || 'Sem pacote') : (item.lote || 'Sem classificação');
      if (!map.has(key)) map.set(key, {
        previstoStarts: [], previstoEnds: [],
        realizadoStarts: [], realizadoEnds: [],
        avancoPrevistos: [], avancoRealizados: [],
        quantidades: [], quantidadesRealizadas: [],
        itemCount: 0,
      });
      const entry = map.get(key)!;
      entry.itemCount++;

      entry.avancoPrevistos.push(item.avanco_previsto || 0);
      entry.avancoRealizados.push(item.avanco_realizado || 0);
      if (item.quantidade != null) {
        entry.quantidades.push(item.quantidade);
        entry.quantidadesRealizadas.push(item.quantidade * ((item.avanco_realizado || 0) / 100));
      }

      if (item.data_inicio_prevista) entry.previstoStarts.push(new Date(item.data_inicio_prevista + 'T00:00:00').getTime());
      if (item.data_fim_prevista) entry.previstoEnds.push(new Date(item.data_fim_prevista + 'T00:00:00').getTime());
      if (item.data_inicio_real) {
        const t = new Date(item.data_inicio_real + 'T00:00:00').getTime();
        entry.realizadoStarts.push(t);
        if (t > lastMeasurement) lastMeasurement = t;
      }
      if (item.data_fim_real) {
        const t = new Date(item.data_fim_real + 'T00:00:00').getTime();
        entry.realizadoEnds.push(t);
        if (t > lastMeasurement) lastMeasurement = t;
      }
    }

    let dMin = Infinity, dMax = -Infinity;

    const data = Array.from(map.entries()).map(([name, d]) => {
      const pStart = d.previstoStarts.length ? Math.min(...d.previstoStarts) : null;
      const pEnd = d.previstoEnds.length ? Math.max(...d.previstoEnds) : null;
      const rStart = d.realizadoStarts.length ? Math.min(...d.realizadoStarts) : null;
      const rEnd = d.realizadoEnds.length ? Math.max(...d.realizadoEnds) : null;

      [pStart, pEnd, rStart, rEnd].forEach(v => {
        if (v !== null) {
          if (v < dMin) dMin = v;
          if (v > dMax) dMax = v;
        }
      });

      const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
      const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

      return {
        name: name.length > 30 ? name.substring(0, 27) + '…' : name,
        fullName: name,
        previsto: pStart != null && pEnd != null ? [pStart, pEnd] as [number, number] : undefined,
        realizado: rStart != null && rEnd != null ? [rStart, rEnd] as [number, number] : undefined,
        avgAvancoPrevisto: Number(avg(d.avancoPrevistos).toFixed(1)),
        avgAvancoRealizado: Number(avg(d.avancoRealizados).toFixed(1)),
        qtdTotal: Number(sum(d.quantidades).toFixed(2)),
        qtdRealizada: Number(sum(d.quantidadesRealizadas).toFixed(2)),
        itemCount: d.itemCount,
      };
    });

    if (todayTs < dMin) dMin = todayTs;
    if (todayTs > dMax) dMax = todayTs;

    const pad = Math.max((dMax - dMin) * 0.05, DAY_MS * 7);
    return {
      chartData: data,
      lastMeasurementTs: lastMeasurement || null,
      domainMin: dMin === Infinity ? todayTs - DAY_MS * 30 : dMin - pad,
      domainMax: dMax === -Infinity ? todayTs + DAY_MS * 30 : dMax + pad,
    };
  }, [items, mode, todayTs]);

  const [zoomDomain, setZoomDomain] = useState<[number, number] | null>(null);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const activeDomain = zoomDomain || [domainMin, domainMax];
  const weekBands = useMemo(() => getWeekBands(activeDomain[0], activeDomain[1]), [activeDomain]);

  const zoomIn = () => {
    const [l, r] = activeDomain;
    const range = r - l;
    const center = (l + r) / 2;
    setZoomDomain([center - range * 0.25, center + range * 0.25]);
  };

  const zoomOut = () => {
    const [l, r] = activeDomain;
    const range = r - l;
    const center = (l + r) / 2;
    setZoomDomain([
      Math.max(domainMin, center - range),
      Math.min(domainMax, center + range),
    ]);
  };

  const resetZoom = () => setZoomDomain(null);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <BarChart3 className="h-12 w-12 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground font-body">Importe uma EAP para visualizar a Linha de Balanço</p>
      </div>
    );
  }

  // Custom bar shape that shows completion % as filled portion
  const ProgressBar = (props: any) => {
    const { x, y, width, height, payload, dataKey } = props;
    if (width == null || height == null || !payload) return null;

    const pct = dataKey === 'previsto' ? payload.avgAvancoPrevisto : payload.avgAvancoRealizado;
    const fillColor = dataKey === 'previsto' ? 'hsl(var(--primary))' : 'hsl(var(--accent))';
    const fillColorDark = dataKey === 'previsto' ? 'hsl(var(--primary))' : 'hsl(var(--accent))';
    const barW = Math.abs(width);
    const filledW = barW * (pct / 100);
    const rx = 3;

    return (
      <g>
        {/* Background (unfilled) */}
        <rect x={Math.min(x, x + width)} y={y} width={barW} height={height} rx={rx} ry={rx}
          fill={fillColor} opacity={0.25} />
        {/* Filled portion */}
        {filledW > 0 && (
          <rect x={Math.min(x, x + width)} y={y} width={Math.min(filledW, barW)} height={height} rx={rx} ry={rx}
            fill={fillColorDark} opacity={0.85} />
        )}
        {/* % label inside bar if wide enough */}
        {barW > 40 && (
          <text
            x={Math.min(x, x + width) + barW / 2}
            y={y + height / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={9}
            fontWeight={600}
            fill="hsl(var(--primary-foreground))"
          >
            {pct}%
          </text>
        )}
      </g>
    );
  };

  return (
    <Card className="h-full flex flex-col">
      <div className="flex items-center justify-end gap-1 px-4 pt-3">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={zoomIn} title="Zoom in">
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={zoomOut} title="Zoom out">
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={resetZoom} title="Resetar zoom">
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      </div>
      <CardContent className="flex-1 min-h-0 p-4 pt-1">
        <ChartContainer config={chartConfig} className="h-full w-full">
          <ComposedChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            {/* Alternating week bands */}
            {weekBands.filter(w => w.odd).map((w, i) => (
              <ReferenceArea
                key={`week-${i}`}
                x1={w.x1}
                x2={w.x2}
                fill="hsl(var(--muted))"
                fillOpacity={0.4}
                ifOverflow="hidden"
              />
            ))}
            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
            <XAxis
              type="number"
              domain={activeDomain}
              tickFormatter={formatDateTick}
              fontSize={10}
              scale="time"
              ticks={weekBands.map(w => w.x1)}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={200}
              fontSize={11}
              tick={{ fill: 'hsl(var(--foreground))' }}
            />
            <Tooltip
              content={({ payload }) => {
                if (!payload || payload.length === 0) return null;
                const row = payload[0]?.payload;
                if (!row) return null;
                return (
                  <div className="rounded-lg border bg-popover px-4 py-3 shadow-lg text-xs font-body space-y-2 max-w-xs">
                    <p className="font-heading font-semibold text-sm">{row.fullName}</p>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                      <span>Itens:</span>
                      <span className="text-foreground font-medium">{row.itemCount}</span>

                      {row.previsto && (
                        <>
                          <span>Início previsto:</span>
                          <span className="text-foreground">{formatDateFull(row.previsto[0])}</span>
                          <span>Fim previsto:</span>
                          <span className="text-foreground">{formatDateFull(row.previsto[1])}</span>
                        </>
                      )}

                      {row.realizado && (
                        <>
                          <span>Início real:</span>
                          <span className="text-foreground">{formatDateFull(row.realizado[0])}</span>
                          <span>Fim real:</span>
                          <span className="text-foreground">{formatDateFull(row.realizado[1])}</span>
                        </>
                      )}

                      <span>Avanço previsto:</span>
                      <span className="text-primary font-medium">{row.avgAvancoPrevisto}%</span>

                      <span>Avanço realizado:</span>
                      <span className="text-accent font-medium">{row.avgAvancoRealizado}%</span>

                      {row.qtdTotal > 0 && (
                        <>
                          <span>Qtd. total:</span>
                          <span className="text-foreground">{row.qtdTotal.toLocaleString('pt-BR')}</span>
                          <span>Qtd. executada:</span>
                          <span className="text-foreground">{row.qtdRealizada.toLocaleString('pt-BR')}</span>
                        </>
                      )}
                    </div>

                    {/* Mini progress bar */}
                    <div className="space-y-1 pt-1">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-muted-foreground">Conclusão</span>
                        <span className="font-medium text-foreground">{row.avgAvancoRealizado}%</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-accent transition-all"
                          style={{ width: `${Math.min(row.avgAvancoRealizado, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              }}
            />
            <Legend
              formatter={(value) => chartConfig[value as keyof typeof chartConfig]?.label || value}
            />

            {/* Today reference line */}
            <ReferenceLine
              x={todayTs}
              stroke="hsl(var(--destructive))"
              strokeWidth={2}
              strokeDasharray="4 4"
              label={{ value: 'Hoje', position: 'top', fill: 'hsl(var(--destructive))', fontSize: 10 }}
            />

            {/* Last measurement reference line */}
            {lastMeasurementTs && (
              <ReferenceLine
                x={lastMeasurementTs}
                stroke="hsl(var(--chart-4, 43 74% 66%))"
                strokeWidth={2}
                strokeDasharray="6 3"
                label={{ value: 'Últ. medição', position: 'top', fill: 'hsl(var(--chart-4, 43 74% 66%))', fontSize: 10 }}
              />
            )}

            <Bar dataKey="previsto" barSize={12} shape={<ProgressBar dataKey="previsto" />} />
            <Bar dataKey="realizado" barSize={12} shape={<ProgressBar dataKey="realizado" />} />
          </ComposedChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
