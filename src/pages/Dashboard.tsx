import { Building2, FileBarChart, Camera, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const stats = [
  { title: "Obras Ativas", value: "0", icon: Building2, description: "Nenhuma obra cadastrada" },
  { title: "Diários este Mês", value: "0", icon: FileBarChart, description: "Nenhum diário registrado" },
  { title: "Fotos Registradas", value: "0", icon: Camera, description: "Nenhuma foto adicionada" },
  { title: "Avanço Médio", value: "0%", icon: TrendingUp, description: "Sem dados de progresso" },
];

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground font-body">Visão geral dos empreendimentos</p>
      </div>

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
              <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
