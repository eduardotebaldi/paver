import { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Plus, Trash2, FolderTree, Layers, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { fetchEapItems } from '@/services/api';
import {
  fetchDependencyRules,
  createDependencyRule,
  deleteDependencyRule,
  DependencyRule,
  DependencyRuleType,
} from '@/services/dependencyRulesApi';

type TabType = 'servico_em_pacote' | 'pacote_em_servico';

export default function Dependencias() {
  const { id: obraId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<TabType>('servico_em_pacote');
  const [newPred, setNewPred] = useState('');
  const [newSucc, setNewSucc] = useState('');

  const { data: eapItems = [], isLoading: loadingEap } = useQuery({
    queryKey: ['eap', obraId],
    queryFn: () => fetchEapItems(obraId!),
    enabled: !!obraId,
  });

  const { data: rules = [], isLoading: loadingRules } = useQuery({
    queryKey: ['dependency-rules', obraId],
    queryFn: () => fetchDependencyRules(obraId!),
    enabled: !!obraId,
  });

  const createMutation = useMutation({
    mutationFn: (params: { tipo: DependencyRuleType; predecessor: string; successor: string }) =>
      createDependencyRule(obraId!, params.tipo, params.predecessor, params.successor, user!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dependency-rules', obraId] });
      toast({ title: 'Dependência criada!' });
      setNewPred('');
      setNewSucc('');
    },
    onError: (err: any) => {
      const msg = err.message?.includes('duplicate') ? 'Essa dependência já existe.' : err.message;
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDependencyRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dependency-rules', obraId] });
      toast({ title: 'Dependência removida!' });
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  // Extract unique pacotes and service types from EAP items
  const items = useMemo(() => eapItems.filter(i => i.tipo === 'item'), [eapItems]);

  const pacotes = useMemo(() => {
    const set = new Set<string>();
    items.forEach(i => { if (i.pacote) set.add(i.pacote); });
    return Array.from(set).sort();
  }, [items]);

  const servicos = useMemo(() => {
    const set = new Set<string>();
    items.forEach(i => { if (i.lote) set.add(i.lote); });
    return Array.from(set).sort();
  }, [items]);

  const filteredRules = useMemo(
    () => rules.filter(r => r.tipo === activeTab),
    [rules, activeTab]
  );

  // Options for selects based on active tab
  const options = activeTab === 'servico_em_pacote' ? servicos : pacotes;

  const handleAdd = () => {
    if (!newPred || !newSucc) return;
    if (newPred === newSucc) {
      toast({ title: 'Predecessor e successor devem ser diferentes', variant: 'destructive' });
      return;
    }
    createMutation.mutate({ tipo: activeTab, predecessor: newPred, successor: newSucc });
  };

  // Build visual graph data
  const graphNodes = useMemo(() => {
    const nodeSet = new Set<string>();
    filteredRules.forEach(r => {
      nodeSet.add(r.predecessor);
      nodeSet.add(r.successor);
    });
    return Array.from(nodeSet);
  }, [filteredRules]);

  // Build adjacency for layered layout
  const { layers, edges } = useMemo(() => {
    if (filteredRules.length === 0) return { layers: [] as string[][], edges: [] as { from: string; to: string }[] };

    const adj = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    const allNodes = new Set<string>();

    filteredRules.forEach(r => {
      allNodes.add(r.predecessor);
      allNodes.add(r.successor);
      if (!adj.has(r.predecessor)) adj.set(r.predecessor, []);
      adj.get(r.predecessor)!.push(r.successor);
      inDegree.set(r.successor, (inDegree.get(r.successor) || 0) + 1);
      if (!inDegree.has(r.predecessor)) inDegree.set(r.predecessor, inDegree.get(r.predecessor) || 0);
    });

    // Topological sort into layers (Kahn's algorithm)
    const layers: string[][] = [];
    let current = Array.from(allNodes).filter(n => (inDegree.get(n) || 0) === 0);
    const placed = new Set<string>();

    while (current.length > 0) {
      layers.push(current);
      current.forEach(n => placed.add(n));
      const next: string[] = [];
      for (const n of current) {
        for (const succ of (adj.get(n) || [])) {
          inDegree.set(succ, (inDegree.get(succ) || 0) - 1);
          if (inDegree.get(succ) === 0 && !placed.has(succ)) {
            next.push(succ);
          }
        }
      }
      current = next;
    }

    // Add remaining (circular) nodes
    const remaining = Array.from(allNodes).filter(n => !placed.has(n));
    if (remaining.length > 0) layers.push(remaining);

    const edges = filteredRules.map(r => ({ from: r.predecessor, to: r.successor }));

    return { layers, edges };
  }, [filteredRules]);

  // Calculate node positions for SVG
  const NODE_W = 180;
  const NODE_H = 40;
  const LAYER_GAP = 80;
  const NODE_GAP = 16;

  const nodePositions = useMemo(() => {
    const positions = new Map<string, { x: number; y: number }>();
    let x = 40;
    for (const layer of layers) {
      const totalHeight = layer.length * NODE_H + (layer.length - 1) * NODE_GAP;
      let y = Math.max(20, (300 - totalHeight) / 2);
      for (const node of layer) {
        positions.set(node, { x, y });
        y += NODE_H + NODE_GAP;
      }
      x += NODE_W + LAYER_GAP;
    }
    return positions;
  }, [layers]);

  const svgWidth = layers.length > 0 ? layers.length * (NODE_W + LAYER_GAP) + 40 : 400;
  const svgHeight = Math.max(
    300,
    ...layers.map(l => l.length * (NODE_H + NODE_GAP) + 40)
  );

  const isLoading = loadingEap || loadingRules;

  if (!obraId) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/obras/${obraId}`)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-heading font-bold text-foreground">Painel de Dependências</h1>
          <p className="text-sm text-muted-foreground font-body">
            Gerencie as regras de sequenciamento entre pacotes e serviços
          </p>
        </div>
      </div>

      {/* Tab toggle */}
      <div className="flex items-center gap-3">
        <div className="flex items-center rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => { setActiveTab('servico_em_pacote'); setNewPred(''); setNewSucc(''); }}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-body transition-colors ${
              activeTab === 'servico_em_pacote'
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-muted-foreground hover:bg-muted'
            }`}
          >
            <Layers className="h-4 w-4" />
            Serviço dentro de Pacote
          </button>
          <button
            onClick={() => { setActiveTab('pacote_em_servico'); setNewPred(''); setNewSucc(''); }}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-body transition-colors ${
              activeTab === 'pacote_em_servico'
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-muted-foreground hover:bg-muted'
            }`}
          >
            <FolderTree className="h-4 w-4" />
            Pacote dentro de Serviço
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Visual Graph */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-heading text-base">
              {activeTab === 'servico_em_pacote'
                ? 'Ordem de serviços (aplicada em todos os pacotes)'
                : 'Ordem de pacotes (aplicada por tipo de serviço)'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-accent" />
              </div>
            ) : filteredRules.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                  <ArrowRight className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground font-body">
                  Nenhuma dependência cadastrada.
                </p>
                <p className="text-xs text-muted-foreground/70 font-body mt-1">
                  Use o formulário ao lado para adicionar regras de sequenciamento.
                </p>
              </div>
            ) : (
              <div className="overflow-auto rounded-lg border border-border bg-muted/20">
                <svg width={svgWidth} height={svgHeight} className="min-w-full">
                  <defs>
                    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                      <polygon points="0 0, 10 3.5, 0 7" className="fill-primary" />
                    </marker>
                  </defs>

                  {/* Edges */}
                  {edges.map((edge, idx) => {
                    const from = nodePositions.get(edge.from);
                    const to = nodePositions.get(edge.to);
                    if (!from || !to) return null;
                    const x1 = from.x + NODE_W;
                    const y1 = from.y + NODE_H / 2;
                    const x2 = to.x;
                    const y2 = to.y + NODE_H / 2;
                    const cx1 = x1 + (x2 - x1) * 0.4;
                    const cx2 = x2 - (x2 - x1) * 0.4;
                    return (
                      <path
                        key={idx}
                        d={`M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`}
                        className="stroke-primary/60"
                        strokeWidth="2"
                        fill="none"
                        markerEnd="url(#arrowhead)"
                      />
                    );
                  })}

                  {/* Nodes */}
                  {Array.from(nodePositions.entries()).map(([name, pos]) => (
                    <g key={name}>
                      <rect
                        x={pos.x}
                        y={pos.y}
                        width={NODE_W}
                        height={NODE_H}
                        rx={8}
                        className="fill-card stroke-border"
                        strokeWidth="1.5"
                      />
                      <text
                        x={pos.x + NODE_W / 2}
                        y={pos.y + NODE_H / 2}
                        textAnchor="middle"
                        dominantBaseline="central"
                        className="fill-foreground text-xs font-body"
                        style={{ fontSize: '11px' }}
                      >
                        {name.length > 22 ? name.substring(0, 20) + '...' : name}
                      </text>
                    </g>
                  ))}
                </svg>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Rules list + add form */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="font-heading text-sm">Adicionar Dependência</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground font-body">
                {activeTab === 'servico_em_pacote'
                  ? 'Defina a ordem dos tipos de serviço. Esta regra é aplicada dentro de cada pacote de trabalho.'
                  : 'Defina a ordem dos pacotes de trabalho. Esta regra é aplicada dentro de cada tipo de serviço.'}
              </p>

              <div className="space-y-2">
                <label className="text-xs font-body text-muted-foreground">Predecessor (executar primeiro)</label>
                <Select value={newPred} onValueChange={setNewPred}>
                  <SelectTrigger className="font-body text-xs">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-48">
                    {options.map(o => (
                      <SelectItem key={o} value={o} className="text-xs font-body">{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-center">
                <ArrowRight className="h-4 w-4 text-muted-foreground rotate-90" />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-body text-muted-foreground">Successor (executar depois)</label>
                <Select value={newSucc} onValueChange={setNewSucc}>
                  <SelectTrigger className="font-body text-xs">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-48">
                    {options.filter(o => o !== newPred).map(o => (
                      <SelectItem key={o} value={o} className="text-xs font-body">{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={handleAdd}
                disabled={!newPred || !newSucc || createMutation.isPending}
                className="w-full font-body"
                size="sm"
              >
                {createMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Adicionar
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="font-heading text-sm flex items-center gap-2">
                Regras cadastradas
                <Badge variant="secondary" className="text-[10px] font-body">{filteredRules.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {filteredRules.length === 0 ? (
                <p className="text-xs text-muted-foreground font-body text-center py-4">Nenhuma regra ainda.</p>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-auto">
                  {filteredRules.map(rule => (
                    <div
                      key={rule.id}
                      className="flex items-center gap-2 p-2 rounded-md border border-border bg-background group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-xs font-body">
                          <span className="truncate font-medium">{rule.predecessor}</span>
                          <ArrowRight className="h-3 w-3 text-primary shrink-0" />
                          <span className="truncate font-medium">{rule.successor}</span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        onClick={() => deleteMutation.mutate(rule.id)}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
