import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Calendar, ChevronDown, ChevronRight, FolderTree, Layers, ChevronsUpDown } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import type { EapItem } from '@/services/api';
import CollapsibleClassification from '@/components/CollapsibleClassification';

interface DateChange {
  id: string;
  data_inicio_prevista?: string;
  data_fim_prevista?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: EapItem[];
  onSave: (changes: { id: string; updates: Partial<EapItem> }[]) => Promise<void>;
}

type GroupMode = 'pacote' | 'servico';

interface GroupedData {
  key: string;
  label: string;
  items: EapItem[];
}

function buildGroups(items: EapItem[], mode: GroupMode): GroupedData[] {
  const editableItems = items.filter(i => i.tipo === 'item').sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  const map = new Map<string, EapItem[]>();

  for (const item of editableItems) {
    const key = mode === 'pacote'
      ? (item.pacote || 'Sem pacote')
      : (item.lote || 'Sem classificação');
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }

  return Array.from(map.entries()).map(([key, items]) => ({ key, label: key, items }));
}

export default function EapMassDateEditor({ open, onOpenChange, items, onSave }: Props) {
  const [saving, setSaving] = useState(false);
  const [changes, setChanges] = useState<Map<string, DateChange>>(new Map());
  const [groupMode, setGroupMode] = useState<GroupMode>('pacote');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string> | null>(null);
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({});

  const groups = useMemo(() => buildGroups(items, groupMode), [items, groupMode]);

  // Start with all groups collapsed to avoid rendering 500+ date inputs at once
  const effectiveCollapsed = useMemo(() => {
    if (collapsedGroups !== null) return collapsedGroups;
    return new Set(groups.map(g => g.key));
  }, [collapsedGroups, groups]);

  const editableItems = useMemo(() =>
    items.filter(i => i.tipo === 'item').sort((a, b) => (a.ordem || 0) - (b.ordem || 0)),
    [items]
  );

  const updateDate = (itemId: string, field: 'data_inicio_prevista' | 'data_fim_prevista', value: string) => {
    setChanges(prev => {
      const next = new Map(prev);
      const existing = next.get(itemId) || { id: itemId };
      next.set(itemId, { ...existing, [field]: value });
      return next;
    });
  };

  const getDate = (item: EapItem, field: 'data_inicio_prevista' | 'data_fim_prevista') => {
    const change = changes.get(item.id);
    if (change && change[field] !== undefined) return change[field]!;
    return item[field] || '';
  };

  const changedCount = changes.size;

  const handleSave = async () => {
    if (changedCount === 0) return;
    setSaving(true);
    try {
      const updates = Array.from(changes.values()).map(c => ({
        id: c.id,
        updates: {
          ...(c.data_inicio_prevista !== undefined && { data_inicio_prevista: c.data_inicio_prevista || null }),
          ...(c.data_fim_prevista !== undefined && { data_fim_prevista: c.data_fim_prevista || null }),
        } as Partial<EapItem>,
      }));
      await onSave(updates);
      setChanges(new Map());
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const [offsetDays, setOffsetDays] = useState<string>('');

  const applyOffset = () => {
    const days = parseInt(offsetDays);
    if (isNaN(days)) return;
    const next = new Map(changes);
    for (const item of editableItems) {
      const existing = next.get(item.id) || { id: item.id };
      const inicio = item.data_inicio_prevista;
      const fim = item.data_fim_prevista;
      if (inicio) {
        const d = new Date(inicio);
        d.setDate(d.getDate() + days);
        existing.data_inicio_prevista = d.toISOString().split('T')[0];
      }
      if (fim) {
        const d = new Date(fim);
        d.setDate(d.getDate() + days);
        existing.data_fim_prevista = d.toISOString().split('T')[0];
      }
      next.set(item.id, existing);
    }
    setChanges(next);
  };

  const toggleGroup = (key: string) => {
    const base = effectiveCollapsed;
    const next = new Set(base);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setCollapsedGroups(next);
  };

  const toggleAll = () => {
    if (effectiveCollapsed.size === groups.length) {
      setCollapsedGroups(new Set());
    } else {
      setCollapsedGroups(new Set(groups.map(g => g.key)));
    }
  };

  const switchGroupMode = (mode: GroupMode) => {
    setGroupMode(mode);
    setCollapsedGroups(null); // reset to all-collapsed default
    setVisibleCounts({}); // reset pagination
  };

  const showMore = (key: string) => {
    setVisibleCounts(prev => ({ ...prev, [key]: (prev[key] || 30) + 30 }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Edição em Massa de Datas
            {changedCount > 0 && (
              <Badge variant="default" className="text-xs font-body">{changedCount} alterações</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Group mode toggle */}
          <div className="flex items-center rounded-md border border-border overflow-hidden">
            <button
              onClick={() => switchGroupMode('pacote')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-body transition-colors ${
                groupMode === 'pacote'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              <FolderTree className="h-3.5 w-3.5" />
              Pacote
            </button>
            <button
              onClick={() => switchGroupMode('servico')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-body transition-colors ${
                groupMode === 'servico'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              Serviço
            </button>
          </div>

          <Button variant="ghost" size="sm" onClick={toggleAll} className="font-body h-8 text-xs">
            <ChevronsUpDown className="h-3.5 w-3.5 mr-1" />
            {effectiveCollapsed.size === groups.length ? 'Expandir' : 'Recolher'}
          </Button>

          <div className="flex-1" />

          {/* Offset tool */}
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
            <Button size="sm" variant="secondary" onClick={applyOffset} className="font-body h-7 text-xs">
              Aplicar
            </Button>
          </div>
        </div>

        {/* Grouped Table */}
        <div className="flex-1 overflow-auto min-h-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-body text-xs">Item</TableHead>
                <TableHead className="font-body text-xs w-40">Início Previsto</TableHead>
                <TableHead className="font-body text-xs w-40">Fim Previsto</TableHead>
                <TableHead className="font-body text-xs w-20">Dias</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((group) => {
                const isCollapsed = effectiveCollapsed.has(group.key);
                const groupChangedCount = isCollapsed ? 0 : group.items.filter(i => changes.has(i.id)).length;
                const visibleLimit = visibleCounts[group.key] || 30;
                const displayedItems = group.items.slice(0, visibleLimit);
                const remaining = group.items.length - visibleLimit;

                return (
                  <>{/* Fragment for group */}
                    <TableRow
                      key={`group-${group.key}`}
                      className="bg-muted/50 hover:bg-muted cursor-pointer"
                      onClick={() => toggleGroup(group.key)}
                    >
                      <TableCell colSpan={4} className="py-2">
                        <div className="flex items-center gap-2 font-medium text-xs font-heading">
                          {isCollapsed ? (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span>{group.label}</span>
                          <Badge variant="secondary" className="text-[10px] font-body">
                            {group.items.length}
                          </Badge>
                          {groupChangedCount > 0 && (
                            <Badge variant="default" className="text-[10px] font-body">
                              {groupChangedCount} alt.
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>

                    {!isCollapsed && displayedItems.map((item) => {
                      const inicio = getDate(item, 'data_inicio_prevista');
                      const fim = getDate(item, 'data_fim_prevista');
                      const duration = inicio && fim
                        ? Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / (1000 * 60 * 60 * 24))
                        : null;
                      const isChanged = changes.has(item.id);
                      return (
                        <TableRow key={item.id} className={isChanged ? 'bg-accent/10' : ''}>
                          <TableCell className="text-xs font-body pl-8">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-1.5">
                                {item.codigo && <span className="text-muted-foreground">{item.codigo}</span>}
                                <span className="truncate max-w-[250px]">{item.descricao}</span>
                              </div>
                              {item.classificacao_adicional && (
                                <CollapsibleClassification text={item.classificacao_adicional} />
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="date"
                              value={inicio}
                              onChange={e => updateDate(item.id, 'data_inicio_prevista', e.target.value)}
                              className="h-7 text-xs"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="date"
                              value={fim}
                              onChange={e => updateDate(item.id, 'data_fim_prevista', e.target.value)}
                              className="h-7 text-xs"
                            />
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground text-center font-body">
                            {duration !== null ? `${duration}d` : '-'}
                          </TableCell>
                        </TableRow>
                      );
                    })}

                    {!isCollapsed && remaining > 0 && (
                      <TableRow key={`more-${group.key}`}>
                        <TableCell colSpan={4} className="py-1.5 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs font-body h-7 text-muted-foreground"
                            onClick={(e) => { e.stopPropagation(); showMore(group.key); }}
                          >
                            Mostrar mais ({remaining} restantes)
                          </Button>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="font-body">
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || changedCount === 0} className="font-body">
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Salvar {changedCount} alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
