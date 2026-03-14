import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Upload, Loader2, FileSpreadsheet, ChevronRight, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { fetchObra, fetchEapItems, insertEapItems, deleteEapItemsByObra, EapItem } from '@/services/api';
import { parseEapExcel } from '@/lib/eapParser';
import DiarioObraTab from '@/components/DiarioObraTab';
import RelatorioFotograficoTab from '@/components/RelatorioFotograficoTab';

export default function ObraDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();
  const canEdit = hasRole('admin') || hasRole('engenharia');
  const fileRef = useRef<HTMLInputElement>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

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

  const toggleGroup = (itemId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const agrupadores = eapItems.filter(i => i.tipo === 'agrupador');
  const itens = eapItems.filter(i => i.tipo === 'item');
  const avgRealizado = itens.length > 0
    ? itens.reduce((sum, i) => sum + (i.avanco_realizado || 0), 0) / itens.length
    : 0;

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

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground font-body">Itens da EAP</p>
            <p className="text-2xl font-bold font-heading">{eapItems.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground font-body">Agrupadores</p>
            <p className="text-2xl font-bold font-heading">{agrupadores.length}</p>
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
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="font-heading">Estrutura Analítica (EAP)</CardTitle>
              {canEdit && (
                <div>
                  <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFileUpload} className="hidden" />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileRef.current?.click()}
                    disabled={importMutation.isPending}
                    className="font-body"
                  >
                    {importMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    Importar Excel
                  </Button>
                </div>
              )}
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
                  {eapItems.map((item) => (
                    <div key={item.id}>
                      {item.tipo === 'agrupador' ? (
                        <button
                          onClick={() => toggleGroup(item.id)}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 hover:bg-muted text-sm font-medium font-heading transition-colors"
                        >
                          {expandedGroups.has(item.id) ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                          {item.codigo && <Badge variant="outline" className="text-[10px] font-mono">{item.codigo}</Badge>}
                          <span>{item.descricao}</span>
                          {item.lote && <Badge className="ml-auto text-[10px] bg-accent/10 text-accent border-0">{item.lote}</Badge>}
                        </button>
                      ) : (
                        <div className="flex items-center gap-3 px-3 py-2 pl-10 text-sm font-body border-l-2 border-border ml-4">
                          {item.codigo && <span className="text-xs font-mono text-muted-foreground w-16 shrink-0">{item.codigo}</span>}
                          <span className="flex-1">{item.descricao}</span>
                          {item.unidade && <span className="text-xs text-muted-foreground">{item.unidade}</span>}
                          <div className="flex items-center gap-2 shrink-0 w-32">
                            <Progress value={item.avanco_realizado || 0} className="h-1.5" />
                            <span className="text-[10px] text-muted-foreground w-8 text-right">
                              {(item.avanco_realizado || 0).toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
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
    </div>
  );
}
