import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus, Pencil, Trash2, MapPin, Calendar, Loader2, Search, Filter, Upload, FileSpreadsheet, AlertTriangle, FileType2, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { fetchObras, createObra, updateObra, deleteObra, fetchEapItems, insertEapItems, deleteEapItemsByObra, Obra, fetchPlantas, createPlanta, deletePlanta, fetchAllEapItems, uploadFile, fetchFotosLocalizadas } from '@/services/api';
import { parseEapExcel } from '@/lib/eapParser';
import ImportOrcamentoWizard from '@/components/ImportOrcamentoWizard';
import EapItemEditModal from '@/components/EapItemEditModal';
import EapEditorPanel from '@/components/EapEditorPanel';
import type { EapItem } from '@/services/api';
import { updateEapItem } from '@/services/eapApi';

const statusLabels: Record<string, string> = {
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  pausada: 'Pausada',
  cancelada: 'Cancelada',
};

const statusColors: Record<string, string> = {
  em_andamento: 'bg-blue-500/10 text-blue-700 border-blue-200',
  concluida: 'bg-green-500/10 text-green-700 border-green-200',
  pausada: 'bg-yellow-500/10 text-yellow-700 border-yellow-200',
  cancelada: 'bg-red-500/10 text-red-700 border-red-200',
};

interface ObraFormData {
  nome: string;
  endereco: string;
  cidade: string;
  estado: string;
  status: string;
  data_inicio: string;
  data_previsao: string;
}

const emptyForm: ObraFormData = {
  nome: '', endereco: '', cidade: '', estado: 'CE',
  status: 'em_andamento', data_inicio: '', data_previsao: '',
};

