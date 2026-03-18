

## Plano: Revisão Completa da Exibição DXF

### Causa Raiz Identificada

O bug principal está no **timing do ResizeObserver**. Em ambos os componentes (`DxfPinCanvas` em `DiarioObraNovo.tsx` e `DxfPlantaViewer.tsx`), o padrão é:

```text
1. Componente renderiza → dxfLoading=true → early return (spinner)
2. useEffect([], []) do ResizeObserver roda → containerRef.current é NULL (div não montada)
3. DXF carrega → early return é removido → div do container aparece no DOM
4. MAS o useEffect NÃO re-executa (deps vazias) → containerSize fica {0, 0}
5. fittedViewport é null → SVG nunca renderiza
```

O container SVG existe no DOM mas com dimensões zero, então `fittedViewport` é sempre `null` e o bloco `{fittedViewport && (...)}` nunca renderiza o SVG.

---

### Correções Necessárias

#### 1. Corrigir ResizeObserver em `DxfPinCanvas` (DiarioObraNovo.tsx, ~linha 115)

Adicionar `dxfData` como dependência do `useEffect` do ResizeObserver, para que ele re-execute quando o container finalmente aparecer no DOM:

```tsx
useEffect(() => {
  const node = containerRef.current;
  if (!node) return;
  const updateSize = () => setCanvasSize({ width: node.clientWidth, height: node.clientHeight });
  updateSize();
  const observer = new ResizeObserver(updateSize);
  observer.observe(node);
  return () => observer.disconnect();
}, [dxfData]); // ← adicionar dxfData como dependência
```

#### 2. Corrigir ResizeObserver em `DxfPlantaViewer.tsx` (~linha 116)

Mesma correção:

```tsx
useEffect(() => {
  const node = svgContainerRef.current;
  if (!node) return;
  const update = () => setContainerSize({ width: node.clientWidth, height: node.clientHeight });
  update();
  const observer = new ResizeObserver(update);
  observer.observe(node);
  return () => observer.disconnect();
}, [dxfData]); // ← adicionar dxfData como dependência
```

#### 3. Adicionar logs de debug temporários

Inserir `console.log` para verificar:
- `dxfData` após parsing (confirmar que layers e paths existem)
- `containerSize` (confirmar que atualiza para valores > 0)
- `fittedViewport` (confirmar que não é null)

Estes logs serão removidos após validação.

#### 4. Fallback de segurança para containerSize

Caso o ResizeObserver demore, usar dimensões fallback baseadas no `style` do container (`60vh` / `65vh`):

```tsx
const effectiveSize = canvasSize.width > 0 && canvasSize.height > 0
  ? canvasSize
  : { width: 800, height: 500 }; // fallback razoável
```

#### 5. Verificar viewBox do DXF (`dxfRenderer.ts`)

O arquivo DXF do usuário tem `$EXTMIN = 1E+20` e `$EXTMAX = 0`, indicando extents inválidos. O renderer já tem fallback para `minX = Infinity`, mas confirmar que as entidades do arquivo geram coordenadas válidas (o que parece ser o caso, já que layers aparecem no painel).

---

### Arquivos a Modificar

| Arquivo | Alteração |
|---|---|
| `src/pages/DiarioObraNovo.tsx` | Fix ResizeObserver deps no `DxfPinCanvas` |
| `src/components/DxfPlantaViewer.tsx` | Fix ResizeObserver deps |
| `src/lib/dxfRenderer.ts` | Nenhuma (já tem fallback adequado) |

### Resultado Esperado

Após as correções, o fluxo será:
1. Componente renderiza → loading spinner
2. DXF carrega → spinner removido → container div monta no DOM
3. ResizeObserver re-executa (dep em `dxfData`) → `containerSize` atualiza
4. `fittedViewport` calcula valores reais → SVG renderiza com as layers visíveis

