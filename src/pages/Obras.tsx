import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus, Pencil, Trash2, MapPin, Calendar, Loader2, Search, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { fetchObras, createObra, updateObra, deleteObra, Obra } from '@/services/api';
import { useNavigate } from 'react-router-dom';

const statusLabels: Record<string, string> = {
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  pausada: 'Pausada',
  cancelada: 'Cancelada',
};

const statusColors: Record<string, string> = {
  em_andamento: 'bg-blue-500/10 text-blue-700 border-blue-200',
  concluida: 'bg-green-500/10 text-green-700 border-green-200',
  pausada: 'bg-yellow-500/10 text-yellow-700 border-yellow-200',
  cancelada: 'bg-red-500/10 text-red-700 border-red-200',
};

interface ObraFormData {
  nome: string;
  endereco: string;
  cidade: string;
  estado: string;
  status: string;
  data_inicio: string;
  data_previsao: string;
}

const emptyForm: ObraFormData = {
  nome: '', endereco: '', cidade: '', estado: 'CE',
  status: 'em_andamento', data_inicio: '', data_previsao: '',
};

export default function Obras() {
  const { user, hasRole } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const canEdit = hasRole('admin') || hasRole('engenharia');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingObra, setEditingObra] = useState<Obra | null>(null);
  const [form, setForm] = useState<ObraFormData>(emptyForm);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: obras = [], isLoading } = useQuery({
    queryKey: ['obras'],
    queryFn: fetchObras,
  });

  // Apply filters
  const filtered = obras.filter(obra => {
    const matchSearch = !search ||
      obra.nome.toLowerCase().includes(search.toLowerCase()) ||
      obra.cidade?.toLowerCase().includes(search.toLowerCase()) ||
      obra.endereco?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || obra.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const createMutation = useMutation({
    mutationFn: (data: ObraFormData) => createObra({
      ...data,
      created_by: user!.id,
      status: data.status as Obra['status'],
      data_inicio: data.data_inicio || undefined,
      data_previsao: data.data_previsao || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['obras'] });
      toast({ title: 'Obra criada com sucesso!' });
      closeDialog();
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ObraFormData }) => updateObra(id, {
      ...data,
      status: data.status as Obra['status'],
      data_inicio: data.data_inicio || undefined,
      data_previsao: data.data_previsao || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['obras'] });
      toast({ title: 'Obra atualizada!' });
      closeDialog();
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteObra,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['obras'] });
      toast({ title: 'Obra excluída' });
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingObra(null);
    setForm(emptyForm);
  };

  const openEdit = (obra: Obra) => {
    setEditingObra(obra);
    setForm({
      nome: obra.nome,
      endereco: obra.endereco || '',
      cidade: obra.cidade || '',
      estado: obra.estado || 'CE',
      status: obra.status,
      data_inicio: obra.data_inicio || '',
      data_previsao: obra.data_previsao || '',
    });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingObra) {
      updateMutation.mutate({ id: editingObra.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Obras</h1>
          <p className="text-muted-foreground font-body">Gerencie seus empreendimentos</p>
        </div>
        {canEdit && (
          <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); else { setForm(emptyForm); setDialogOpen(true); } }}>
            <DialogTrigger asChild>
              <Button className="bg-accent text-accent-foreground hover:bg-accent/90">
                <Plus className="h-4 w-4 mr-2" />
                Nova Obra
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="font-heading">
                  {editingObra ? 'Editar Obra' : 'Nova Obra'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label className="font-body">Nome *</Label>
                  <Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} required className="font-body" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="font-body">Cidade</Label>
                    <Input value={form.cidade} onChange={e => setForm({ ...form, cidade: e.target.value })} className="font-body" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-body">Estado</Label>
                    <Input value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value })} className="font-body" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="font-body">Status</Label>
                  <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                    <SelectTrigger className="font-body"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(statusLabels).map(([k, v]) => (
                        <SelectItem key={k} value={k} className="font-body">{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="font-body">Data Início</Label>
                    <Input type="date" value={form.data_inicio} onChange={e => setForm({ ...form, data_inicio: e.target.value })} className="font-body" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-body">Previsão Conclusão</Label>
                    <Input type="date" value={form.data_previsao} onChange={e => setForm({ ...form, data_previsao: e.target.value })} className="font-body" />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={closeDialog} className="font-body">Cancelar</Button>
                  <Button type="submit" disabled={isPending} className="bg-accent text-accent-foreground hover:bg-accent/90 font-body">
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : editingObra ? 'Salvar' : 'Criar'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, cidade ou endereço..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 font-body"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48 font-body">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="font-body">Todos os status</SelectItem>
            {Object.entries(statusLabels).map(([k, v]) => (
              <SelectItem key={k} value={k} className="font-body">{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Building2 className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-heading font-semibold text-muted-foreground">
              {obras.length === 0 ? 'Nenhuma obra cadastrada' : 'Nenhum resultado encontrado'}
            </h3>
            <p className="text-sm text-muted-foreground/70 mt-1 font-body">
              {obras.length === 0 ? 'Clique em "Nova Obra" para começar' : 'Tente ajustar os filtros'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((obra) => (
            <Card key={obra.id} className="hover:shadow-md transition-shadow cursor-pointer group" onClick={() => navigate(`/obras/${obra.id}`)}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base font-heading leading-tight">{obra.nome}</CardTitle>
                  <Badge variant="outline" className={`text-[10px] shrink-0 ${statusColors[obra.status]}`}>
                    {statusLabels[obra.status]}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {obra.cidade && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    <span className="font-body">{obra.cidade}{obra.estado ? `, ${obra.estado}` : ''}</span>
                  </div>
                )}
                {obra.data_inicio && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    <span className="font-body">
                      {new Date(obra.data_inicio).toLocaleDateString('pt-BR')}
                      {obra.data_previsao && ` — ${new Date(obra.data_previsao).toLocaleDateString('pt-BR')}`}
                    </span>
                  </div>
                )}
                {canEdit && (
                  <div className="flex gap-2 pt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button size="sm" variant="outline" className="h-7 text-xs font-body" onClick={(e) => { e.stopPropagation(); openEdit(obra); }}>
                      <Pencil className="h-3 w-3 mr-1" /> Editar
                    </Button>
                    {hasRole('admin') && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="outline" className="h-7 text-xs text-destructive font-body" onClick={e => e.stopPropagation()}>
                            <Trash2 className="h-3 w-3 mr-1" /> Excluir
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent onClick={e => e.stopPropagation()}>
                          <AlertDialogHeader>
                            <AlertDialogTitle className="font-heading">Excluir obra?</AlertDialogTitle>
                            <AlertDialogDescription className="font-body">
                              Essa ação é irreversível. Todos os dados da EAP serão removidos.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="font-body">Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteMutation.mutate(obra.id)} className="bg-destructive text-destructive-foreground font-body">
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
