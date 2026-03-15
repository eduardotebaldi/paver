
Objetivo: resolver o “não rodou” (404 do GitHub Pages) garantindo que o deploy execute e que o domínio customizado aponte para um site publicado.

1) Diagnóstico provável
- O DNS já aponta para o GitHub (por isso aparece “Site not found · GitHub Pages”).
- Esse 404 normalmente significa: o Pages não publicou nada ainda (workflow não executou/falhou) ou o Pages não está configurado para “GitHub Actions”.

2) Ajustes que vou aplicar no código (para evitar travar por branch/config)
- Arquivo: `.github/workflows/deploy.yml`
  - Adicionar trigger manual `workflow_dispatch` (permite clicar “Run workflow” no GitHub).
  - Ajustar trigger de push para cobrir branch padrão diferente de `main` (ex.: incluir `master`).
  - Garantir estrutura oficial de Pages (build + upload artifact + deploy) e permissões corretas por job.
- Manter `public/CNAME` com `paver.youngempreendimentos.com.br` (já está correto).
- Manter `public/404.html` + script do `index.html` para roteamento SPA (já está correto).

3) Passos de configuração no GitHub (sem isso o deploy não publica)
- Repositório → Settings → Pages:
  - Source: **GitHub Actions**
  - Custom domain: `paver.youngempreendimentos.com.br`
- Repositório → Actions:
  - Rodar manualmente o workflow (via `workflow_dispatch`) para publicar imediatamente.
  - Confirmar jobs “build” e “deploy” em verde.

4) Verificação DNS (KingHost)
- Deve existir **apenas**:
  - Tipo: CNAME
  - Nome: `paver`
  - Destino: `eduardotebaldi.github.io`
- Remover registros conflitantes para `paver` (A/AAAA/CNAME duplicado).

5) Validação final
- Abrir `https://paver.youngempreendimentos.com.br` e confirmar que saiu do 404.
- Testar rota interna direta (ex.: `/obras`) para validar SPA redirect no GitHub Pages.

Detalhes técnicos (resumo)
- “There isn't a GitHub Pages site here” = DNS chegou no GitHub, mas publicação ausente/inativa.
- Cobrir `main/master` + `workflow_dispatch` elimina o cenário “não disparou”.
- `CNAME` em `public/` é necessário para o domínio persistir após cada deploy.
