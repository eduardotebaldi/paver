import { useState, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Upload, Loader2, FileSpreadsheet, ChevronRight, ChevronDown, Layers, FolderTree, Calendar, History, Link2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { fetchObra, fetchEapItems, insertEapItems, deleteEapItemsByObra, EapItem } from '@/services/api';
import { updateEapItem, bulkUpdateEapItems, calculateDependencyDates } from '@/services/eapApi';
import { parseEapExcel } from '@/lib/eapParser';
import DiarioObraTab from '@/components/DiarioObraTab';
import RelatorioFotograficoTab from '@/components/RelatorioFotograficoTab';
import ImportOrcamentoWizard from '@/components/ImportOrcamentoWizard';
import LinhaBalanco from '@/components/LinhaBalanco';
import EapItemEditModal from '@/components/EapItemEditModal';
import EapMassDateEditor from '@/components/EapMassDateEditor';
import BaselineManager from '@/components/BaselineManager';

type GroupMode = 'pacote' | 'servico';

interface GroupedView {
  key: string;
  label: string;
  subGroups: { key: string; label: string; items: EapItem[] }[];
}

function buildGroupedView(eapItems: EapItem[], mode: GroupMode): GroupedView[] {
  const items = eapItems.filter(i => i.tipo === 'item');

  if (mode === 'pacote') {
    const pacoteMap = new Map<string, Map<string, EapItem[]>>();
    for (const item of items) {
      const pacote = item.pacote || 'Sem pacote';
      const servico = item.lote || 'Sem classificação';
      if (!pacoteMap.has(pacote)) pacoteMap.set(pacote, new Map());
      const servicoMap = pacoteMap.get(pacote)!;
      if (!servicoMap.has(servico)) servicoMap.set(servico, []);
      servicoMap.get(servico)!.push(item);
    }
    return Array.from(pacoteMap.entries()).map(([pacote, servicoMap]) => ({
      key: pacote,
      label: pacote,
      subGroups: Array.from(servicoMap.entries()).map(([servico, items]) => ({
        key: `${pacote}::${servico}`,
        label: servico,
        items,
      })),
    }));
  } else {
    const servicoMap = new Map<string, Map<string, EapItem[]>>();
    for (const item of items) {
      const servico = item.lote || 'Sem classificação';
      const pacote = item.pacote || 'Sem pacote';
      if (!servicoMap.has(servico)) servicoMap.set(servico, new Map());
      const pacoteMap = servicoMap.get(servico)!;
      if (!pacoteMap.has(pacote)) pacoteMap.set(pacote, []);
      pacoteMap.get(pacote)!.push(item);
    }
    return Array.from(servicoMap.entries()).map(([servico, pacoteMap]) => ({
      key: servico,
      label: servico,
      subGroups: Array.from(pacoteMap.entries()).map(([pacote, items]) => ({
        key: `${servico}::${pacote}`,
        label: pacote,
        items,
      })),
    }));
  }
}

export default function ObraDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();
  const canEdit = hasRole('admin') || hasRole('engenharia');
  const isAdmin = hasRole('admin');
  const fileRef = useRef<HTMLInputElement>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [groupMode, setGroupMode] = useState<GroupMode>('pacote');
  const [importWizardOpen, setImportWizardOpen] = useState(false);

  // New modals
  const [editingItem, setEditingItem] = useState<EapItem | null>(null);
  const [massDateOpen, setMassDateOpen] = useState(false);
  const [baselineOpen, setBaselineOpen] = useState(false);

  const { data: obra, isLoading: loadingObra } = useQuery({
    queryKey: ['obra', id],
    queryFn: () => fetchObra(id!),
    enabled: !!id,
  });

  const { data: eapItems = [], isLoading: loadingEap } = useQuery({
    queryKey: ['eap', id],
    queryFn: () => fetchEapItems(id!),
    enabled: !!id,
  });

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const parsed = await parseEapExcel(file);
      await deleteEapItemsByObra(id!);
      const items = parsed.map(item => ({ ...item, obra_id: id! }));
      return insertEapItems(items);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eap', id] });
      toast({ title: 'EAP importada com sucesso!' });
    },
    onError: (err: any) => toast({ title: 'Erro na importação', description: err.message, variant: 'destructive' }),
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      importMutation.mutate(file);
      e.target.value = '';
    }
  };

  const handleImportComplete = () => {
    queryClient.invalidateQueries({ queryKey: ['eap', id] });
    toast({ title: 'Orçamento importado com sucesso!' });
  };

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Save single item
  const handleSaveItem = async (itemId: string, updates: Partial<EapItem>) => {
    await updateEapItem(itemId, updates);
    queryClient.invalidateQueries({ queryKey: ['eap', id] });
    toast({ title: 'Item atualizado!' });
  };

  // Save bulk
  const handleBulkSave = async (changes: { id: string; updates: Partial<EapItem> }[]) => {
    await bulkUpdateEapItems(changes);
    queryClient.invalidateQueries({ queryKey: ['eap', id] });
    toast({ title: `${changes.length} itens atualizados!` });
  };

  // Recalculate dependencies
  const handleRecalcDeps = async () => {
    const calculated = calculateDependencyDates(eapItems);
    const changes: { id: string; updates: Partial<EapItem> }[] = [];
    calculated.forEach((dates, itemId) => {
      changes.push({
        id: itemId,
        updates: {
          data_inicio_prevista: dates.inicio,
          data_fim_prevista: dates.fim,
        },
      });
    });
    if (changes.length > 0) {
      await bulkUpdateEapItems(changes);
      queryClient.invalidateQueries({ queryKey: ['eap', id] });
      toast({ title: `Datas recalculadas para ${changes.length} itens!` });
    } else {
      toast({ title: 'Nenhum item com dependências para recalcular', variant: 'destructive' });
    }
  };

  const groupedView = useMemo(
    () => buildGroupedView(eapItems, groupMode),
    [eapItems, groupMode]
  );

  const itens = eapItems.filter(i => i.tipo === 'item');
  const avgRealizado = itens.length > 0
    ? itens.reduce((sum, i) => sum + (i.avanco_realizado || 0), 0) / itens.length
    : 0;

  const itemsWithDates = itens.filter(i => i.data_inicio_prevista || i.data_fim_prevista).length;
  const itemsWithDeps = itens.filter(i => i.predecessoras && i.predecessoras.length > 0).length;

  if (loadingObra) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!obra) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground font-body">Obra não encontrada</p>
        <Button variant="link" onClick={() => navigate('/obras')} className="font-body">Voltar</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/obras')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-heading font-bold text-foreground">{obra.nome}</h1>
          <p className="text-sm text-muted-foreground font-body">
            {obra.cidade && `${obra.cidade}, ${obra.estado}`}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground font-body">Itens da EAP</p>
            <p className="text-2xl font-bold font-heading">{itens.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground font-body">Com Datas</p>
            <p className="text-2xl font-bold font-heading">{itemsWithDates}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground font-body">Dependências</p>
            <p className="text-2xl font-bold font-heading">{itemsWithDeps}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground font-body">Avanço Realizado</p>
            <div className="flex items-center gap-3">
              <p className="text-2xl font-bold font-heading">{avgRealizado.toFixed(1)}%</p>
              <Progress value={avgRealizado} className="flex-1" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="eap">
        <TabsList>
          <TabsTrigger value="eap" className="font-body">EAP</TabsTrigger>
          <TabsTrigger value="diario" className="font-body">Diário de Obra</TabsTrigger>
          <TabsTrigger value="fotos" className="font-body">Relatório Fotográfico</TabsTrigger>
        </TabsList>

        <TabsContent value="eap" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
              <CardTitle className="font-heading">Estrutura Analítica (EAP)</CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Group mode toggle */}
                <div className="flex items-center rounded-md border border-border overflow-hidden">
                  <button
                    onClick={() => { setGroupMode('pacote'); setCollapsedGroups(new Set()); }}
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
                    onClick={() => { setGroupMode('servico'); setCollapsedGroups(new Set()); }}
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

                {canEdit && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setMassDateOpen(true)} className="font-body">
                      <Calendar className="h-4 w-4 mr-1.5" />
                      Datas
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setBaselineOpen(true)} className="font-body">
                      <History className="h-4 w-4 mr-1.5" />
                      Baselines
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleRecalcDeps} className="font-body">
                      <Link2 className="h-4 w-4 mr-1.5" />
                      Recalcular
                    </Button>
                  </div>
                )}
                {isAdmin && (
                  <div className="flex gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => setImportWizardOpen(true)}
                      className="font-body"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Importar Orçamento
                    </Button>
                    <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFileUpload} className="hidden" />
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loadingEap ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-accent" />
                </div>
              ) : eapItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FileSpreadsheet className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground font-body">
                    Nenhum item na EAP. Importe uma planilha Excel para começar.
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {groupedView.map((group) => {
                    const totalItems = group.subGroups.reduce((s, sg) => s + sg.items.length, 0);
                    return (
                    <div key={group.key}>
                      <button
                        onClick={() => toggleGroup(group.key)}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 hover:bg-muted text-sm font-medium font-heading transition-colors"
                      >
                        {collapsedGroups.has(group.key) ? (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span>{group.label}</span>
                        <Badge variant="secondary" className="text-[10px] font-body ml-2">
                          {totalItems}
                        </Badge>
                      </button>

                      {!collapsedGroups.has(group.key) && (
                        <div className="ml-4 border-l-2 border-border space-y-0.5">
                          {group.subGroups.map((sub) => (
                            <div key={sub.key}>
                              <button
                                onClick={() => toggleGroup(sub.key)}
                                className="w-full flex items-center gap-2 px-3 py-1.5 pl-6 text-sm font-body text-foreground/80 hover:bg-muted/30 rounded-md transition-colors"
                              >
                                {collapsedGroups.has(sub.key) ? (
                                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                ) : (
                                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                )}
                                <span className="font-medium">{sub.label}</span>
                                <Badge variant="outline" className="text-[10px] font-body ml-1">
                                  {sub.items.length}
                                </Badge>
                              </button>

                              {!collapsedGroups.has(sub.key) && (
                                <div className="space-y-0.5">
                                  {sub.items.map((item) => (
                                    <div
                                      key={item.id}
                                      className="flex items-center gap-3 px-3 py-1.5 pl-14 text-sm font-body group hover:bg-muted/20 rounded-md transition-colors"
                                    >
                                      <span className="flex-1 text-muted-foreground">
                                        {item.descricao}
                                      </span>
                                      {/* Date indicators */}
                                      {item.data_inicio_prevista && (
                                        <span className="text-[9px] text-muted-foreground">
                                          {new Date(item.data_inicio_prevista + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                                        </span>
                                      )}
                                      {/* Dependencies indicator */}
                                      {item.predecessoras && item.predecessoras.length > 0 && (
                                        <Badge variant="outline" className="text-[8px] px-1">
                                          <Link2 className="h-2.5 w-2.5 mr-0.5" />
                                          {item.predecessoras.length}
                                        </Badge>
                                      )}
                                      {item.unidade && (
                                        <Badge variant="outline" className="text-[9px] shrink-0">{item.unidade}</Badge>
                                      )}
                                      {item.quantidade ? (
                                        <span className="text-[10px] text-muted-foreground w-12 text-right">
                                          {item.quantidade.toLocaleString('pt-BR')}
                                        </span>
                                      ) : null}
                                      <div className="flex items-center gap-2 shrink-0 w-32">
                                        <Progress value={item.avanco_realizado || 0} className="h-1.5" />
                                        <span className="text-[10px] text-muted-foreground w-8 text-right">
                                          {(item.avanco_realizado || 0).toFixed(0)}%
                                        </span>
                                      </div>
                                      {isAdmin && (
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                          onClick={() => setEditingItem(item)}
                                        >
                                          <Pencil className="h-3 w-3" />
                                        </Button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="diario" className="mt-4">
          <DiarioObraTab obraId={id!} />
        </TabsContent>

        <TabsContent value="fotos" className="mt-4">
          <RelatorioFotograficoTab obraId={id!} />
        </TabsContent>
      </Tabs>

      <ImportOrcamentoWizard
        open={importWizardOpen}
        onOpenChange={setImportWizardOpen}
        obraId={id!}
        onImportComplete={handleImportComplete}
      />

      {/* Edit item modal */}
      <EapItemEditModal
        open={!!editingItem}
        onOpenChange={(open) => { if (!open) setEditingItem(null); }}
        item={editingItem}
        allItems={eapItems}
        onSave={handleSaveItem}
      />

      {/* Mass date editor */}
      <EapMassDateEditor
        open={massDateOpen}
        onOpenChange={setMassDateOpen}
        items={eapItems}
        onSave={handleBulkSave}
      />

      {/* Baseline manager */}
      <BaselineManager
        open={baselineOpen}
        onOpenChange={setBaselineOpen}
        obraId={id!}
        eapItems={eapItems}
      />
    </div>
  );
}
