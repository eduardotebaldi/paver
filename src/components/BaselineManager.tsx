import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Save, Trash2, History, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { fetchBaselines, createBaseline, deleteBaseline } from '@/services/eapApi';
import type { EapBaseline } from '@/services/eapApi';
import type { EapItem } from '@/services/api';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  obraId: string;
  eapItems: EapItem[];
}

export default function BaselineManager({ open, onOpenChange, obraId, eapItems }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');

  const { data: baselines = [], isLoading } = useQuery<EapBaseline[]>({
    queryKey: ['baselines', obraId],
    queryFn: () => fetchBaselines(obraId),
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const name = newName.trim() || `Baseline ${baselines.length + 1}`;
      return createBaseline(obraId, name, user!.id, eapItems);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['baselines', obraId] });
      setNewName('');
      toast({ title: 'Linha de base salva com sucesso!' });
    },
    onError: (error: Error) => toast({ title: 'Erro', description: error.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteBaseline,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['baselines', obraId] });
      toast({ title: 'Linha de base excluída' });
    },
    onError: (error: Error) => toast({ title: 'Erro', description: error.message, variant: 'destructive' }),
  });

  const itemCount = eapItems.filter(item => item.tipo === 'item').length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading">
            <History className="h-5 w-5" />
            Linhas de Base
          </DialogTitle>
          <DialogDescription className="font-body text-xs">
            Salve snapshots das datas e do avanço previsto atual sem travar a página principal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2 rounded-md border border-border p-3">
            <Label className="font-body text-xs text-muted-foreground">Salvar nova linha de base</Label>
            <div className="flex gap-2">
              <Input
                placeholder={`Baseline ${baselines.length + 1}`}
                value={newName}
                onChange={event => setNewName(event.target.value)}
                className="flex-1 text-sm"
              />
              <Button
                size="sm"
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
                className="font-body"
              >
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              </Button>
            </div>
            <p className="font-body text-[10px] text-muted-foreground">
              Salva um snapshot de {itemCount} itens com datas e avanço previstos atuais.
            </p>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-accent" />
            </div>
          ) : baselines.length === 0 ? (
            <p className="py-4 text-center font-body text-sm text-muted-foreground">Nenhuma linha de base salva</p>
          ) : (
            <div className="max-h-60 space-y-2 overflow-auto">
              {baselines.map(baseline => (
                <div
                  key={baseline.id}
                  className="flex items-center justify-between rounded-md border border-border p-2.5 transition-colors hover:bg-muted/30"
                >
                  <div>
                    <p className="font-body text-sm font-medium">{baseline.nome}</p>
                    <div className="flex items-center gap-1 font-body text-[10px] text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {new Date(baseline.created_at).toLocaleDateString('pt-BR')} às{' '}
                      {new Date(baseline.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => deleteMutation.mutate(baseline.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="font-body">
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
