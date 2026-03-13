import { Building2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function Obras() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Obras</h1>
          <p className="text-muted-foreground font-body">Gerencie seus empreendimentos</p>
        </div>
        <Button className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Plus className="h-4 w-4 mr-2" />
          Nova Obra
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Building2 className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-heading font-semibold text-muted-foreground">
            Nenhuma obra cadastrada
          </h3>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Clique em "Nova Obra" para começar
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
