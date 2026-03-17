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
  5: '#0000FF', 6: '#FF00FF', 7: 'hsl(var(--foreground))', 8: '#808080', 9: '#C0C0C0',
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

/**
 * Convert a bulge value between two polyline vertices into an SVG arc segment.
 * Bulge = tan(included_angle / 4). Positive = CCW, negative = CW.
 */
function bulgeArcSegment(
  x1: number, y1: number,
  x2: number, y2: number,
  bulge: number
): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const chordLen = Math.sqrt(dx * dx + dy * dy);
  if (chordLen < 1e-10) return `L ${x2} ${y2}`;

  const sagitta = Math.abs(bulge) * chordLen / 2;
  const radius = (chordLen * chordLen / 4 + sagitta * sagitta) / (2 * sagitta);

  const largeArc = Math.abs(bulge) > 1 ? 1 : 0;
  const sweep = bulge > 0 ? 1 : 0;

  return `A ${radius} ${radius} 0 ${largeArc} ${sweep} ${x2} ${y2}`;
}

/**
 * Simple cubic B-spline interpolation for SPLINE entities.
 * Converts control points to a smooth SVG path using cubic bezier curves.
 */
function splineToSvgPath(controlPoints: { x: number; y: number }[], closed: boolean): string {
  if (controlPoints.length < 2) return '';
  if (controlPoints.length === 2) {
    return `M ${controlPoints[0].x} ${-controlPoints[0].y} L ${controlPoints[1].x} ${-controlPoints[1].y}`;
  }

  // For 3 points, use a quadratic bezier
  if (controlPoints.length === 3) {
    const [p0, p1, p2] = controlPoints;
    return `M ${p0.x} ${-p0.y} Q ${p1.x} ${-p1.y} ${p2.x} ${-p2.y}`;
  }

  // For 4+ control points, use cubic bezier approximation
  const pts = controlPoints;
  let d = `M ${pts[0].x} ${-pts[0].y}`;

  // Use Catmull-Rom to cubic Bezier conversion for smooth curves
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[Math.min(pts.length - 1, i + 1)];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = -(p1.y + (p2.y - p0.y) / 6);
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = -(p2.y - (p3.y - p1.y) / 6);

    d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${-p2.y}`;
  }

  if (closed) d += ' Z';
  return d;
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

  // Extract block definitions
  const blocks = new Map<string, any[]>();
  if (dxf.blocks) {
    for (const [blockName, block] of Object.entries(dxf.blocks) as any[]) {
      if (block.entities && block.entities.length > 0) {
        blocks.set(blockName, block.entities);
      }
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

  function processEntity(entity: any, offsetX = 0, offsetY = 0, scaleX = 1, scaleY = 1, rotation = 0) {
    const layer = entity.layer || '0';

    // Apply transform: rotate then scale then translate
    function tx(x: number, y: number): [number, number] {
      // Apply rotation
      if (rotation !== 0) {
        const rad = (rotation * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const nx = x * cos - y * sin;
        const ny = x * sin + y * cos;
        x = nx;
        y = ny;
      }
      return [x * scaleX + offsetX, y * scaleY + offsetY];
    }

    try {
      switch (entity.type) {
        case 'LINE': {
          const s = entity.vertices?.[0] || entity.start || {};
          const e = entity.vertices?.[1] || entity.end || {};
          if (s.x != null && s.y != null && e.x != null && e.y != null) {
            const [x1, y1] = tx(s.x, s.y);
            const [x2, y2] = tx(e.x, e.y);
            track(x1, y1); track(x2, y2);
            addPath(layer, `M ${x1} ${-y1} L ${x2} ${-y2}`);
          }
          break;
        }
        case 'LWPOLYLINE':
        case 'POLYLINE': {
          const verts = entity.vertices || [];
          if (verts.length < 2) break;

          const [sx, sy] = tx(verts[0].x, verts[0].y);
          let d = `M ${sx} ${-sy}`;
          track(sx, sy);

          for (let i = 0; i < verts.length - 1; i++) {
            const [cx, cy] = tx(verts[i].x, verts[i].y);
            const [nx, ny] = tx(verts[i + 1].x, verts[i + 1].y);
            track(nx, ny);

            const bulge = verts[i].bulge;
            if (bulge && Math.abs(bulge) > 1e-6) {
              d += ' ' + bulgeArcSegment(cx, -cy, nx, -ny, bulge);
            } else {
              d += ` L ${nx} ${-ny}`;
            }
          }

          // Handle closed polylines: check for bulge on last vertex connecting to first
          if (entity.shape || entity.closed) {
            const lastIdx = verts.length - 1;
            const bulge = verts[lastIdx].bulge;
            const [lx, ly] = tx(verts[lastIdx].x, verts[lastIdx].y);
            if (bulge && Math.abs(bulge) > 1e-6) {
              d += ' ' + bulgeArcSegment(lx, -ly, sx, -sy, bulge);
            }
            d += ' Z';
          }

          addPath(layer, d);
          break;
        }
        case 'CIRCLE': {
          const c = entity.center || {};
          const r = entity.radius;
          if (c.x != null && c.y != null && r) {
            const [cx, cy] = tx(c.x, c.y);
            const sr = r * Math.abs(scaleX); // approximate scaled radius
            track(cx - sr, cy - sr); track(cx + sr, cy + sr);
            addPath(layer, `M ${cx - sr} ${-cy} A ${sr} ${sr} 0 1 0 ${cx + sr} ${-cy} A ${sr} ${sr} 0 1 0 ${cx - sr} ${-cy}`);
          }
          break;
        }
        case 'ARC': {
          const c = entity.center || {};
          const r = entity.radius;
          if (c.x != null && c.y != null && r) {
            const [cx, cy] = tx(c.x, c.y);
            const sr = r * Math.abs(scaleX);
            track(cx - sr, cy - sr); track(cx + sr, cy + sr);
            const sa = -(entity.endAngle || 0);
            const ea = -(entity.startAngle || 0);
            const path = arcToSvgPath(cx, -cy, sr, sa, ea);
            addPath(layer, path);
          }
          break;
        }
        case 'ELLIPSE': {
          const c = entity.center || {};
          const m = entity.majorAxisEndPoint || {};
          const ratio = entity.axisRatio || 1;
          if (c.x != null && c.y != null && m.x != null) {
            const [cx, cy] = tx(c.x, c.y);
            const rx = Math.sqrt(m.x * m.x + (m.y || 0) * (m.y || 0)) * Math.abs(scaleX);
            const ry = rx * ratio;
            const angle = Math.atan2(m.y || 0, m.x) * (180 / Math.PI);
            track(cx - rx, cy - ry); track(cx + rx, cy + ry);
            addPath(layer, `M ${cx - rx} ${-cy} A ${rx} ${ry} ${-angle} 1 0 ${cx + rx} ${-cy} A ${rx} ${ry} ${-angle} 1 0 ${cx - rx} ${-cy}`);
          }
          break;
        }
        case 'SPLINE': {
          const ctrlPts = entity.controlPoints || [];
          const fitPts = entity.fitPoints || [];
          const pts = ctrlPts.length >= 2 ? ctrlPts : fitPts;

          if (pts.length >= 2) {
            // Transform all points
            const transformed = pts.map((p: any) => {
              const [px, py] = tx(p.x, p.y);
              track(px, py);
              return { x: px, y: py };
            });

            const isClosed = entity.closed || entity.shape;
            const d = splineToSvgPath(transformed, !!isClosed);
            if (d) addPath(layer, d);
          }
          break;
        }
        case 'POINT': {
          const p = entity.position || {};
          if (p.x != null && p.y != null) {
            const [px, py] = tx(p.x, p.y);
            track(px, py);
            addPath(layer, `M ${px - 0.5} ${-py} L ${px + 0.5} ${-py} M ${px} ${-py - 0.5} L ${px} ${-py + 0.5}`);
          }
          break;
        }
        case 'SOLID':
        case '3DFACE': {
          // Solid fills / 3D faces - draw as filled polygon outline
          const corners = entity.points || entity.vertices || [];
          if (corners.length >= 3) {
            const tCorners = corners.map((p: any) => {
              const [px, py] = tx(p.x, p.y);
              track(px, py);
              return { x: px, y: py };
            });
            let d = `M ${tCorners[0].x} ${-tCorners[0].y}`;
            for (let i = 1; i < tCorners.length; i++) {
              d += ` L ${tCorners[i].x} ${-tCorners[i].y}`;
            }
            d += ' Z';
            addPath(layer, d);
          }
          break;
        }
        case 'INSERT': {
          // Block references
          const blockName = entity.name;
          const blockEntities = blocks.get(blockName);
          if (!blockEntities) break;

          const insertX = entity.position?.x || entity.x || 0;
          const insertY = entity.position?.y || entity.y || 0;
          const insertScaleX = entity.xScale ?? entity.scaleX ?? 1;
          const insertScaleY = entity.yScale ?? entity.scaleY ?? 1;
          const insertRotation = entity.rotation || 0;

          const [newOffX, newOffY] = tx(insertX, insertY);

          // Recursively process block entities with accumulated transform
          for (const blockEntity of blockEntities) {
            processEntity(
              blockEntity,
              newOffX,
              newOffY,
              scaleX * insertScaleX,
              scaleY * insertScaleY,
              rotation + insertRotation
            );
          }
          break;
        }
        case 'HATCH': {
          // Render hatch boundary paths
          const boundaries = entity.boundaries || entity.boundaryPaths || [];
          for (const boundary of boundaries) {
            const edges = boundary.edges || boundary.polyline || [];
            if (boundary.polyline) {
              const pts = boundary.polyline;
              if (pts.length >= 2) {
                const [sx2, sy2] = tx(pts[0].x, pts[0].y);
                let d = `M ${sx2} ${-sy2}`;
                track(sx2, sy2);
                for (let i = 1; i < pts.length; i++) {
                  const [px, py] = tx(pts[i].x, pts[i].y);
                  track(px, py);
                  d += ` L ${px} ${-py}`;
                }
                d += ' Z';
                addPath(layer, d);
              }
            }
          }
          break;
        }
        default:
          break;
      }
    } catch {
      // Skip malformed entities
    }
  }

  // Process all top-level entities
  for (const entity of dxf.entities || []) {
    processEntity(entity);
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
