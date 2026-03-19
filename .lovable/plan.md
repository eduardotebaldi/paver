

## Plano: Performance Definitiva da Linha de Balanço

### Diagnóstico Final

Foram identificados 5 gargalos concretos que, combinados, travam a página:

1. **`MultiSubBarShape` recriado a cada render** (linha 342 de `LinhaBalancoFullChart.tsx`): definido dentro do corpo do componente, forçando o Recharts a desmontar e remontar todos os SVGs do gráfico a cada mudança de estado.

2. **Recharts renderiza centenas de SVGs de uma vez**: para a obra "Morada da Coxilha" (643 itens, 23 pacotes x 9 serviços), o gráfico gera dezenas de `<ReferenceArea>` para week bands + sub-barras com `<rect>`, `<text>`, `<clipPath>` por linha. Tudo isso renderiza de uma vez, bloqueando o main thread.

3. **`fetchEapItems` faz 2 chamadas sequenciais** (busca todos os itens + RPC `get_eap_avanco_sums`) antes de retornar qualquer dado ao componente.

4. **O modal Datas (`EapMassDateEditor`) renderiza inputs pesados dentro de um Dialog**, que força layout recalculations no overlay do dialog a cada scroll.

5. **`isChartReady` com timer de 60ms** é insuficiente para defer real e não impede o bloqueio do main thread quando os dados processam.

### Solução em 4 Frentes

#### 1. Gráfico: Modo Resumo por Padrão (Velocidade Máxima)

Substituir o gráfico pesado por uma **tabela resumo leve** que carrega instantaneamente. O gráfico completo será carregado apenas quando o usuário clicar em "Ver Gráfico".

- Criar componente `LinhaBalancoSummaryTable` que mostra uma tabela com: Nome do grupo, Qtd de itens, Avanço médio (barra de progresso CSS pura), Período
- O gráfico Recharts completo será acessível via botão "Ver Gráfico Completo", carregado com `React.lazy`
- Isso elimina o processamento pesado de SVGs no carregamento inicial

#### 2. Mover `MultiSubBarShape` para fora do componente

Extrair `MultiSubBarShape` para fora do corpo de `LinhaBalancoFullChart`, passando `activeDomain`, `colorMap` e `handleBarClick` via closure ou props. Isso evita que o Recharts recrie todos os elementos SVG a cada re-render.

#### 3. Editor de Datas: Página Dedicada (`/datas-eap`)

Mover o editor de datas para uma rota própria, eliminando o Dialog pesado:

- Nova rota `/datas-eap` com seletor de obra no topo
- Mesma funcionalidade atual mas renderizada em página inteira
- Sem overlay de Dialog, o scroll funciona nativamente sem recálculos de layout
- Virtualização com `@tanstack/react-virtual` para renderizar apenas as linhas visíveis (resolve de vez o problema de 600+ date inputs)
- O botão "Datas" na Linha de Balanço vira um link para `/datas-eap?obra={id}`

#### 4. Reduzir `weekBands` do gráfico

Limitar as `ReferenceArea` de week bands para no máximo 20 bandas visíveis (as do viewport atual de zoom). Com domínios longos, o gráfico atualmente gera 50+ `<ReferenceArea>` desnecessárias.

### Arquivos a Modificar/Criar

| Arquivo | Ação |
|---|---|
| `src/components/LinhaBalancoSummaryTable.tsx` | **Novo** - Tabela resumo leve |
| `src/components/LinhaBalancoFullChart.tsx` | Extrair `MultiSubBarShape`, limitar weekBands |
| `src/pages/LinhaBalanco.tsx` | Trocar gráfico por resumo + botão, remover modal Datas |
| `src/pages/DatasEap.tsx` | **Novo** - Página dedicada de edição de datas |
| `src/App.tsx` | Adicionar rota `/datas-eap` |
| `src/components/AppSidebar.tsx` | Adicionar link "Datas EAP" no menu |
| `package.json` | Adicionar `@tanstack/react-virtual` |

### Resultado Esperado

- Página Linha de Balanço carrega em menos de 1 segundo (tabela resumo leve)
- Gráfico completo carrega sob demanda com loading state
- Edição de datas em página dedicada, sem travamentos, com virtualização
- Scroll suave em todos os cenários

