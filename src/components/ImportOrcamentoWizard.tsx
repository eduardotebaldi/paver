import { useState, useMemo, useCallback, useRef } from 'react';
import {
  Upload,
  Loader2,
  ChevronRight,
  ChevronDown,
  ArrowLeft,
  ArrowRight,
  FileSpreadsheet,
  CheckCircle2,
  GripVertical,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  parseCsvOrcamento,
  readFileAsText,
  ParsedOrcamento,
  OrcamentoGroup,
  OrcamentoItem,
} from '@/lib/csvOrcamentoParser';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  obraId: string;
  onImportComplete: () => void;
}

type Step = 'upload' | 'sections' | 'classify' | 'review';

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Remove common prefixes like "MO - ", "MAT - " from description */
function removePrefixes(desc: string): string {
  return desc.replace(/^(MO|MAT|EQ|ADM|SER)\s*[-–]\s*/i, '').trim();
}

/** Autocomplete component for text fields */
function AutocompleteInput({
  value,
  onChange,
  suggestions,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const filtered = useMemo(
    () =>
      value.trim()
        ? suggestions.filter(s => s.toLowerCase().includes(value.toLowerCase()) && s !== value)
        : suggestions.filter(s => s !== value),
    [suggestions, value],
  );

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
        placeholder={placeholder}
        className="h-7 text-xs"
      />
      {showSuggestions && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg max-h-32 overflow-auto">
          {filtered.slice(0, 8).map(s => (
            <button
              key={s}
              onMouseDown={e => {
                e.preventDefault();
                onChange(s);
                setShowSuggestions(false);
              }}
              className="w-full text-left px-2 py-1 text-xs hover:bg-muted transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Collapsible description that shows the cleaned name + original full description */
function CollapsibleDescription({
  cleanedName,
  originalDesc,
}: {
  cleanedName: string;
  originalDesc: string;
}) {
  const [expanded, setExpanded] = useState(false);
  // Only show the collapsible part if the original differs from the cleaned name
  const hasExtra = originalDesc !== cleanedName && originalDesc.length > 0;

  return (
    <span className="text-xs">
      <span>{cleanedName}</span>
      {hasExtra && (
        <>
          {' '}
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            title={expanded ? 'Recolher' : 'Ver descrição completa'}
          >
            {expanded ? (
              <span className="italic text-muted-foreground/60">({originalDesc})</span>
            ) : (
              <span className="text-[10px]">(...)</span>
            )}
          </button>
        </>
      )}
    </span>
  );
}

export default function ImportOrcamentoWizard({ open, onOpenChange, obraId, onImportComplete }: Props) {
  const [step, setStep] = useState<Step>('upload');
  const [parsed, setParsed] = useState<ParsedOrcamento | null>(null);
  const [groups, setGroups] = useState<OrcamentoGroup[]>([]);
  const [items, setItems] = useState<OrcamentoItem[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [rawFile, setRawFile] = useState<File | null>(null);
  const [previewLines, setPreviewLines] = useState<string[][]>([]);
  const [headerLine, setHeaderLine] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Section toggles (level 1 codes)
  const [enabledSections, setEnabledSections] = useState<Set<string>>(new Set());

  // Expanded sections in step 2
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  // Level 3 classification: codigo -> { pacoteTrabalho, tipoServico }
  const [classifications, setClassifications] = useState<
    Map<string, { pacoteTrabalho: string; tipoServico: string }>
  >(new Map());

  const { user } = useAuth();
  const { toast } = useToast();

  const processFile = useCallback(async (file: File) => {
    try {
      setParseError(null);
      setRawFile(file);
      const text = await readFileAsText(file);

      // Preview: first 10 data lines
      const allLines = text.split('\n').map(l => l.trim()).filter(Boolean);
      const sep = allLines[0]?.includes(';') ? ';' : ',';
      setHeaderLine(allLines[0]?.split(sep).map(c => c.trim()) || []);
      setPreviewLines(
        allLines.slice(1, 11).map(l => l.split(sep).map(c => c.trim())),
      );

      const result = parseCsvOrcamento(text);
      setParsed(result);
      setGroups(result.groups);
      setItems(result.items);

      // Enable all level-1 sections by default
      const l1Codes = new Set(result.groups.filter(g => g.nivel === 1).map(g => g.codigo));
      setEnabledSections(l1Codes);

      // Pre-populate classifications for level 3 groups
      const classMap = new Map<string, { pacoteTrabalho: string; tipoServico: string }>();
      const groupMap = new Map<string, OrcamentoGroup>();
      result.groups.forEach(g => groupMap.set(g.codigo, g));

      for (const g of result.groups) {
        if (g.nivel === 3) {
          // Tipo de Serviço = level 1 parent description (remove leading number prefix)
          const l1Code = g.codigo.split('.')[0];
          const l1 = groupMap.get(l1Code);
          const tipoServico = l1 ? l1.descricao.replace(/^\d+\s*[-–]\s*/, '').trim() : '';

          // Pacote de Trabalho = own description with prefixes removed
          const pacoteTrabalho = removePrefixes(g.descricao);

          classMap.set(g.codigo, { pacoteTrabalho, tipoServico });
        }
      }
      setClassifications(classMap);

      setStep('upload'); // stays on upload to show preview
    } catch (err: any) {
      setParseError(err.message || 'Erro ao ler arquivo');
    }
  }, []);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = '';
      await processFile(file);
    },
    [processFile],
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file && file.name.endsWith('.csv')) {
        await processFile(file);
      }
    },
    [processFile],
  );

  // Group lookup map
  const groupMap = useMemo(() => {
    const m = new Map<string, OrcamentoGroup>();
    groups.forEach(g => m.set(g.codigo, g));
    return m;
  }, [groups]);

  // Level 1 groups
  const level1Groups = useMemo(() => groups.filter(g => g.nivel === 1), [groups]);

  // Level 3 groups, filtered by enabled sections
  const level3Groups = useMemo(
    () =>
      groups.filter(g => {
        if (g.nivel !== 3) return false;
        const l1Code = g.codigo.split('.')[0];
        return enabledSections.has(l1Code);
      }),
    [groups, enabledSections],
  );

  // Active items (belonging to enabled sections)
  const activeItems = useMemo(
    () => items.filter(i => enabledSections.has(i.grupo1Codigo)),
    [items, enabledSections],
  );

  // Total of enabled sections
  const enabledTotal = useMemo(
    () => activeItems.reduce((s, i) => s + i.precoTotal, 0),
    [activeItems],
  );

  // Child groups helper
  const getChildGroups = useCallback(
    (parentCodigo: string, targetNivel: number) =>
      groups.filter(g => g.nivel === targetNivel && g.codigo.startsWith(parentCodigo + '.')),
    [groups],
  );

  // Items for a group
  const getItemsForGroup = useCallback(
    (groupCodigo: string, nivel: number) =>
      items.filter(i => {
        if (nivel === 1) return i.grupo1Codigo === groupCodigo;
        if (nivel === 2) return i.grupo2Codigo === groupCodigo;
        return i.grupo3Codigo === groupCodigo;
      }),
    [items],
  );

  // Autocomplete suggestions
  const allPacotes = useMemo(() => {
    const set = new Set<string>();
    classifications.forEach(v => { if (v.pacoteTrabalho) set.add(v.pacoteTrabalho); });
    return Array.from(set).sort();
  }, [classifications]);

  const allTipos = useMemo(() => {
    const set = new Set<string>();
    classifications.forEach(v => { if (v.tipoServico) set.add(v.tipoServico); });
    return Array.from(set).sort();
  }, [classifications]);

  // Build review panels
  const reviewByPacote = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of activeItems) {
      const l3 = classifications.get(item.grupo3Codigo);
      const label = l3?.pacoteTrabalho || 'Sem classificação';
      map.set(label, (map.get(label) || 0) + item.precoTotal);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([label, total]) => ({ label, total }));
  }, [activeItems, classifications]);

  const reviewByTipo = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of activeItems) {
      const l3 = classifications.get(item.grupo3Codigo);
      const label = l3?.tipoServico || 'Sem classificação';
      map.set(label, (map.get(label) || 0) + item.precoTotal);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([label, total]) => ({ label, total }));
  }, [activeItems, classifications]);

  const updateClassification = (codigo: string, field: 'pacoteTrabalho' | 'tipoServico', value: string) => {
    setClassifications(prev => {
      const next = new Map(prev);
      const existing = next.get(codigo) || { pacoteTrabalho: '', tipoServico: '' };
      next.set(codigo, { ...existing, [field]: value });
      return next;
    });
  };

  const toggleSection = (codigo: string) => {
    setEnabledSections(prev => {
      const next = new Set(prev);
      if (next.has(codigo)) next.delete(codigo);
      else next.add(codigo);
      return next;
    });
  };

  const toggleExpanded = (codigo: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(codigo)) next.delete(codigo);
      else next.add(codigo);
      return next;
    });
  };

  // Import to Supabase
  const handleConfirmImport = async () => {
    if (!user || !rawFile) return;
    setImporting(true);

    try {
      // 1. Upload CSV to storage
      const filePath = `${obraId}/${Date.now()}_${rawFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from('paver-orcamentos')
        .upload(filePath, rawFile, { cacheControl: '3600', upsert: false });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('paver-orcamentos').getPublicUrl(filePath);
      const arquivoUrl = urlData.publicUrl;

      // 2. Create orcamento record
      const { data: orcamento, error: orcError } = await supabase
        .from('paver_orcamentos' as any)
        .insert({
          obra_id: obraId,
          arquivo_url: arquivoUrl,
          nome_arquivo: rawFile.name,
          valor_total: enabledTotal,
          total_itens: activeItems.length,
          created_by: user.id,
        })
        .select()
        .single();
      if (orcError) throw orcError;

      const orcamentoId = (orcamento as any).id;

      // 3. Insert items in batches
      const batchSize = 200;
      const itemsToInsert = activeItems.map((item, idx) => {
        const l3 = classifications.get(item.grupo3Codigo);
        return {
          orcamento_id: orcamentoId,
          obra_id: obraId,
          codigo: item.codigo,
          descricao: item.descricao,
          unidade: item.unidade || null,
          quantidade: item.quantidade,
          preco_unitario: item.precoUnitario,
          preco_total: item.precoTotal,
          pacote_trabalho: l3?.pacoteTrabalho || null,
          tipo_servico: l3?.tipoServico || null,
          nivel: 4,
          codigo_pai_n1: item.grupo1Codigo || null,
          codigo_pai_n2: item.grupo2Codigo || null,
          codigo_pai_n3: item.grupo3Codigo || null,
          ordem: idx,
        };
      });

      for (let i = 0; i < itemsToInsert.length; i += batchSize) {
        const batch = itemsToInsert.slice(i, i + batchSize);
        const { error: batchError } = await supabase
          .from('paver_orcamento_itens' as any)
          .insert(batch);
        if (batchError) throw batchError;
      }

      // 4. Also insert into EAP for backward compatibility
      await supabase.from('paver_eap_items').delete().eq('obra_id', obraId);

      let ordem = 0;
      const eapItems: any[] = [];

      for (const g of groups) {
        if (!enabledSections.has(g.codigo.split('.')[0])) continue;
        const l3class = classifications.get(g.codigo);
        eapItems.push({
          obra_id: obraId,
          codigo: g.codigo,
          descricao: g.descricao,
          tipo: 'agrupador',
          pacote: l3class?.pacoteTrabalho || undefined,
          lote: l3class?.tipoServico || undefined,
          ordem: ordem++,
        });
      }

      for (const item of activeItems) {
        const l3 = classifications.get(item.grupo3Codigo);
        eapItems.push({
          obra_id: obraId,
          codigo: item.codigo,
          descricao: item.descricao,
          tipo: 'item',
          unidade: item.unidade || undefined,
          quantidade: item.quantidade,
          pacote: l3?.pacoteTrabalho || undefined,
          lote: l3?.tipoServico || undefined,
          ordem: ordem++,
        });
      }

      if (eapItems.length > 0) {
        for (let i = 0; i < eapItems.length; i += batchSize) {
          const batch = eapItems.slice(i, i + batchSize);
          await supabase.from('paver_eap_items').insert(batch);
        }
      }

      setImportSuccess(true);
      onImportComplete();
    } catch (err: any) {
      toast({ title: 'Erro na importação', description: err.message, variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  const resetWizard = () => {
    setStep('upload');
    setParsed(null);
    setGroups([]);
    setItems([]);
    setParseError(null);
    setRawFile(null);
    setPreviewLines([]);
    setHeaderLine([]);
    setImportSuccess(false);
    setEnabledSections(new Set());
    setExpandedSections(new Set());
    setClassifications(new Map());
    setDragOver(false);
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) resetWizard();
    onOpenChange(v);
  };

  const stepsConfig: { key: Step; label: string; num: number }[] = [
    { key: 'upload', label: 'Upload', num: 1 },
    { key: 'sections', label: 'Seções', num: 2 },
    { key: 'classify', label: 'Classificação', num: 3 },
    { key: 'review', label: 'Revisão', num: 4 },
  ];
  const stepIdx = stepsConfig.findIndex(s => s.key === step);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Importar Orçamento
          </DialogTitle>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center gap-1 text-xs font-body">
          {stepsConfig.map((s, i) => (
            <div key={s.key} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
              <span
                className={`px-2 py-1 rounded ${
                  step === s.key
                    ? 'bg-primary text-primary-foreground'
                    : stepIdx > i
                      ? 'bg-primary/20 text-primary'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {s.num}. {s.label}
              </span>
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-hidden">
          {/* STEP 1: Upload */}
          {step === 'upload' && !parsed && (
            <div
              className={`flex flex-col items-center justify-center py-12 gap-4 border-2 border-dashed rounded-lg mx-4 transition-colors ${
                dragOver ? 'border-primary bg-primary/5' : 'border-border'
              }`}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <Upload className="h-12 w-12 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground font-body text-center max-w-md">
                Arraste o arquivo CSV aqui ou clique para selecionar.
                <br />
                <span className="text-xs">Separador: ponto-e-vírgula (;) · Encoding: Latin-1</span>
              </p>
              {parseError && (
                <div className="text-sm text-destructive bg-destructive/10 px-4 py-2 rounded-md">
                  {parseError}
                </div>
              )}
              <label className="cursor-pointer">
                <input
                  ref={fileInputRef}
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

          {/* Upload preview */}
          {step === 'upload' && parsed && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Badge variant="outline" className="font-body">
                  <FileSpreadsheet className="h-3 w-3 mr-1" />
                  {rawFile?.name}
                </Badge>
                <span className="text-xs text-muted-foreground font-body">
                  {items.length} itens · {groups.length} agrupadores
                </span>
                <span className="text-xs font-body font-medium text-primary">
                  Total: {formatBRL(items.reduce((s, i) => s + i.precoTotal, 0))}
                </span>
              </div>

              <ScrollArea className="h-[40vh]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {headerLine.map((h, i) => (
                        <TableHead key={i} className="text-xs whitespace-nowrap">{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewLines.map((row, ri) => (
                      <TableRow key={ri}>
                        {row.map((cell, ci) => (
                          <TableCell key={ci} className="text-xs py-1.5">{cell}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {previewLines.length >= 10 && (
                  <p className="text-xs text-muted-foreground text-center py-2 font-body">
                    Mostrando as primeiras 10 linhas...
                  </p>
                )}
              </ScrollArea>
            </div>
          )}

          {/* STEP 2: Sections — expandable */}
          {step === 'sections' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground font-body">
                Selecione as seções que deseja importar. Clique na seta para ver o conteúdo de cada seção.
              </p>

              <div className="flex items-center gap-3 px-3 py-2 bg-muted/50 rounded-md">
                <span className="text-sm font-body font-medium">Total a importar:</span>
                <span className="text-lg font-heading font-bold text-primary">
                  {formatBRL(enabledTotal)}
                </span>
                <span className="text-xs text-muted-foreground font-body ml-auto">
                  {activeItems.length} itens
                </span>
              </div>

              <ScrollArea className="h-[45vh]">
                <div className="space-y-1 pr-4">
                  {level1Groups.map(l1 => {
                    const sectionItems = getItemsForGroup(l1.codigo, 1);
                    const sectionTotal = sectionItems.reduce((s, i) => s + i.precoTotal, 0);
                    const enabled = enabledSections.has(l1.codigo);
                    const expanded = expandedSections.has(l1.codigo);
                    const l2Groups = getChildGroups(l1.codigo, 2);

                    return (
                      <div key={l1.codigo}>
                        <div
                          className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors ${
                            enabled ? 'bg-card border-border' : 'bg-muted/30 border-transparent opacity-60'
                          }`}
                        >
                          <button
                            onClick={() => toggleExpanded(l1.codigo)}
                            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {expanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                          <Switch
                            checked={enabled}
                            onCheckedChange={() => toggleSection(l1.codigo)}
                          />
                          <span className="text-xs text-muted-foreground font-mono w-8">{l1.codigo}</span>
                          <span className="flex-1 text-sm font-body font-medium">{l1.descricao}</span>
                          <span className="text-xs text-muted-foreground font-body">
                            {sectionItems.length} itens
                          </span>
                          <span className="text-sm font-body font-medium w-28 text-right">
                            {formatBRL(sectionTotal)}
                          </span>
                        </div>

                        {/* Expanded content: level 2 → level 3 → items */}
                        {expanded && (
                          <div className="ml-8 border-l-2 border-border mt-1 mb-2">
                            {l2Groups.map(l2 => {
                              const l2Expanded = expandedSections.has(l2.codigo);
                              const l3Groups = getChildGroups(l2.codigo, 3);
                              const l2Items = getItemsForGroup(l2.codigo, 2);
                              const l2Total = l2Items.reduce((s, i) => s + i.precoTotal, 0);

                              return (
                                <div key={l2.codigo}>
                                  <button
                                    onClick={() => toggleExpanded(l2.codigo)}
                                    className="w-full flex items-center gap-2 px-3 py-1.5 pl-4 text-sm font-body text-foreground/80 hover:bg-muted/30 rounded-md transition-colors"
                                  >
                                    {l3Groups.length > 0 ? (
                                      l2Expanded ? (
                                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                      ) : (
                                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                      )
                                    ) : (
                                      <span className="w-3.5 shrink-0" />
                                    )}
                                    <span className="text-[10px] text-muted-foreground font-mono">{l2.codigo}</span>
                                    <span className="flex-1 text-left">{l2.descricao}</span>
                                    <span className="text-[10px] text-muted-foreground">{l2Items.length} itens</span>
                                    <span className="text-xs text-muted-foreground w-24 text-right">{formatBRL(l2Total)}</span>
                                  </button>

                                  {l2Expanded && (
                                    <div className="ml-6 border-l border-border/50">
                                      {l3Groups.map(l3 => {
                                        const l3Expanded = expandedSections.has(l3.codigo);
                                        const l3Items = getItemsForGroup(l3.codigo, 3);
                                        const l3Total = l3Items.reduce((s, i) => s + i.precoTotal, 0);

                                        return (
                                          <div key={l3.codigo}>
                                            <button
                                              onClick={() => toggleExpanded(l3.codigo)}
                                              className="w-full flex items-center gap-2 px-2 py-1 pl-4 text-xs font-body hover:bg-muted/20 rounded-md transition-colors"
                                            >
                                              {l3Items.length > 0 ? (
                                                l3Expanded ? (
                                                  <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                                                ) : (
                                                  <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                                )
                                              ) : (
                                                <span className="w-3 shrink-0" />
                                              )}
                                              <span className="text-[10px] text-muted-foreground font-mono">{l3.codigo}</span>
                                              <span className="flex-1 text-left">{l3.descricao}</span>
                                              <span className="text-[10px] text-muted-foreground">{l3Items.length}</span>
                                              <span className="text-[10px] text-muted-foreground w-20 text-right">{formatBRL(l3Total)}</span>
                                            </button>

                                            {l3Expanded && l3Items.length > 0 && (
                                              <div className="ml-6 space-y-0">
                                                {l3Items.map(item => (
                                                  <div
                                                    key={item.codigo}
                                                    className="flex items-center gap-2 px-2 py-0.5 pl-4 text-[10px] font-body text-muted-foreground"
                                                  >
                                                    <span className="font-mono">{item.codigo}</span>
                                                    <span className="flex-1 truncate">{item.descricao}</span>
                                                    <Badge variant="outline" className="text-[8px] shrink-0">{item.unidade}</Badge>
                                                    <span className="w-10 text-right">{item.quantidade.toLocaleString('pt-BR')}</span>
                                                    <span className="w-16 text-right">{formatBRL(item.precoTotal)}</span>
                                                  </div>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}

                                      {/* Items directly under level 2 */}
                                      {l2Items
                                        .filter(i => !i.grupo3Codigo || !groups.some(g => g.codigo === i.grupo3Codigo))
                                        .map(item => (
                                          <div
                                            key={item.codigo}
                                            className="flex items-center gap-2 px-2 py-0.5 pl-4 text-[10px] font-body text-muted-foreground"
                                          >
                                            <span className="w-3 shrink-0" />
                                            <span className="font-mono">{item.codigo}</span>
                                            <span className="flex-1 truncate">{item.descricao}</span>
                                            <Badge variant="outline" className="text-[8px] shrink-0">{item.unidade}</Badge>
                                            <span className="w-10 text-right">{item.quantidade.toLocaleString('pt-BR')}</span>
                                            <span className="w-16 text-right">{formatBRL(item.precoTotal)}</span>
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

          {/* STEP 3: Classification with heuristic auto-suggestions, grouped by level 1 */}
          {step === 'classify' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground font-body">
                Classificação pré-preenchida por heurística. Edite livremente antes de avançar.
                <br />
                <span className="text-xs">
                  <strong>Tipo de Serviço</strong>: baseado na descrição do nível 1 pai ·{' '}
                  <strong>Pacote de Trabalho</strong>: baseado na descrição do nível 3 (sem prefixos MO/MAT/EQ)
                </span>
              </p>

              <ScrollArea className="h-[50vh]">
                <div className="space-y-2 pr-2">
                  {level1Groups
                    .filter(l1 => enabledSections.has(l1.codigo))
                    .map(l1 => {
                      const l3ForSection = level3Groups.filter(
                        g => g.codigo.startsWith(l1.codigo + '.'),
                      );
                      if (l3ForSection.length === 0) return null;
                      const sectionExpanded = expandedSections.has('classify_' + l1.codigo);
                      const sectionTotal = l3ForSection.reduce((sum, g) => {
                        const childItems = items.filter(
                          i => i.grupo3Codigo === g.codigo && enabledSections.has(i.grupo1Codigo),
                        );
                        return sum + childItems.reduce((s, i) => s + i.precoTotal, 0);
                      }, 0);

                      return (
                        <div key={l1.codigo} className="border border-border rounded-lg overflow-hidden">
                          <button
                            onClick={() => toggleExpanded('classify_' + l1.codigo)}
                            className="w-full flex items-center gap-2 px-4 py-2.5 bg-muted/50 hover:bg-muted transition-colors"
                          >
                            {sectionExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                            )}
                            <span className="text-xs text-muted-foreground font-mono">{l1.codigo}</span>
                            <span className="flex-1 text-left text-sm font-heading font-semibold">
                              {l1.descricao}
                            </span>
                            <Badge variant="secondary" className="text-[10px] font-body">
                              {l3ForSection.length} itens
                            </Badge>
                            <span className="text-xs font-body font-medium w-28 text-right">
                              {formatBRL(sectionTotal)}
                            </span>
                          </button>

                          {sectionExpanded && (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-xs w-24">Código</TableHead>
                                  <TableHead className="text-xs">Descrição</TableHead>
                                  <TableHead className="text-xs w-28 text-right">Valor Total</TableHead>
                                  <TableHead className="text-xs w-44">Pacote de Trabalho</TableHead>
                                  <TableHead className="text-xs w-44">Tipo de Serviço</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {l3ForSection.map(g => {
                                  const cls = classifications.get(g.codigo) || {
                                    pacoteTrabalho: '',
                                    tipoServico: '',
                                  };
                                  const childItems = items.filter(
                                    i => i.grupo3Codigo === g.codigo && enabledSections.has(i.grupo1Codigo),
                                  );
                                  const total = childItems.reduce((s, i) => s + i.precoTotal, 0);

                                  return (
                                    <TableRow key={g.codigo}>
                                      <TableCell className="text-xs font-mono py-1.5">{g.codigo}</TableCell>
                                      <TableCell className="text-xs py-1.5">{g.descricao}</TableCell>
                                      <TableCell className="text-xs text-right py-1.5">
                                        {formatBRL(total)}
                                      </TableCell>
                                      <TableCell className="py-1.5">
                                        <AutocompleteInput
                                          value={cls.pacoteTrabalho}
                                          onChange={v =>
                                            updateClassification(g.codigo, 'pacoteTrabalho', v)
                                          }
                                          suggestions={allPacotes}
                                          placeholder="Pacote..."
                                        />
                                      </TableCell>
                                      <TableCell className="py-1.5">
                                        <AutocompleteInput
                                          value={cls.tipoServico}
                                          onChange={v =>
                                            updateClassification(g.codigo, 'tipoServico', v)
                                          }
                                          suggestions={allTipos}
                                          placeholder="Tipo..."
                                        />
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          )}
                        </div>
                      );
                    })}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* STEP 4: Review */}
          {step === 'review' && !importSuccess && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 px-3 py-2 bg-muted/50 rounded-md">
                <span className="text-sm font-body font-medium">Total do orçamento:</span>
                <span className="text-lg font-heading font-bold text-primary">
                  {formatBRL(enabledTotal)}
                </span>
                <span className="text-xs text-muted-foreground font-body ml-auto">
                  {activeItems.length} itens
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm font-heading font-semibold mb-2 flex items-center gap-1.5">
                    <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                    Por Pacote de Trabalho
                  </h3>
                  <ScrollArea className="h-[40vh]">
                    <div className="space-y-1 pr-2">
                      {reviewByPacote.map(r => (
                        <div
                          key={r.label}
                          className="flex items-center gap-2 px-3 py-2 rounded-md bg-card border border-border"
                        >
                          <span className="flex-1 text-xs font-body truncate">{r.label}</span>
                          <span className="text-xs font-body font-medium shrink-0">
                            {formatBRL(r.total)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>

                <div>
                  <h3 className="text-sm font-heading font-semibold mb-2 flex items-center gap-1.5">
                    <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                    Por Tipo de Serviço
                  </h3>
                  <ScrollArea className="h-[40vh]">
                    <div className="space-y-1 pr-2">
                      {reviewByTipo.map(r => (
                        <div
                          key={r.label}
                          className="flex items-center gap-2 px-3 py-2 rounded-md bg-card border border-border"
                        >
                          <span className="flex-1 text-xs font-body truncate">{r.label}</span>
                          <span className="text-xs font-body font-medium shrink-0">
                            {formatBRL(r.total)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </div>
          )}

          {/* Import success */}
          {step === 'review' && importSuccess && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <CheckCircle2 className="h-16 w-16 text-primary" />
              <h3 className="text-lg font-heading font-bold">Orçamento importado com sucesso!</h3>
              <p className="text-sm text-muted-foreground font-body text-center max-w-md">
                {activeItems.length} itens foram importados totalizando{' '}
                <strong>{formatBRL(enabledTotal)}</strong>.
              </p>
              <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)} className="font-body">
                Fechar
              </Button>
            </div>
          )}
        </div>

        {!importSuccess && (
          <DialogFooter className="flex items-center justify-between gap-2">
            <div>
              {step !== 'upload' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const prevStep = stepsConfig[stepIdx - 1]?.key;
                    if (prevStep) setStep(prevStep);
                  }}
                  disabled={importing}
                  className="font-body"
                >
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Voltar
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              {step === 'upload' && parsed && (
                <Button size="sm" onClick={() => setStep('sections')} className="font-body">
                  Próximo
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              )}
              {step === 'sections' && (
                <Button
                  size="sm"
                  onClick={() => setStep('classify')}
                  disabled={enabledSections.size === 0}
                  className="font-body"
                >
                  Próximo
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              )}
              {step === 'classify' && (
                <Button size="sm" onClick={() => setStep('review')} className="font-body">
                  Próximo
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              )}
              {step === 'review' && (
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
                  Confirmar e Importar
                </Button>
              )}
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
