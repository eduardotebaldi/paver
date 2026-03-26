import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Loader2, CloudSun, Cloud, CloudRain, Sun, Snowflake, Trash2,
  ClipboardList, User, Clock, Check, Camera, ChevronRight, Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { fetchObras, fetchAllDiarios, deleteDiario, DiarioObra } from '@/services/api';
import { supabase } from '@/integrations/supabase/client';

const climaOptions = [
  { value: 'ensolarado', label: 'Ensolarado', icon: Sun },
  { value: 'nublado', label: 'Nublado', icon: Cloud },
  { value: 'parcialmente_nublado', label: 'Parc. Nublado', icon: CloudSun },
  { value: 'chuvoso', label: 'Chuvoso', icon: CloudRain },
  { value: 'frio', label: 'Frio', icon: Snowflake },
];

const climaLabels: Record<string, string> = Object.fromEntries(climaOptions.map(c => [c.value, c.label]));

export default function DiarioObraPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const canEdit = isAdmin || hasRole('engenharia');

  const canModifyDiario = (diario: DiarioObra) => {
    if (isAdmin) return true;
    if (diario.created_by !== user?.id) return false;
    const created = new Date(diario.created_at);
    return (Date.now() - created.getTime()) <= 2 * 24 * 60 * 60 * 1000;
  };

  const [selectedObraId, setSelectedObraId] = useState<string>('');

  const { data: obras = [] } = useQuery({ queryKey: ['obras'], queryFn: fetchObras });
  const obrasMap = useMemo(() => new Map(obras.map(o => [o.id, o.nome])), [obras]);

  const { data: allDiarios = [], isLoading } = useQuery({
    queryKey: ['diarios-all'],
    queryFn: fetchAllDiarios,
  });

  const diarios = useMemo(() => {
    if (!selectedObraId) return allDiarios;
    return allDiarios.filter(d => d.obra_id === selectedObraId);
  }, [allDiarios, selectedObraId]);

  const userIds = [...new Set(allDiarios.map(d => d.created_by).filter(Boolean))];
  const { data: profilesMap = {} } = useQuery({
    queryKey: ['paver-profiles', userIds],
    queryFn: async () => {
      if (userIds.length === 0) return {};
      const { data } = await supabase.from('paver_profiles').select('id, full_name').in('id', userIds);
      const map: Record<string, string> = {};
      (data || []).forEach((p: any) => { map[p.id] = p.full_name || 'Sem nome'; });
      return map;
    },
    enabled: userIds.length > 0,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDiario,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['diarios-all'] });
      queryClient.invalidateQueries({ queryKey: ['eap'] });
      queryClient.invalidateQueries({ queryKey: ['eap-all'] });
      queryClient.invalidateQueries({ queryKey: ['eap-items-balance'] });
      toast({ title: 'Diário excluído e avanço recalculado' });
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const ClimaIcon = ({ clima }: { clima: string }) => {
    const opt = climaOptions.find(c => c.value === clima);
    if (!opt) return null;
    const Icon = opt.icon;
    return <Icon className="h-4 w-4" />;
  };

  const formatCreatedAt = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-heading font-bold text-foreground">Diário de Obra</h1>
        {canEdit && selectedObraId && (
          <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90 font-body"
            onClick={() => navigate(`/diario-obra/novo?obra=${selectedObraId}`)}>
            <Plus className="h-4 w-4 mr-2" />Novo Registro
          </Button>
        )}
      </div>

      <div className="max-w-xs">
        <Label className="font-body text-sm">Filtrar por Obra</Label>
        <Select value={selectedObraId} onValueChange={setSelectedObraId}>
          <SelectTrigger className="font-body mt-1"><SelectValue placeholder="Todas as obras" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="font-body">Todas as obras</SelectItem>
            {obras.map(o => (
              <SelectItem key={o.id} value={o.id} className="font-body">{o.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading">Registros ({diarios.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>
          ) : diarios.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ClipboardList className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground font-body">Nenhum diário registrado.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {diarios.map(diario => {
                const fotoCount = diario.fotos?.length || 0;
                const obraNome = obrasMap.get(diario.obra_id) || 'Obra desconhecida';
                return (
                  <div
                    key={diario.id}
                    className="border rounded-lg p-4 space-y-2 cursor-pointer hover:bg-muted/30 transition-colors group"
                    onClick={() => navigate(`/diario-obra/${diario.id}`)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-sm font-heading font-semibold">
                          {new Date(diario.data).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                        <Badge variant="outline" className="text-[10px] flex items-center gap-1">
                          <ClimaIcon clima={diario.clima_manha || diario.clima} />
                          {climaLabels[diario.clima_manha || diario.clima] || diario.clima}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] flex items-center gap-1">
                          <ClimaIcon clima={diario.clima_tarde || diario.clima} />
                          {climaLabels[diario.clima_tarde || diario.clima] || diario.clima}
                        </Badge>
                        {fotoCount > 0 && (
                          <Badge variant="secondary" className="text-[10px]">
                            <Camera className="h-3 w-3 mr-0.5" />{fotoCount}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        {canModifyDiario(diario) && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive">
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle className="font-heading">Excluir diário?</AlertDialogTitle>
                                <AlertDialogDescription className="font-body">Essa ação é irreversível.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="font-body">Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteMutation.mutate(diario.id)} className="bg-destructive text-destructive-foreground font-body">Excluir</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>

                    {/* Obra name */}
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-body">
                      <Building2 className="h-3 w-3" />
                      <span>{obraNome}</span>
                    </div>

                    {diario.atividades && diario.atividades !== 'Sem atividades registradas' && (
                      <p className="text-xs text-foreground/70 font-body truncate">{diario.atividades}</p>
                    )}

                    {/* Footer */}
                    <div className="flex items-center gap-4 pt-1 border-t border-border/50">
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground font-body">
                        <User className="h-3 w-3" />{profilesMap[diario.created_by] || 'Usuário'}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground font-body">
                        <Clock className="h-3 w-3" />{formatCreatedAt(diario.created_at)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
