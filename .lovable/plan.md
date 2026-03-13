

# Paver | Young Empreendimentos -- Plano de Implementação

## Atualizações ao plano anterior

**Perfis simplificados**: Apenas 2 roles -- `admin` e `engenharia` (em vez de 3).

**Regra de edição temporal**: Diários de obra e fotos ficam editáveis por 2 dias após o cadastro. Após esse prazo, somente `admin` pode editar ou excluir. Essa lógica será aplicada tanto no frontend (ocultar botões) quanto no backend (RLS policies com verificação de `created_at`).

## Identidade Visual (extraída do Guia de Marca)

Paleta de cores baseada no manual oficial:

| Token | Cor | Hex | Uso |
|-------|-----|-----|-----|
| Primary | Azul corporativo | #061B39 | Sidebar, cabeçalhos, botões principais |
| Primary foreground | Branco | #FFFFFF | Texto sobre primary |
| Accent | Laranja jovem | #FE5009 | Destaques, ações, badges, links ativos |
| Accent dark | Laranja escuro | #751900 | Hover em elementos accent |
| Background | Cinza claro | #F2F2F2 | Fundo geral das páginas |
| Card | Branco | #FFFFFF | Cards e painéis |
| Foreground | Cinza espacial | #0D0D0D | Texto principal |
| Muted | Cinza fraco | #D7D7D9 | Bordas, texto secundário |
| Muted foreground | Cinza médio | #323232 | Texto secundário |

Tipografia:
- **Space Grotesk** -- títulos e elementos de destaque (Google Fonts)
- **Be Vietnam Pro** -- corpo de texto (Google Fonts)

## Fases de Implementação

### Fase 1 -- Setup Visual e Navegação
- Atualizar `index.html` com título, fontes do Google e favicon
- Criar favicon de engenharia (capacete/Y da Young) em SVG/PNG
- Configurar paleta de cores no `index.css` e `tailwind.config.ts` em HSL
- Criar layout principal com sidebar (logo Young, navegação: Dashboard, Obras, Relatórios, Usuários)
- Páginas placeholder para cada seção

### Fase 2 -- Autenticação e Roles
- Conectar Supabase
- Tabelas: `profiles` (nome, cargo, telefone) + `user_roles` (com enum `admin`, `engenharia`)
- Função `has_role()` security definer para RLS
- Tela de login com email/senha
- Proteção de rotas; menu "Usuários" visível apenas para admin

### Fase 3 -- Cadastro de Obras e EAP
- Tabela `obras` (nome, endereço, cliente, datas, status)
- CRUD de obras
- Tabelas para EAP: `work_packages`, `service_types`, `eap_items`
- Importação de planilha Excel (.xlsx) via `xlsx` library
- Tela de visualização da EAP em tabela expansível

### Fase 4 -- Diário de Obra
- Tabelas: `daily_reports`, `daily_weather`, `daily_teams`, `daily_progress`, `daily_occurrences`
- Formulário diário com clima por turno, equipes, avanço (itens da EAP) e ocorrências
- **Regra de 2 dias**: RLS policy que permite UPDATE/DELETE se `created_at > now() - interval '2 days'` OR `has_role(auth.uid(), 'admin')`
- Listagem por data com indicador visual de editabilidade

### Fase 5 -- Relatório Fotográfico
- Storage bucket para fotos e plantas
- Tabelas: `site_plans`, `photos`, `photo_locations`
- Upload de planta da obra (PNG/JPG/PDF convertido a imagem)
- Upload de foto com marcação de ponto na planta (click para coordenadas x,y)
- Visualização: planta com pins clicáveis, filtro por data
- **Mesma regra de 2 dias** para edição/exclusão de fotos

### Fase 6 -- Linha de Balanço
- Tabela `balance_line_activities` (atividade, pacote, datas previstas)
- Gráfico visual tipo Gantt/Linha de Balanço com Recharts ou canvas customizado
- Eixo Y: pacotes de trabalho; Eixo X: timeline
- Barras coloridas por tipo de serviço; comparação previsto vs. realizado

### Fase 7 -- Relatórios e Medições
- Tabela `measurements` para medições periódicas
- Relatório de volumes executados com filtros (período, pacote, etapa)
- Relatório de medições com histórico
- Exportação em PDF via `jspdf` + `jspdf-autotable`

## Estrutura de Dados (resumo)

```text
profiles ──┐
user_roles ─┤── auth.users
            │
obras ──────┤
  ├── work_packages
  ├── service_types
  ├── eap_items (FK: work_package, service_type)
  ├── site_plans (planta da obra)
  ├── daily_reports
  │     ├── daily_weather (por turno)
  │     ├── daily_teams
  │     ├── daily_progress (FK: eap_item)
  │     └── daily_occurrences
  ├── photos (FK: site_plan, com x,y)
  ├── balance_line_activities
  └── measurements (FK: eap_item, período)
```

## Ordem de execução sugerida

Implementarei fase a fase, começando pela **Fase 1** (visual + navegação) para ter a estrutura base do app funcionando.

