

## Diagnóstico: Barras/Cores "Explodidas" no Viewer DXF

### Causa Raiz

O problema está na combinação de `strokeWidth` e `vectorEffect="non-scaling-stroke"` na renderização SVG.

Ambos os viewers (`DiarioObraNovo.tsx` linha 334 e `DxfPlantaViewer.tsx` linha 377) renderizam cada path assim:

```tsx
<path d={d} fill="none" stroke={color}
  strokeWidth={viewBox.width * 0.001}
  vectorEffect="non-scaling-stroke" />
```

**O conflito**: `vectorEffect="non-scaling-stroke"` faz com que `strokeWidth` seja interpretado em **pixels de tela**, não em unidades SVG. Porém, `viewBox.width * 0.001` é calculado a partir das coordenadas do DXF — um desenho arquitetônico típico tem dimensões em milímetros (ex: `viewBox.width = 50000`), resultando em `strokeWidth = 50` **pixels**. Isso transforma cada linha do desenho em uma barra grossa e colorida, exatamente como na imagem.

### Correção

#### 1. Fixar strokeWidth em pixels constantes (ambos os viewers)

Substituir `strokeWidth={viewBox.width * 0.001}` por um valor fixo em pixels:

```tsx
strokeWidth={0.5}  // ou 1, fino o suficiente para ver o desenho
vectorEffect="non-scaling-stroke"
```

Isso garante que linhas fiquem finas independente da escala do DXF.

#### 2. Alternativa: remover `vectorEffect` e usar unidade SVG

Se preferirmos que o zoom afete a espessura (comportamento mais natural de CAD):

```tsx
strokeWidth={viewBox.width * 0.001}
// sem vectorEffect
```

Neste caso, `viewBox.width * 0.001` seria relativo ao viewBox SVG (unidades do DXF), o que resulta em espessura proporcional correta.

**Recomendação**: opção 1 (strokeWidth fixo em pixels) — é o padrão mais previsível para viewers web.

### Arquivos a Modificar

| Arquivo | Linha | Alteração |
|---|---|---|
| `src/pages/DiarioObraNovo.tsx` | ~334 | `strokeWidth={0.5}` |
| `src/components/DxfPlantaViewer.tsx` | ~377 | `strokeWidth={0.5}` |

### Resultado Esperado

As linhas do desenho DXF serão renderizadas com 0.5px de espessura constante, revelando a planta arquitetônica corretamente em vez de barras coloridas grossas.

