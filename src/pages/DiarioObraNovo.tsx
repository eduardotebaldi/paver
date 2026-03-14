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
import CollapsibleClassification from '@/components/CollapsibleClassification';

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

interface EapNode {
  item: EapItem;
  children: EapNode[];
}

export default function DiarioObraNovoPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const obraIdFromUrl = searchParams.get('obra') || '';
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [step, setStep] = useState<1 | 2>(1);
  const [selectedObraId, setSelectedObraId] = useState(obraIdFromUrl);
  const [data, setData] = useState(new Date().toISOString().split('T')[0]);
  const [climaManha, setClimaManha] = useState('ensolarado');
  const [climaTarde, setClimaTarde] = useState('ensolarado');
  const [maoDeObra, setMaoDeObra] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [atividades, setAtividades] = useState<Map<string, AtividadeEntry>>(new Map());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedSubGroups, setExpandedSubGroups] = useState<Set<string>>(new Set());
  const [groupMode, setGroupMode] = useState<GroupMode>('pacote');
  const [filterText, setFilterText] = useState('');
  const [fotos, setFotos] = useState<FotoDiario[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: obras = [] } = useQuery({ queryKey: ['obras'], queryFn: fetchObras });
  const { data: eapItems = [] } = useQuery({
    queryKey: ['eap', selectedObraId],
    queryFn: () => fetchEapItems(selectedObraId),
    enabled: !!selectedObraId,
  });

  const eapItensOnly = useMemo(() => eapItems.filter(i => i.tipo === 'item'), [eapItems]);

  // Build parent map for hierarchy breadcrumb
  const parentMap = useMemo(() => {
    const map = new Map<string, EapItem>();
    for (const item of eapItems) map.set(item.id, item);
    return map;
  }, [eapItems]);

  const getHierarchyPath = (item: EapItem): EapItem[] => {
    const path: EapItem[] = [];
    let current = item.parent_id ? parentMap.get(item.parent_id) : undefined;
    while (current) {
      path.unshift(current);
      current = current.parent_id ? parentMap.get(current.parent_id) : undefined;
    }
    return path;
  };

  // Group items by pacote or servico (lote)
  const groupedItems = useMemo(() => {
    const groups = new Map<string, EapItem[]>();
    for (const item of eapItensOnly) {
      const key = groupMode === 'pacote' ? (item.pacote || 'Sem pacote') : (item.lote || 'Sem serviço');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }
    // Sort groups alphabetically
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [eapItensOnly, groupMode]);

  // Filter groups
  const filteredGroups = useMemo(() => {
    if (!filterText.trim()) return groupedItems;
    const lower = filterText.toLowerCase();
    return groupedItems
      .map(([key, items]) => {
        const keyMatch = key.toLowerCase().includes(lower);
        const filteredItems = items.filter(item => {
          const descMatch = item.descricao.toLowerCase().includes(lower);
          const codeMatch = (item.codigo || '').toLowerCase().includes(lower);
          const pathMatch = getHierarchyPath(item).some(p => p.descricao.toLowerCase().includes(lower));
          return descMatch || codeMatch || pathMatch;
        });
        if (keyMatch) return [key, items] as [string, EapItem[]];
        if (filteredItems.length > 0) return [key, filteredItems] as [string, EapItem[]];
        return null;
      })
      .filter(Boolean) as [string, EapItem[]][];
  }, [groupedItems, filterText]);

  // Start with all groups collapsed (no auto-expand)

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleSubGroup = (key: string) => {
    setExpandedSubGroups(prev => {
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
        next.set(item.id, { eap_item_id: item.id, quantidade_dia: 0, avanco_percentual: item.avanco_realizado || 0 });
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

  // Photo handlers
  const handleAddFotos = (files: FileList | null) => {
    if (!files) return;
    const newFotos: FotoDiario[] = Array.from(files).map(file => ({
      file, preview: URL.createObjectURL(file), descricao: '',
    }));
    setFotos(prev => [...prev, ...newFotos]);
  };
  const removeFoto = (index: number) => {
    setFotos(prev => { const next = [...prev]; URL.revokeObjectURL(next[index].preview); next.splice(index, 1); return next; });
  };
  const updateFotoDescricao = (index: number, descricao: string) => {
    setFotos(prev => prev.map((f, i) => i === index ? { ...f, descricao } : f));
  };

  const selectedCount = atividades.size;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const atividadesArr = Array.from(atividades.values()).filter(a => a.quantidade_dia > 0 || a.avanco_percentual > 0);
      const fotoUrls: string[] = [];
      for (const foto of fotos) {
        const ext = foto.file.name.split('.').pop() || 'jpg';
        const path = `diarios/${selectedObraId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const url = await uploadFile('paver-fotos', path, foto.file);
        fotoUrls.push(url);
      }
      const diario = await createDiario({
        obra_id: selectedObraId, data, clima: climaManha, clima_manha: climaManha, clima_tarde: climaTarde,
        mao_de_obra: maoDeObra, fotos: fotoUrls.length > 0 ? fotoUrls : null,
        atividades: atividadesArr.length > 0
          ? atividadesArr.map(a => { const item = eapItensOnly.find(i => i.id === a.eap_item_id); return `${item?.descricao || 'Item'}: ${a.avanco_percentual}%`; }).join('; ')
          : 'Sem atividades registradas',
        observacoes: observacoes || undefined, created_by: user!.id,
      } as any);
      if (atividadesArr.length > 0) {
        const { error } = await supabase.from('paver_diario_atividades').insert(atividadesArr.map(a => ({
          diario_id: diario.id, eap_item_id: a.eap_item_id, avanco_percentual: a.avanco_percentual, quantidade_dia: a.quantidade_dia,
        })));
        if (error) throw error;
        for (const a of atividadesArr) {
          const { error: updErr } = await supabase.from('paver_eap_items').update({ avanco_realizado: a.avanco_percentual }).eq('id', a.eap_item_id);
          if (updErr) console.error('Failed to update EAP item:', updErr);
        }
      }
      return diario;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['diarios'] });
      queryClient.invalidateQueries({ queryKey: ['diario-atividades'] });
      queryClient.invalidateQueries({ queryKey: ['eap'] });
      toast({ title: 'Diário registrado com sucesso!' });
      navigate('/diario-obra');
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const handleNext = () => setStep(2);
  const handleBack = () => setStep(1);
  const handleSubmit = () => saveMutation.mutate();

  // Render a single EAP item row with hierarchy breadcrumb
  const renderItemRow = (item: EapItem, hideClassification = false) => {
    const selected = atividades.get(item.id);
    const currentPercent = item.avanco_realizado || 0;
    const totalQtd = item.quantidade || 0;
    const currentQtdRealized = totalQtd * (currentPercent / 100);
    const hierarchy = getHierarchyPath(item);

    return (
      <div
        key={item.id}
        className={`px-3 py-2 transition-colors rounded-md ${selected ? 'bg-accent/5' : 'hover:bg-muted/20'}`}
      >
        <div className="flex items-center gap-3">
          <Checkbox checked={!!selected} onCheckedChange={() => toggleItem(item)} />
          <div className="flex-1 min-w-0">
            {hierarchy.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap mb-0.5">
                {hierarchy.map((parent, idx) => (
                  <span key={parent.id} className="text-[10px] text-muted-foreground/70 font-body flex items-center gap-0.5">
                    {parent.codigo && <span className="font-mono text-accent/60">{parent.codigo}</span>}
                    <span className="truncate max-w-[150px]">{parent.descricao}</span>
                    {idx < hierarchy.length - 1 && <ChevronRight className="h-2.5 w-2.5 text-muted-foreground/40 shrink-0" />}
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              {item.codigo && <span className="text-xs text-muted-foreground font-mono shrink-0">{item.codigo}</span>}
              <span className="text-sm font-body text-foreground truncate">
                {item.descricao}
                {!hideClassification && item.classificacao_adicional && <CollapsibleClassification text={item.classificacao_adicional} />}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <span className="text-xs text-muted-foreground font-body block">Atual: {currentPercent.toFixed(1)}%</span>
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
                <Label className="text-xs font-body text-muted-foreground whitespace-nowrap">Qtd. do dia:</Label>
                <Input type="number" min={0} step="any" value={selected.quantidade_dia || ''} onChange={e => updateQuantidadeDia(item, Number(e.target.value) || 0)} className="w-20 h-7 text-xs font-body text-center" />
                <span className="text-xs text-muted-foreground font-body">{item.unidade || 'un'}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Label className="text-xs font-body text-muted-foreground whitespace-nowrap">Novo %:</Label>
              <Input type="number" min={0} max={100} step="any" value={selected.avanco_percentual || ''} onChange={e => updatePercentual(item, Number(e.target.value) || 0)} className="w-20 h-7 text-xs font-body text-center" />
              <span className="text-xs text-muted-foreground font-body">%</span>
            </div>
            {selected.avanco_percentual > currentPercent && (
              <Badge variant="secondary" className="text-[10px] font-body">
                <Check className="h-3 w-3 mr-0.5" />+{(selected.avanco_percentual - currentPercent).toFixed(1)}%
              </Badge>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => step === 1 ? navigate('/diario-obra') : handleBack()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-heading font-bold text-foreground">Novo Diário de Obra</h1>
          <p className="text-sm text-muted-foreground font-body">
            {step === 1 ? 'Etapa 1 — Registre as atividades executadas no dia' : 'Etapa 2 — Registro fotográfico do dia'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`h-2.5 w-2.5 rounded-full ${step === 1 ? 'bg-accent' : 'bg-muted-foreground/30'}`} />
          <div className={`h-2.5 w-2.5 rounded-full ${step === 2 ? 'bg-accent' : 'bg-muted-foreground/30'}`} />
        </div>
      </div>

      {step === 1 ? (
        <div className="space-y-6">
          {/* Obra + Data */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="font-body">Obra</Label>
              <Select value={selectedObraId} onValueChange={v => { setSelectedObraId(v); setAtividades(new Map()); }}>
                <SelectTrigger className="font-body"><SelectValue placeholder="Selecione a obra..." /></SelectTrigger>
                <SelectContent>
                  {obras.map(o => <SelectItem key={o.id} value={o.id} className="font-body">{o.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="font-body">Data</Label>
              <Input type="date" value={data} onChange={e => setData(e.target.value)} required className="font-body" />
            </div>
          </div>

          {/* Clima */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="font-body">Clima — Manhã</Label>
              <Select value={climaManha} onValueChange={setClimaManha}>
                <SelectTrigger className="font-body"><SelectValue /></SelectTrigger>
                <SelectContent>{climaOptions.map(c => <SelectItem key={c.value} value={c.value} className="font-body">{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="font-body">Clima — Tarde</Label>
              <Select value={climaTarde} onValueChange={setClimaTarde}>
                <SelectTrigger className="font-body"><SelectValue /></SelectTrigger>
                <SelectContent>{climaOptions.map(c => <SelectItem key={c.value} value={c.value} className="font-body">{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {/* Observações */}
          <div className="space-y-2">
            <Label className="font-body">Observações</Label>
            <Textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={2} className="font-body" placeholder="Observações gerais sobre o dia..." />
          </div>

          {/* Equipes */}
          <div className="space-y-2">
            <Label className="font-body">Equipes / Mão de Obra</Label>
            <Textarea value={maoDeObra} onChange={e => setMaoDeObra(e.target.value)} rows={3} placeholder="Ex: 2 pedreiros, 1 encanador, 3 serventes..." className="font-body" />
          </div>

          {/* EAP Tree */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="font-heading text-base">Atividades Executadas (EAP)</CardTitle>
                <div className="flex items-center gap-2">
                  {selectedCount > 0 && <Badge variant="secondary" className="font-body">{selectedCount} atividade(s) selecionada(s)</Badge>}
                  <Button type="button" variant="outline" size="sm" onClick={() => navigate('/diario-obra')} className="font-body">Cancelar</Button>
                  <Button type="button" size="sm" onClick={handleNext} disabled={!selectedObraId} className="bg-accent text-accent-foreground hover:bg-accent/90 font-body">
                    Próximo: Fotos <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground font-body">
                Selecione os itens executados. Informe a quantidade do dia — o percentual é calculado automaticamente.
              </p>
              <div className="flex items-center gap-3 mt-3 flex-wrap">
                <div className="flex items-center rounded-md border border-border overflow-hidden">
                  <button type="button" onClick={() => { setGroupMode('pacote'); setFilterText(''); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-body transition-colors ${groupMode === 'pacote' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}>
                    <Package className="h-3.5 w-3.5" />Pacote
                  </button>
                  <button type="button" onClick={() => { setGroupMode('servico'); setFilterText(''); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-body transition-colors ${groupMode === 'servico' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}>
                    <Layers className="h-3.5 w-3.5" />Serviço
                  </button>
                </div>
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input value={filterText} onChange={e => setFilterText(e.target.value)}
                    placeholder="Filtrar por código, descrição ou grupo..." className="pl-8 h-8 text-xs font-body" />
                  {filterText && (
                    <button type="button" onClick={() => setFilterText('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {!selectedObraId ? (
                <p className="text-sm text-muted-foreground font-body italic py-4 text-center">Selecione uma obra para ver os itens da EAP.</p>
              ) : eapItems.length === 0 ? (
                <p className="text-sm text-muted-foreground font-body italic py-4 text-center">Nenhum item de EAP cadastrado para esta obra.</p>
              ) : filteredGroups.length === 0 ? (
                <p className="text-sm text-muted-foreground font-body italic py-4 text-center">Nenhum resultado para "{filterText}".</p>
              ) : (
                filteredGroups.map(([groupKey, items]) => {
                  const isExpanded = expandedGroups.has(groupKey);
                  const selInGroup = items.filter(i => atividades.has(i.id)).length;
                  return (
                    <Collapsible key={groupKey} open={isExpanded} onOpenChange={() => toggleGroup(groupKey)}>
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          className="flex items-center gap-2 w-full px-3 py-2 rounded-md bg-muted/50 hover:bg-muted transition-colors text-left"
                        >
                          {isExpanded
                            ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                            : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                          }
                          {groupMode === 'pacote'
                            ? <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            : <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          }
                          <span className="flex-1 text-sm font-heading font-semibold truncate">{groupKey}</span>
                          <Badge variant="outline" className="text-[10px] font-body shrink-0">{items.length} itens</Badge>
                          {selInGroup > 0 && (
                            <Badge className="text-[10px] font-body bg-accent text-accent-foreground shrink-0">{selInGroup} sel.</Badge>
                          )}
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="border-l-2 border-border ml-4 space-y-0.5 mt-0.5">
                          {(() => {
                            // Sub-group items by classificacao_adicional
                            const subGroups = new Map<string, EapItem[]>();
                            for (const item of items) {
                              const subKey = item.classificacao_adicional || '';
                              if (!subGroups.has(subKey)) subGroups.set(subKey, []);
                              subGroups.get(subKey)!.push(item);
                            }
                            // If only one sub-group (or all empty), render flat
                            // Only render flat if there's a single group with no classificacao
                            if (subGroups.size === 1 && subGroups.has('')) {
                              return items.map(item => renderItemRow(item, false));
                            }
                            return [...subGroups.entries()]
                              .sort((a, b) => a[0].localeCompare(b[0]))
                              .map(([subKey, subItems]) => {
                                const subId = `${groupKey}::${subKey}`;
                                const isSubExpanded = expandedSubGroups.has(subId);
                                const selInSub = subItems.filter(i => atividades.has(i.id)).length;
                                if (!subKey) {
                                  return <div key="__none__" className="space-y-0.5">{subItems.map(item => renderItemRow(item, true))}</div>;
                                }
                                return (
                                  <Collapsible key={subId} open={isSubExpanded} onOpenChange={() => toggleSubGroup(subId)}>
                                    <CollapsibleTrigger asChild>
                                      <button type="button" className="flex items-center gap-2 w-full px-3 py-1.5 ml-2 rounded-md hover:bg-muted/30 transition-colors text-left">
                                        {isSubExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground/60 shrink-0" /> : <ChevronRight className="h-3 w-3 text-muted-foreground/60 shrink-0" />}
                                        <span className="text-[11px] font-body font-medium text-muted-foreground/80 italic flex-1 truncate">{subKey}</span>
                                        <Badge variant="outline" className="text-[9px] font-body shrink-0">{subItems.length}</Badge>
                                        {selInSub > 0 && <Badge className="text-[9px] font-body bg-accent text-accent-foreground shrink-0">{selInSub}</Badge>}
                                      </button>
                                    </CollapsibleTrigger>
                                    <CollapsibleContent>
                                      <div className="border-l border-border/50 ml-5 space-y-0.5">
                                        {subItems.map(item => renderItemRow(item, true))}
                                      </div>
                                    </CollapsibleContent>
                                  </Collapsible>
                                );
                              });
                          })()}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        /* ═══ STEP 2: Photos ═══ */
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="font-heading text-base flex items-center gap-2">
                  <Camera className="h-5 w-5 text-accent" />Registro Fotográfico
                </CardTitle>
                <Badge variant="secondary" className="font-body">{fotos.length} foto(s)</Badge>
              </div>
              <p className="text-xs text-muted-foreground font-body">Adicione fotos do dia. Você pode adicionar uma descrição para cada foto.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-lg p-8 flex flex-col items-center justify-center cursor-pointer hover:border-accent/50 hover:bg-muted/30 transition-colors">
                <Upload className="h-8 w-8 text-muted-foreground/50 mb-2" />
                <p className="text-sm font-body text-muted-foreground">Clique para adicionar fotos</p>
                <p className="text-xs font-body text-muted-foreground/60 mt-1">JPG, PNG ou WEBP</p>
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => handleAddFotos(e.target.files)} />
              </div>
              {fotos.length > 0 && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {fotos.map((foto, index) => (
                    <div key={index} className="border rounded-lg overflow-hidden group">
                      <div className="aspect-video bg-muted relative">
                        <img src={foto.preview} alt={`Foto ${index + 1}`} className="w-full h-full object-cover" />
                        <button type="button" onClick={() => removeFoto(index)}
                          className="absolute top-2 right-2 h-7 w-7 bg-destructive/90 text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="p-2">
                        <Input value={foto.descricao} onChange={e => updateFotoDescricao(index, e.target.value)} placeholder="Descrição da foto (opcional)" className="text-xs font-body h-7" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Summary */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-heading text-sm text-muted-foreground">Resumo das atividades</CardTitle>
            </CardHeader>
            <CardContent>
              {atividades.size === 0 ? (
                <p className="text-xs text-muted-foreground font-body italic">Nenhuma atividade selecionada.</p>
              ) : (
                <div className="space-y-2">
                  {Array.from(atividades.values()).map(a => {
                    const item = eapItensOnly.find(i => i.id === a.eap_item_id);
                    return (
                      <div key={a.eap_item_id} className="border border-border/50 rounded-md p-2 space-y-1">
                        <div className="flex items-center justify-between text-xs font-body">
                          <span className="truncate text-foreground">
                            {item?.codigo && <span className="font-mono text-muted-foreground mr-1">{item.codigo}</span>}
                            {item?.descricao || 'Item'}
                            {item?.classificacao_adicional && <CollapsibleClassification text={item.classificacao_adicional} />}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            {a.quantidade_dia > 0 && <span className="text-muted-foreground">+{a.quantidade_dia} {item?.unidade || 'un'}</span>}
                            <Badge variant="secondary" className="text-[10px]">{a.avanco_percentual.toFixed(1)}%</Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          {item?.pacote && (
                            <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-body">
                              <Package className="h-3 w-3" />
                              <span className="font-medium">Pacote:</span> {item.pacote}
                            </span>
                          )}
                          {item?.lote && (
                            <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-body">
                              <Layers className="h-3 w-3" />
                              <span className="font-medium">Serviço:</span> {item.lote}
                            </span>
                          )}
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
              <ArrowLeft className="h-4 w-4 mr-2" />Voltar
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={!selectedObraId || saveMutation.isPending} className="bg-accent text-accent-foreground hover:bg-accent/90 font-body">
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              Registrar Diário
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
