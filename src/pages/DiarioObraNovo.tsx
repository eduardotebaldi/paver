import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Loader2, Sun, Cloud, CloudSun, CloudRain, Snowflake,
  ChevronDown, ChevronRight, Check, Package,
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
import { fetchObras, fetchEapItems, createDiario, EapItem } from '@/services/api';
import { supabase } from '@/integrations/supabase/client';

const climaOptions = [
  { value: 'ensolarado', label: 'Ensolarado', icon: Sun },
  { value: 'nublado', label: 'Nublado', icon: Cloud },
  { value: 'parcialmente_nublado', label: 'Parc. Nublado', icon: CloudSun },
  { value: 'chuvoso', label: 'Chuvoso', icon: CloudRain },
  { value: 'frio', label: 'Frio', icon: Snowflake },
];

interface AtividadeEntry {
  eap_item_id: string;
  /** Quantity executed TODAY (delta) */
  quantidade_dia: number;
  /** Resulting percentage after adding today's quantity */
  avanco_percentual: number;
}

export default function DiarioObraNovoPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const obraIdFromUrl = searchParams.get('obra') || '';
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [selectedObraId, setSelectedObraId] = useState(obraIdFromUrl);
  const [data, setData] = useState(new Date().toISOString().split('T')[0]);
  const [climaManha, setClimaManha] = useState('ensolarado');
  const [climaTarde, setClimaTarde] = useState('ensolarado');
  const [maoDeObra, setMaoDeObra] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [atividades, setAtividades] = useState<Map<string, AtividadeEntry>>(new Map());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

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

  // Group items by pacote
  const groupedItems = useMemo(() => {
    const groups = new Map<string, EapItem[]>();
    eapItensOnly.forEach(item => {
      const key = item.pacote || 'Sem pacote';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    });
    return groups;
  }, [eapItensOnly]);

  // Auto-expand all groups when obra changes
  useMemo(() => {
    setExpandedGroups(new Set(groupedItems.keys()));
  }, [groupedItems]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const isItemSelected = (id: string) => atividades.has(id);

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
    // Current realized quantity
    const currentQtdRealized = totalQtd * (currentRealized / 100);
    // New total after adding today's work
    const newQtdRealized = currentQtdRealized + qtdDia;
    const newPercent = totalQtd > 0
      ? Math.min(100, Math.round((newQtdRealized / totalQtd) * 10000) / 100)
      : currentRealized;

    setAtividades(prev => {
      const next = new Map(prev);
      next.set(item.id, {
        eap_item_id: item.id,
        quantidade_dia: qtdDia,
        avanco_percentual: newPercent,
      });
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
      next.set(item.id, {
        eap_item_id: item.id,
        quantidade_dia: qtdDia,
        avanco_percentual: Math.min(100, newPercent),
      });
      return next;
    });
  };

  const selectedCount = atividades.size;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const atividadesArr = Array.from(atividades.values()).filter(a => a.quantidade_dia > 0 || a.avanco_percentual > 0);

      const diario = await createDiario({
        obra_id: selectedObraId,
        data,
        clima: climaManha,
        clima_manha: climaManha,
        clima_tarde: climaTarde,
        mao_de_obra: maoDeObra,
        atividades: atividadesArr.length > 0
          ? atividadesArr.map(a => {
              const item = eapItensOnly.find(i => i.id === a.eap_item_id);
              return `${item?.descricao || 'Item'}: ${a.avanco_percentual}%`;
            }).join('; ')
          : 'Sem atividades registradas',
        observacoes: observacoes || undefined,
        created_by: user!.id,
      } as any);

      // Insert atividades
      if (atividadesArr.length > 0) {
        const { error } = await supabase
          .from('paver_diario_atividades')
          .insert(atividadesArr.map(a => ({
            diario_id: diario.id,
            eap_item_id: a.eap_item_id,
            avanco_percentual: a.avanco_percentual,
            quantidade_dia: a.quantidade_dia,
          })));
        if (error) throw error;

        // Update EAP items avanco_realizado
        for (const a of atividadesArr) {
          const { error: updErr } = await supabase
            .from('paver_eap_items')
            .update({ avanco_realizado: a.avanco_percentual })
            .eq('id', a.eap_item_id);
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate();
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/diario-obra')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Novo Diário de Obra</h1>
          <p className="text-sm text-muted-foreground font-body">Registre as atividades executadas no dia</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Row 1: Obra + Data */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label className="font-body">Obra</Label>
            <Select value={selectedObraId} onValueChange={v => { setSelectedObraId(v); setAtividades(new Map()); }}>
              <SelectTrigger className="font-body">
                <SelectValue placeholder="Selecione a obra..." />
              </SelectTrigger>
              <SelectContent>
                {obras.map(o => (
                  <SelectItem key={o.id} value={o.id} className="font-body">{o.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="font-body">Data</Label>
            <Input type="date" value={data} onChange={e => setData(e.target.value)} required className="font-body" />
          </div>
        </div>

        {/* Row 2: Clima */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="font-body">Clima — Manhã</Label>
            <Select value={climaManha} onValueChange={setClimaManha}>
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
            <Select value={climaTarde} onValueChange={setClimaTarde}>
              <SelectTrigger className="font-body"><SelectValue /></SelectTrigger>
              <SelectContent>
                {climaOptions.map(c => (
                  <SelectItem key={c.value} value={c.value} className="font-body">{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Row 3: Equipes */}
        <div className="space-y-2">
          <Label className="font-body">Equipes / Mão de Obra</Label>
          <p className="text-xs text-muted-foreground font-body">Descreva as equipes que trabalharam na obra</p>
          <Textarea
            value={maoDeObra}
            onChange={e => setMaoDeObra(e.target.value)}
            rows={3}
            placeholder="Ex: 2 pedreiros, 1 encanador, 3 serventes..."
            className="font-body"
          />
        </div>

        {/* Atividades Executadas */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="font-heading text-base">
                Atividades Executadas (EAP)
              </CardTitle>
              {selectedCount > 0 && (
                <Badge variant="secondary" className="font-body">
                  {selectedCount} atividade(s) selecionada(s)
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground font-body">
              Selecione os itens executados. Informe a quantidade do dia — o percentual é calculado automaticamente (e vice-versa).
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {!selectedObraId ? (
              <p className="text-sm text-muted-foreground font-body italic py-4 text-center">
                Selecione uma obra para ver os itens da EAP.
              </p>
            ) : eapItensOnly.length === 0 ? (
              <p className="text-sm text-muted-foreground font-body italic py-4 text-center">
                Nenhum item de EAP cadastrado para esta obra.
              </p>
            ) : (
              Array.from(groupedItems.entries()).map(([groupName, items]) => {
                const isExpanded = expandedGroups.has(groupName);
                const selectedInGroup = items.filter(i => atividades.has(i.id)).length;

                return (
                  <Collapsible key={groupName} open={isExpanded} onOpenChange={() => toggleGroup(groupName)}>
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="flex items-center gap-2 w-full px-3 py-2.5 rounded-md bg-muted/50 hover:bg-muted transition-colors text-left"
                      >
                        {isExpanded
                          ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                          : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        }
                        <Package className="h-4 w-4 text-accent shrink-0" />
                        <span className="flex-1 text-sm font-heading font-medium">{groupName}</span>
                        <Badge variant="outline" className="text-[10px] font-body">
                          {items.length} itens
                        </Badge>
                        {selectedInGroup > 0 && (
                          <Badge className="text-[10px] font-body bg-accent text-accent-foreground">
                            {selectedInGroup} selecionado(s)
                          </Badge>
                        )}
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="border rounded-md mt-1 divide-y">
                        {items.map(item => {
                          const selected = atividades.get(item.id);
                          const currentPercent = item.avanco_realizado || 0;
                          const totalQtd = item.quantidade || 0;
                          const currentQtdRealized = totalQtd * (currentPercent / 100);

                          return (
                            <div
                              key={item.id}
                              className={`px-3 py-2.5 transition-colors ${
                                selected ? 'bg-accent/5' : 'hover:bg-muted/30'
                              }`}
                            >
                              {/* Row 1: checkbox + description + current status */}
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
                                  {/* Current status badge */}
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

                              {/* Row 2: Input fields when selected */}
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
                        })}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })
            )}
          </CardContent>
        </Card>

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
            type="submit"
            disabled={!selectedObraId || saveMutation.isPending}
            className="bg-accent text-accent-foreground hover:bg-accent/90 font-body"
          >
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Registrar Diário
          </Button>
        </div>
      </form>
    </div>
  );
}
