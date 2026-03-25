import { useState, useMemo, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AlertTriangle, Building2, Calendar, ChevronDown, ChevronRight, ChevronsUpDown, FolderTree, Layers, Loader2, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { fetchEapItems, fetchObras } from '@/services/api';
import { bulkUpdateEapItems } from '@/services/eapApi';
import type { EapItem } from '@/services/api';

type GroupMode = 'pacote' | 'servico';

interface DateChange {
  id: string;
  data_inicio_prevista?: string;
  data_fim_prevista?: string;
}

interface FlatRow {
  type: 'group' | 'item';
  key: string;
  groupKey?: string;
  label?: string;
  itemCount?: number;
  item?: EapItem;
}

function buildFlatRows(items: EapItem[], mode: GroupMode, collapsed: Set<string>): FlatRow[] {
  const editableItems = items.filter(i => i.tipo === 'item').sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  const map = new Map<string, EapItem[]>();

  for (const item of editableItems) {
    const key = mode === 'pacote' ? (item.pacote || 'Sem pacote') : (item.lote || 'Sem classificação');
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }

  const rows: FlatRow[] = [];
  for (const [key, groupItems] of map.entries()) {
    rows.push({ type: 'group', key: `group-${key}`, groupKey: key, label: key, itemCount: groupItems.length });
    if (!collapsed.has(key)) {
      for (const item of groupItems) {
        rows.push({ type: 'item', key: item.id, groupKey: key, item });
      }
    }
  }
  return rows;
}

export default function DatasEap() {
  const [searchParams] = useSearchParams();
  const initialObra = searchParams.get('obra') || '';
  const filterMissing = searchParams.get('filter') === 'sem-datas';
  const [selectedObra, setSelectedObra] = useState(initialObra);
  const [groupMode, setGroupMode] = useState<GroupMode>('pacote');
  const [changes, setChanges] = useState<Map<string, DateChange>>(new Map());
  const [collapsed, setCollapsed] = useState<Set<string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [offsetDays, setOffsetDays] = useState('');
  const parentRef = useRef<HTMLDivElement>(null);

  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();
  const canEdit = hasRole('admin') || hasRole('engenharia');

  const { data: obras = [] } = useQuery({ queryKey: ['obras'], queryFn: fetchObras });
  const { data: eapItems = [], isLoading } = useQuery({
    queryKey: ['eap-items-datas', selectedObra],
    queryFn: () => fetchEapItems(selectedObra),
    enabled: !!selectedObra,
  });

  const selectedObraObj = obras.find(o => o.id === selectedObra);
  const obraInicio = selectedObraObj?.data_inicio || '';
  const obraFim = selectedObraObj?.data_previsao || '';

  const effectiveCollapsed = useMemo(() => {
    if (collapsed !== null) return collapsed;
    if (filterMissing) return new Set<string>(); // Start expanded when filtering
    const editableItems = eapItems.filter(i => i.tipo === 'item');
    const groups = new Set<string>();
    for (const item of editableItems) {
      const key = groupMode === 'pacote' ? (item.pacote || 'Sem pacote') : (item.lote || 'Sem classificação');
      groups.add(key);
    }
    return groups; // Start all collapsed
  }, [collapsed, eapItems, groupMode, filterMissing]);

  const filteredForDisplay = useMemo(() => {
    if (!filterMissing) return eapItems;
    return eapItems.filter(i => {
      if (i.tipo !== 'item') return false;
      return !i.data_inicio_prevista || !i.data_fim_prevista;
    });
  }, [eapItems, filterMissing]);

  const flatRows = useMemo(
    () => buildFlatRows(filterMissing ? filteredForDisplay : eapItems, groupMode, effectiveCollapsed),
    [filteredForDisplay, eapItems, filterMissing, groupMode, effectiveCollapsed],
  );

  const virtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => flatRows[index]?.type === 'group' ? 40 : 44,
    overscan: 10,
  });

  const toggleGroup = useCallback((key: string) => {
    setCollapsed(prev => {
      const base = prev ?? effectiveCollapsed;
      const next = new Set(base);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, [effectiveCollapsed]);

  const toggleAll = useCallback(() => {
    const editableItems = eapItems.filter(i => i.tipo === 'item');
    const allGroups = new Set<string>();
    for (const item of editableItems) {
      const key = groupMode === 'pacote' ? (item.pacote || 'Sem pacote') : (item.lote || 'Sem classificação');
      allGroups.add(key);
    }
    if (effectiveCollapsed.size === allGroups.size) {
      setCollapsed(new Set());
    } else {
      setCollapsed(allGroups);
    }
  }, [eapItems, groupMode, effectiveCollapsed]);

  const updateDate = useCallback((itemId: string, field: 'data_inicio_prevista' | 'data_fim_prevista', value: string) => {
    if (value && obraInicio && value < obraInicio) {
      toast({ title: 'Data fora do período da obra', description: `A data não pode ser anterior a ${obraInicio}.`, variant: 'destructive' });
      return;
    }
    if (value && obraFim && value > obraFim) {
      toast({ title: 'Data fora do período da obra', description: `A data não pode ser posterior a ${obraFim}.`, variant: 'destructive' });
      return;
    }
    setChanges(prev => {
      const next = new Map(prev);
      const existing = next.get(itemId) || { id: itemId };
      next.set(itemId, { ...existing, [field]: value });
      return next;
    });
  }, [obraInicio, obraFim, toast]);

  const getDate = useCallback((item: EapItem, field: 'data_inicio_prevista' | 'data_fim_prevista') => {
    const change = changes.get(item.id);
    if (change && change[field] !== undefined) return change[field]!;
    return item[field] || '';
  }, [changes]);

  const applyOffset = useCallback(() => {
    const days = parseInt(offsetDays);
    if (isNaN(days)) return;
    const editableItems = eapItems.filter(i => i.tipo === 'item');
    const next = new Map(changes);
    let outOfRange = 0;
    for (const item of editableItems) {
      const existing = next.get(item.id) || { id: item.id };
      if (item.data_inicio_prevista) {
        const [y, m, d] = item.data_inicio_prevista.split('-').map(Number);
        const date = new Date(y, m - 1, d + days);
        const val = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        if ((obraInicio && val < obraInicio) || (obraFim && val > obraFim)) { outOfRange++; continue; }
        existing.data_inicio_prevista = val;
      }
      if (item.data_fim_prevista) {
        const [y, m, d] = item.data_fim_prevista.split('-').map(Number);
        const date = new Date(y, m - 1, d + days);
        const val = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        if ((obraInicio && val < obraInicio) || (obraFim && val > obraFim)) { outOfRange++; continue; }
        existing.data_fim_prevista = val;
      }
      next.set(item.id, existing);
    }
    setChanges(next);
    if (outOfRange > 0) {
      toast({ title: `${outOfRange} datas ignoradas`, description: 'Algumas datas ficaram fora do período da obra.', variant: 'destructive' });
    }
  }, [offsetDays, eapItems, changes, obraInicio, obraFim, toast]);

  const handleSave = async () => {
    if (changes.size === 0) return;
    setSaving(true);
    try {
      const updates = Array.from(changes.values()).map(c => ({
        id: c.id,
        updates: {
          ...(c.data_inicio_prevista !== undefined && { data_inicio_prevista: c.data_inicio_prevista || null }),
          ...(c.data_fim_prevista !== undefined && { data_fim_prevista: c.data_fim_prevista || null }),
        } as Partial<EapItem>,
      }));
      await bulkUpdateEapItems(updates);
      queryClient.invalidateQueries({ queryKey: ['eap-items-datas', selectedObra] });
      queryClient.invalidateQueries({ queryKey: ['eap-items-balance', selectedObra] });
      toast({ title: `${updates.length} itens atualizados!` });
      setChanges(new Map());
    } finally {
      setSaving(false);
    }
  };

  const switchGroupMode = (mode: GroupMode) => {
    setGroupMode(mode);
    setCollapsed(null);
  };

  if (!selectedObra) {
    return (
      <div className="flex h-[calc(100vh-8rem)] flex-col items-center justify-center gap-6">
        <Calendar className="h-16 w-16 text-muted-foreground/30" />
        <div className="space-y-1 text-center">
          <h1 className="font-heading text-2xl font-bold text-foreground">Edição de Datas da EAP</h1>
          <p className="font-body text-muted-foreground">Selecione uma obra para editar datas</p>
        </div>
        <Select value="" onValueChange={setSelectedObra}>
          <SelectTrigger className="w-72 font-body">
            <Building2 className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Escolha uma obra" />
          </SelectTrigger>
          <SelectContent>
            {obras.map(obra => (
              <SelectItem key={obra.id} value={obra.id} className="font-body">{obra.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-end gap-3 shrink-0">
        <div className="space-y-1">
          <Label className="font-body text-xs text-muted-foreground">Obra</Label>
          <Select value={selectedObra} onValueChange={v => { setSelectedObra(v); setChanges(new Map()); setCollapsed(null); }}>
            <SelectTrigger className="w-52 font-body">
              <Building2 className="mr-2 h-4 w-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {obras.map(obra => (
                <SelectItem key={obra.id} value={obra.id} className="font-body">{obra.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="font-body text-xs text-muted-foreground">Agrupar por</Label>
          <div className="overflow-hidden rounded-md border border-border flex items-center">
            <button
              onClick={() => switchGroupMode('pacote')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-body transition-colors ${
                groupMode === 'pacote' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              <FolderTree className="h-3.5 w-3.5" />
              Pacote
            </button>
            <button
              onClick={() => switchGroupMode('servico')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-body transition-colors ${
                groupMode === 'servico' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              Serviço
            </button>
          </div>
        </div>

        <Button variant="ghost" size="sm" onClick={toggleAll} className="font-body h-8 text-xs">
          <ChevronsUpDown className="h-3.5 w-3.5 mr-1" />
          {effectiveCollapsed.size > 0 ? 'Expandir' : 'Recolher'}
        </Button>

        <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50 border border-border">
          <span className="text-xs text-muted-foreground font-body">Deslocar</span>
          <Input
            type="number"
            value={offsetDays}
            onChange={e => setOffsetDays(e.target.value)}
            className="w-16 h-7 text-xs"
            placeholder="0"
          />
          <span className="text-xs text-muted-foreground font-body">dias</span>
          <Button size="sm" variant="secondary" onClick={applyOffset} className="font-body h-7 text-xs">Aplicar</Button>
        </div>

        {canEdit && changes.size > 0 && (
          <div className="ml-auto">
            <Button onClick={handleSave} disabled={saving} className="font-body">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar {changes.size} alterações
            </Button>
          </div>
        )}
      </div>

      {/* Filter badge */}
      {filterMissing && (
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="destructive" className="font-body text-xs flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Exibindo apenas atividades sem datas previstas ({filteredForDisplay.length} itens)
            <button onClick={() => navigate(`/datas-eap?obra=${selectedObra}`)} className="ml-1 hover:opacity-70">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        </div>
      )}

      {/* Table Header */}
      <div className="grid grid-cols-[1fr_160px_160px_80px] gap-1 px-4 py-2 bg-muted/50 rounded-t-md border border-border text-xs font-body text-muted-foreground font-medium shrink-0">
        <span>Item</span>
        <span>Início Previsto</span>
        <span>Fim Previsto</span>
        <span className="text-center">Dias</span>
      </div>

      {/* Virtualized Body */}
      {isLoading ? (
        <Card className="flex-1">
          <CardContent className="flex items-center justify-center h-full">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="font-body text-sm text-muted-foreground">Carregando itens...</span>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div ref={parentRef} className="flex-1 min-h-0 overflow-auto border border-t-0 border-border rounded-b-md">
          <div style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
            {virtualizer.getVirtualItems().map(virtualRow => {
              const row = flatRows[virtualRow.index];
              if (!row) return null;

              if (row.type === 'group') {
                const isCollapsed = effectiveCollapsed.has(row.groupKey!);
                const groupChangedCount = row.itemCount
                  ? flatRows
                      .filter(r => r.type === 'item' && r.groupKey === row.groupKey)
                      .filter(r => changes.has(r.item!.id)).length
                  : 0;

                return (
                  <div
                    key={row.key}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className="grid grid-cols-[1fr_160px_160px_80px] gap-1 px-4 items-center bg-muted/50 hover:bg-muted cursor-pointer border-b border-border"
                    onClick={() => toggleGroup(row.groupKey!)}
                  >
                    <div className="flex items-center gap-2 font-medium text-xs font-heading">
                      {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      <span>{row.label}</span>
                      <Badge variant="secondary" className="text-[10px] font-body">{row.itemCount}</Badge>
                      {groupChangedCount > 0 && <Badge variant="default" className="text-[10px] font-body">{groupChangedCount} alt.</Badge>}
                    </div>
                    <div /><div /><div />
                  </div>
                );
              }

              const item = row.item!;
              const inicio = getDate(item, 'data_inicio_prevista');
              const fim = getDate(item, 'data_fim_prevista');
              const duration = inicio && fim
                ? Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / (1000 * 60 * 60 * 24))
                : null;
              const isChanged = changes.has(item.id);

              return (
                <div
                  key={row.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className={`grid grid-cols-[1fr_160px_160px_80px] gap-1 px-4 pl-10 items-center border-b border-border/50 ${isChanged ? 'bg-accent/10' : ''}`}
                >
                  <div className="text-xs font-body truncate">
                    {item.codigo && <span className="text-muted-foreground mr-1">{item.codigo}</span>}
                    <span>{item.descricao}</span>
                  </div>
                  <Input
                    type="date"
                    value={inicio}
                    min={obraInicio || undefined}
                    max={obraFim || undefined}
                    onChange={e => updateDate(item.id, 'data_inicio_prevista', e.target.value)}
                    className="h-7 text-xs"
                  />
                  <Input
                    type="date"
                    value={fim}
                    min={obraInicio || undefined}
                    max={obraFim || undefined}
                    onChange={e => updateDate(item.id, 'data_fim_prevista', e.target.value)}
                    className="h-7 text-xs"
                  />
                  <span className="text-xs text-muted-foreground text-center font-body">
                    {duration !== null ? `${duration}d` : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