export default function AdminObras() {
  const { user, hasRole } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const dxfInputRef = useRef<HTMLInputElement>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingObra, setEditingObra] = useState<Obra | null>(null);
  const [form, setForm] = useState<ObraFormData>(emptyForm);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Import states
  const [importWizardOpen, setImportWizardOpen] = useState(false);
  const [importObraId, setImportObraId] = useState<string>('');

  // EAP edit modal
  const [editingItem, setEditingItem] = useState<EapItem | null>(null);
  const [editObraId, setEditObraId] = useState<string>('');

  // DXF upload
  const [dxfUploadObraId, setDxfUploadObraId] = useState<string>('');
  const [dxfUploading, setDxfUploading] = useState(false);

  // EAP editor panel
  const [editorObraId, setEditorObraId] = useState<string>('');
  const [editorObraNome, setEditorObraNome] = useState<string>('');

  const { data: obras = [], isLoading } = useQuery({
    queryKey: ['obras'],
    queryFn: fetchObras,
  });

  const { data: allEapItems = [] } = useQuery({
    queryKey: ['eap-all'],
    queryFn: fetchAllEapItems,
  });

  // Fetch all plantas for all obras
  const { data: allPlantas = [] } = useQuery({
    queryKey: ['all-plantas'],
    queryFn: async () => {
      const results = await Promise.all(obras.map(o => fetchPlantas(o.id)));
      return results.flat();
    },
    enabled: obras.length > 0,
  });

  // Fetch fotos for all plantas to check associations
  const { data: allFotos = [] } = useQuery({
    queryKey: ['all-fotos-localizadas', allPlantas.map(p => p.id).join(',')],
    queryFn: async () => {
      if (allPlantas.length === 0) return [];
      const results = await Promise.all(allPlantas.map(p => fetchFotosLocalizadas(p.id)));
      return results.flat();
    },
    enabled: allPlantas.length > 0,
  });

  const { data: editEapItems = [] } = useQuery({
    queryKey: ['eap', editObraId],
    queryFn: () => fetchEapItems(editObraId),
    enabled: !!editObraId,
  });

  // Helper: check if obra has planta (DXF)
  const getObraPlanta = (obraId: string) => allPlantas.find(p => p.obra_id === obraId);

  // Helper: check if obra has activities without dates
  const hasItemsMissingDates = (obraId: string) => {
    return allEapItems.some(item => item.obra_id === obraId && (!item.data_inicio_prevista || !item.data_fim_prevista));
  };

  // Helper: check if planta has associated fotos
  const plantaHasFotos = (plantaId: string) => {
    return allFotos.some(f => f.planta_id === plantaId);
  };

  const filtered = obras.filter(obra => {
    const matchSearch = !search ||
      obra.nome.toLowerCase().includes(search.toLowerCase()) ||
      obra.cidade?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || obra.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const createMutation = useMutation({
    mutationFn: (data: ObraFormData) => createObra({
      ...data,
      created_by: user!.id,
      status: data.status as Obra['status'],
      data_inicio: data.data_inicio || undefined,
      data_previsao: data.data_previsao || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['obras'] });
      toast({ title: 'Obra criada com sucesso!' });
      closeDialog();
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ObraFormData }) => updateObra(id, {
      ...data,
      status: data.status as Obra['status'],
      data_inicio: data.data_inicio || undefined,
      data_previsao: data.data_previsao || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['obras'] });
      toast({ title: 'Obra atualizada!' });
      closeDialog();
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteObra,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['obras'] });
      toast({ title: 'Obra excluída' });
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const importMutation = useMutation({
    mutationFn: async ({ file, obraId }: { file: File; obraId: string }) => {
      const parsed = await parseEapExcel(file);
      await deleteEapItemsByObra(obraId);
      const items = parsed.map(item => ({ ...item, obra_id: obraId }));
      return insertEapItems(items);
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['eap', vars.obraId] });
      toast({ title: 'EAP importada com sucesso!' });
    },
    onError: (err: any) => toast({ title: 'Erro na importação', description: err.message, variant: 'destructive' }),
  });

  const handleDxfUpload = async (file: File, obraId: string) => {
    setDxfUploading(true);
    try {
      const path = `plantas/${obraId}/${Date.now()}_${file.name}`;
      const url = await uploadFile('paver-fotos', path, file);
      await createPlanta({ obra_id: obraId, nome: file.name, imagem_url: url });
      queryClient.invalidateQueries({ queryKey: ['all-plantas'] });
      toast({ title: 'Planta DXF adicionada com sucesso!' });
    } catch (err: any) {
      toast({ title: 'Erro ao enviar DXF', description: err.message, variant: 'destructive' });
    } finally {
      setDxfUploading(false);
      setDxfUploadObraId('');
    }
  };

  const handleDeletePlanta = async (plantaId: string) => {
    try {
      await deletePlanta(plantaId);
      queryClient.invalidateQueries({ queryKey: ['all-plantas'] });
      toast({ title: 'Planta removida' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingObra(null);
    setForm(emptyForm);
  };

  const openEdit = (obra: Obra) => {
    setEditingObra(obra);
    setForm({
      nome: obra.nome,
      endereco: obra.endereco || '',
      cidade: obra.cidade || '',
      estado: obra.estado || 'CE',
      status: obra.status,
      data_inicio: obra.data_inicio || '',
      data_previsao: obra.data_previsao || '',
    });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.data_inicio || !form.data_previsao) {
      toast({ title: 'Datas obrigatórias', description: 'Informe a data de início e previsão de conclusão.', variant: 'destructive' });
      return;
    }
    if (editingObra) {
      updateMutation.mutate({ id: editingObra.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const handleSaveItem = async (itemId: string, updates: Partial<EapItem>) => {
    await updateEapItem(itemId, updates);
    queryClient.invalidateQueries({ queryKey: ['eap', editObraId] });
    toast({ title: 'Item atualizado!' });
  };

  const handleImportComplete = () => {
    queryClient.invalidateQueries({ queryKey: ['eap'] });
    toast({ title: 'Orçamento importado com sucesso!' });
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-heading font-bold text-foreground">Gestão de Obras</h1>
            <p className="text-muted-foreground font-body">Cadastro, edição e importação de EAP/Orçamento</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); else { setForm(emptyForm); setDialogOpen(true); } }}>
            <DialogTrigger asChild>
              <Button className="bg-accent text-accent-foreground hover:bg-accent/90 font-body">
                <Plus className="h-4 w-4 mr-2" />
                Nova Obra
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="font-heading">
                  {editingObra ? 'Editar Obra' : 'Nova Obra'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label className="font-body">Nome *</Label>
                  <Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} required className="font-body" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="font-body">Cidade</Label>
                    <Input value={form.cidade} onChange={e => setForm({ ...form, cidade: e.target.value })} className="font-body" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-body">Estado</Label>
                    <Input value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value })} className="font-body" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="font-body">Status</Label>
                  <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                    <SelectTrigger className="font-body"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(statusLabels).map(([k, v]) => (
                        <SelectItem key={k} value={k} className="font-body">{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="font-body">Data Início *</Label>
                    <Input type="date" value={form.data_inicio} onChange={e => setForm({ ...form, data_inicio: e.target.value })} required className="font-body" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-body">Previsão Conclusão *</Label>
                    <Input type="date" value={form.data_previsao} onChange={e => setForm({ ...form, data_previsao: e.target.value })} required className="font-body" />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={closeDialog} className="font-body">Cancelar</Button>
                  <Button type="submit" disabled={isPending} className="bg-accent text-accent-foreground hover:bg-accent/90 font-body">
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : editingObra ? 'Salvar' : 'Criar'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou cidade..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 font-body"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-48 font-body">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="font-body">Todos os status</SelectItem>
              {Object.entries(statusLabels).map(([k, v]) => (
                <SelectItem key={k} value={k} className="font-body">{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Hidden DXF input */}
        <input
          ref={dxfInputRef}
          type="file"
          accept=".dxf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && dxfUploadObraId) handleDxfUpload(file, dxfUploadObraId);
            e.target.value = '';
          }}
        />

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Building2 className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-heading font-semibold text-muted-foreground">
                {obras.length === 0 ? 'Nenhuma obra cadastrada' : 'Nenhum resultado encontrado'}
              </h3>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((obra) => {
              const planta = getObraPlanta(obra.id);
              const missingDates = hasItemsMissingDates(obra.id);
              const hasFotos = planta ? plantaHasFotos(planta.id) : false;

              return (
                <Card key={obra.id} className="group">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base font-heading leading-tight">{obra.nome}</CardTitle>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {!planta && (
                          <Tooltip>
                            <TooltipTrigger>
                              <AlertTriangle className="h-4 w-4 text-amber-500" />
                            </TooltipTrigger>
                            <TooltipContent><p className="font-body text-xs">Sem planta DXF associada</p></TooltipContent>
                          </Tooltip>
                        )}
                        {missingDates && (
                          <Tooltip>
                            <TooltipTrigger>
                              <AlertTriangle className="h-4 w-4 text-destructive" />
                            </TooltipTrigger>
                            <TooltipContent><p className="font-body text-xs">Atividades sem datas previstas</p></TooltipContent>
                          </Tooltip>
                        )}
                        <Badge variant="outline" className={`text-[10px] ${statusColors[obra.status]}`}>
                          {statusLabels[obra.status]}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {obra.cidade && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        <span className="font-body">{obra.cidade}{obra.estado ? `, ${obra.estado}` : ''}</span>
                      </div>
                    )}
                    {obra.data_inicio && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span className="font-body">
                          {new Date(obra.data_inicio).toLocaleDateString('pt-BR')}
                          {obra.data_previsao && ` — ${new Date(obra.data_previsao).toLocaleDateString('pt-BR')}`}
                        </span>
                      </div>
                    )}

                    {/* DXF status */}
                    {planta ? (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <FileType2 className="h-3 w-3 text-green-600" />
                        <span className="font-body truncate flex-1">{planta.nome}</span>
                        {hasFotos ? (
                          <Tooltip>
                            <TooltipTrigger>
                              <span className="flex items-center gap-0.5 text-[10px] text-amber-600">
                                <ImageIcon className="h-3 w-3" /> protegido
                              </span>
                            </TooltipTrigger>
                            <TooltipContent><p className="font-body text-xs">Não é possível alterar ou excluir: há fotos associadas à planta</p></TooltipContent>
                          </Tooltip>
                        ) : (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-5 w-5">
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle className="font-heading">Remover planta DXF?</AlertDialogTitle>
                                <AlertDialogDescription className="font-body">
                                  O arquivo DXF será desassociado da obra.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="font-body">Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeletePlanta(planta.id)} className="bg-destructive text-destructive-foreground font-body">
                                  Remover
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    ) : null}

                    <div className="flex gap-2 pt-2 flex-wrap">
                      <Button size="sm" variant="outline" className="h-7 text-xs font-body" onClick={() => openEdit(obra)}>
                        <Pencil className="h-3 w-3 mr-1" /> Editar
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs font-body" onClick={() => { setImportObraId(obra.id); setImportWizardOpen(true); }}>
                        <Upload className="h-3 w-3 mr-1" /> Importar Orç.
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs font-body" onClick={() => { setEditorObraId(obra.id); setEditorObraNome(obra.nome); }}>
                        <FileSpreadsheet className="h-3 w-3 mr-1" /> Editar Orç.
                      </Button>
                      {!planta ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs font-body"
                          disabled={dxfUploading}
                          onClick={() => {
                            setDxfUploadObraId(obra.id);
                            dxfInputRef.current?.click();
                          }}
                        >
                          {dxfUploading && dxfUploadObraId === obra.id ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <FileType2 className="h-3 w-3 mr-1" />
                          )}
                          DXF
                        </Button>
                      ) : !hasFotos ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs font-body"
                          disabled={dxfUploading}
                          onClick={() => {
                            setDxfUploadObraId(obra.id);
                            // Delete existing then upload new
                            handleDeletePlanta(planta.id).then(() => {
                              dxfInputRef.current?.click();
                            });
                          }}
                        >
                          <FileType2 className="h-3 w-3 mr-1" /> Trocar DXF
                        </Button>
                      ) : null}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="outline" className="h-7 text-xs text-destructive font-body">
                            <Trash2 className="h-3 w-3 mr-1" /> Excluir
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle className="font-heading">Excluir obra?</AlertDialogTitle>
                            <AlertDialogDescription className="font-body">
                              Essa ação é irreversível. Todos os dados da EAP serão removidos.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="font-body">Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteMutation.mutate(obra.id)} className="bg-destructive text-destructive-foreground font-body">
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <ImportOrcamentoWizard
          open={importWizardOpen}
          onOpenChange={setImportWizardOpen}
          obraId={importObraId}
          onImportComplete={handleImportComplete}
        />

        <EapItemEditModal
          open={!!editingItem}
          onOpenChange={(open) => { if (!open) setEditingItem(null); }}
          item={editingItem}
          allItems={editEapItems}
          onSave={handleSaveItem}
          obraDataInicio={obras.find(o => o.id === editObraId)?.data_inicio}
          obraDataPrevisao={obras.find(o => o.id === editObraId)?.data_previsao}
        />

        <EapEditorPanel
          open={!!editorObraId}
          onOpenChange={(open) => { if (!open) { setEditorObraId(''); setEditorObraNome(''); } }}
          obraId={editorObraId}
          obraNome={editorObraNome}
        />
      </div>
    </TooltipProvider>
  );
}
