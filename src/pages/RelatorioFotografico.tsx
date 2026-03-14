import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Loader2, FolderTree, Layers, Building2, MapPin, FileCode, Image as ImageIcon, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { fetchObras, fetchAllFotosLocalizadas, fetchPlantas, deleteFotoLocalizada, FotoLocalizada, PlantaObra } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import DxfPlantaViewer from '@/components/DxfPlantaViewer';

type ViewMode = 'galeria' | 'planta';

function isDxf(url: string) {
  return url.toLowerCase().includes('.dxf');
}

export default function RelatorioFotografico() {
  const [viewMode, setViewMode] = useState<ViewMode>('galeria');
  const [selectedObra, setSelectedObra] = useState<string>('all');
  const [selectedPacote, setSelectedPacote] = useState<string>('all');
  const [selectedServico, setSelectedServico] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedFoto, setSelectedFoto] = useState<FotoLocalizada | null>(null);
  const [selectedPlantaId, setSelectedPlantaId] = useState<string>('');
  const { hasRole } = useAuth();
  const canEdit = hasRole('admin') || hasRole('engenharia');

  const { data: obras = [] } = useQuery({
    queryKey: ['obras'],
    queryFn: fetchObras,
  });

  const { data: allFotos = [], isLoading } = useQuery({
    queryKey: ['all-fotos-localizadas'],
    queryFn: fetchAllFotosLocalizadas,
  });

  const { data: allPlantas = [] } = useQuery({
    queryKey: ['all-plantas', selectedObra],
    queryFn: async () => {
      if (selectedObra !== 'all') {
        return fetchPlantas(selectedObra);
      }
      const results = await Promise.all(obras.map(o => fetchPlantas(o.id)));
      return results.flat();
    },
    enabled: obras.length > 0,
  });

  const dxfPlantas = useMemo(() => allPlantas.filter(p => isDxf(p.imagem_url)), [allPlantas]);

  // Auto-select first planta when list changes
  const activePlanta = useMemo(() => {
    if (selectedPlantaId) {
      const found = dxfPlantas.find(p => p.id === selectedPlantaId);
      if (found) return found;
    }
    return dxfPlantas[0] || null;
  }, [dxfPlantas, selectedPlantaId]);

  const obraMap = Object.fromEntries(obras.map(o => [o.id, o]));

  const filteredFotos = useMemo(() => {
    let fotos = allFotos;
    if (selectedObra !== 'all') fotos = fotos.filter(f => f.obra_id === selectedObra);
    if (selectedPacote !== 'all') fotos = fotos.filter(f => f.pacote === selectedPacote);
    if (selectedServico !== 'all') fotos = fotos.filter(f => f.tipo_servico === selectedServico);
    if (dateFrom) fotos = fotos.filter(f => f.created_at >= dateFrom);
    if (dateTo) fotos = fotos.filter(f => f.created_at <= dateTo + 'T23:59:59');
    return fotos;
  }, [allFotos, selectedObra, selectedPacote, selectedServico, dateFrom, dateTo]);

  // Set of foto IDs that pass filters — used by DxfPlantaViewer
  const visibleFotoIds = useMemo(() => new Set(filteredFotos.map(f => f.id)), [filteredFotos]);

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Relatório Fotográfico</h1>
          <p className="text-muted-foreground font-body">Fotos localizadas em plantas de todas as obras</p>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center rounded-md border border-border overflow-hidden">
          <button
            onClick={() => setViewMode('galeria')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-body transition-colors ${
              viewMode === 'galeria'
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-muted-foreground hover:bg-muted'
            }`}
          >
            <ImageIcon className="h-3.5 w-3.5" />
            Galeria
          </button>
          <button
            onClick={() => setViewMode('planta')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-body transition-colors ${
              viewMode === 'planta'
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-muted-foreground hover:bg-muted'
            }`}
          >
            <MapPin className="h-3.5 w-3.5" />
            Planta
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs font-body text-muted-foreground">Obra</Label>
          <Select value={selectedObra} onValueChange={(v) => { setSelectedObra(v); setSelectedPacote('all'); setSelectedServico('all'); setSelectedPlantaId(''); }}>
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

        {viewMode === 'planta' && dxfPlantas.length > 1 && (
          <div className="space-y-1">
            <Label className="text-xs font-body text-muted-foreground">Planta</Label>
            <Select value={activePlanta?.id || ''} onValueChange={setSelectedPlantaId}>
              <SelectTrigger className="w-52 font-body">
                <FileCode className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {dxfPlantas.map(p => (
                  <SelectItem key={p.id} value={p.id} className="font-body">
                    {p.nome} {obraMap[p.obra_id] ? `(${obraMap[p.obra_id].nome})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

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

      {/* View content */}
      {viewMode === 'galeria' ? (
        <GaleriaView
          fotos={filteredFotos}
          obraMap={obraMap}
          isLoading={isLoading}
          selectedFoto={selectedFoto}
          onSelectFoto={setSelectedFoto}
        />
      ) : (
        <PlantaEmbeddedView
          planta={activePlanta}
          dxfPlantas={dxfPlantas}
          obraMap={obraMap}
          canEdit={canEdit}
          visibleFotoIds={visibleFotoIds}
          filteredCount={filteredFotos.length}
        />
      )}
    </div>
  );
}

/* ─── Galeria View ─── */
function GaleriaView({
  fotos,
  obraMap,
  isLoading,
  selectedFoto,
  onSelectFoto,
}: {
  fotos: FotoLocalizada[];
  obraMap: Record<string, { nome: string }>;
  isLoading: boolean;
  selectedFoto: FotoLocalizada | null;
  onSelectFoto: (f: FotoLocalizada | null) => void;
}) {
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const canDeleteFoto = (foto: FotoLocalizada) => {
    if (isAdmin) return true;
    if (foto.created_by !== user?.id) return false;
    const created = new Date(foto.created_at);
    return (Date.now() - created.getTime()) <= 2 * 24 * 60 * 60 * 1000;
  };

  const handleDelete = async (foto: FotoLocalizada) => {
    try {
      await deleteFotoLocalizada(foto.id);
      queryClient.invalidateQueries({ queryKey: ['all-fotos-localizadas'] });
      queryClient.invalidateQueries({ queryKey: ['fotos-localizadas'] });
      if (selectedFoto?.id === foto.id) onSelectFoto(null);
      toast({ title: 'Foto excluída' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (fotos.length === 0) {
    return (
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
    );
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {fotos.map(foto => (
          <Card
            key={foto.id}
            className="overflow-hidden cursor-pointer hover:border-accent/50 transition-colors group relative"
            onClick={() => onSelectFoto(foto)}
          >
            <div className="aspect-square bg-muted overflow-hidden">
              <img
                src={foto.foto_url}
                alt={foto.descricao || 'Foto'}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                loading="lazy"
              />
            </div>
            {canDeleteFoto(foto) && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    type="button"
                    onClick={e => e.stopPropagation()}
                    className="absolute top-2 right-2 h-7 w-7 bg-destructive/90 text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    title="Excluir foto"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent onClick={e => e.stopPropagation()}>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="font-heading">Excluir foto?</AlertDialogTitle>
                    <AlertDialogDescription className="font-body">Essa ação é irreversível. A foto será removida permanentemente.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="font-body">Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleDelete(foto)} className="bg-destructive text-destructive-foreground font-body">Excluir</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
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

      {selectedFoto && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => onSelectFoto(null)}
        >
          <div className="max-w-4xl max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <img
              src={selectedFoto.foto_url}
              alt={selectedFoto.descricao || 'Foto'}
              className="w-full rounded-lg"
            />
            <div className="mt-3 p-3 bg-card rounded-lg space-y-1">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
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
                {canDeleteFoto(selectedFoto) && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-destructive shrink-0">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle className="font-heading">Excluir foto?</AlertDialogTitle>
                        <AlertDialogDescription className="font-body">Essa ação é irreversível.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="font-body">Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(selectedFoto)} className="bg-destructive text-destructive-foreground font-body">Excluir</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Planta Embedded View ─── */
function PlantaEmbeddedView({
  planta,
  dxfPlantas,
  obraMap,
  canEdit,
  visibleFotoIds,
  filteredCount,
}: {
  planta: PlantaObra | null;
  dxfPlantas: PlantaObra[];
  obraMap: Record<string, { nome: string }>;
  canEdit: boolean;
  visibleFotoIds: Set<string>;
  filteredCount: number;
}) {
  if (dxfPlantas.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <FileCode className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-heading font-semibold text-muted-foreground">
            Nenhuma planta DXF encontrada
          </h3>
          <p className="text-sm text-muted-foreground/70 mt-1 font-body">
            Faça upload de arquivos DXF nas obras para visualizá-los aqui
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!planta) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <FileCode className="h-4 w-4 text-accent" />
        <span className="text-sm font-heading font-medium">{planta.nome}</span>
        <Badge variant="secondary" className="text-[10px]">
          {obraMap[planta.obra_id]?.nome || ''}
        </Badge>
        <span className="text-xs text-muted-foreground font-body ml-auto">
          {filteredCount} foto(s) visível(is) com os filtros atuais
        </span>
      </div>

      <DxfPlantaViewer
        key={planta.id}
        planta={planta}
        obraId={planta.obra_id}
        canEdit={canEdit}
        visibleFotoIds={visibleFotoIds}
      />
    </div>
  );
}
