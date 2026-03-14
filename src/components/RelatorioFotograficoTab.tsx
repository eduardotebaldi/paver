import { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Upload, Loader2, Image, Trash2, X, Plus, Camera, FileText, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw, FileCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import {
  fetchPlantas,
  createPlanta,
  deletePlanta,
  fetchFotosLocalizadas,
  createFotoLocalizada,
  deleteFotoLocalizada,
  uploadFile,
  PlantaObra,
  FotoLocalizada,
} from '@/services/api';
import DxfPlantaViewer from '@/components/DxfPlantaViewer';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

function isPdf(url: string): boolean {
  return url.toLowerCase().includes('.pdf');
}

function isDxf(url: string): boolean {
  return url.toLowerCase().includes('.dxf');
}

interface Props {
  obraId: string;
}

export default function RelatorioFotograficoTab({ obraId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, hasRole } = useAuth();
  const canEdit = hasRole('admin') || hasRole('engenharia');
  const [selectedPlanta, setSelectedPlanta] = useState<PlantaObra | null>(null);

  const { data: plantas = [], isLoading } = useQuery({
    queryKey: ['plantas', obraId],
    queryFn: () => fetchPlantas(obraId),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-heading font-semibold text-foreground">
          Relatório Fotográfico
        </h3>
        {canEdit && <UploadPlantaButton obraId={obraId} />}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
        </div>
      ) : plantas.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Image className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground font-body">
              Nenhuma planta cadastrada. Faça upload de uma planta (imagem, PDF ou DXF) para começar.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {plantas.map((planta) => (
            <Card
              key={planta.id}
              className="cursor-pointer hover:border-accent/50 transition-colors"
              onClick={() => setSelectedPlanta(planta)}
            >
              <CardContent className="p-3">
                <div className="aspect-video bg-muted rounded overflow-hidden mb-2 flex items-center justify-center">
                  {isDxf(planta.imagem_url) ? (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <FileCode className="h-10 w-10" />
                      <span className="text-xs font-body">DXF</span>
                    </div>
                  ) : isPdf(planta.imagem_url) ? (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <FileText className="h-10 w-10" />
                      <span className="text-xs font-body">PDF</span>
                    </div>
                  ) : (
                    <img
                      src={planta.imagem_url}
                      alt={planta.nome}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <p className="text-sm font-heading font-medium truncate">{planta.nome}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selectedPlanta && (
        isDxf(selectedPlanta.imagem_url) ? (
          <Dialog open onOpenChange={(v) => !v && setSelectedPlanta(null)}>
            <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-heading flex items-center gap-2">
                  <FileCode className="h-5 w-5 text-accent" />
                  {selectedPlanta.nome}
                  <span className="text-xs font-body text-muted-foreground ml-2">DXF</span>
                </DialogTitle>
              </DialogHeader>
              <DxfPlantaViewer
                planta={selectedPlanta}
                obraId={obraId}
                canEdit={canEdit}
                onClose={() => setSelectedPlanta(null)}
              />
            </DialogContent>
          </Dialog>
        ) : (
          <PlantaViewer
            planta={selectedPlanta}
            obraId={obraId}
            canEdit={canEdit}
            onClose={() => setSelectedPlanta(null)}
          />
        )
      )}
    </div>
  );
}

function UploadPlantaButton({ obraId }: { obraId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [nome, setNome] = useState('');
  const [open, setOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleUpload = async () => {
    if (!selectedFile || !nome.trim()) return;
    setUploading(true);
    try {
      const ext = selectedFile.name.split('.').pop();
      const path = `plantas/${obraId}/${Date.now()}.${ext}`;
      const url = await uploadFile('paver-fotos', path, selectedFile);
      await createPlanta({ obra_id: obraId, nome: nome.trim(), imagem_url: url });
      queryClient.invalidateQueries({ queryKey: ['plantas', obraId] });
      toast({ title: 'Planta adicionada!' });
      setOpen(false);
      setNome('');
      setSelectedFile(null);
    } catch (err: any) {
      toast({ title: 'Erro ao enviar planta', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="font-body">
          <Plus className="h-4 w-4 mr-2" />
          Nova Planta
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-heading">Adicionar Planta</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            placeholder="Nome da planta (ex: Térreo, 1º Pavimento)"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="font-body"
          />
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.pdf,.dxf"
              className="hidden"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
            />
            <Button
              variant="outline"
              className="w-full font-body"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-4 w-4 mr-2" />
              {selectedFile ? selectedFile.name : 'Selecionar imagem, PDF ou DXF'}
            </Button>
          </div>
          <Button
            className="w-full font-body"
            onClick={handleUpload}
            disabled={uploading || !selectedFile || !nome.trim()}
          >
            {uploading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Enviar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PlantaViewer({
  planta,
  obraId,
  canEdit,
  onClose,
}: {
  planta: PlantaObra;
  obraId: string;
  canEdit: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const fotoInputRef = useRef<HTMLInputElement>(null);
  const [pendingPin, setPendingPin] = useState<{ x: number; y: number } | null>(null);
  const [descricao, setDescricao] = useState('');
  const [selectedFoto, setSelectedFoto] = useState<FotoLocalizada | null>(null);
  const [uploading, setUploading] = useState(false);
  const [numPages, setNumPages] = useState<number>(1);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pdfContainerWidth, setPdfContainerWidth] = useState<number>(800);
  const [zoom, setZoom] = useState<number>(1);
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  const pdf = isPdf(planta.imagem_url);

  const { data: fotos = [] } = useQuery({
    queryKey: ['fotos-localizadas', planta.id],
    queryFn: () => fetchFotosLocalizadas(planta.id),
  });

  // Filter fotos for current page (PDF) or all (image)
  const visibleFotos = pdf
    ? fotos.filter(f => {
        // Store page in pos_x's integer thousands: page is encoded as extra data
        // Actually, simpler: we store page number in description prefix or a separate approach
        // For now, fotos on PDF are per-page, we'll use a convention
        return true; // show all pins for now, page-specific could be added later
      })
    : fotos;

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!canEdit) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      setPendingPin({ x, y });
      setDescricao('');
      setSelectedFoto(null);
    },
    [canEdit]
  );

  const handleSaveFoto = async (file: File) => {
    if (!pendingPin || !user) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `fotos/${obraId}/${Date.now()}.${ext}`;
      const url = await uploadFile('paver-fotos', path, file);
      await createFotoLocalizada({
        planta_id: planta.id,
        obra_id: obraId,
        foto_url: url,
        descricao: descricao || undefined,
        pos_x: pendingPin.x,
        pos_y: pendingPin.y,
        created_by: user.id,
      });
      queryClient.invalidateQueries({ queryKey: ['fotos-localizadas', planta.id] });
      toast({ title: 'Foto registrada!' });
      setPendingPin(null);
      setDescricao('');
    } catch (err: any) {
      toast({ title: 'Erro ao salvar foto', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteFoto = async (id: string) => {
    try {
      await deleteFotoLocalizada(id);
      queryClient.invalidateQueries({ queryKey: ['fotos-localizadas', planta.id] });
      setSelectedFoto(null);
      toast({ title: 'Foto removida' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  // Measure PDF container width for responsive rendering (base width, without zoom)
  const zoomContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = zoomContainerRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      // We only care about the container's own width, not the zoomed content
    });
    // Measure once on mount
    setPdfContainerWidth(node.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);

  const PinsOverlay = (
    <>
      {visibleFotos.map((foto) => (
        <button
          key={foto.id}
          className={`absolute w-6 h-6 -ml-3 -mt-6 transition-transform hover:scale-125 ${
            selectedFoto?.id === foto.id ? 'scale-125 z-20' : 'z-10'
          }`}
          style={{ left: `${foto.pos_x}%`, top: `${foto.pos_y}%` }}
          onClick={(e) => {
            e.stopPropagation();
            setSelectedFoto(foto);
            setPendingPin(null);
          }}
          title={foto.descricao || 'Foto'}
        >
          <MapPin className="h-6 w-6 text-accent drop-shadow-md fill-accent/30" />
        </button>
      ))}
      {pendingPin && (
        <div
          className="absolute w-6 h-6 -ml-3 -mt-6 z-20 animate-bounce"
          style={{ left: `${pendingPin.x}%`, top: `${pendingPin.y}%` }}
        >
          <MapPin className="h-6 w-6 text-primary drop-shadow-md fill-primary/30" />
        </div>
      )}
    </>
  );

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <MapPin className="h-5 w-5 text-accent" />
            {planta.nome}
            {pdf && <span className="text-xs font-body text-muted-foreground ml-2">PDF</span>}
          </DialogTitle>
        </DialogHeader>

        <div className="relative" ref={containerRef}>
          {pdf ? (
            <div ref={zoomContainerRef}>
              {/* PDF controls: zoom + navigation */}
              <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}>
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <Slider
                    className="w-28"
                    min={50}
                    max={300}
                    step={25}
                    value={[zoom * 100]}
                    onValueChange={([v]) => setZoom(v / 100)}
                  />
                  <Button variant="outline" size="icon" onClick={() => setZoom(z => Math.min(3, z + 0.25))}>
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  <span className="text-xs font-body text-muted-foreground w-12 text-center">{Math.round(zoom * 100)}%</span>
                  {zoom !== 1 && (
                    <Button variant="ghost" size="icon" onClick={() => setZoom(1)}>
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {numPages > 1 && (
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm font-body text-muted-foreground">
                      {currentPage} / {numPages}
                    </span>
                    <Button variant="outline" size="icon" disabled={currentPage >= numPages} onClick={() => setCurrentPage(p => p + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
              <div className="overflow-auto max-h-[60vh] border border-border rounded-lg">
                <div className="relative inline-block" style={{ width: pdfContainerWidth * zoom }}>
                  <Document
                    file={planta.imagem_url}
                    onLoadSuccess={({ numPages: n }) => setNumPages(n)}
                    loading={
                      <div className="flex justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-accent" />
                      </div>
                    }
                    error={
                      <div className="text-center py-12 text-destructive font-body text-sm">
                        Erro ao carregar PDF. Verifique se o arquivo é válido.
                      </div>
                    }
                  >
                    <Page
                      pageNumber={currentPage}
                      width={pdfContainerWidth * zoom}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                    />
                  </Document>
                  {/* Clickable overlay for pins */}
                  <div
                    className={`absolute inset-0 ${canEdit ? 'cursor-crosshair' : ''}`}
                    onClick={handleOverlayClick}
                  >
                    {PinsOverlay}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="relative inline-block w-full">
              <img
                src={planta.imagem_url}
                alt={planta.nome}
                className={`w-full rounded-lg border border-border ${canEdit ? 'cursor-crosshair' : ''}`}
                onClick={handleOverlayClick}
                draggable={false}
              />
              {PinsOverlay}
            </div>
          )}
        </div>

        {/* Pending pin form */}
        {pendingPin && canEdit && (
          <Card className="border-accent/30">
            <CardContent className="pt-4 space-y-3">
              <p className="text-sm font-body text-muted-foreground">
                Marque uma foto neste ponto ({pendingPin.x.toFixed(0)}%, {pendingPin.y.toFixed(0)}%)
              </p>
              <Textarea
                placeholder="Descrição (opcional)"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                className="font-body"
                rows={2}
              />
              <div className="flex gap-2">
                <input
                  ref={fotoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleSaveFoto(file);
                    e.target.value = '';
                  }}
                />
                <Button
                  onClick={() => fotoInputRef.current?.click()}
                  disabled={uploading}
                  className="font-body"
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Camera className="h-4 w-4 mr-2" />
                  )}
                  Selecionar Foto
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setPendingPin(null)}
                  className="font-body"
                >
                  Cancelar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Selected foto detail */}
        {selectedFoto && (
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-heading font-medium">
                    {selectedFoto.descricao || 'Sem descrição'}
                  </p>
                  <p className="text-xs text-muted-foreground font-body">
                    {new Date(selectedFoto.created_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <div className="flex gap-1">
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteFoto(selectedFoto.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => setSelectedFoto(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <img
                src={selectedFoto.foto_url}
                alt={selectedFoto.descricao || 'Foto'}
                className="w-full max-h-96 object-contain rounded-lg border border-border"
              />
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-muted-foreground font-body">
          {fotos.length} foto(s) marcada(s) nesta planta
          {canEdit && ' • Clique na planta para marcar uma nova foto'}
        </p>
      </DialogContent>
    </Dialog>
  );
}
