import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, FileSpreadsheet, ChevronRight, ChevronDown, Layers, FolderTree, Link2, Building2 } from 'lucide-react';
import CollapsibleClassification from '@/components/CollapsibleClassification';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { fetchObras, fetchEapItems, EapItem } from '@/services/api';

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

export default function EapPage() {
  const [selectedObraId, setSelectedObraId] = useState<string>('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [groupMode, setGroupMode] = useState<GroupMode>('pacote');

  const { data: obras = [] } = useQuery({
    queryKey: ['obras'],
    queryFn: fetchObras,
  });

  const { data: eapItems = [], isLoading: loadingEap } = useQuery({
    queryKey: ['eap', selectedObraId],
    queryFn: () => fetchEapItems(selectedObraId),
    enabled: !!selectedObraId,
  });

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const groupedView = useMemo(
    () => buildGroupedView(eapItems, groupMode),
    [eapItems, groupMode]
  );

  const itens = eapItems.filter(i => i.tipo === 'item');
  const avgRealizado = itens.length > 0
    ? itens.reduce((sum, i) => sum + (i.avanco_realizado || 0), 0) / itens.length
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-heading font-bold text-foreground">EAP — Estrutura Analítica</h1>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label className="text-xs font-body text-muted-foreground">Obra</Label>
          <Select value={selectedObraId} onValueChange={(v) => { setSelectedObraId(v); setCollapsedGroups(new Set()); }}>
            <SelectTrigger className="w-64 font-body">
              <Building2 className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Selecione uma obra..." />
            </SelectTrigger>
            <SelectContent>
              {obras.map(o => (
                <SelectItem key={o.id} value={o.id} className="font-body">{o.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedObraId && eapItems.length > 0 && (
          <div className="space-y-1">
            <Label className="text-xs font-body text-muted-foreground">Agrupar por</Label>
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
          </div>
        )}

        {selectedObraId && itens.length > 0 && (
          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm font-body text-muted-foreground">{itens.length} itens</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-heading font-bold">{avgRealizado.toFixed(1)}%</span>
              <Progress value={avgRealizado} className="w-24 h-2" />
            </div>
          </div>
        )}
      </div>

      {!selectedObraId ? (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-center">
              <FileSpreadsheet className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground font-body">Selecione uma obra para consultar a EAP.</p>
            </div>
          </CardContent>
        </Card>
      ) : loadingEap ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
        </div>
      ) : eapItems.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <FileSpreadsheet className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground font-body">
              Nenhum item na EAP desta obra.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-4">
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
                                    className="flex items-center gap-3 px-3 py-1.5 pl-14 text-sm font-body hover:bg-muted/20 rounded-md transition-colors"
                                  >
                                    <span className="flex-1 text-muted-foreground">
                                      {item.descricao}
                                    </span>
                                    {item.data_inicio_prevista && (
                                      <span className="text-[9px] text-muted-foreground">
                                        {new Date(item.data_inicio_prevista + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                                      </span>
                                    )}
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
