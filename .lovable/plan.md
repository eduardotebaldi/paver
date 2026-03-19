

## Plan: Fix Performance Issues on Linha de Balanço Page

### Problems Identified

1. **`EapMassDateEditor` and `BaselineManager` are always mounted** (lines 258-266 of `LinhaBalanco.tsx`), even when their dialogs are closed. With ~982 EAP items, `buildGroups()`, `editableItems`, and all `useMemo` hooks run on every parent re-render.

2. **Expanding a group renders all items at once.** A single group can have 100+ items, each with 2 `<input type="date">` elements. Date inputs are expensive DOM elements — rendering 200+ simultaneously causes jank and scroll lag.

3. **`groupChangedCount` recalculates via `.filter()` on every render** for every group header row, even collapsed ones.

### Fixes

#### 1. Conditionally render dialogs (`LinhaBalanco.tsx`)

Wrap both components so they only mount when open:

```tsx
{massDateOpen && (
  <EapMassDateEditor open={massDateOpen} ... />
)}
{baselineOpen && (
  <BaselineManager open={baselineOpen} ... />
)}
```

This eliminates all processing of 982 items when the dialogs are closed.

#### 2. Paginate items within expanded groups (`EapMassDateEditor.tsx`)

Add a per-group "visible count" limit (e.g., 30 items). Show a "Mostrar mais" button to load the next batch. This prevents rendering hundreds of date inputs when a large group is expanded.

- Track `visibleCounts` as a `Map<string, number>` state
- Slice `group.items` to `visibleCounts.get(group.key) || 30`
- Show "Mostrar mais (N restantes)" button at the bottom of each group

#### 3. Memoize `groupChangedCount` efficiently

Move the changed-count check inside the collapsed guard — skip the `.filter()` entirely for collapsed groups, and use a simple counter for expanded ones.

### Files to Modify

| File | Change |
|---|---|
| `src/pages/LinhaBalanco.tsx` | Conditional render of EapMassDateEditor and BaselineManager |
| `src/components/EapMassDateEditor.tsx` | Add per-group pagination (30-item batches) |

