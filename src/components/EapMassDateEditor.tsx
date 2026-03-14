import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Calendar, ArrowRight } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import type { EapItem } from '@/services/api';

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

export default function EapMassDateEditor({ open, onOpenChange, items, onSave }: Props) {
  const [saving, setSaving] = useState(false);
  const [changes, setChanges] = useState<Map<string, DateChange>>(new Map());

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

  // Apply offset to all visible items
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

        {/* Offset tool */}
        <div className="flex items-center gap-2 p-3 rounded-md bg-muted/50 border border-border">
          <span className="text-xs text-muted-foreground font-body">Deslocar todas as datas em</span>
          <Input
            type="number"
            value={offsetDays}
            onChange={e => setOffsetDays(e.target.value)}
            className="w-20 h-8 text-sm"
            placeholder="0"
          />
          <span className="text-xs text-muted-foreground font-body">dias</span>
          <Button size="sm" variant="secondary" onClick={applyOffset} className="font-body h-8">
            Aplicar
          </Button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto min-h-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-body text-xs w-12">#</TableHead>
                <TableHead className="font-body text-xs">Item</TableHead>
                <TableHead className="font-body text-xs w-40">Início Previsto</TableHead>
                <TableHead className="font-body text-xs w-40">Fim Previsto</TableHead>
                <TableHead className="font-body text-xs w-20">Dias</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {editableItems.map((item, idx) => {
                const inicio = getDate(item, 'data_inicio_prevista');
                const fim = getDate(item, 'data_fim_prevista');
                const duration = inicio && fim
                  ? Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / (1000 * 60 * 60 * 24))
                  : null;
                const isChanged = changes.has(item.id);
                return (
                  <TableRow key={item.id} className={isChanged ? 'bg-accent/10' : ''}>
                    <TableCell className="text-xs text-muted-foreground font-body">{idx + 1}</TableCell>
                    <TableCell className="text-xs font-body">
                      <div className="flex items-center gap-1.5">
                        {item.codigo && <span className="text-muted-foreground">{item.codigo}</span>}
                        <span className="truncate max-w-[250px]">{item.descricao}</span>
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
