import { useQuery } from '@tanstack/react-query';
import { Building2, FileBarChart, TrendingUp, ClipboardList } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { fetchObras, fetchAllEapItems, fetchDiariosThisMonth } from '@/services/api';
import { useNavigate } from 'react-router-dom';

const statusLabels: Record<string, string> = {
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  pausada: 'Pausada',
  cancelada: 'Cancelada',
};

const statusColors: Record<string, string> = {
  em_andamento: 'bg-blue-500/10 text-blue-700',
  concluida: 'bg-green-500/10 text-green-700',
  pausada: 'bg-yellow-500/10 text-yellow-700',
  cancelada: 'bg-red-500/10 text-red-700',
};

export default function Dashboard() {
  const navigate = useNavigate();

  const { data: obras = [] } = useQuery({
    queryKey: ['obras'],
    queryFn: fetchObras,
  });

  const { data: eapItems = [] } = useQuery({
    queryKey: ['eap-all'],
    queryFn: fetchAllEapItems,
  });

  const { data: diariosMonth = [] } = useQuery({
    queryKey: ['diarios-month'],
    queryFn: fetchDiariosThisMonth,
  });

  const obrasAtivas = obras.filter(o => o.status === 'em_andamento').length;
  const totalFotos = diariosMonth.reduce((sum, d) => sum + (d.fotos?.length || 0), 0);

  // Average progress across all EAP items
  const avgAvanco = eapItems.length > 0
    ? eapItems.reduce((sum, i) => sum + (i.avanco_realizado || 0), 0) / eapItems.length
    : 0;

  const stats = [
    { title: 'Obras Ativas', value: String(obrasAtivas), icon: Building2, description: `${obras.length} total cadastradas` },
    { title: 'Diários este Mês', value: String(diariosMonth.length), icon: ClipboardList, description: 'Registros no mês atual' },
    { title: 'Fotos no Mês', value: String(totalFotos), icon: FileBarChart, description: 'Fotos em diários este mês' },
    { title: 'Avanço Médio', value: `${avgAvanco.toFixed(1)}%`, icon: TrendingUp, description: `${eapItems.length} itens de EAP` },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground font-body">Visão geral dos empreendimentos</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium font-body text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold font-heading">{stat.value}</div>
              <p className="text-xs text-muted-foreground mt-1 font-body">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Obras recentes */}
      <div>
        <h2 className="text-lg font-heading font-semibold text-foreground mb-3">Obras Recentes</h2>
        {obras.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-sm text-muted-foreground font-body">Nenhuma obra cadastrada ainda.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {obras.slice(0, 6).map(obra => (
              <Card
                key={obra.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(`/obras/${obra.id}`)}
              >
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-sm font-heading font-semibold leading-tight">{obra.nome}</h3>
                    <Badge variant="outline" className={`text-[10px] shrink-0 ml-2 ${statusColors[obra.status]}`}>
                      {statusLabels[obra.status]}
                    </Badge>
                  </div>
                  {obra.cidade && (
                    <p className="text-xs text-muted-foreground font-body">{obra.cidade}, {obra.estado}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
