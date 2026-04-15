interface Props {
  icon: string;
  label: string;
  value: string;
  unit?: string;
  color?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendPositive?: boolean;
  onClick?: () => void;
}

function trendArrow(t: 'up' | 'down' | 'neutral') {
  return t === 'up' ? '▲' : t === 'down' ? '▼' : '─';
}
function trendColor(t: 'up' | 'down' | 'neutral', pos: boolean) {
  if (t === 'neutral') return '#3d3330';
  const good = '#4caf78', bad = '#e05a4a';
  return t === 'up' ? (pos ? good : bad) : (pos ? bad : good);
}

export default function MetricCard({
  icon, label, value, unit,
  color = '#ff6b35',
  trend, trendPositive = true, onClick,
}: Props) {
  return (
    <div
      className={`card flex-1 flex flex-col gap-0.5 min-w-0 ${onClick ? 'cursor-pointer active:scale-[0.97] transition-transform' : ''}`}
      style={{ background: '#131110', borderColor: '#2a2320' }}
      onClick={onClick}
    >
      <span className="text-lg leading-none mb-1 opacity-80">{icon}</span>
      <div className="flex items-baseline gap-1">
        <span
          className="text-2xl font-black leading-none"
          style={{ color, letterSpacing: -0.5 }}>
          {value}
        </span>
        {unit && <span className="text-xs font-semibold" style={{ color, opacity: 0.55 }}>{unit}</span>}
      </div>
      <span className="text-[11px] font-semibold tracking-wide truncate" style={{ color: '#7a6e6a' }}>{label}</span>
      {trend && (
        <span className="text-[11px] font-bold mt-0.5" style={{ color: trendColor(trend, trendPositive) }}>
          {trendArrow(trend)}
        </span>
      )}
    </div>
  );
}
