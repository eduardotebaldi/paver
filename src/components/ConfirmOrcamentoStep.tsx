import { useState, useMemo } from 'react';
import {
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  XCircle,
  Pencil,
  Merge,
  FolderTree,
  Layers,
  Check,
  X,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { OrcamentoGroup, OrcamentoItem, GrupoTipo } from '@/lib/csvOrcamentoParser';

type ConfirmGroupMode = 'pacote_trabalho' | 'tipo_servico';

interface Props {
  items: OrcamentoItem[];
  groups: OrcamentoGroup[];
  onItemsChange: (items: OrcamentoItem[]) => void;
}

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

interface GroupedConfirmView {
  key: string;
  label: string;
  items: OrcamentoItem[];
}

function buildConfirmGroupedView(
  activeItems: OrcamentoItem[],
  groups: OrcamentoGroup[],
  mode: ConfirmGroupMode,
): GroupedConfirmView[] {
  const groupMap = new Map<string, OrcamentoGroup>();
  groups.forEach(g => groupMap.set(g.codigo, g));

  const result = new Map<string, OrcamentoItem[]>();

  for (const item of activeItems) {
    let groupLabel = 'Sem classificação';

    // Walk up the hierarchy: grupo3 → grupo2 → grupo1
    const candidates = [item.grupo3Codigo, item.grupo2Codigo, item.grupo1Codigo].filter(Boolean);
    for (const code of candidates) {
      const g = groupMap.get(code);
      if (g && g.grupoTipo === mode) {
        groupLabel = g.descricao;
        break;
      }
    }

    if (!result.has(groupLabel)) result.set(groupLabel, []);
    result.get(groupLabel)!.push(item);
  }

  return Array.from(result.entries()).map(([label, items]) => ({
    key: label,
    label,
    items,
  }));
}

export default function ConfirmOrcamentoStep({ items, groups, onItemsChange }: Props) {
  const [groupMode, setGroupMode] = useState<ConfirmGroupMode>('pacote_trabalho');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [editingItem, setEditingItem] = useState<OrcamentoItem | null>(null);
  const [editForm, setEditForm] = useState({ descricao: '', quantidade: 0, precoUnitario: 0 });
  const [selectedForMerge, setSelectedForMerge] = useState<Set<string>>(new Set());
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeDescricao, setMergeDescricao] = useState('');

  const activeItems = useMemo(() => items.filter(i => i.ativo), [items]);
  const inactiveCount = useMemo(() => items.filter(i => !i.ativo).length, [items]);

  const groupedView = useMemo(
    () => buildConfirmGroupedView(activeItems, groups, groupMode),
    [activeItems, groups, groupMode],
  );

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Edit
  const startEdit = (item: OrcamentoItem) => {
    setEditingItem(item);
    setEditForm({
      descricao: item.descricao,
      quantidade: item.quantidade,
      precoUnitario: item.precoUnitario,
    });
  };

  const saveEdit = () => {
    if (!editingItem) return;
    const precoTotal = editForm.quantidade * editForm.precoUnitario;
    onItemsChange(
      items.map(i =>
        i.codigo === editingItem.codigo
          ? { ...i, descricao: editForm.descricao, quantidade: editForm.quantidade, precoUnitario: editForm.precoUnitario, precoTotal }
          : i,
      ),
    );
    setEditingItem(null);
  };

  // Merge
  const toggleMergeSelect = (codigo: string) => {
    setSelectedForMerge(prev => {
      const next = new Set(prev);
      if (next.has(codigo)) next.delete(codigo);
      else next.add(codigo);
      return next;
    });
  };

  const openMergeDialog = () => {
    const selected = activeItems.filter(i => selectedForMerge.has(i.codigo));
    if (selected.length < 2) return;
    setMergeDescricao(selected.map(i => i.descricao).join(' + '));
    setMergeDialogOpen(true);
  };

  const confirmMerge = () => {
    const selected = items.filter(i => selectedForMerge.has(i.codigo));
    if (selected.length < 2) return;

    const base = selected[0];
    const mergedItem: OrcamentoItem = {
      ...base,
      descricao: mergeDescricao,
      quantidade: selected.reduce((s, i) => s + i.quantidade, 0),
      precoTotal: selected.reduce((s, i) => s + i.precoTotal, 0),
      precoUnitario:
        selected.reduce((s, i) => s + i.precoTotal, 0) /
        (selected.reduce((s, i) => s + i.quantidade, 0) || 1),
    };

    const mergedCodigos = new Set(selected.map(i => i.codigo));
    const newItems = items.filter(i => !mergedCodigos.has(i.codigo));
    // Insert merged item at the position of the first selected
    const insertIdx = newItems.findIndex(i => i.codigo > base.codigo);
    if (insertIdx === -1) newItems.push(mergedItem);
    else newItems.splice(insertIdx, 0, mergedItem);

    onItemsChange(newItems);
    setSelectedForMerge(new Set());
    setMergeDialogOpen(false);
  };

  const hasPacoteGroups = groups.some(g => g.grupoTipo === 'pacote_trabalho');
  const hasServicoGroups = groups.some(g => g.grupoTipo === 'tipo_servico');

  return (
    <div className="space-y-3">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2 mb-0.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-body text-muted-foreground">Ativos</span>
            </div>
            <p className="text-lg font-bold font-heading">{activeItems.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2 mb-0.5">
              <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-body text-muted-foreground">Desativados</span>
            </div>
            <p className="text-lg font-bold font-heading">{inactiveCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3">
            <span className="text-xs font-body text-muted-foreground">Valor total</span>
            <p className="text-lg font-bold font-heading text-primary">
              {formatBRL(activeItems.reduce((s, i) => s + i.precoTotal, 0))}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar: group mode + merge */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center rounded-md border border-border overflow-hidden">
          <button
            onClick={() => { setGroupMode('pacote_trabalho'); setCollapsedGroups(new Set()); }}
            disabled={!hasPacoteGroups}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-body transition-colors ${
              groupMode === 'pacote_trabalho'
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-muted-foreground hover:bg-muted'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <FolderTree className="h-3.5 w-3.5" />
            Pacote
          </button>
          <button
            onClick={() => { setGroupMode('tipo_servico'); setCollapsedGroups(new Set()); }}
            disabled={!hasServicoGroups}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-body transition-colors ${
              groupMode === 'tipo_servico'
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-muted-foreground hover:bg-muted'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <Layers className="h-3.5 w-3.5" />
            Serviço
          </button>
        </div>

        {selectedForMerge.size >= 2 && (
          <Button variant="outline" size="sm" onClick={openMergeDialog} className="font-body text-xs">
            <Merge className="h-3.5 w-3.5 mr-1" />
            Mesclar {selectedForMerge.size} itens
          </Button>
        )}

        {selectedForMerge.size > 0 && selectedForMerge.size < 2 && (
          <span className="text-xs text-muted-foreground font-body">Selecione pelo menos 2 itens para mesclar</span>
        )}
      </div>

      {/* Grouped items list */}
      <ScrollArea className="h-[38vh]">
        <div className="space-y-1 pr-4">
          {groupedView.map(group => (
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
                <span className="ml-auto text-xs text-muted-foreground font-body">
                  {group.items.length} item(s) · {formatBRL(group.items.reduce((s, i) => s + i.precoTotal, 0))}
                </span>
              </button>

              {!collapsedGroups.has(group.key) && (
                <div className="ml-4 border-l-2 border-border space-y-0">
                  {group.items.map(item => (
                    <div
                      key={item.codigo}
                      className="flex items-center gap-2 px-3 py-1.5 pl-6 text-xs font-body hover:bg-muted/30 rounded-md transition-colors group"
                    >
                      <Checkbox
                        checked={selectedForMerge.has(item.codigo)}
                        onCheckedChange={() => toggleMergeSelect(item.codigo)}
                        className="h-3.5 w-3.5"
                      />
                      <span className="text-[10px] text-muted-foreground font-mono">{item.codigo}</span>
                      <span className="flex-1 truncate">{item.descricao}</span>
                      <Badge variant="outline" className="text-[9px] shrink-0">{item.unidade}</Badge>
                      <span className="text-[10px] text-muted-foreground w-12 text-right">
                        {item.quantidade.toLocaleString('pt-BR')}
                      </span>
                      <span className="text-[10px] text-muted-foreground w-20 text-right">
                        {formatBRL(item.precoTotal)}
                      </span>
                      <button
                        onClick={() => startEdit(item)}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-all"
                        title="Editar item"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="text-xs font-body text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
        Os itens ativos serão importados para a EAP desta obra. Dados anteriores da EAP serão substituídos.
        Use os checkboxes para selecionar itens e mesclá-los, ou clique no lápis para editar.
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editingItem} onOpenChange={(open) => { if (!open) setEditingItem(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-sm">Editar Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-body text-muted-foreground">Descrição</label>
              <Input
                value={editForm.descricao}
                onChange={e => setEditForm(f => ({ ...f, descricao: e.target.value }))}
                className="text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-body text-muted-foreground">Quantidade</label>
                <Input
                  type="number"
                  value={editForm.quantidade}
                  onChange={e => setEditForm(f => ({ ...f, quantidade: parseFloat(e.target.value) || 0 }))}
                  className="text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-body text-muted-foreground">Preço Unitário</label>
                <Input
                  type="number"
                  step="0.01"
                  value={editForm.precoUnitario}
                  onChange={e => setEditForm(f => ({ ...f, precoUnitario: parseFloat(e.target.value) || 0 }))}
                  className="text-sm"
                />
              </div>
            </div>
            <div className="text-xs text-muted-foreground font-body">
              Total: {formatBRL(editForm.quantidade * editForm.precoUnitario)}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setEditingItem(null)}>
              <X className="h-3.5 w-3.5 mr-1" /> Cancelar
            </Button>
            <Button size="sm" onClick={saveEdit}>
              <Check className="h-3.5 w-3.5 mr-1" /> Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge dialog */}
      <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-sm">Mesclar Itens</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground font-body">
              Os {selectedForMerge.size} itens selecionados serão combinados em um único item. As quantidades e valores serão somados.
            </div>
            <div>
              <label className="text-xs font-body text-muted-foreground">Descrição do item mesclado</label>
              <Input
                value={mergeDescricao}
                onChange={e => setMergeDescricao(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="text-xs text-muted-foreground font-body space-y-1">
              {activeItems
                .filter(i => selectedForMerge.has(i.codigo))
                .map(i => (
                  <div key={i.codigo} className="flex justify-between">
                    <span className="truncate flex-1">{i.descricao}</span>
                    <span className="shrink-0 ml-2">{formatBRL(i.precoTotal)}</span>
                  </div>
                ))}
              <div className="border-t border-border pt-1 font-medium flex justify-between">
                <span>Total</span>
                <span>
                  {formatBRL(
                    activeItems
                      .filter(i => selectedForMerge.has(i.codigo))
                      .reduce((s, i) => s + i.precoTotal, 0),
                  )}
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setMergeDialogOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={confirmMerge}>
              <Merge className="h-3.5 w-3.5 mr-1" /> Mesclar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
