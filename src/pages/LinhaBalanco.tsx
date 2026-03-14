import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Building2, Loader2, FolderTree, Layers } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { fetchObras, fetchAllEapItems, fetchEapItems, EapItem } from '@/services/api';
import LinhaBalancoChart from '@/components/LinhaBalanco';

type GroupMode = 'pacote' | 'servico';

export default function LinhaBalancoPage() {
  const [selectedObra, setSelectedObra] = useState<string>('all');
  const [mode, setMode] = useState<GroupMode>('pacote');
  const [selectedPacote, setSelectedPacote] = useState<string>('all');
  const [selectedServico, setSelectedServico] = useState<string>('all');

  const { data: obras = [] } = useQuery({
    queryKey: ['obras'],
    queryFn: fetchObras,
  });

  const { data: allEapItems = [], isLoading } = useQuery({
    queryKey: ['eap-items-balance', selectedObra],
    queryFn: () => selectedObra !== 'all' ? fetchEapItems(selectedObra) : fetchAllEapItems(),
  });

  const uniquePacotes = useMemo(() => {
    const set = new Set<string>();
    allEapItems.forEach(i => { if (i.pacote) set.add(i.pacote); });
    return Array.from(set).sort();
  }, [allEapItems]);

  const uniqueServicos = useMemo(() => {
    const set = new Set<string>();
    allEapItems.forEach(i => { if (i.lote) set.add(i.lote); });
    return Array.from(set).sort();
  }, [allEapItems]);

  const filteredItems = useMemo(() => {
    let items = allEapItems;
    if (selectedPacote !== 'all') items = items.filter(i => i.pacote === selectedPacote);
    if (selectedServico !== 'all') items = items.filter(i => i.lote === selectedServico);
    return items;
  }, [allEapItems, selectedPacote, selectedServico]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Linha de Balanço</h1>
        <p className="text-muted-foreground font-body">Acompanhamento de avanço por pacote de trabalho ou tipo de serviço</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs font-body text-muted-foreground">Obra</Label>
          <Select value={selectedObra} onValueChange={(v) => { setSelectedObra(v); setSelectedPacote('all'); setSelectedServico('all'); }}>
            <SelectTrigger className="w-52 font-body">
              <Building2 className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="font-body">Todas as obras</SelectItem>
              {obras.map(o => (
                <SelectItem key={o.id} value={o.id} className="font-body">{o.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs font-body text-muted-foreground">Agrupar por</Label>
          <div className="flex items-center rounded-md border border-border overflow-hidden">
            <button
              onClick={() => setMode('pacote')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-body transition-colors ${
                mode === 'pacote'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              <FolderTree className="h-3.5 w-3.5" />
              Pacote
            </button>
            <button
              onClick={() => setMode('servico')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-body transition-colors ${
                mode === 'servico'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              Serviço
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs font-body text-muted-foreground">Pacote</Label>
          <Select value={selectedPacote} onValueChange={setSelectedPacote}>
            <SelectTrigger className="w-48 font-body">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="font-body">Todos</SelectItem>
              {uniquePacotes.map(p => (
                <SelectItem key={p} value={p} className="font-body">{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs font-body text-muted-foreground">Tipo Serviço</Label>
          <Select value={selectedServico} onValueChange={setSelectedServico}>
            <SelectTrigger className="w-48 font-body">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="font-body">Todos</SelectItem>
              {uniqueServicos.map(s => (
                <SelectItem key={s} value={s} className="font-body">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      ) : (
        <LinhaBalancoChart eapItems={filteredItems} mode={mode} />
      )}
    </div>
  );
}
