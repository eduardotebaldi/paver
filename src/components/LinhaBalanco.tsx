import { useMemo } from 'react';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { EapItem } from '@/services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  eapItems: EapItem[];
  mode: 'pacote' | 'servico';
}

const chartConfig: ChartConfig = {
  previsto: { label: 'Previsto', color: 'hsl(var(--primary))' },
  realizado: { label: 'Realizado', color: 'hsl(var(--accent))' },
  base: { label: 'Base', color: 'hsl(var(--muted-foreground))' },
};

export default function LinhaBalanco({ eapItems, mode }: Props) {
  const items = eapItems.filter(i => i.tipo === 'item');

  const chartData = useMemo(() => {
    const map = new Map<string, { base: number[]; previsto: number[]; realizado: number[] }>();

    for (const item of items) {
      const key = mode === 'pacote' ? (item.pacote || 'Sem pacote') : (item.lote || 'Sem classificação');
      if (!map.has(key)) map.set(key, { base: [], previsto: [], realizado: [] });
      const entry = map.get(key)!;
      entry.base.push(item.avanco_base || 0);
      entry.previsto.push(item.avanco_previsto || 0);
      entry.realizado.push(item.avanco_realizado || 0);
    }

    return Array.from(map.entries()).map(([name, data]) => {
      const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
      return {
        name: name.length > 25 ? name.substring(0, 22) + '...' : name,
        fullName: name,
        base: Number(avg(data.base).toFixed(1)),
        previsto: Number(avg(data.previsto).toFixed(1)),
        realizado: Number(avg(data.realizado).toFixed(1)),
        count: data.base.length,
      };
    });
  }, [items, mode]);

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <p className="text-sm text-muted-foreground font-body">Importe uma EAP para visualizar a Linha de Balanço</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-lg">
          Linha de Balanço — por {mode === 'pacote' ? 'Pacote de Trabalho' : 'Tipo de Serviço'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[400px] w-full">
          <ComposedChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
              fontSize={11}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={180}
              fontSize={11}
              tick={{ fill: 'hsl(var(--foreground))' }}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) => {
                    const item = payload?.[0]?.payload;
                    return item?.fullName || '';
                  }}
                  formatter={(value, name) => {
                    return [`${value}%`, chartConfig[name as keyof typeof chartConfig]?.label || name];
                  }}
                />
              }
            />
            <Legend
              formatter={(value) => chartConfig[value as keyof typeof chartConfig]?.label || value}
            />
            <Bar dataKey="base" fill="hsl(var(--muted-foreground))" opacity={0.3} barSize={8} radius={[0, 4, 4, 0]} />
            <Bar dataKey="previsto" fill="hsl(var(--primary))" barSize={8} radius={[0, 4, 4, 0]} />
            <Bar dataKey="realizado" fill="hsl(var(--accent))" barSize={8} radius={[0, 4, 4, 0]} />
          </ComposedChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
