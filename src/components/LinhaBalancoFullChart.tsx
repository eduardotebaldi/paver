import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Maximize, Minimize, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ChartContainer,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  ReferenceArea,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { EapItem } from '@/services/api';

type GroupMode = 'pacote' | 'servico';

const DAY_MS = 86400000;
const WEEK_MS = DAY_MS * 7;
const SUB_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

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

interface Props {
  eapItems: EapItem[];
  mode: GroupMode;
  obraName?: string;
  obraDataInicio?: string;
  obraDataPrevisao?: string;
}

function getWeekBands(domainStart: number, domainEnd: number, maxBands = 26): { x1: number; x2: number; odd: boolean }[] {
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
    if (bands.length >= maxBands) break;
  }

  return bands;
}

function parseDateLocal(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

function formatDateTick(ts: number) {
  const d = new Date(ts);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

function formatDateFull(ts: number) {
  const d = new Date(ts);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${d.getFullYear()}`;
}

function ChartLoadingState({ title, description }: { title: string; description: string }) {
  return (
    <Card className="h-full">
      <CardContent className="flex h-full min-h-[320px] flex-col items-center justify-center gap-4 p-6">
        <div className="flex items-center gap-3 text-foreground">
          <LoaderIcon />
          <div className="text-center">
            <p className="font-heading text-base">{title}</p>
            <p className="font-body text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="h-2 w-full max-w-sm overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
        </div>
      </CardContent>
    </Card>
  );
}

function LoaderIcon() {
  return <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" aria-hidden="true" />;
}

// Extracted outside component to prevent Recharts unmount/remount on every render
function createMultiSubBarShape(
  activeDomainRef: React.MutableRefObject<[number, number]>,
  colorMapRef: React.MutableRefObject<Record<string, string>>,
  handleBarClickRef: React.MutableRefObject<(data: any, clickedSub?: SubBarMeta) => void>,
) {
  return function MultiSubBarShape(props: any) {
    const { x, y, width, height, payload } = props;
    if (width == null || height == null || !payload) return null;

    const subBars: SubBarMeta[] = (payload._subBars || []).filter(
      (sub: SubBarMeta) => sub.start != null && sub.end != null,
    );
    if (subBars.length === 0) return null;

    const chartLeft = Math.min(x, x + width);
    const chartWidth = Math.abs(width);
    const [domainStart, domainEnd] = activeDomainRef.current;
    const domainRange = domainEnd - domainStart;
    const tsToX = (ts: number) => chartLeft + ((ts - domainStart) / domainRange) * chartWidth;
    const cMap = colorMapRef.current;
    const onBarClick = handleBarClickRef.current;

    const barH = Math.min(14, (height - (subBars.length - 1)) / subBars.length);
    const totalBarHeight = barH * subBars.length + (subBars.length - 1);
    const startY = y + (height - totalBarHeight) / 2;
    const clipId = `clip-bars-${String(payload?.fullName || payload?.name || 'x').replace(/\s+/g, '-')}`;

    return (
      <g style={{ cursor: 'pointer' }}>
        <defs>
          <clipPath id={clipId}>
            <rect x={chartLeft} y={y - 2} width={chartWidth} height={height + 4} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          {subBars.map((sub, index) => {
            const barX = tsToX(sub.start!);
            const barEndX = tsToX(sub.end!);
            const barW = Math.max(barEndX - barX, 2);
            const barY = startY + index * (barH + 1);
            const fillColor = cMap[sub.name] || 'hsl(var(--muted-foreground))';
            const filledW = barW * (sub.avanco / 100);
            const visibleW = Math.max(0, Math.min(barX + barW, chartLeft + chartWidth) - Math.max(barX, chartLeft));
            const maxChars = Math.max(0, Math.floor(visibleW / 7));
            const label = sub.name.length > maxChars && maxChars > 1
              ? `${sub.name.substring(0, maxChars - 1)}…`
              : sub.name;
            const labelX = Math.max(barX + 5, chartLeft + 5);

            return (
              <g key={sub.name} onClick={(event) => { event.stopPropagation(); onBarClick(payload, sub); }}>
                <rect x={barX} y={barY} width={barW} height={barH} rx={2} ry={2} fill={fillColor} opacity={0.3} />
                {filledW > 0 && (
                  <rect x={barX} y={barY} width={Math.min(filledW, barW)} height={barH} rx={2} ry={2} fill={fillColor} opacity={0.9} />
                )}
                {visibleW > 40 && (
                  <text
                    x={labelX}
                    y={barY + barH / 2}
                    dominantBaseline="central"
                    fontSize={9}
                    fontWeight={600}
                    fill="hsl(var(--primary-foreground))"
                    style={{ textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}
                  >
                    {label}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </g>
    );
  };
}

export default function LinhaBalancoFullChart({ eapItems, mode, obraName, obraDataInicio, obraDataPrevisao }: Props) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailGroup, setDetailGroup] = useState('');
  const [detailSubs, setDetailSubs] = useState<SubBarMeta[]>([]);
  const [detailColorMap, setDetailColorMap] = useState<Record<string, string>>({});
  const [zoomDomain, setZoomDomain] = useState<[number, number] | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const todayTs = useMemo(() => new Date().setHours(0, 0, 0, 0), []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const items = useMemo(() => {
    return eapItems.filter(i => i.tipo === 'item');
  }, [eapItems]);

  const { chartData, subCategories, colorMap, lastMeasurementTs, domainMin, domainMax } = useMemo(() => {
    const defaultMin = todayTs - DAY_MS * 30;
    const defaultMax = todayTs + DAY_MS * 30;

    const groupMap = new Map<string, Map<string, {
      starts: number[];
      ends: number[];
      avancos: number[];
      qtds: number[];
      qtdsRealizadas: number[];
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
      if (!group.has(subKey)) {
        group.set(subKey, {
          starts: [],
          ends: [],
          avancos: [],
          qtds: [],
          qtdsRealizadas: [],
          itemCount: 0,
          items: [],
        });
      }

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
      if (item.data_inicio_prevista) entry.starts.push(new Date(`${item.data_inicio_prevista}T00:00:00`).getTime());
      if (item.data_fim_prevista) entry.ends.push(new Date(`${item.data_fim_prevista}T00:00:00`).getTime());
      if (item.data_inicio_real) {
        const t = new Date(`${item.data_inicio_real}T00:00:00`).getTime();
        if (t > lastMeasurement) lastMeasurement = t;
      }
      if (item.data_fim_real) {
        const t = new Date(`${item.data_fim_real}T00:00:00`).getTime();
        if (t > lastMeasurement) lastMeasurement = t;
      }
    }

    const sortedSubs = Array.from(allSubs).sort();
    const cMap: Record<string, string> = {};
    sortedSubs.forEach((sub, index) => {
      cMap[sub] = SUB_COLORS[index % SUB_COLORS.length];
    });

    let dMin = Infinity;
    let dMax = -Infinity;
    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

    const data = Array.from(groupMap.entries()).map(([groupName, subMap]) => {
      const row: Record<string, any> = {
        name: groupName.length > 18 ? `${groupName.substring(0, 16)}…` : groupName,
        fullName: groupName,
        _subBars: [] as SubBarMeta[],
      };

      for (const [subName, details] of subMap.entries()) {
        const start = details.starts.length ? Math.min(...details.starts) : null;
        const end = details.ends.length ? Math.max(...details.ends) : null;

        if (start !== null) {
          if (start < dMin) dMin = start;
          if (start > dMax) dMax = start;
        }
        if (end !== null) {
          if (end < dMin) dMin = end;
          if (end > dMax) dMax = end;
        }

        row._subBars.push({
          name: subName,
          start,
          end,
          avanco: Number(avg(details.avancos).toFixed(1)),
          qtdTotal: Number(sum(details.qtds).toFixed(2)),
          qtdRealizada: Number(sum(details.qtdsRealizadas).toFixed(2)),
          itemCount: details.itemCount,
          items: details.items,
        });
      }

      return row;
    });

    if (todayTs < dMin) dMin = todayTs;
    if (todayTs > dMax) dMax = todayTs;
    const pad = Math.max((dMax - dMin) * 0.05, DAY_MS * 7);
    const finalMin = dMin === Infinity ? todayTs - DAY_MS * 30 : dMin - pad;
    const finalMax = dMax === -Infinity ? todayTs + DAY_MS * 30 : dMax + pad;

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

  const activeDomain = zoomDomain || [domainMin, domainMax];
  const weekBands = useMemo(() => getWeekBands(activeDomain[0], activeDomain[1]), [activeDomain]);

  const toggleFullscreen = useCallback(() => {
    if (!cardRef.current) return;
    if (!document.fullscreenElement) {
      cardRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
      return;
    }
    document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
  }, []);

  const handleBarClick = useCallback((data: any, clickedSub?: SubBarMeta) => {
    if (!data || !data._subBars) return;
    setDetailGroup(clickedSub ? `${data.fullName} — ${clickedSub.name}` : data.fullName);
    setDetailSubs(clickedSub ? [clickedSub] : data._subBars);
    setDetailColorMap(colorMap);
    setDetailOpen(true);
  }, [colorMap]);

  const zoomIn = () => {
    const [left, right] = activeDomain;
    const range = right - left;
    const center = (left + right) / 2;
    setZoomDomain([center - range * 0.25, center + range * 0.25]);
  };

  const zoomOut = () => {
    const [left, right] = activeDomain;
    const range = right - left;
    const center = (left + right) / 2;
    setZoomDomain([Math.max(domainMin, center - range), Math.min(domainMax, center + range)]);
  };
  const resetZoom = () => setZoomDomain(null);

  // Refs for the extracted MultiSubBarShape to avoid re-creating on each render
  const activeDomainRef = useRef<[number, number]>(activeDomain as [number, number]);
  activeDomainRef.current = activeDomain as [number, number];
  const colorMapRef = useRef(colorMap);
  colorMapRef.current = colorMap;
  const handleBarClickRef = useRef(handleBarClick);
  handleBarClickRef.current = handleBarClick;

  const MultiSubBarShape = useMemo(
    () => createMultiSubBarShape(activeDomainRef, colorMapRef, handleBarClickRef),
    [], // stable reference — reads latest values via refs
  );

  if (items.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <BarChart3 className="mb-3 h-12 w-12 text-muted-foreground/30" />
        <p className="font-body text-sm text-muted-foreground">Importe uma EAP para visualizar a Linha de Balanço</p>
      </div>
    );
  }

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
          <div className="mx-1 h-4 w-px bg-border" />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
          >
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </Button>
        </div>
        <CardContent className="flex-1 min-h-0 p-2 pt-1">
          <ChartContainer config={dynamicConfig} className="h-full w-full">
            <ComposedChart data={chartData} layout="vertical" margin={{ top: 5, right: 15, left: 0, bottom: 5 }}>
              {weekBands.filter(week => week.odd).map((week, index) => (
                <ReferenceArea
                  key={`week-${index}`}
                  x1={week.x1}
                  x2={week.x2}
                  fill="hsl(var(--muted))"
                  fillOpacity={0.4}
                  ifOverflow="hidden"
                />
              ))}
              <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} />
              <XAxis
                type="number"
                domain={activeDomain}
                tickFormatter={formatDateTick}
                fontSize={10}
                scale="time"
                ticks={weekBands.map(week => week.x1)}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={120}
                fontSize={9}
                tick={{ fill: 'hsl(var(--foreground))' }}
                interval={0}
              />
              <Tooltip content={() => null} />
              <ReferenceLine
                x={todayTs}
                stroke="hsl(var(--destructive))"
                strokeWidth={2}
                strokeDasharray="4 4"
                label={{ value: 'Hoje', position: 'top', fill: 'hsl(var(--destructive))', fontSize: 10 }}
              />
              {lastMeasurementTs && (
                <ReferenceLine
                  x={lastMeasurementTs}
                  stroke="hsl(var(--chart-4))"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  label={{ value: 'Últ. medição', position: 'top', fill: 'hsl(var(--chart-4))', fontSize: 10 }}
                />
              )}
              <Bar dataKey="_allRange" barSize={50} fill="transparent" shape={<MultiSubBarShape />} />
            </ComposedChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-base">{detailGroup || obraName || 'Detalhes da barra'}</DialogTitle>
            <DialogDescription className="font-body text-xs">
              Detalhamento dos serviços e quantidades representados na linha selecionada.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-4 pb-4">
              {detailSubs.map(sub => (
                <div key={sub.name} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-3 w-3 shrink-0 rounded-sm"
                      style={{ backgroundColor: detailColorMap[sub.name] }}
                    />
                    <span className="font-heading text-sm font-semibold text-foreground">{sub.name}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 pl-5 text-xs">
                    {sub.start && sub.end && (
                      <>
                        <span className="text-muted-foreground">Período:</span>
                        <span className="text-foreground">{formatDateFull(sub.start)} → {formatDateFull(sub.end)}</span>
                      </>
                    )}
                    <span className="text-muted-foreground">Avanço:</span>
                    <span className="font-medium text-foreground">{sub.avanco}%</span>
                    {sub.qtdTotal > 0 && (
                      <>
                        <span className="text-muted-foreground">Qtd:</span>
                        <span className="text-foreground">
                          {sub.qtdRealizada.toLocaleString('pt-BR')} / {sub.qtdTotal.toLocaleString('pt-BR')}
                        </span>
                      </>
                    )}
                    <span className="text-muted-foreground">Itens:</span>
                    <span className="text-foreground">{sub.itemCount}</span>
                  </div>
                  <div className="ml-5 h-1.5 w-full max-w-[200px] overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${Math.min(sub.avanco, 100)}%`, backgroundColor: detailColorMap[sub.name] }}
                    />
                  </div>
                  <div className="space-y-1 pl-5">
                    {sub.items.map(item => (
                      <div key={item.id} className="rounded border border-border/50 px-3 py-1.5 text-xs">
                        <div className="flex items-baseline gap-1">
                          <span className="font-body text-foreground">{item.descricao}</span>
                          {item.classificacao_adicional && (
                            <span className="text-[10px] italic text-muted-foreground">({item.classificacao_adicional})</span>
                          )}
                        </div>
                        <div className="mt-0.5 flex gap-3 text-muted-foreground">
                          <span>{item.avanco_realizado || 0}%</span>
                          {item.quantidade != null && item.unidade && (
                            <span>
                              {(item.quantidade * ((item.avanco_realizado || 0) / 100)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
                              {' / '}
                              {item.quantidade.toLocaleString('pt-BR')} {item.unidade}
                            </span>
                          )}
                          {item.data_inicio_prevista && item.data_fim_prevista && (
                            <span>
                              {item.data_inicio_prevista.split('-').reverse().join('/')} → {item.data_fim_prevista.split('-').reverse().join('/')}
                            </span>
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
