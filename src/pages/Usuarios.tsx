import { Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function Usuarios() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Usuários</h1>
        <p className="text-muted-foreground font-body">Gerenciamento de usuários e permissões</p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Users className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-heading font-semibold text-muted-foreground">
            Autenticação não configurada
          </h3>
          <p className="text-sm text-muted-foreground/70 mt-1">
            O sistema de usuários será habilitado na Fase 2
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
