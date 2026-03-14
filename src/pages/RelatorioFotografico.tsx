import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Camera, Loader2, Filter, FolderTree, Layers, CalendarDays, Building2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { fetchObras, fetchAllFotosLocalizadas, FotoLocalizada, Obra } from '@/services/api';
import { supabase } from '@/integrations/supabase/client';

export default function RelatorioFotografico() {
  const [selectedObra, setSelectedObra] = useState<string>('all');
  const [selectedPacote, setSelectedPacote] = useState<string>('all');
  const [selectedServico, setSelectedServico] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedFoto, setSelectedFoto] = useState<FotoLocalizada | null>(null);

  const { data: obras = [] } = useQuery({
    queryKey: ['obras'],
    queryFn: fetchObras,
  });

  const { data: allFotos = [], isLoading } = useQuery({
    queryKey: ['all-fotos-localizadas'],
    queryFn: fetchAllFotosLocalizadas,
  });

  const obraMap = Object.fromEntries(obras.map(o => [o.id, o]));

  // Apply filters
  const filteredFotos = useMemo(() => {
    let fotos = allFotos;
    if (selectedObra !== 'all') fotos = fotos.filter(f => f.obra_id === selectedObra);
    if (selectedPacote !== 'all') fotos = fotos.filter(f => f.pacote === selectedPacote);
    if (selectedServico !== 'all') fotos = fotos.filter(f => f.tipo_servico === selectedServico);
    if (dateFrom) fotos = fotos.filter(f => f.created_at >= dateFrom);
    if (dateTo) fotos = fotos.filter(f => f.created_at <= dateTo + 'T23:59:59');
    return fotos;
  }, [allFotos, selectedObra, selectedPacote, selectedServico, dateFrom, dateTo]);

  // Unique values for filters
  const uniquePacotes = useMemo(() => {
    const set = new Set<string>();
    allFotos.forEach(f => { if (f.pacote) set.add(f.pacote); });
    return Array.from(set).sort();
  }, [allFotos]);

  const uniqueServicos = useMemo(() => {
    const set = new Set<string>();
    allFotos.forEach(f => { if (f.tipo_servico) set.add(f.tipo_servico); });
    return Array.from(set).sort();
  }, [allFotos]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Relatório Fotográfico</h1>
        <p className="text-muted-foreground font-body">Fotos localizadas em plantas de todas as obras</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs font-body text-muted-foreground">Obra</Label>
          <Select value={selectedObra} onValueChange={setSelectedObra}>
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
          <Label className="text-xs font-body text-muted-foreground">Pacote</Label>
          <Select value={selectedPacote} onValueChange={setSelectedPacote}>
            <SelectTrigger className="w-48 font-body">
              <FolderTree className="h-4 w-4 mr-2" />
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
              <Layers className="h-4 w-4 mr-2" />
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

        <div className="space-y-1">
          <Label className="text-xs font-body text-muted-foreground">De</Label>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40 font-body" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-body text-muted-foreground">Até</Label>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40 font-body" />
        </div>
      </div>

      {/* Photo grid */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      ) : filteredFotos.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Camera className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-heading font-semibold text-muted-foreground">
              Nenhuma foto encontrada
            </h3>
            <p className="text-sm text-muted-foreground/70 mt-1 font-body">
              Registre fotos nas plantas de uma obra para visualizá-las aqui
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {filteredFotos.map(foto => (
            <Card
              key={foto.id}
              className="overflow-hidden cursor-pointer hover:border-accent/50 transition-colors group"
              onClick={() => setSelectedFoto(foto)}
            >
              <div className="aspect-square bg-muted overflow-hidden">
                <img
                  src={foto.foto_url}
                  alt={foto.descricao || 'Foto'}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  loading="lazy"
                />
              </div>
              <CardContent className="p-3 space-y-1.5">
                {foto.descricao && (
                  <p className="text-sm font-body text-foreground truncate">{foto.descricao}</p>
                )}
                <div className="flex flex-wrap gap-1">
                  <Badge variant="secondary" className="text-[10px] font-body">
                    {obraMap[foto.obra_id]?.nome || 'Obra'}
                  </Badge>
                  {foto.pacote && (
                    <Badge variant="outline" className="text-[10px] font-body">{foto.pacote}</Badge>
                  )}
                  {foto.tipo_servico && (
                    <Badge variant="outline" className="text-[10px] font-body">{foto.tipo_servico}</Badge>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground font-body">
                  {new Date(foto.created_at).toLocaleDateString('pt-BR')}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Selected photo modal */}
      {selectedFoto && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setSelectedFoto(null)}
        >
          <div className="max-w-4xl max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <img
              src={selectedFoto.foto_url}
              alt={selectedFoto.descricao || 'Foto'}
              className="w-full rounded-lg"
            />
            <div className="mt-3 p-3 bg-card rounded-lg space-y-1">
              {selectedFoto.descricao && (
                <p className="font-body text-sm text-foreground">{selectedFoto.descricao}</p>
              )}
              <div className="flex gap-2 flex-wrap">
                <Badge variant="secondary" className="text-[10px]">{obraMap[selectedFoto.obra_id]?.nome || ''}</Badge>
                {selectedFoto.pacote && <Badge variant="outline" className="text-[10px]">{selectedFoto.pacote}</Badge>}
                {selectedFoto.tipo_servico && <Badge variant="outline" className="text-[10px]">{selectedFoto.tipo_servico}</Badge>}
              </div>
              <p className="text-[10px] text-muted-foreground font-body">
                {new Date(selectedFoto.created_at).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
