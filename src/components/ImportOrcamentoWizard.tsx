import { useState, useMemo, useCallback } from 'react';
import {
  Upload,
  Loader2,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  ArrowRight,
  FileSpreadsheet,
  Eye,
  EyeOff,
  Tag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  parseCsvOrcamento,
  readFileAsText,
  ParsedOrcamento,
  OrcamentoGroup,
  OrcamentoItem,
  GrupoTipo,
} from '@/lib/csvOrcamentoParser';
import { EapItem } from '@/services/api';
import ConfirmOrcamentoStep from '@/components/ConfirmOrcamentoStep';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (items: Omit<EapItem, 'id' | 'created_at' | 'obra_id'>[]) => void;
  importing: boolean;
}

type Step = 'upload' | 'review' | 'confirm';

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function ImportOrcamentoWizard({ open, onOpenChange, onImport, importing }: Props) {
  const [step, setStep] = useState<Step>('upload');
  const [parsed, setParsed] = useState<ParsedOrcamento | null>(null);
  const [groups, setGroups] = useState<OrcamentoGroup[]>([]);
  const [items, setItems] = useState<OrcamentoItem[]>([]);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [parseError, setParseError] = useState<string | null>(null);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    try {
      setParseError(null);
      const text = await readFileAsText(file);
      const result = parseCsvOrcamento(text);
      setParsed(result);
      setGroups(result.groups);
      setItems(result.items);
      setCollapsedGroups(new Set());
      setStep('review');
    } catch (err: any) {
      setParseError(err.message || 'Erro ao ler arquivo');
    }
  }, []);

  const toggleGroup = (codigo: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(codigo)) next.delete(codigo);
      else next.add(codigo);
      return next;
    });
  };

  const toggleItemAtivo = (codigo: string) => {
    setItems(prev =>
      prev.map(i => (i.codigo === codigo ? { ...i, ativo: !i.ativo } : i))
    );
  };

  const toggleAllInGroup = (groupCodigo: string, nivel: number, ativo: boolean) => {
    setItems(prev =>
      prev.map(i => {
        const key = nivel === 1 ? i.grupo1Codigo : nivel === 2 ? i.grupo2Codigo : i.grupo3Codigo;
        return key === groupCodigo ? { ...i, ativo } : i;
      })
    );
  };

  const changeGroupType = (codigo: string, tipo: GrupoTipo) => {
    setGroups(prev =>
      prev.map(g => (g.codigo === codigo ? { ...g, grupoTipo: tipo } : g))
    );
  };

  const activeItems = useMemo(() => items.filter(i => i.ativo), [items]);
  const inactiveCount = useMemo(() => items.filter(i => !i.ativo).length, [items]);

  const groupMap = useMemo(() => {
    const map = new Map<string, OrcamentoGroup>();
    groups.forEach(g => map.set(g.codigo, g));
    return map;
  }, [groups]);

  // Build a tree view for the review step
  const level1Groups = useMemo(() => groups.filter(g => g.nivel === 1), [groups]);

  const getChildGroups = useCallback(
    (parentCodigo: string, targetNivel: number) =>
      groups.filter(g => g.nivel === targetNivel && g.codigo.startsWith(parentCodigo + '.')),
    [groups]
  );

  const getItemsForGroup = useCallback(
    (groupCodigo: string, nivel: number) =>
      items.filter(i => {
        if (nivel === 1) return i.grupo1Codigo === groupCodigo;
        if (nivel === 2) return i.grupo2Codigo === groupCodigo;
        return i.grupo3Codigo === groupCodigo;
      }),
    [items]
  );

  const handleConfirmImport = () => {
    const eapItems: Omit<EapItem, 'id' | 'created_at' | 'obra_id'>[] = [];
    let ordem = 0;

    // Add groups as agrupadores
    for (const group of groups) {
      // Find what pacote this group belongs to based on classification
      let pacote: string | undefined;
      if (group.nivel === 3) {
        const parent2 = groupMap.get(group.codigo.split('.').slice(0, 2).join('.'));
        pacote = parent2?.descricao;
      }

      eapItems.push({
        codigo: group.codigo,
        descricao: group.descricao,
        tipo: 'agrupador',
        pacote,
        lote: group.grupoTipo === 'pacote_trabalho' ? group.descricao : undefined,
        ordem: ordem++,
      });
    }

    // Add active items
    for (const item of activeItems) {
      const g3 = groupMap.get(item.grupo3Codigo);
      const g2 = groupMap.get(item.grupo2Codigo);

      // Determine pacote based on group classifications
      let pacote: string | undefined;
      let lote: string | undefined;
      if (g3?.grupoTipo === 'pacote_trabalho') {
        pacote = g3.descricao;
      } else if (g2?.grupoTipo === 'pacote_trabalho') {
        pacote = g2.descricao;
      }
      // Lote = the other grouping
      if (g3?.grupoTipo === 'tipo_servico') {
        lote = g3.descricao;
      } else if (g3) {
        lote = g3.descricao;
      }

      eapItems.push({
        codigo: item.codigo,
        descricao: item.descricao,
        tipo: 'item',
        unidade: item.unidade || undefined,
        quantidade: item.quantidade,
        pacote,
        lote,
        ordem: ordem++,
      });
    }

    onImport(eapItems);
  };

  const resetWizard = () => {
    setStep('upload');
    setParsed(null);
    setGroups([]);
    setItems([]);
    setCollapsedGroups(new Set());
    setParseError(null);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) resetWizard();
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            {step === 'upload' && 'Importar Orçamento (CSV)'}
            {step === 'review' && 'Revisar e Classificar'}
            {step === 'confirm' && 'Confirmar Importação'}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center gap-2 text-xs font-body">
          <span className={`px-2 py-1 rounded ${step === 'upload' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
            1. Upload
          </span>
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
          <span className={`px-2 py-1 rounded ${step === 'review' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
            2. Revisar
          </span>
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
          <span className={`px-2 py-1 rounded ${step === 'confirm' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
            3. Confirmar
          </span>
        </div>

        <div className="flex-1 overflow-hidden">
          {/* STEP 1: Upload */}
          {step === 'upload' && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <FileSpreadsheet className="h-16 w-16 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground font-body text-center max-w-md">
                Selecione o arquivo CSV do orçamento. O sistema detectará automaticamente a hierarquia
                baseada nos códigos (ex.: 3.001.001.001).
              </p>
              {parseError && (
                <div className="text-sm text-destructive bg-destructive/10 px-4 py-2 rounded-md">
                  {parseError}
                </div>
              )}
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <div className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-body text-sm">
                  <Upload className="h-4 w-4" />
                  Selecionar Arquivo CSV
                </div>
              </label>
            </div>
          )}

          {/* STEP 2: Review */}
          {step === 'review' && parsed && (
            <div className="space-y-3">
              <div className="flex items-center gap-4 text-xs font-body text-muted-foreground">
                <span>{groups.length} grupo(s)</span>
                <span>{items.length} item(ns) total</span>
                <span className="text-primary">{activeItems.length} ativo(s)</span>
                {inactiveCount > 0 && (
                  <span className="text-muted-foreground">{inactiveCount} desativado(s)</span>
                )}
              </div>

              <div className="text-xs font-body text-muted-foreground bg-muted/50 rounded-md px-3 py-2 flex items-center gap-2">
                <Tag className="h-3.5 w-3.5" />
                Classifique os agrupamentos como <Badge variant="outline" className="text-[10px]">Tipo de Serviço</Badge> ou <Badge variant="secondary" className="text-[10px]">Pacote de Trabalho</Badge>.
                Desative itens que não devem aparecer no sistema.
              </div>

              <ScrollArea className="h-[45vh]">
                <div className="space-y-0.5 pr-4">
                  {level1Groups.map((l1) => {
                    const l1Items = getItemsForGroup(l1.codigo, 1);
                    const l1ActiveCount = l1Items.filter(i => i.ativo).length;

                    return (
                      <div key={l1.codigo}>
                        {/* Level 1 */}
                        <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/60 hover:bg-muted transition-colors">
                          <button onClick={() => toggleGroup(l1.codigo)} className="shrink-0">
                            {collapsedGroups.has(l1.codigo) ? (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            )}
                          </button>
                          <span className="text-[10px] text-muted-foreground font-mono">{l1.codigo}</span>
                          <span className="text-sm font-medium font-heading flex-1">{l1.descricao}</span>

                          <Select
                            value={l1.grupoTipo}
                            onValueChange={(v) => changeGroupType(l1.codigo, v as GrupoTipo)}
                          >
                            <SelectTrigger className="h-6 w-[140px] text-[10px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="tipo_servico" className="text-xs">Tipo de Serviço</SelectItem>
                              <SelectItem value="pacote_trabalho" className="text-xs">Pacote de Trabalho</SelectItem>
                              <SelectItem value="nenhum" className="text-xs">Não Classificar</SelectItem>
                            </SelectContent>
                          </Select>

                          <button
                            onClick={() => toggleAllInGroup(l1.codigo, 1, l1ActiveCount < l1Items.length)}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            title={l1ActiveCount === l1Items.length ? 'Desativar todos' : 'Ativar todos'}
                          >
                            {l1ActiveCount === l1Items.length ? (
                              <Eye className="h-3.5 w-3.5" />
                            ) : (
                              <EyeOff className="h-3.5 w-3.5" />
                            )}
                          </button>

                          <span className="text-[10px] text-muted-foreground">{l1ActiveCount}/{l1Items.length}</span>
                          <span className="text-[10px] text-muted-foreground">{formatBRL(l1.precoTotal)}</span>
                        </div>

                        {!collapsedGroups.has(l1.codigo) && (
                          <div className="ml-4 border-l-2 border-border">
                            {getChildGroups(l1.codigo, 2).map((l2) => {
                              const l2Items = getItemsForGroup(l2.codigo, 2);
                              const l2ActiveCount = l2Items.filter(i => i.ativo).length;

                              return (
                                <div key={l2.codigo}>
                                  {/* Level 2 */}
                                  <div className="flex items-center gap-2 px-2 py-1.5 pl-4 hover:bg-muted/30 rounded-md transition-colors">
                                    <button onClick={() => toggleGroup(l2.codigo)} className="shrink-0">
                                      {collapsedGroups.has(l2.codigo) ? (
                                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                      ) : (
                                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                      )}
                                    </button>
                                    <span className="text-[10px] text-muted-foreground font-mono">{l2.codigo}</span>
                                    <span className="text-sm font-body flex-1">{l2.descricao}</span>

                                    <Select
                                      value={l2.grupoTipo}
                                      onValueChange={(v) => changeGroupType(l2.codigo, v as GrupoTipo)}
                                    >
                                      <SelectTrigger className="h-6 w-[140px] text-[10px]">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="tipo_servico" className="text-xs">Tipo de Serviço</SelectItem>
                                        <SelectItem value="pacote_trabalho" className="text-xs">Pacote de Trabalho</SelectItem>
                                        <SelectItem value="nenhum" className="text-xs">Não Classificar</SelectItem>
                                      </SelectContent>
                                    </Select>

                                    <button
                                      onClick={() => toggleAllInGroup(l2.codigo, 2, l2ActiveCount < l2Items.length)}
                                      className="text-muted-foreground hover:text-foreground transition-colors"
                                      title={l2ActiveCount === l2Items.length ? 'Desativar todos' : 'Ativar todos'}
                                    >
                                      {l2ActiveCount === l2Items.length ? (
                                        <Eye className="h-3.5 w-3.5" />
                                      ) : (
                                        <EyeOff className="h-3.5 w-3.5" />
                                      )}
                                    </button>

                                    <span className="text-[10px] text-muted-foreground w-8 text-right">{l2ActiveCount}/{l2Items.length}</span>
                                  </div>

                                  {!collapsedGroups.has(l2.codigo) && (
                                    <div className="ml-6 border-l border-border/50">
                                      {getChildGroups(l2.codigo, 3).map((l3) => {
                                        const l3Items = getItemsForGroup(l3.codigo, 3);
                                        const l3ActiveCount = l3Items.filter(i => i.ativo).length;

                                        return (
                                          <div key={l3.codigo}>
                                            {/* Level 3 */}
                                            <div className="flex items-center gap-2 px-2 py-1 pl-4 hover:bg-muted/20 rounded-md transition-colors">
                                              <button onClick={() => toggleGroup(l3.codigo)} className="shrink-0">
                                                {collapsedGroups.has(l3.codigo) ? (
                                                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                                ) : (
                                                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                                )}
                                              </button>
                                              <span className="text-[10px] text-muted-foreground font-mono">{l3.codigo}</span>
                                              <span className="text-xs font-body flex-1">{l3.descricao}</span>

                                              <Select
                                                value={l3.grupoTipo}
                                                onValueChange={(v) => changeGroupType(l3.codigo, v as GrupoTipo)}
                                              >
                                                <SelectTrigger className="h-5 w-[140px] text-[10px]">
                                                  <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                  <SelectItem value="tipo_servico" className="text-xs">Tipo de Serviço</SelectItem>
                                                  <SelectItem value="pacote_trabalho" className="text-xs">Pacote de Trabalho</SelectItem>
                                                  <SelectItem value="nenhum" className="text-xs">Não Classificar</SelectItem>
                                                </SelectContent>
                                              </Select>

                                              <button
                                                onClick={() => toggleAllInGroup(l3.codigo, 3, l3ActiveCount < l3Items.length)}
                                                className="text-muted-foreground hover:text-foreground transition-colors"
                                              >
                                                {l3ActiveCount === l3Items.length ? (
                                                  <Eye className="h-3 w-3" />
                                                ) : (
                                                  <EyeOff className="h-3 w-3" />
                                                )}
                                              </button>

                                              <span className="text-[10px] text-muted-foreground w-8 text-right">{l3ActiveCount}/{l3Items.length}</span>
                                            </div>

                                            {/* Items under level 3 */}
                                            {!collapsedGroups.has(l3.codigo) && l3Items.length > 0 && (
                                              <div className="ml-6 space-y-0">
                                                {l3Items.map((item) => (
                                                  <div
                                                    key={item.codigo}
                                                    className={`flex items-center gap-2 px-2 py-1 pl-4 text-xs font-body rounded-md transition-colors ${
                                                      item.ativo
                                                        ? 'hover:bg-muted/10'
                                                        : 'opacity-40'
                                                    }`}
                                                  >
                                                    <Checkbox
                                                      checked={item.ativo}
                                                      onCheckedChange={() => toggleItemAtivo(item.codigo)}
                                                      className="h-3.5 w-3.5"
                                                    />
                                                    <span className="text-[10px] text-muted-foreground font-mono">{item.codigo}</span>
                                                    <span className="flex-1 truncate">{item.descricao}</span>
                                                    <Badge variant="outline" className="text-[9px] shrink-0">{item.unidade}</Badge>
                                                    <span className="text-[10px] text-muted-foreground w-12 text-right">{item.quantidade.toLocaleString('pt-BR')}</span>
                                                    <span className="text-[10px] text-muted-foreground w-20 text-right">{formatBRL(item.precoTotal)}</span>
                                                  </div>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}

                                      {/* Items directly under level 2 (no level 3 parent) */}
                                      {l2Items
                                        .filter(i => !i.grupo3Codigo || !groups.some(g => g.codigo === i.grupo3Codigo))
                                        .map((item) => (
                                          <div
                                            key={item.codigo}
                                            className={`flex items-center gap-2 px-2 py-1 pl-4 text-xs font-body rounded-md transition-colors ${
                                              item.ativo ? 'hover:bg-muted/10' : 'opacity-40'
                                            }`}
                                          >
                                            <Checkbox
                                              checked={item.ativo}
                                              onCheckedChange={() => toggleItemAtivo(item.codigo)}
                                              className="h-3.5 w-3.5"
                                            />
                                            <span className="text-[10px] text-muted-foreground font-mono">{item.codigo}</span>
                                            <span className="flex-1 truncate">{item.descricao}</span>
                                            <Badge variant="outline" className="text-[9px] shrink-0">{item.unidade}</Badge>
                                            <span className="text-[10px] text-muted-foreground w-12 text-right">{item.quantidade.toLocaleString('pt-BR')}</span>
                                            <span className="text-[10px] text-muted-foreground w-20 text-right">{formatBRL(item.precoTotal)}</span>
                                          </div>
                                        ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* STEP 3: Confirm */}
          {step === 'confirm' && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      <span className="text-sm font-body text-muted-foreground">Itens ativos</span>
                    </div>
                    <p className="text-2xl font-bold font-heading">{activeItems.length}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-1">
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-body text-muted-foreground">Itens desativados</span>
                    </div>
                    <p className="text-2xl font-bold font-heading">{inactiveCount}</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardContent className="pt-4">
                  <p className="text-sm font-body text-muted-foreground mb-1">Valor total dos itens ativos</p>
                  <p className="text-xl font-bold font-heading text-primary">
                    {formatBRL(activeItems.reduce((sum, i) => sum + i.precoTotal, 0))}
                  </p>
                </CardContent>
              </Card>

              <div className="text-xs font-body text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                Os itens ativos serão importados para a EAP desta obra. Dados anteriores da EAP serão substituídos.
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between gap-2">
          <div>
            {step !== 'upload' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep(step === 'confirm' ? 'review' : 'upload')}
                disabled={importing}
                className="font-body"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Voltar
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {step === 'review' && (
              <Button
                size="sm"
                onClick={() => setStep('confirm')}
                className="font-body"
              >
                Próximo
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            )}
            {step === 'confirm' && (
              <Button
                size="sm"
                onClick={handleConfirmImport}
                disabled={importing || activeItems.length === 0}
                className="font-body"
              >
                {importing ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                Importar {activeItems.length} item(ns)
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
