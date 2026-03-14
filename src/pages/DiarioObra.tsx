import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, CloudSun, Cloud, CloudRain, Sun, Snowflake, Trash2, ClipboardList, User, Clock, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { fetchObras, fetchDiarios, fetchEapItems, deleteDiario, DiarioObra, EapItem } from '@/services/api';
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
    const now = new Date();
    const diffMs = now.getTime() - created.getTime();
    return diffMs <= 2 * 24 * 60 * 60 * 1000; // 2 days
  };

  const [selectedObraId, setSelectedObraId] = useState<string>('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<DiarioFormData>(emptyForm);

  const { data: obras = [] } = useQuery({
    queryKey: ['obras'],
    queryFn: fetchObras,
  });

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

  // Fetch diario atividades for display
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
      return data as { id: string; diario_id: string; eap_item_id: string; avanco_percentual: number }[];
    },
    enabled: diarioIds.length > 0,
  });

  // Fetch profile names
  const userIds = [...new Set(diarios.map(d => d.created_by).filter(Boolean))];
  const { data: profilesMap = {} } = useQuery({
    queryKey: ['paver-profiles', userIds],
    queryFn: async () => {
      if (userIds.length === 0) return {};
      const { data } = await supabase
        .from('paver_profiles')
        .select('id, full_name')
        .in('id', userIds);
      const map: Record<string, string> = {};
      (data || []).forEach((p: any) => { map[p.id] = p.full_name || 'Sem nome'; });
      return map;
    },
    enabled: userIds.length > 0,
  });

  const createMutation = useMutation({
    mutationFn: async (data: DiarioFormData) => {
      // Create the diary entry
      const diario = await createDiario({
        obra_id: selectedObraId,
        data: data.data,
        clima: data.clima_manha, // legacy field
        clima_manha: data.clima_manha,
        clima_tarde: data.clima_tarde,
        mao_de_obra: data.mao_de_obra,
        atividades: data.atividades_eap.length > 0
          ? data.atividades_eap.map(a => {
              const item = eapItensOnly.find(i => i.id === a.eap_item_id);
              return `${item?.descricao || 'Item'}: ${a.avanco_percentual}%`;
            }).join('; ')
          : 'Sem atividades registradas',
        observacoes: data.observacoes || undefined,
        created_by: user!.id,
      } as any);

      // Insert atividades
      if (data.atividades_eap.length > 0) {
        const { error } = await supabase
          .from('paver_diario_atividades')
          .insert(data.atividades_eap.map(a => ({
            diario_id: diario.id,
            eap_item_id: a.eap_item_id,
            avanco_percentual: a.avanco_percentual,
          })));
        if (error) throw error;
      }

      return diario;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['diarios', selectedObraId] });
      queryClient.invalidateQueries({ queryKey: ['diario-atividades'] });
      toast({ title: 'Diário registrado!' });
      setDialogOpen(false);
      setForm(emptyForm);
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDiario,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['diarios', selectedObraId] });
      queryClient.invalidateQueries({ queryKey: ['diario-atividades'] });
      toast({ title: 'Diário excluído' });
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(form);
  };

  const toggleAtividadeEap = (itemId: string) => {
    setForm(prev => {
      const exists = prev.atividades_eap.find(a => a.eap_item_id === itemId);
      if (exists) {
        return { ...prev, atividades_eap: prev.atividades_eap.filter(a => a.eap_item_id !== itemId) };
      }
      return { ...prev, atividades_eap: [...prev.atividades_eap, { eap_item_id: itemId, avanco_percentual: 0 }] };
    });
  };

  const updateAtividadeAvanco = (itemId: string, value: number) => {
    setForm(prev => ({
      ...prev,
      atividades_eap: prev.atividades_eap.map(a =>
        a.eap_item_id === itemId ? { ...a, avanco_percentual: Math.min(100, Math.max(0, value)) } : a
      ),
    }));
  };

  const ClimaIcon = ({ clima }: { clima: string }) => {
    const opt = climaOptions.find(c => c.value === clima);
    if (!opt) return null;
    const Icon = opt.icon;
    return <Icon className="h-4 w-4" />;
  };

  const formatCreatedAt = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const getAtividadesForDiario = (diarioId: string) => {
    return allAtividades.filter(a => a.diario_id === diarioId);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-heading font-bold text-foreground">Diário de Obra</h1>
      </div>

      <div className="max-w-xs">
        <Label className="font-body text-sm">Selecione a Obra</Label>
        <Select value={selectedObraId} onValueChange={setSelectedObraId}>
          <SelectTrigger className="font-body mt-1">
            <SelectValue placeholder="Escolha uma obra..." />
          </SelectTrigger>
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
              <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (open) setForm(emptyForm); }}>
                <DialogTrigger asChild>
                  <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90 font-body">
                    <Plus className="h-4 w-4 mr-2" />
                    Novo Registro
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="font-heading">Novo Diário de Obra</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Data */}
                    <div className="space-y-2">
                      <Label className="font-body">Data</Label>
                      <Input type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} required className="font-body max-w-xs" />
                    </div>

                    {/* Clima Manhã e Tarde */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="font-body">Clima — Manhã</Label>
                        <Select value={form.clima_manha} onValueChange={v => setForm({ ...form, clima_manha: v })}>
                          <SelectTrigger className="font-body"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {climaOptions.map(c => (
                              <SelectItem key={c.value} value={c.value} className="font-body">{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="font-body">Clima — Tarde</Label>
                        <Select value={form.clima_tarde} onValueChange={v => setForm({ ...form, clima_tarde: v })}>
                          <SelectTrigger className="font-body"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {climaOptions.map(c => (
                              <SelectItem key={c.value} value={c.value} className="font-body">{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Equipes (mão de obra - texto) */}
                    <div className="space-y-2">
                      <Label className="font-body">Equipes / Mão de Obra</Label>
                      <p className="text-xs text-muted-foreground font-body">Descreva as equipes que trabalharam na obra</p>
                      <Textarea
                        value={form.mao_de_obra}
                        onChange={e => setForm({ ...form, mao_de_obra: e.target.value })}
                        rows={3}
                        placeholder="Ex: 2 pedreiros, 1 encanador, 3 serventes..."
                        className="font-body"
                      />
                    </div>

                    {/* Atividades Executadas — EAP items */}
                    <div className="space-y-2">
                      <Label className="font-body">Atividades Executadas (EAP)</Label>
                      <p className="text-xs text-muted-foreground font-body">Selecione os itens da EAP executados e informe o % de avanço</p>
                      {eapItensOnly.length === 0 ? (
                        <p className="text-xs text-muted-foreground font-body italic py-2">Nenhum item de EAP cadastrado para esta obra.</p>
                      ) : (
                        <div className="border rounded-md max-h-60 overflow-y-auto">
                          {eapItensOnly.map(item => {
                            const selected = form.atividades_eap.find(a => a.eap_item_id === item.id);
                            return (
                              <div key={item.id} className="flex items-center gap-3 px-3 py-2 border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                                <Checkbox
                                  checked={!!selected}
                                  onCheckedChange={() => toggleAtividadeEap(item.id)}
                                />
                                <span className="flex-1 text-sm font-body text-foreground/80 truncate">
                                  {item.codigo && <span className="text-muted-foreground mr-1">{item.codigo}</span>}
                                  {item.descricao}
                                </span>
                                {selected && (
                                  <div className="flex items-center gap-1 shrink-0">
                                    <Input
                                      type="number"
                                      min={0}
                                      max={100}
                                      value={selected.avanco_percentual}
                                      onChange={e => updateAtividadeAvanco(item.id, Number(e.target.value))}
                                      className="w-16 h-7 text-xs font-body text-center"
                                    />
                                    <span className="text-xs text-muted-foreground">%</span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Observações */}
                    <div className="space-y-2">
                      <Label className="font-body">Observações</Label>
                      <Textarea value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} rows={2} className="font-body" />
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="font-body">Cancelar</Button>
                      <Button type="submit" disabled={createMutation.isPending} className="bg-accent text-accent-foreground hover:bg-accent/90 font-body">
                        {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Registrar'}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-accent" />
              </div>
            ) : diarios.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <ClipboardList className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground font-body">Nenhum diário registrado para esta obra.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {diarios.map(diario => {
                  const atividades = getAtividadesForDiario(diario.id);
                  return (
                    <div key={diario.id} className="border rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-sm font-heading font-semibold">
                            {new Date(diario.data).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                          <Badge variant="outline" className="text-[10px] flex items-center gap-1">
                            <ClimaIcon clima={diario.clima_manha || diario.clima} />
                            Manhã: {climaLabels[diario.clima_manha || diario.clima] || diario.clima}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] flex items-center gap-1">
                            <ClimaIcon clima={diario.clima_tarde || diario.clima} />
                            Tarde: {climaLabels[diario.clima_tarde || diario.clima] || diario.clima}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
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
                        </div>
                      </div>

                      {/* Equipes */}
                      {diario.mao_de_obra && (
                        <div className="space-y-1">
                          <span className="text-xs font-body font-medium text-muted-foreground">Equipes:</span>
                          <p className="text-sm text-foreground font-body">{diario.mao_de_obra}</p>
                        </div>
                      )}

                      {/* Atividades EAP */}
                      {atividades.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-xs font-body font-medium text-muted-foreground">Atividades executadas:</span>
                          <div className="space-y-0.5">
                            {atividades.map(a => {
                              const item = eapItensOnly.find(i => i.id === a.eap_item_id);
                              return (
                                <div key={a.id} className="flex items-center gap-2 text-sm font-body">
                                  <Check className="h-3 w-3 text-accent shrink-0" />
                                  <span className="text-foreground/80 truncate">{item?.descricao || 'Item removido'}</span>
                                  <Badge variant="secondary" className="text-[10px] shrink-0">{a.avanco_percentual}%</Badge>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Fallback to text atividades for legacy entries */}
                      {atividades.length === 0 && diario.atividades && diario.atividades !== 'Sem atividades registradas' && (
                        <p className="text-sm text-foreground font-body">{diario.atividades}</p>
                      )}

                      {diario.observacoes && (
                        <p className="text-xs text-muted-foreground font-body italic">{diario.observacoes}</p>
                      )}

                      {/* User and timestamp info */}
                      <div className="flex items-center gap-4 pt-1 border-t border-border/50">
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground font-body">
                          <User className="h-3 w-3" />
                          {profilesMap[diario.created_by] || 'Usuário desconhecido'}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground font-body">
                          <Clock className="h-3 w-3" />
                          {formatCreatedAt(diario.created_at)}
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
    </div>
  );
}
