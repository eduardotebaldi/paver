import { FileBarChart } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function Relatorios() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Relatórios</h1>
        <p className="text-muted-foreground font-body">Relatórios de execução e medições</p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <FileBarChart className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-heading font-semibold text-muted-foreground">
            Nenhum relatório disponível
          </h3>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Cadastre obras e registre avanços para gerar relatórios
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
