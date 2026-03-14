import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Save, Trash2, Loader2, History, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { fetchBaselines, createBaseline, deleteBaseline, type EapBaseline } from '@/services/eapApi';
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

  const { data: baselines = [], isLoading } = useQuery({
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
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteBaseline,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['baselines', obraId] });
      toast({ title: 'Linha de base excluída' });
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const itemCount = eapItems.filter(i => i.tipo === 'item').length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <History className="h-5 w-5" />
            Linhas de Base
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Create new */}
          <div className="p-3 rounded-md border border-border space-y-2">
            <Label className="text-xs font-body text-muted-foreground">Salvar nova linha de base</Label>
            <div className="flex gap-2">
              <Input
                placeholder={`Baseline ${baselines.length + 1}`}
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="flex-1 text-sm"
              />
              <Button
                size="sm"
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
                className="font-body"
              >
                {createMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground font-body">
              Salva um snapshot de {itemCount} itens com datas e avanço previstos atuais
            </p>
          </div>

          {/* List */}
          {isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-accent" />
            </div>
          ) : baselines.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4 font-body">
              Nenhuma linha de base salva
            </p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-auto">
              {baselines.map(b => (
                <div key={b.id} className="flex items-center justify-between p-2.5 rounded-md border border-border hover:bg-muted/30 transition-colors">
                  <div>
                    <p className="text-sm font-medium font-body">{b.nome}</p>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-body">
                      <Clock className="h-3 w-3" />
                      {new Date(b.created_at).toLocaleDateString('pt-BR')} às {new Date(b.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => deleteMutation.mutate(b.id)}
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
