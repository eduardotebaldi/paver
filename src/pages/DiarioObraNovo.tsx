import { useState, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, ArrowRight, Loader2, Sun, Cloud, CloudSun, CloudRain, Snowflake,
  ChevronDown, ChevronRight, Check, Package, Layers, Search, Camera, Upload, X, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { fetchObras, fetchEapItems, createDiario, uploadFile, EapItem } from '@/services/api';
import { supabase } from '@/integrations/supabase/client';

const climaOptions = [
  { value: 'ensolarado', label: 'Ensolarado', icon: Sun },
  { value: 'nublado', label: 'Nublado', icon: Cloud },
  { value: 'parcialmente_nublado', label: 'Parc. Nublado', icon: CloudSun },
  { value: 'chuvoso', label: 'Chuvoso', icon: CloudRain },
  { value: 'frio', label: 'Frio', icon: Snowflake },
];

type GroupMode = 'pacote' | 'servico';

interface AtividadeEntry {
  eap_item_id: string;
  quantidade_dia: number;
  avanco_percentual: number;
}

interface FotoDiario {
  file: File;
  preview: string;
  descricao: string;
}

export default function DiarioObraNovoPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const obraIdFromUrl = searchParams.get('obra') || '';
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Step control: 1 = activities, 2 = photos
  const [step, setStep] = useState<1 | 2>(1);

  // Form fields
  const [selectedObraId, setSelectedObraId] = useState(obraIdFromUrl);
  const [data, setData] = useState(new Date().toISOString().split('T')[0]);
  const [climaManha, setClimaManha] = useState('ensolarado');
  const [climaTarde, setClimaTarde] = useState('ensolarado');
  const [maoDeObra, setMaoDeObra] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [atividades, setAtividades] = useState<Map<string, AtividadeEntry>>(new Map());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Grouping & filter
  const [groupMode, setGroupMode] = useState<GroupMode>('pacote');
  const [filterText, setFilterText] = useState('');

  // Photos (step 2)
  const [fotos, setFotos] = useState<FotoDiario[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: obras = [] } = useQuery({
    queryKey: ['obras'],
    queryFn: fetchObras,
  });

  const { data: eapItems = [] } = useQuery({
    queryKey: ['eap', selectedObraId],
    queryFn: () => fetchEapItems(selectedObraId),
    enabled: !!selectedObraId,
  });

  const eapItensOnly = useMemo(() => eapItems.filter(i => i.tipo === 'item'), [eapItems]);

  // Build tree structure from EAP items
  interface EapNode {
    item: EapItem;
    children: EapNode[];
  }

  const eapTree = useMemo(() => {
    const nodeMap = new Map<string, EapNode>();
    const roots: EapNode[] = [];

    // Create nodes for ALL items (agrupadores + items)
    for (const item of eapItems) {
      nodeMap.set(item.id, { item, children: [] });
    }

    // Build parent-child relationships
    for (const item of eapItems) {
      const node = nodeMap.get(item.id)!;
      if (item.parent_id && nodeMap.has(item.parent_id)) {
        nodeMap.get(item.parent_id)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    // Sort children by ordem
    const sortChildren = (nodes: EapNode[]) => {
      nodes.sort((a, b) => (a.item.ordem || 0) - (b.item.ordem || 0));
      nodes.forEach(n => sortChildren(n.children));
    };
    sortChildren(roots);

    return roots;
  }, [eapItems]);

  // Filter tree: keep branches that contain matching items
  const filteredTree = useMemo(() => {
    if (!filterText.trim()) return eapTree;

    const lower = filterText.toLowerCase();

    const filterNode = (node: EapNode): EapNode | null => {
      // Check if this node's group value matches
      const groupValue = groupMode === 'pacote' ? (node.item.pacote || '') : (node.item.lote || '');
      const descMatch = node.item.descricao.toLowerCase().includes(lower);
      const groupMatch = groupValue.toLowerCase().includes(lower);

      // Recursively filter children
      const filteredChildren = node.children.map(filterNode).filter(Boolean) as EapNode[];

      // Keep node if it matches or has matching descendants
      if (descMatch || groupMatch || filteredChildren.length > 0) {
        return { item: node.item, children: filteredChildren.length > 0 ? filteredChildren : node.children };
      }
      return null;
    };

    return eapTree.map(filterNode).filter(Boolean) as EapNode[];
  }, [eapTree, filterText, groupMode]);

  // Auto-expand all groups when obra/mode changes
  useMemo(() => {
    const keys = new Set<string>();
    const collectKeys = (nodes: EapNode[]) => {
      for (const node of nodes) {
        if (node.children.length > 0) {
          keys.add(node.item.id);
          collectKeys(node.children);
        }
      }
    };
    collectKeys(filteredTree);
    setExpandedGroups(keys);
  }, [filteredTree]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleItem = (item: EapItem) => {
    setAtividades(prev => {
      const next = new Map(prev);
      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.set(item.id, {
          eap_item_id: item.id,
          quantidade_dia: 0,
          avanco_percentual: item.avanco_realizado || 0,
        });
      }
      return next;
    });
  };

  const updateQuantidadeDia = (item: EapItem, qtdDia: number) => {
    const totalQtd = item.quantidade || 0;
    const currentRealized = item.avanco_realizado || 0;
    const currentQtdRealized = totalQtd * (currentRealized / 100);
    const newQtdRealized = currentQtdRealized + qtdDia;
    const newPercent = totalQtd > 0
      ? Math.min(100, Math.round((newQtdRealized / totalQtd) * 10000) / 100)
      : currentRealized;

    setAtividades(prev => {
      const next = new Map(prev);
      next.set(item.id, { eap_item_id: item.id, quantidade_dia: qtdDia, avanco_percentual: newPercent });
      return next;
    });
  };

  const updatePercentual = (item: EapItem, newPercent: number) => {
    const totalQtd = item.quantidade || 0;
    const currentRealized = item.avanco_realizado || 0;
    const currentQtdRealized = totalQtd * (currentRealized / 100);
    const newQtdRealized = totalQtd * (newPercent / 100);
    const qtdDia = Math.max(0, Math.round((newQtdRealized - currentQtdRealized) * 100) / 100);

    setAtividades(prev => {
      const next = new Map(prev);
      next.set(item.id, { eap_item_id: item.id, quantidade_dia: qtdDia, avanco_percentual: Math.min(100, newPercent) });
      return next;
    });
  };

  // Count items in a subtree
  const countItems = (nodes: EapNode[]): number => {
    let count = 0;
    for (const node of nodes) {
      if (node.item.tipo === 'item') count++;
      count += countItems(node.children);
    }
    return count;
  };

  const countSelectedInTree = (nodes: EapNode[]): number => {
    let count = 0;
    for (const node of nodes) {
      if (node.item.tipo === 'item' && atividades.has(node.item.id)) count++;
      count += countSelectedInTree(node.children);
    }
    return count;
  };

  // Render a tree node recursively
  const renderNode = (node: EapNode, depth: number): React.ReactNode => {
    const { item } = node;

    if (item.tipo === 'agrupador') {
      const isExpanded = expandedGroups.has(item.id);
      const itemCount = countItems(node.children);
      const selectedInGroup = countSelectedInTree(node.children);

      return (
        <div key={item.id}>
          <Collapsible open={isExpanded} onOpenChange={() => toggleGroup(item.id)}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className={`flex items-center gap-2 w-full px-3 py-2 rounded-md transition-colors text-left ${
                  depth === 0
                    ? 'bg-muted/50 hover:bg-muted'
                    : depth === 1
                    ? 'bg-muted/30 hover:bg-muted/50 ml-1'
                    : 'hover:bg-muted/30 ml-2'
                }`}
                style={{ paddingLeft: `${12 + depth * 16}px` }}
              >
                {isExpanded
                  ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                }
                {item.codigo && (
                  <span className="text-xs font-mono text-accent shrink-0 font-semibold">{item.codigo}</span>
                )}
                <span className={`flex-1 text-sm font-heading ${depth === 0 ? 'font-semibold' : 'font-medium'} truncate`}>
                  {item.descricao}
                </span>
                <Badge variant="outline" className="text-[10px] font-body shrink-0">
                  {itemCount} itens
                </Badge>
                {selectedInGroup > 0 && (
                  <Badge className="text-[10px] font-body bg-accent text-accent-foreground shrink-0">
                    {selectedInGroup} sel.
                  </Badge>
                )}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className={depth === 0 ? 'border-l-2 border-border ml-4 space-y-0.5 mt-0.5' : 'space-y-0.5'}>
                {node.children.map(child => renderNode(child, depth + 1))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      );
    }

    // Leaf item — selectable
    const selected = atividades.get(item.id);
    const currentPercent = item.avanco_realizado || 0;
    const totalQtd = item.quantidade || 0;
    const currentQtdRealized = totalQtd * (currentPercent / 100);

    return (
      <div
        key={item.id}
        className={`px-3 py-2 transition-colors rounded-md ${
          selected ? 'bg-accent/5' : 'hover:bg-muted/20'
        }`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
      >
        <div className="flex items-center gap-3">
          <Checkbox
            checked={!!selected}
            onCheckedChange={() => toggleItem(item)}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {item.codigo && (
                <span className="text-xs text-muted-foreground font-mono shrink-0">{item.codigo}</span>
              )}
              <span className="text-sm font-body text-foreground truncate">{item.descricao}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <span className="text-xs text-muted-foreground font-body block">
                Atual: {currentPercent.toFixed(1)}%
              </span>
              {totalQtd > 0 && (
                <span className="text-[10px] text-muted-foreground/70 font-body">
                  {currentQtdRealized.toFixed(1)} / {totalQtd} {item.unidade || 'un'}
                </span>
              )}
            </div>
            <Progress value={currentPercent} className="w-16 h-2" />
          </div>
        </div>

        {selected && (
          <div className="mt-2 ml-8 flex items-center gap-4 flex-wrap">
            {totalQtd > 0 && (
              <div className="flex items-center gap-1.5">
                <Label className="text-xs font-body text-muted-foreground whitespace-nowrap">
                  Qtd. do dia:
                </Label>
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={selected.quantidade_dia || ''}
                  onChange={e => updateQuantidadeDia(item, Number(e.target.value) || 0)}
                  className="w-20 h-7 text-xs font-body text-center"
                />
                <span className="text-xs text-muted-foreground font-body">{item.unidade || 'un'}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Label className="text-xs font-body text-muted-foreground whitespace-nowrap">
                Novo %:
              </Label>
              <Input
                type="number"
                min={0}
                max={100}
                step="any"
                value={selected.avanco_percentual || ''}
                onChange={e => updatePercentual(item, Number(e.target.value) || 0)}
                className="w-20 h-7 text-xs font-body text-center"
              />
              <span className="text-xs text-muted-foreground font-body">%</span>
            </div>
            {selected.avanco_percentual > currentPercent && (
              <Badge variant="secondary" className="text-[10px] font-body">
                <Check className="h-3 w-3 mr-0.5" />
                +{(selected.avanco_percentual - currentPercent).toFixed(1)}%
              </Badge>
            )}
          </div>
        )}
      </div>
    );
  };

  // Photo handlers (unchanged)
  // ... keep existing code for handleAddFotos, removeFoto, updateFotoDescricao, selectedCount, saveMutation, handleNext/Back/Submit

  const selectedCount = atividades.size;

  // --- rendered step 1 EAP card content replacement ---
  const renderEapContent = () => {
    if (!selectedObraId) {
      return (
        <p className="text-sm text-muted-foreground font-body italic py-4 text-center">
          Selecione uma obra para ver os itens da EAP.
        </p>
      );
    }
    if (eapItems.length === 0) {
      return (
        <p className="text-sm text-muted-foreground font-body italic py-4 text-center">
          Nenhum item de EAP cadastrado para esta obra.
        </p>
      );
    }
    if (filteredTree.length === 0) {
      return (
        <p className="text-sm text-muted-foreground font-body italic py-4 text-center">
          Nenhum resultado para "{filterText}".
        </p>
      );
    }
    return (
      <div className="space-y-1">
        {filteredTree.map(node => renderNode(node, 0))}
      </div>
    );
  }

          {/* Observações */}
          <div className="space-y-2">
            <Label className="font-body">Observações</Label>
            <Textarea
              value={observacoes}
              onChange={e => setObservacoes(e.target.value)}
              rows={2}
              className="font-body"
              placeholder="Observações gerais sobre o dia..."
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pb-8">
            <Button type="button" variant="outline" onClick={() => navigate('/diario-obra')} className="font-body">
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleNext}
              disabled={!selectedObraId}
              className="bg-accent text-accent-foreground hover:bg-accent/90 font-body"
            >
              Próximo: Fotos
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      ) : (
        /* ═══════════ STEP 2: Photos ═══════════ */
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="font-heading text-base flex items-center gap-2">
                  <Camera className="h-5 w-5 text-accent" />
                  Registro Fotográfico
                </CardTitle>
                <Badge variant="secondary" className="font-body">
                  {fotos.length} foto(s)
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground font-body">
                Adicione fotos do dia. Você pode adicionar uma descrição para cada foto.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Upload area */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-lg p-8 flex flex-col items-center justify-center cursor-pointer hover:border-accent/50 hover:bg-muted/30 transition-colors"
              >
                <Upload className="h-8 w-8 text-muted-foreground/50 mb-2" />
                <p className="text-sm font-body text-muted-foreground">Clique para adicionar fotos</p>
                <p className="text-xs font-body text-muted-foreground/60 mt-1">JPG, PNG ou WEBP</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={e => handleAddFotos(e.target.files)}
                />
              </div>

              {/* Photo grid */}
              {fotos.length > 0 && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {fotos.map((foto, index) => (
                    <div key={index} className="border rounded-lg overflow-hidden group">
                      <div className="aspect-video bg-muted relative">
                        <img
                          src={foto.preview}
                          alt={`Foto ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeFoto(index)}
                          className="absolute top-2 right-2 h-7 w-7 bg-destructive/90 text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="p-2">
                        <Input
                          value={foto.descricao}
                          onChange={e => updateFotoDescricao(index, e.target.value)}
                          placeholder="Descrição da foto (opcional)"
                          className="text-xs font-body h-7"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Summary of step 1 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-heading text-sm text-muted-foreground">Resumo das atividades</CardTitle>
            </CardHeader>
            <CardContent>
              {atividades.size === 0 ? (
                <p className="text-xs text-muted-foreground font-body italic">Nenhuma atividade selecionada.</p>
              ) : (
                <div className="space-y-1">
                  {Array.from(atividades.values()).map(a => {
                    const item = eapItensOnly.find(i => i.id === a.eap_item_id);
                    return (
                      <div key={a.eap_item_id} className="flex items-center justify-between text-xs font-body">
                        <span className="truncate text-foreground">{item?.descricao || 'Item'}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          {a.quantidade_dia > 0 && (
                            <span className="text-muted-foreground">+{a.quantidade_dia} {item?.unidade || 'un'}</span>
                          )}
                          <Badge variant="secondary" className="text-[10px]">{a.avanco_percentual.toFixed(1)}%</Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-between pb-8">
            <Button type="button" variant="outline" onClick={handleBack} className="font-body">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!selectedObraId || saveMutation.isPending}
              className="bg-accent text-accent-foreground hover:bg-accent/90 font-body"
            >
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              Registrar Diário
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
