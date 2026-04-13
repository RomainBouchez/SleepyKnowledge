interface Props {
  icon: string;
  label: string;
  value: string;
  unit?: string;
  color?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendPositive?: boolean;
}

function trendArrow(t: 'up' | 'down' | 'neutral') {
  return t === 'up' ? '▲' : t === 'down' ? '▼' : '─';
}
function trendColor(t: 'up' | 'down' | 'neutral', pos: boolean) {
  if (t === 'neutral') return '#475569';
  const good = '#22C55E', bad = '#EF4444';
  return t === 'up' ? (pos ? good : bad) : (pos ? bad : good);
}

export default function MetricCard({ icon, label, value, unit, color = '#3B82F6', trend, trendPositive = true }: Props) {
  return (
    <div className="card flex-1 flex flex-col gap-0.5 min-w-0">
      <span className="text-xl leading-none mb-1">{icon}</span>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold leading-none" style={{ color, letterSpacing: -0.5 }}>
          {value}
        </span>
        {unit && <span className="text-xs text-sl-gray">{unit}</span>}
      </div>
      <span className="text-[11px] text-sl-gray font-medium tracking-wide truncate">{label}</span>
      {trend && (
        <span className="text-[11px] font-bold mt-1" style={{ color: trendColor(trend, trendPositive) }}>
          {trendArrow(trend)}
        </span>
      )}
    </div>
  );
}
