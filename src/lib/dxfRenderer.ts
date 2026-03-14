/**
 * Converts parsed DXF entities into SVG path strings, grouped by layer.
 */

export interface DxfLayer {
  name: string;
  color: string;
  visible: boolean;
}

export interface DxfSvgData {
  layers: DxfLayer[];
  pathsByLayer: Map<string, string[]>;
  viewBox: { minX: number; minY: number; width: number; height: number };
}

// AutoCAD Color Index (ACI) → hex color (subset of common colors)
const ACI_COLORS: Record<number, string> = {
  0: '#000000', 1: '#FF0000', 2: '#FFFF00', 3: '#00FF00', 4: '#00FFFF',
  5: '#0000FF', 6: '#FF00FF', 7: '#FFFFFF', 8: '#808080', 9: '#C0C0C0',
  10: '#FF0000', 11: '#FF7F7F', 12: '#CC0000', 14: '#990000',
  30: '#FF7F00', 40: '#FFFF00', 50: '#7FFF00', 60: '#00FF00',
  70: '#00FF7F', 80: '#00FFFF', 90: '#007FFF', 100: '#0000FF',
  110: '#7F00FF', 120: '#FF00FF', 130: '#FF007F',
  250: '#333333', 251: '#555555', 252: '#787878', 253: '#A0A0A0',
  254: '#C8C8C8', 255: '#FFFFFF',
};

function aciToHex(colorIndex: number | undefined): string {
  if (!colorIndex || colorIndex <= 0) return '#888888';
  return ACI_COLORS[colorIndex] || `hsl(${(colorIndex * 2.8) % 360}, 70%, 50%)`;
}

function arcToSvgPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  // DXF angles are in degrees, counter-clockwise from positive X
  const sa = (startAngle * Math.PI) / 180;
  const ea = (endAngle * Math.PI) / 180;
  
  const x1 = cx + r * Math.cos(sa);
  const y1 = cy + r * Math.sin(sa);
  const x2 = cx + r * Math.cos(ea);
  const y2 = cy + r * Math.sin(ea);
  
  let angleDiff = endAngle - startAngle;
  if (angleDiff < 0) angleDiff += 360;
  const largeArc = angleDiff > 180 ? 1 : 0;
  
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
}

export function parseDxfToSvg(dxf: any): DxfSvgData {
  const pathsByLayer = new Map<string, string[]>();
  const layerColors = new Map<string, number>();
  
  // Extract layer info from tables
  if (dxf.tables?.layer?.layers) {
    for (const [name, layer] of Object.entries(dxf.tables.layer.layers) as any[]) {
      layerColors.set(name, layer.color || 7);
    }
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  function track(x: number, y: number) {
    if (isFinite(x) && isFinite(y)) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  function addPath(layer: string, path: string) {
    if (!pathsByLayer.has(layer)) pathsByLayer.set(layer, []);
    pathsByLayer.get(layer)!.push(path);
  }

  for (const entity of dxf.entities || []) {
    const layer = entity.layer || '0';
    
    try {
      switch (entity.type) {
        case 'LINE': {
          const { x: x1, y: y1 } = entity.vertices?.[0] || entity.start || {};
          const { x: x2, y: y2 } = entity.vertices?.[1] || entity.end || {};
          if (x1 != null && y1 != null && x2 != null && y2 != null) {
            track(x1, y1); track(x2, y2);
            addPath(layer, `M ${x1} ${-y1} L ${x2} ${-y2}`);
          }
          break;
        }
        case 'LWPOLYLINE':
        case 'POLYLINE': {
          const verts = entity.vertices || [];
          if (verts.length < 2) break;
          let d = `M ${verts[0].x} ${-verts[0].y}`;
          track(verts[0].x, verts[0].y);
          for (let i = 1; i < verts.length; i++) {
            d += ` L ${verts[i].x} ${-verts[i].y}`;
            track(verts[i].x, verts[i].y);
          }
          if (entity.shape) d += ' Z';
          addPath(layer, d);
          break;
        }
        case 'CIRCLE': {
          const { x: cx, y: cy } = entity.center || {};
          const r = entity.radius;
          if (cx != null && cy != null && r) {
            track(cx - r, cy - r); track(cx + r, cy + r);
            // SVG circle as two arcs
            addPath(layer, `M ${cx - r} ${-cy} A ${r} ${r} 0 1 0 ${cx + r} ${-cy} A ${r} ${r} 0 1 0 ${cx - r} ${-cy}`);
          }
          break;
        }
        case 'ARC': {
          const { x: cx, y: cy } = entity.center || {};
          const r = entity.radius;
          if (cx != null && cy != null && r) {
            track(cx - r, cy - r); track(cx + r, cy + r);
            // Flip Y for SVG (negate angles too)
            const sa = -(entity.endAngle || 0);
            const ea = -(entity.startAngle || 0);
            const path = arcToSvgPath(cx, -cy, r, sa, ea);
            addPath(layer, path);
          }
          break;
        }
        case 'ELLIPSE': {
          const { x: cx, y: cy } = entity.center || {};
          const { x: mx, y: my } = entity.majorAxisEndPoint || {};
          const ratio = entity.axisRatio || 1;
          if (cx != null && cy != null && mx != null) {
            const rx = Math.sqrt(mx * mx + (my || 0) * (my || 0));
            const ry = rx * ratio;
            const angle = Math.atan2(my || 0, mx) * (180 / Math.PI);
            track(cx - rx, cy - ry); track(cx + rx, cy + ry);
            addPath(layer, `M ${cx - rx} ${-cy} A ${rx} ${ry} ${-angle} 1 0 ${cx + rx} ${-cy} A ${rx} ${ry} ${-angle} 1 0 ${cx - rx} ${-cy}`);
          }
          break;
        }
        case 'SPLINE': {
          const pts = entity.controlPoints || entity.fitPoints || [];
          if (pts.length >= 2) {
            let d = `M ${pts[0].x} ${-pts[0].y}`;
            track(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) {
              d += ` L ${pts[i].x} ${-pts[i].y}`;
              track(pts[i].x, pts[i].y);
            }
            addPath(layer, d);
          }
          break;
        }
        case 'POINT': {
          const { x, y } = entity.position || {};
          if (x != null && y != null) {
            track(x, y);
            addPath(layer, `M ${x - 0.5} ${-y} L ${x + 0.5} ${-y} M ${x} ${-y - 0.5} L ${x} ${-y + 0.5}`);
          }
          break;
        }
        case 'INSERT': {
          // Block references — skip for now (complex)
          break;
        }
        default:
          break;
      }
    } catch {
      // Skip malformed entities
    }
  }

  // Add padding
  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 100; maxY = 100; }
  const padding = Math.max(maxX - minX, maxY - minY) * 0.05;
  
  // Build layer list
  const allLayerNames = new Set<string>();
  pathsByLayer.forEach((_, name) => allLayerNames.add(name));
  
  const layers: DxfLayer[] = Array.from(allLayerNames).sort().map(name => ({
    name,
    color: aciToHex(layerColors.get(name)),
    visible: true,
  }));

  return {
    layers,
    pathsByLayer,
    viewBox: {
      minX: minX - padding,
      minY: -(maxY + padding),
      width: (maxX - minX) + padding * 2,
      height: (maxY - minY) + padding * 2,
    },
  };
}
