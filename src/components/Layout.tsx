import { useEffect, useRef } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { fetchObras, fetchAllEapItems } from "@/services/api";

export function Layout() {
  const location = useLocation();
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const lastToastPath = useRef<string>("");

  const isEngenharia = hasRole("engenharia");

  const { data: obras = [] } = useQuery({
    queryKey: ["obras"],
    queryFn: fetchObras,
    enabled: isEngenharia,
  });

  const { data: eapItems = [] } = useQuery({
    queryKey: ["eap-all"],
    queryFn: fetchAllEapItems,
    enabled: isEngenharia,
  });

  // Count obras with missing dates
  useEffect(() => {
    if (!isEngenharia || eapItems.length === 0 || obras.length === 0) return;
    if (lastToastPath.current === location.pathname) return;

    const obrasWithIssues: string[] = [];
    const obraMap = new Map<string, number>();

    for (const item of eapItems) {
      if (!item.data_inicio_prevista || !item.data_fim_prevista) {
        obraMap.set(item.obra_id, (obraMap.get(item.obra_id) || 0) + 1);
      }
    }

    for (const [obraId, count] of obraMap.entries()) {
      const obra = obras.find((o) => o.id === obraId);
      if (obra) obrasWithIssues.push(`${obra.nome} (${count})`);
    }

    if (obrasWithIssues.length > 0) {
      lastToastPath.current = location.pathname;
      toast({
        title: "⚠️ Atividades sem datas previstas",
        description:
          obrasWithIssues.length === 1
            ? `${obrasWithIssues[0]} possui atividades sem datas de planejamento.`
            : `${obrasWithIssues.length} obras possuem atividades sem datas: ${obrasWithIssues.join(", ")}`,
        variant: "destructive",
        duration: 6000,
      });
    }
  }, [location.pathname, isEngenharia, eapItems, obras, toast]);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </SidebarProvider>
  );
}
