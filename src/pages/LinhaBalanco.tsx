import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, Building2, Loader2, FolderTree, Layers, Calendar, History, Link2, Check, ChevronsUpDown, ZoomIn, ZoomOut, RotateCcw, Maximize, Minimize, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
  ReferenceLine,
  ReferenceArea,
  Tooltip,
} from 'recharts';

const DAY_MS = 86400000;
const WEEK_MS = DAY_MS * 7;

const SUB_COLORS = [
  'hsl(220, 20%, 35%)',
  'hsl(45, 85%, 48%)',
  'hsl(280, 55%, 45%)',
  'hsl(160, 55%, 38%)',
  'hsl(10, 70%, 50%)',
  'hsl(200, 65%, 45%)',
  'hsl(330, 55%, 48%)',
  'hsl(90, 50%, 38%)',
  'hsl(30, 75%, 45%)',
  'hsl(260, 45%, 55%)',
  'hsl(180, 50%, 40%)',
  'hsl(350, 60%, 42%)',
];

function getWeekBands(domainStart: number, domainEnd: number): { x1: number; x2: number; odd: boolean }[] {
  const startDate = new Date(domainStart);
  const day = startDate.getUTCDay();
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

interface SubBarItem {
  id: string;
  descricao: string;
  classificacao_adicional?: string;
  quantidade?: number;
  avanco_realizado?: number;
  data_inicio_prevista?: string;
  data_fim_prevista?: string;
  unidade?: string;
}

interface SubBarMeta {
  name: string;
  start: number | null;
  end: number | null;
  avanco: number;
  qtdTotal: number;
  qtdRealizada: number;
  itemCount: number;
  items: SubBarItem[];
}

function LinhaBalancoFullChart({ eapItems, mode, obraName }: { eapItems: EapItem[]; mode: GroupMode; obraName?: string }) {
  const items = eapItems.filter(i => i.tipo === 'item');
  const todayTs = useMemo(() => new Date().setHours(0, 0, 0, 0), []);

  // Detail dialog state
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailGroup, setDetailGroup] = useState<string>('');
  const [detailSubs, setDetailSubs] = useState<SubBarMeta[]>([]);
  const [detailColorMap, setDetailColorMap] = useState<Record<string, string>>({});

  const { chartData, subCategories, colorMap, lastMeasurementTs, domainMin, domainMax } = useMemo(() => {
    const groupMap = new Map<string, Map<string, {
      starts: number[]; ends: number[];
      avancos: number[]; qtds: number[]; qtdsRealizadas: number[];
      itemCount: number;
      items: SubBarItem[];
    }>>();
    let lastMeasurement = 0;
    const allSubs = new Set<string>();

    for (const item of items) {
      const groupKey = mode === 'pacote' ? (item.pacote || 'Sem pacote') : (item.lote || 'Sem classificação');
      const subKey = mode === 'pacote' ? (item.lote || 'Sem classificação') : (item.pacote || 'Sem pacote');
      allSubs.add(subKey);

      if (!groupMap.has(groupKey)) groupMap.set(groupKey, new Map());
      const group = groupMap.get(groupKey)!;
      if (!group.has(subKey)) group.set(subKey, { starts: [], ends: [], avancos: [], qtds: [], qtdsRealizadas: [], itemCount: 0, items: [] });
      const entry = group.get(subKey)!;
      entry.itemCount++;
      entry.avancos.push(item.avanco_realizado || 0);
      entry.items.push({
        id: item.id,
        descricao: item.descricao,
        classificacao_adicional: item.classificacao_adicional || undefined,
        quantidade: item.quantidade || undefined,
        avanco_realizado: item.avanco_realizado || 0,
        data_inicio_prevista: item.data_inicio_prevista || undefined,
        data_fim_prevista: item.data_fim_prevista || undefined,
        unidade: item.unidade || undefined,
      });
      if (item.quantidade != null) {
        entry.qtds.push(item.quantidade);
        entry.qtdsRealizadas.push(item.quantidade * ((item.avanco_realizado || 0) / 100));
      }
      if (item.data_inicio_prevista) entry.starts.push(new Date(item.data_inicio_prevista + 'T00:00:00').getTime());
      if (item.data_fim_prevista) entry.ends.push(new Date(item.data_fim_prevista + 'T00:00:00').getTime());
      if (item.data_inicio_real) {
        const t = new Date(item.data_inicio_real + 'T00:00:00').getTime();
        if (t > lastMeasurement) lastMeasurement = t;
      }
      if (item.data_fim_real) {
        const t = new Date(item.data_fim_real + 'T00:00:00').getTime();
        if (t > lastMeasurement) lastMeasurement = t;
      }
    }

    const sortedSubs = Array.from(allSubs).sort();
    const cMap: Record<string, string> = {};
    sortedSubs.forEach((sub, i) => { cMap[sub] = SUB_COLORS[i % SUB_COLORS.length]; });

    let dMin = Infinity, dMax = -Infinity;
    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

    const data = Array.from(groupMap.entries()).map(([groupName, subMap]) => {
      const row: Record<string, any> = {
        name: groupName.length > 25 ? groupName.substring(0, 22) + '…' : groupName,
        fullName: groupName,
        _subBars: [] as SubBarMeta[],
      };

      for (const [subName, d] of subMap.entries()) {
        const start = d.starts.length ? Math.min(...d.starts) : null;
        const end = d.ends.length ? Math.max(...d.ends) : null;
        if (start !== null) { if (start < dMin) dMin = start; if (start > dMax) dMax = start; }
        if (end !== null) { if (end < dMin) dMin = end; if (end > dMax) dMax = end; }

        row._subBars.push({
          name: subName,
          start, end,
          avanco: Number(avg(d.avancos).toFixed(1)),
          qtdTotal: Number(sum(d.qtds).toFixed(2)),
          qtdRealizada: Number(sum(d.qtdsRealizadas).toFixed(2)),
          itemCount: d.itemCount,
          items: d.items,
        });
      }
      return row;
    });

    if (todayTs < dMin) dMin = todayTs;
    if (todayTs > dMax) dMax = todayTs;
    const pad = Math.max((dMax - dMin) * 0.05, DAY_MS * 7);

    const finalMin = dMin === Infinity ? todayTs - DAY_MS * 30 : dMin - pad;
    const finalMax = dMax === -Infinity ? todayTs + DAY_MS * 30 : dMax + pad;

    // Set _allRange to full domain so the Bar spans the entire chart width
    data.forEach(row => {
      row._allRange = [finalMin, finalMax];
    });

    return {
      chartData: data,
      subCategories: sortedSubs,
      colorMap: cMap,
      lastMeasurementTs: lastMeasurement || null,
      domainMin: finalMin,
      domainMax: finalMax,
    };
  }, [items, mode, todayTs]);

  const [zoomDomain, setZoomDomain] = useState<[number, number] | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const activeDomain = zoomDomain || [domainMin, domainMax];
  const weekBands = useMemo(() => getWeekBands(activeDomain[0], activeDomain[1]), [activeDomain]);

  const toggleFullscreen = useCallback(() => {
    if (!cardRef.current) return;
    if (!document.fullscreenElement) {
      cardRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

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
    setZoomDomain([Math.max(domainMin, center - range), Math.min(domainMax, center + range)]);
  };
  const resetZoom = () => setZoomDomain(null);

  // Handle bar click to open detail dialog
  const handleBarClick = useCallback((data: any) => {
    if (!data || !data._subBars) return;
    setDetailGroup(data.fullName);
    setDetailSubs(data._subBars);
    setDetailColorMap(colorMap);
    setDetailOpen(true);
  }, [colorMap]);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <BarChart3 className="h-12 w-12 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground font-body">Importe uma EAP para visualizar a Linha de Balanço</p>
      </div>
    );
  }

  // Custom bar shape: renders ALL sub-bars for the row using a single Bar component
  const MultiSubBarShape = (props: any) => {
    const { x, y, width, height, payload } = props;
    if (width == null || height == null || !payload) return null;

    const subBars: SubBarMeta[] = payload._subBars || [];
    if (subBars.length === 0) return null;

    // We need to convert each sub-bar's [start, end] timestamps to pixel positions
    // The `x` and `width` correspond to the `_allRange` data key, which spans the full domain
    // We use the domain to map sub-bar timestamps to x positions
    const domainStart = activeDomain[0];
    const domainEnd = activeDomain[1];
    const domainRange = domainEnd - domainStart;
    // The full chart area width: x is the left edge of domain, x+width is the right edge
    const chartLeft = Math.min(x, x + width);
    const chartWidth = Math.abs(width);

    const tsToX = (ts: number) => chartLeft + ((ts - domainStart) / domainRange) * chartWidth;

    const barH = Math.min(14, height / subBars.length - 1);
    const totalBarHeight = barH * subBars.length + (subBars.length - 1);
    const startY = y + (height - totalBarHeight) / 2;

    return (
      <g style={{ cursor: 'pointer' }} onClick={() => handleBarClick(payload)}>
        {subBars.map((sub, i) => {
          if (sub.start == null || sub.end == null) return null;
          const barX = tsToX(sub.start);
          const barEndX = tsToX(sub.end);
          const barW = Math.max(barEndX - barX, 2);
          const barY = startY + i * (barH + 1);
          const fillColor = colorMap[sub.name] || 'hsl(var(--muted-foreground))';
          const pct = sub.avanco;
          const filledW = barW * (pct / 100);
          const rx = 2;

          const maxChars = Math.max(0, Math.floor(barW / 7));
          const label = sub.name.length > maxChars ? sub.name.substring(0, maxChars - 1) + '…' : sub.name;

          return (
            <g key={sub.name}>
              <rect x={barX} y={barY} width={barW} height={barH} rx={rx} ry={rx}
                fill={fillColor} opacity={0.3} />
              {filledW > 0 && (
                <rect x={barX} y={barY} width={Math.min(filledW, barW)} height={barH} rx={rx} ry={rx}
                  fill={fillColor} opacity={0.9} />
              )}
              {barW > 40 && (
                <text x={barX + 5} y={barY + barH / 2} dominantBaseline="central"
                  fontSize={9} fontWeight={600} fill="white"
                  style={{ textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}>
                  {label}
                </text>
              )}
            </g>
          );
        })}
      </g>
    );
  };

  // Dynamic chart config
  const dynamicConfig: ChartConfig = {};
  subCategories.forEach(sub => {
    dynamicConfig[sub] = { label: sub, color: colorMap[sub] };
  });

  return (
    <>
      <Card ref={cardRef} className={`flex flex-col ${isFullscreen ? 'h-screen bg-background' : 'h-full'}`}>
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
          <div className="w-px h-4 bg-border mx-1" />
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggleFullscreen} title={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}>
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </Button>
        </div>
        <CardContent className="flex-1 min-h-0 p-2 pt-1">
          <ChartContainer config={dynamicConfig} className="h-full w-full">
            <ComposedChart
              data={chartData}
              layout="vertical"
              margin={{ top: 5, right: 15, left: 0, bottom: 5 }}
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
                width={150}
                fontSize={11}
                tick={{ fill: 'hsl(var(--foreground))' }}
              />
              {/* Disable hover tooltip */}
              <Tooltip content={() => null} />

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

              {/* Single Bar with custom shape rendering all sub-bars */}
              <Bar dataKey="_allRange" barSize={50}
                shape={<MultiSubBarShape />}
              />
            </ComposedChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Detail dialog - click on bar to open */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-base">{detailGroup}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-4 pb-4">
              {detailSubs.map((sub) => (
                <div key={sub.name} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-sm shrink-0"
                      style={{ backgroundColor: detailColorMap[sub.name] }} />
                    <span className="font-heading font-semibold text-sm text-foreground">{sub.name}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 pl-5 text-xs">
                    {sub.start && sub.end && (
                      <>
                        <span className="text-muted-foreground">Período:</span>
                        <span className="text-foreground">{formatDateFull(sub.start)} → {formatDateFull(sub.end)}</span>
                      </>
                    )}
                    <span className="text-muted-foreground">Avanço:</span>
                    <span className="text-foreground font-medium">{sub.avanco}%</span>
                    {sub.qtdTotal > 0 && (
                      <>
                        <span className="text-muted-foreground">Qtd:</span>
                        <span className="text-foreground">{sub.qtdRealizada.toLocaleString('pt-BR')} / {sub.qtdTotal.toLocaleString('pt-BR')}</span>
                      </>
                    )}
                    <span className="text-muted-foreground">Itens:</span>
                    <span className="text-foreground">{sub.itemCount}</span>
                  </div>
                  {/* Progress bar */}
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden ml-5" style={{ maxWidth: '200px' }}>
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${Math.min(sub.avanco, 100)}%`, backgroundColor: detailColorMap[sub.name] }} />
                  </div>
                  {/* Individual items */}
                  <div className="pl-5 space-y-1">
                    {sub.items.map((item) => (
                      <div key={item.id} className="border border-border/50 rounded px-3 py-1.5 text-xs">
                        <div className="flex items-baseline gap-1">
                          <span className="font-body text-foreground">{item.descricao}</span>
                          {item.classificacao_adicional && (
                            <span className="text-muted-foreground italic text-[10px]">({item.classificacao_adicional})</span>
                          )}
                        </div>
                        <div className="flex gap-3 text-muted-foreground mt-0.5">
                          <span>{item.avanco_realizado || 0}%</span>
                          {item.quantidade != null && item.unidade && (
                            <span>{((item.quantidade * ((item.avanco_realizado || 0) / 100))).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} / {item.quantidade.toLocaleString('pt-BR')} {item.unidade}</span>
                          )}
                          {item.data_inicio_prevista && item.data_fim_prevista && (
                            <span>{item.data_inicio_prevista.split('-').reverse().join('/')} → {item.data_fim_prevista.split('-').reverse().join('/')}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
