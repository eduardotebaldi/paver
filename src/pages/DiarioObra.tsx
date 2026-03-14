import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Loader2, CloudSun, Cloud, CloudRain, Sun, Snowflake, Trash2,
  ClipboardList, User, Clock, Check, Package, Layers, ChevronRight,
  X, Camera, Video, Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { fetchObras, fetchDiarios, fetchEapItems, deleteDiario, DiarioObra, EapItem } from '@/services/api';
import { supabase } from '@/integrations/supabase/client';
import CollapsibleClassification from '@/components/CollapsibleClassification';

const climaOptions = [
  { value: 'ensolarado', label: 'Ensolarado', icon: Sun },
  { value: 'nublado', label: 'Nublado', icon: Cloud },
  { value: 'parcialmente_nublado', label: 'Parc. Nublado', icon: CloudSun },
  { value: 'chuvoso', label: 'Chuvoso', icon: CloudRain },
  { value: 'frio', label: 'Frio', icon: Snowflake },
];

const climaLabels: Record<string, string> = Object.fromEntries(climaOptions.map(c => [c.value, c.label]));

interface DiarioAtividade {
  id: string;
  diario_id: string;
  eap_item_id: string;
  avanco_percentual: number;
  quantidade_dia: number;
}

function isVideo(url: string) {
  return /\.(mp4|mov|webm|avi|mkv)(\?|$)/i.test(url);
}

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
    const now = new Date();
    return (now.getTime() - created.getTime()) <= 2 * 24 * 60 * 60 * 1000;
  };

  const [selectedObraId, setSelectedObraId] = useState<string>('');
  const [detailDiario, setDetailDiario] = useState<DiarioObra | null>(null);

  const { data: obras = [] } = useQuery({ queryKey: ['obras'], queryFn: fetchObras });

  const { data: diarios = [], isLoading } = useQuery({
    queryKey: ['diarios', selectedObraId],
    queryFn: () => fetchDiarios(selectedObraId),
    enabled: !!selectedObraId,
  });

  const { data: eapItems = [] } = useQuery({
    queryKey: ['eap', selectedObraId],
    queryFn: () => fetchEapItems(selectedObraId),
    enabled: !!selectedObraId,
  });

  const eapItensOnly = useMemo(() => eapItems.filter(i => i.tipo === 'item'), [eapItems]);
  const eapMap = useMemo(() => new Map(eapItensOnly.map(i => [i.id, i])), [eapItensOnly]);

  const diarioIds = diarios.map(d => d.id);
  const { data: allAtividades = [] } = useQuery({
    queryKey: ['diario-atividades', diarioIds],
    queryFn: async () => {
      if (diarioIds.length === 0) return [];
      const { data, error } = await supabase
        .from('paver_diario_atividades')
        .select('*')
        .in('diario_id', diarioIds);
      if (error) throw error;
      return data as DiarioAtividade[];
    },
    enabled: diarioIds.length > 0,
  });

  const userIds = [...new Set(diarios.map(d => d.created_by).filter(Boolean))];
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
      queryClient.invalidateQueries({ queryKey: ['diarios', selectedObraId] });
      queryClient.invalidateQueries({ queryKey: ['diario-atividades'] });
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

  const getAtividadesForDiario = (diarioId: string) => allAtividades.filter(a => a.diario_id === diarioId);

  const detailAtividades = detailDiario ? getAtividadesForDiario(detailDiario.id) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-heading font-bold text-foreground">Diário de Obra</h1>
      </div>

      <div className="max-w-xs">
        <Label className="font-body text-sm">Selecione a Obra</Label>
        <Select value={selectedObraId} onValueChange={setSelectedObraId}>
          <SelectTrigger className="font-body mt-1"><SelectValue placeholder="Escolha uma obra..." /></SelectTrigger>
          <SelectContent>
            {obras.map(o => (
              <SelectItem key={o.id} value={o.id} className="font-body">{o.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!selectedObraId ? (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-center">
              <ClipboardList className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground font-body">Selecione uma obra para visualizar os diários.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="font-heading">Registros</CardTitle>
            {canEdit && (
              <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90 font-body"
                onClick={() => navigate(`/diario-obra/novo?obra=${selectedObraId}`)}>
                <Plus className="h-4 w-4 mr-2" />Novo Registro
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>
            ) : diarios.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <ClipboardList className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground font-body">Nenhum diário registrado para esta obra.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {diarios.map(diario => {
                  const atividades = getAtividadesForDiario(diario.id);
                  const fotoCount = diario.fotos?.length || 0;
                  return (
                    <div
                      key={diario.id}
                      className="border rounded-lg p-4 space-y-2 cursor-pointer hover:bg-muted/30 transition-colors group"
                      onClick={() => setDetailDiario(diario)}
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

                      {/* Compact activities summary */}
                      {atividades.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {atividades.slice(0, 4).map(a => {
                            const item = eapMap.get(a.eap_item_id);
                            return (
                              <div key={a.id} className="flex items-center gap-1 text-[11px] font-body text-foreground/70 bg-muted/50 rounded px-1.5 py-0.5">
                                <Check className="h-2.5 w-2.5 text-accent shrink-0" />
                                <span className="truncate max-w-[180px]">{item?.descricao || 'Item'}</span>
                                {item?.lote && <span className="text-muted-foreground/60">· {item.lote}</span>}
                                <Badge variant="secondary" className="text-[9px] h-4 px-1 shrink-0">{a.avanco_percentual}%</Badge>
                              </div>
                            );
                          })}
                          {atividades.length > 4 && (
                            <span className="text-[10px] text-muted-foreground font-body self-center">+{atividades.length - 4} mais</span>
                          )}
                        </div>
                      )}

                      {atividades.length === 0 && diario.atividades && diario.atividades !== 'Sem atividades registradas' && (
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
      )}

      {/* ═══ DETAIL MODAL ═══ */}
      <Dialog open={!!detailDiario} onOpenChange={v => { if (!v) setDetailDiario(null); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          {detailDiario && (
            <>
              <DialogHeader>
                <DialogTitle className="font-heading flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-accent" />
                  Diário — {new Date(detailDiario.data).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                </DialogTitle>
              </DialogHeader>

              <ScrollArea className="flex-1 -mx-6 px-6">
                <div className="space-y-5 pb-4">
                  {/* Clima */}
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <ClimaIcon clima={detailDiario.clima_manha || detailDiario.clima} />
                      <span className="text-xs font-body">
                        <span className="text-muted-foreground">Manhã:</span> {climaLabels[detailDiario.clima_manha || detailDiario.clima] || detailDiario.clima}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <ClimaIcon clima={detailDiario.clima_tarde || detailDiario.clima} />
                      <span className="text-xs font-body">
                        <span className="text-muted-foreground">Tarde:</span> {climaLabels[detailDiario.clima_tarde || detailDiario.clima] || detailDiario.clima}
                      </span>
                    </div>
                    <span className="text-[11px] text-muted-foreground font-body flex items-center gap-1">
                      <User className="h-3 w-3" />{profilesMap[detailDiario.created_by] || 'Usuário'}
                    </span>
                    <span className="text-[11px] text-muted-foreground font-body flex items-center gap-1">
                      <Clock className="h-3 w-3" />{formatCreatedAt(detailDiario.created_at)}
                    </span>
                  </div>

                  {/* Mão de obra */}
                  {detailDiario.mao_de_obra && (
                    <div>
                      <span className="text-xs font-body font-medium text-muted-foreground">Equipes</span>
                      <p className="text-sm font-body mt-0.5">{detailDiario.mao_de_obra}</p>
                    </div>
                  )}

                  {/* Atividades */}
                  {detailAtividades.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-body font-medium text-muted-foreground">Atividades executadas</span>
                      <div className="space-y-2">
                        {detailAtividades.map(a => {
                          const item = eapMap.get(a.eap_item_id);
                          const totalQtd = item?.quantidade || 0;
                          const qtdDia = a.quantidade_dia || 0;
                          return (
                            <div key={a.id} className="border border-border/50 rounded-md p-2.5 space-y-1.5">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    {item?.codigo && (
                                      <span className="font-mono text-[10px] text-muted-foreground">{item.codigo}</span>
                                    )}
                                    <span className="text-sm font-body font-medium text-foreground truncate">
                                      {item?.descricao || 'Item removido'}
                                    </span>
                                  </div>
                                  {item?.classificacao_adicional && (
                                    <CollapsibleClassification text={item.classificacao_adicional} />
                                  )}
                                </div>
                                <Badge variant="secondary" className="text-[10px] shrink-0">{a.avanco_percentual}%</Badge>
                              </div>

                              {/* Quantity info */}
                              <div className="flex items-center gap-3 flex-wrap">
                                {totalQtd > 0 && (
                                  <div className="flex items-center gap-1.5">
                                    <div className="w-20">
                                      <Progress value={a.avanco_percentual} className="h-1.5" />
                                    </div>
                                    <span className="text-[10px] font-body text-muted-foreground">
                                      {qtdDia > 0 && `+${qtdDia} `}{item?.unidade || 'un'} 
                                      {totalQtd > 0 && ` (${Math.round(totalQtd * a.avanco_percentual / 100)}/${totalQtd} ${item?.unidade || 'un'})`}
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* Tags row */}
                              <div className="flex items-center gap-2 flex-wrap">
                                {item?.lote && (
                                  <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground font-body bg-muted/50 rounded px-1.5 py-0.5">
                                    <Layers className="h-2.5 w-2.5" />{item.lote}
                                  </span>
                                )}
                                {item?.pacote && (
                                  <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground font-body bg-muted/50 rounded px-1.5 py-0.5">
                                    <Package className="h-2.5 w-2.5" />{item.pacote}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Legacy text atividades */}
                  {detailAtividades.length === 0 && detailDiario.atividades && detailDiario.atividades !== 'Sem atividades registradas' && (
                    <div>
                      <span className="text-xs font-body font-medium text-muted-foreground">Atividades</span>
                      <p className="text-sm font-body mt-0.5">{detailDiario.atividades}</p>
                    </div>
                  )}

                  {/* Observações */}
                  {detailDiario.observacoes && (
                    <div>
                      <span className="text-xs font-body font-medium text-muted-foreground">Observações</span>
                      <p className="text-sm font-body mt-0.5 italic text-foreground/80">{detailDiario.observacoes}</p>
                    </div>
                  )}

                  {/* Fotos */}
                  {detailDiario.fotos && detailDiario.fotos.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-body font-medium text-muted-foreground">
                        Fotos e Vídeos ({detailDiario.fotos.length})
                      </span>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {detailDiario.fotos.map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                            className="aspect-square rounded-md overflow-hidden border border-border bg-muted relative group">
                            {isVideo(url) ? (
                              <>
                                <video src={url} className="w-full h-full object-cover" muted />
                                <div className="absolute top-1 left-1">
                                  <Badge variant="secondary" className="text-[8px] px-1 h-4"><Video className="h-2.5 w-2.5" /></Badge>
                                </div>
                              </>
                            ) : (
                              <img src={url} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                            )}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                              <Eye className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                            </div>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
