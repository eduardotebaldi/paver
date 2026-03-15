

## Deploy via GitHub Pages + Subdomínio DNS

Ótima alternativa. GitHub Pages é gratuito, não precisa de senha FTP, e você só precisa criar um registro CNAME no DNS da KingHost.

### Alterações no projeto

**1. Substituir `.github/workflows/deploy.yml`**
- Remover o deploy FTP
- Novo workflow que faz build e publica no branch `gh-pages` usando `peaceiris/actions-gh-pages`

**2. Adicionar `public/CNAME`**
- Arquivo com o conteúdo `paver.youngempreendimentos.com.br`
- Necessário para o GitHub Pages reconhecer o domínio customizado

**3. Atualizar `vite.config.ts`**
- Não precisa de `base` pois com domínio customizado o GitHub Pages serve da raiz

**4. Remover `public/.htaccess`**
- GitHub Pages não usa Apache, então o `.htaccess` não tem efeito
- Para SPA routing no GitHub Pages, adicionaremos um `public/404.html` que redireciona para `index.html`

### Seus passos (DNS na KingHost)

No painel da KingHost, crie um registro DNS:

| Tipo | Nome | Valor |
|------|------|-------|
| **CNAME** | `paver` | `SEU-USUARIO-GITHUB.github.io` |

E no GitHub (Settings → Pages):
1. Ative GitHub Pages com source: **GitHub Actions**
2. Em Custom domain, digite: `paver.youngempreendimentos.com.br`
3. Marque **Enforce HTTPS**

Não precisa de secrets. Não precisa de senha FTP.

