

## Deploy Automático para KingHost via GitHub Actions

Você não precisa rodar nenhum comando manualmente. Vamos configurar um **GitHub Action** que, a cada push no repositório, faz o build e envia os arquivos automaticamente para a KingHost via FTP.

### Como funciona

1. Você faz alterações no Lovable → o código vai automaticamente para o GitHub
2. O GitHub Action detecta o push, roda `npm install` e `npm run build`
3. Os arquivos da pasta `dist/` são enviados via FTP para a KingHost

### O que será criado/modificado

**Arquivo novo: `.github/workflows/deploy.yml`**
- Workflow que roda em cada push na branch `main`
- Usa Node.js para fazer o build
- Usa a action `SamKirkland/FTP-Deploy-Action` para enviar via FTP

**Arquivo novo: `public/.htaccess`**
- Configuração Apache para roteamento SPA (necessário para que as rotas do React funcionem)

### Secrets do GitHub necessários

Você precisará configurar 3 secrets no repositório GitHub (Settings → Secrets → Actions):

| Secret | Valor |
|--------|-------|
| `FTP_SERVER` | Endereço FTP da KingHost (ex: `ftp.seudominio.com.br`) |
| `FTP_USERNAME` | Seu usuário FTP |
| `FTP_PASSWORD` | Sua senha FTP |

### Passos para você

1. Eu crio os arquivos no projeto
2. Você vai no GitHub → Settings → Secrets and variables → Actions
3. Adiciona os 3 secrets acima com os dados da KingHost
4. Pronto — cada alteração no Lovable será publicada automaticamente

