import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Link2, X } from 'lucide-react';
import type { EapItem } from '@/services/api';

import { useToast } from '@/hooks/use-toast';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: EapItem | null;
  allItems: EapItem[];
  onSave: (id: string, updates: Partial<EapItem>) => Promise<void>;
  obraDataInicio?: string;
  obraDataPrevisao?: string;
}

export default function EapItemEditModal({ open, onOpenChange, item, allItems, onSave, obraDataInicio, obraDataPrevisao }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [dataInicioPrevista, setDataInicioPrevista] = useState('');
  const [dataFimPrevista, setDataFimPrevista] = useState('');
  const [dataInicioReal, setDataInicioReal] = useState('');
  const [dataFimReal, setDataFimReal] = useState('');
  const [predecessoras, setPredecessoras] = useState<string[]>([]);
  const [addingPred, setAddingPred] = useState('');

  // Sync state when item changes
  const itemId = item?.id;
  useState(() => {
    if (item) {
      setDataInicioPrevista(item.data_inicio_prevista || '');
      setDataFimPrevista(item.data_fim_prevista || '');
      setDataInicioReal(item.data_inicio_real || '');
      setDataFimReal(item.data_fim_real || '');
      setPredecessoras(item.predecessoras || []);
    }
  });

  // Available items for predecessors (exclude self)
  const availableItems = useMemo(() =>
    allItems.filter(i => i.tipo === 'item' && i.id !== item?.id),
    [allItems, item?.id]
  );

  const predItemsDisplay = useMemo(() => {
    return predecessoras.map(predId => {
      const found = allItems.find(i => i.id === predId || i.codigo === predId);
      return { id: predId, label: found ? `${found.codigo || ''} - ${found.descricao}` : predId };
    });
  }, [predecessoras, allItems]);

  if (!item) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(item.id, {
        data_inicio_prevista: dataInicioPrevista || undefined,
        data_fim_prevista: dataFimPrevista || undefined,
        data_inicio_real: dataInicioReal || undefined,
        data_fim_real: dataFimReal || undefined,
        predecessoras: predecessoras.length > 0 ? predecessoras : undefined,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const addPredecessor = (value: string) => {
    if (value && !predecessoras.includes(value)) {
      setPredecessoras([...predecessoras, value]);
    }
    setAddingPred('');
  };

  const removePredecessor = (predId: string) => {
    setPredecessoras(predecessoras.filter(p => p !== predId));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading text-base">
            {item.codigo && <span className="text-muted-foreground mr-2">{item.codigo}</span>}
            {item.descricao}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-body">Início Previsto</Label>
              <Input type="date" value={dataInicioPrevista} onChange={e => setDataInicioPrevista(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-body">Fim Previsto</Label>
              <Input type="date" value={dataFimPrevista} onChange={e => setDataFimPrevista(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-body">Início Real</Label>
              <Input type="date" value={dataInicioReal} onChange={e => setDataInicioReal(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-body">Fim Real</Label>
              <Input type="date" value={dataFimReal} onChange={e => setDataFimReal(e.target.value)} />
            </div>
          </div>

          {/* Dependencies */}
          <div className="space-y-2">
            <Label className="text-xs font-body flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5" />
              Predecessoras (Finish-Start)
            </Label>

            {predItemsDisplay.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {predItemsDisplay.map(p => (
                  <Badge key={p.id} variant="secondary" className="text-xs font-body gap-1">
                    {p.label.length > 40 ? p.label.substring(0, 37) + '...' : p.label}
                    <button onClick={() => removePredecessor(p.id)}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            <Select value={addingPred} onValueChange={addPredecessor}>
              <SelectTrigger className="font-body text-xs">
                <SelectValue placeholder="Adicionar predecessora..." />
              </SelectTrigger>
              <SelectContent className="max-h-48">
                {availableItems
                  .filter(i => !predecessoras.includes(i.id))
                  .map(i => (
                    <SelectItem key={i.id} value={i.id} className="text-xs font-body">
                      {i.codigo ? `${i.codigo} - ` : ''}{i.descricao}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="font-body">
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving} className="font-body">
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
