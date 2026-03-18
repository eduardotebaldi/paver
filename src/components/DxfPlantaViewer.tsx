import { useState, useRef, useCallback, useMemo, useEffect, useLayoutEffect } from 'react';
import DxfParser from 'dxf-parser';
import {
  MapPin, Upload, Loader2, Camera, Trash2, X,
  ZoomIn, ZoomOut, RotateCcw, Layers, Eye, EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { parseDxfToSvg, DxfSvgData, DxfLayer } from '@/lib/dxfRenderer';
import {
  fetchFotosLocalizadas,
  createFotoLocalizada,
  deleteFotoLocalizada,
  uploadFile,
  FotoLocalizada,
  PlantaObra,
} from '@/services/api';

interface Props {
  planta: PlantaObra;
  obraId: string;
  canEdit: boolean;
  onClose?: () => void;
  /** If provided, only show pins whose IDs are in this set */
  visibleFotoIds?: Set<string>;
}

export default function DxfPlantaViewer({ planta, obraId, canEdit, onClose, visibleFotoIds }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole('admin');

  const canModifyFoto = (foto: FotoLocalizada) => {
    if (isAdmin) return true;
    if (foto.created_by !== user?.id) return false;
    const created = new Date(foto.created_at);
    const now = new Date();
    return (now.getTime() - created.getTime()) <= 2 * 24 * 60 * 60 * 1000;
  };
  const fotoInputRef = useRef<HTMLInputElement>(null);
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const fittedRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [dxfData, setDxfData] = useState<DxfSvgData | null>(null);
  const [layers, setLayers] = useState<DxfLayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [showLayerPanel, setShowLayerPanel] = useState(true);

  // Pin state
  const [pendingPin, setPendingPin] = useState<{ x: number; y: number } | null>(null);
  const [descricao, setDescricao] = useState('');
  const [selectedFoto, setSelectedFoto] = useState<FotoLocalizada | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: fotos = [] } = useQuery({
    queryKey: ['fotos-localizadas', planta.id],
    queryFn: () => fetchFotosLocalizadas(planta.id),
  });

  // Load and parse DXF
  useEffect(() => {
    let cancelled = false;
    async function loadDxf() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(planta.imagem_url);
        const text = await response.text();
        const parser = new DxfParser();
        const dxf = parser.parseSync(text);
        if (cancelled) return;
        if (!dxf) throw new Error('Falha ao interpretar arquivo DXF');

        const svgData = parseDxfToSvg(dxf);
        setDxfData(svgData);
        setLayers(svgData.layers);
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Erro ao carregar DXF');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadDxf();
    return () => { cancelled = true; };
  }, [planta.imagem_url]);

  const toggleLayer = (name: string) => {
    setLayers(prev => prev.map(l =>
      l.name === name ? { ...l, visible: !l.visible } : l
    ));
  };

  const toggleAllLayers = (visible: boolean) => {
    setLayers(prev => prev.map(l => ({ ...l, visible })));
  };

  const visibleLayerNames = useMemo(
    () => new Set(layers.filter(l => l.visible).map(l => l.name)),
    [layers]
  );

  // Track container size for fittedViewport calculation
  useEffect(() => {
    const node = svgContainerRef.current;
    if (!node) return;
    const update = () => setContainerSize({ width: node.clientWidth, height: node.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Mouse handlers for pan
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || e.button === 2 || e.altKey) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
  }, [isPanning, panStart]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.min(10, Math.max(0.1, z * delta)));
  }, []);

  // Click to place pin — coordinates relative to fittedRef (the actual SVG drawing area)
  const handleSvgClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!canEdit || isPanning) return;
    const target = fittedRef.current;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    // Ignore clicks outside the fitted drawing area
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setPendingPin({ x, y });
    setDescricao('');
    setSelectedFoto(null);
  }, [canEdit, isPanning]);

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

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
        <p className="text-sm text-muted-foreground font-body">Carregando planta DXF...</p>
      </div>
    );
  }

  if (error || !dxfData) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-destructive font-body">{error || 'Erro ao carregar DXF'}</p>
        {onClose && <Button variant="link" onClick={onClose} className="mt-2">Voltar</Button>}
      </div>
    );
  }

  const { viewBox, pathsByLayer } = dxfData;
  const aspectRatio = viewBox.width > 0 && viewBox.height > 0 ? viewBox.width / viewBox.height : 1;

  // Compute the fitted viewport so pins align with actual drawing area
  const fittedViewport = useMemo(() => {
    const { width, height } = containerSize;
    if (!width || !height) return null;
    const containerRatio = width / height;
    if (containerRatio > aspectRatio) {
      const fittedWidth = height * aspectRatio;
      return { width: fittedWidth, height, left: (width - fittedWidth) / 2, top: 0 };
    }
    const fittedHeight = width / aspectRatio;
    return { width, height: fittedHeight, left: 0, top: (height - fittedHeight) / 2 };
  }, [containerSize, aspectRatio]);

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setZoom(z => Math.max(0.1, z / 1.25))}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Slider
            className="w-28"
            min={10}
            max={500}
            step={10}
            value={[zoom * 100]}
            onValueChange={([v]) => setZoom(v / 100)}
          />
          <Button variant="outline" size="icon" onClick={() => setZoom(z => Math.min(10, z * 1.25))}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <span className="text-xs font-body text-muted-foreground w-12 text-center">{Math.round(zoom * 100)}%</span>
          {(zoom !== 1 || pan.x !== 0 || pan.y !== 0) && (
            <Button variant="ghost" size="icon" onClick={resetView}>
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showLayerPanel ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowLayerPanel(!showLayerPanel)}
            className="font-body text-xs"
          >
            <Layers className="h-3.5 w-3.5 mr-1" />
            Layers ({layers.filter(l => l.visible).length}/{layers.length})
          </Button>
        </div>
      </div>

      <div className="flex gap-3">
        {/* Layer panel */}
        {showLayerPanel && layers.length > 0 && (
          <Card className="shrink-0 w-52">
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-heading font-semibold">Layers</span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[10px]" onClick={() => toggleAllLayers(true)}>
                    <Eye className="h-3 w-3 mr-0.5" /> Todas
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[10px]" onClick={() => toggleAllLayers(false)}>
                    <EyeOff className="h-3 w-3 mr-0.5" /> Nenhuma
                  </Button>
                </div>
              </div>
              <ScrollArea className="h-[45vh]">
                <div className="space-y-1 pr-2">
                  {layers.map(layer => (
                    <label
                      key={layer.name}
                      className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-muted/50 cursor-pointer transition-colors"
                    >
                      <Checkbox
                        checked={layer.visible}
                        onCheckedChange={() => toggleLayer(layer.name)}
                        className="h-3.5 w-3.5"
                      />
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 border border-border"
                        style={{ backgroundColor: layer.color }}
                      />
                      <span className="text-[11px] font-body truncate flex-1">{layer.name}</span>
                    </label>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        {/* DXF SVG canvas */}
        <div
          ref={svgContainerRef}
          className="flex-1 overflow-hidden border border-border rounded-lg bg-muted/20 relative"
          style={{ height: '65vh', minHeight: '400px' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          onContextMenu={e => e.preventDefault()}
        >
          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
              width: '100%',
              height: '100%',
              position: 'relative',
            }}
          >
            <div
              className={`relative h-full w-full ${canEdit && !isPanning ? 'cursor-crosshair' : isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
              onClick={handleSvgClick}
            >
              {fittedViewport && (
                <div
                  ref={fittedRef}
                  className="absolute overflow-hidden"
                  style={{
                    left: fittedViewport.left,
                    top: fittedViewport.top,
                    width: fittedViewport.width,
                    height: fittedViewport.height,
                  }}
                >
                  <svg
                    viewBox={`${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`}
                    className="block h-full w-full"
                    preserveAspectRatio="none"
                    style={{ background: 'transparent' }}
                  >
                    {Array.from(pathsByLayer.entries()).map(([layerName, paths]) => {
                      if (!visibleLayerNames.has(layerName)) return null;
                      const layerInfo = layers.find(l => l.name === layerName);
                      const color = layerInfo?.color || '#888';
                      return (
                        <g key={layerName}>
                          {paths.map((d, i) => (
                            <path
                              key={i}
                              d={d}
                              fill="none"
                              stroke={color}
                              strokeWidth={viewBox.width * 0.001}
                              vectorEffect="non-scaling-stroke"
                            />
                          ))}
                        </g>
                      );
                    })}
                  </svg>

                  {/* Pins overlay — inside fitted area so percentages align */}
                  {fotos.filter(f => !visibleFotoIds || visibleFotoIds.has(f.id)).map(foto => (
                    <button
                      key={foto.id}
                      className={`absolute transition-transform hover:scale-125 ${
                        selectedFoto?.id === foto.id ? 'scale-125 z-20' : 'z-10'
                      }`}
                      style={{
                        left: `${foto.pos_x}%`,
                        top: `${foto.pos_y}%`,
                        transform: `translate(-50%, -100%) scale(${1 / zoom})`,
                      }}
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
                      className="absolute z-20 animate-bounce"
                      style={{
                        left: `${pendingPin.x}%`,
                        top: `${pendingPin.y}%`,
                        transform: `translate(-50%, -100%) scale(${1 / zoom})`,
                      }}
                    >
                      <MapPin className="h-6 w-6 text-primary drop-shadow-md fill-primary/30" />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
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
              <Button variant="ghost" onClick={() => setPendingPin(null)} className="font-body">
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
                {canModifyFoto(selectedFoto) && (
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteFoto(selectedFoto.id)}>
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
        {fotos.length} foto(s) marcada(s) · {layers.filter(l => l.visible).length} layer(s) ativa(s)
        {canEdit && ' · Clique na planta para marcar · Alt+arrastar para mover'}
      </p>
    </div>
  );
}
