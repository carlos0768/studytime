'use client';

interface SaunaClockProps {
  elapsedSeconds: number;
}

const CYCLE_SECONDS = 1800; // 30 minutes per revolution

// Sauna-style color sections (5 min each, warm gradient)
const SECTION_COLORS = [
  '#2dd4a8', // 0-5min: teal (relaxed)
  '#4ade80', // 5-10min: green
  '#a3e635', // 10-15min: yellow-green
  '#facc15', // 15-20min: yellow
  '#f97316', // 20-25min: orange
  '#ef4444', // 25-30min: red (limit zone)
];

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const start = polarToCartesian(cx, cy, r, startDeg);
  const end = polarToCartesian(cx, cy, r, endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

export function SaunaClock({ elapsedSeconds }: SaunaClockProps) {
  const cycleSeconds = elapsedSeconds % CYCLE_SECONDS;
  const angle = (cycleSeconds / CYCLE_SECONDS) * 360;
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const cx = 100;
  const cy = 100;
  const outerR = 88;
  const innerR = 72;
  const tickOuterR = 90;
  const tickInnerMajor = 76;
  const tickInnerMinor = 82;

  // Current section index (which 5-min block we're in within the cycle)
  const currentSection = Math.floor(cycleSeconds / 300);

  return (
    <div className="relative" style={{ width: 200, height: 200 }}>
      <svg viewBox="0 0 200 200" width={200} height={200}>
        {/* Background circle */}
        <circle cx={cx} cy={cy} r={outerR} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={1} />

        {/* Color arc sections */}
        {SECTION_COLORS.map((color, i) => {
          const startDeg = i * 60;
          const endDeg = (i + 1) * 60;
          const isFilled = i < currentSection;
          const isCurrentSection = i === currentSection;
          const sectionStartSec = i * 300;
          const sectionProgress = isCurrentSection
            ? Math.min((cycleSeconds - sectionStartSec) / 300, 1)
            : 0;

          if (!isFilled && !isCurrentSection) {
            // Unfilled section — dim outline
            return (
              <path
                key={i}
                d={arcPath(cx, cy, (outerR + innerR) / 2, startDeg + 0.5, endDeg - 0.5)}
                fill="none"
                stroke={color}
                strokeWidth={outerR - innerR}
                opacity={0.08}
              />
            );
          }

          if (isFilled) {
            // Fully filled section
            return (
              <path
                key={i}
                d={arcPath(cx, cy, (outerR + innerR) / 2, startDeg + 0.5, endDeg - 0.5)}
                fill="none"
                stroke={color}
                strokeWidth={outerR - innerR}
                opacity={0.3}
              />
            );
          }

          // Partially filled current section
          const partialEndDeg = startDeg + sectionProgress * 60;
          return (
            <g key={i}>
              {/* Dim background for full section */}
              <path
                d={arcPath(cx, cy, (outerR + innerR) / 2, startDeg + 0.5, endDeg - 0.5)}
                fill="none"
                stroke={color}
                strokeWidth={outerR - innerR}
                opacity={0.08}
              />
              {/* Filled portion */}
              {sectionProgress > 0.01 && (
                <path
                  d={arcPath(cx, cy, (outerR + innerR) / 2, startDeg + 0.5, Math.max(partialEndDeg, startDeg + 1))}
                  fill="none"
                  stroke={color}
                  strokeWidth={outerR - innerR}
                  opacity={0.3}
                />
              )}
            </g>
          );
        })}

        {/* Tick marks */}
        {Array.from({ length: 30 }, (_, i) => {
          const deg = i * 12; // 360/30 = 12 degrees per minute
          const isMajor = i % 5 === 0;
          const start = polarToCartesian(cx, cy, tickOuterR, deg);
          const end = polarToCartesian(cx, cy, isMajor ? tickInnerMajor : tickInnerMinor, deg);
          return (
            <line
              key={`tick-${i}`}
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              stroke="rgba(255,255,255,0.2)"
              strokeWidth={isMajor ? 2 : 1}
              strokeLinecap="round"
            />
          );
        })}

        {/* 5-minute labels */}
        {[0, 5, 10, 15, 20, 25].map((min, i) => {
          const deg = i * 60;
          const pos = polarToCartesian(cx, cy, 64, deg);
          return (
            <text
              key={`label-${min}`}
              x={pos.x}
              y={pos.y}
              textAnchor="middle"
              dominantBaseline="central"
              fill="rgba(255,255,255,0.2)"
              fontSize={10}
              fontFamily="var(--font-mono)"
            >
              {min}
            </text>
          );
        })}

        {/* Clock hand */}
        {(() => {
          const handEnd = polarToCartesian(cx, cy, innerR - 8, angle);
          const currentColor = SECTION_COLORS[Math.min(currentSection, 5)];
          return (
            <line
              x1={cx}
              y1={cy}
              x2={handEnd.x}
              y2={handEnd.y}
              stroke={currentColor}
              strokeWidth={2}
              strokeLinecap="round"
              opacity={0.7}
            />
          );
        })()}

        {/* Center dot */}
        <circle cx={cx} cy={cy} r={3} fill="rgba(255,255,255,0.3)" />

        {/* Digital time display */}
        <text
          x={cx}
          y={cy + 28}
          textAnchor="middle"
          dominantBaseline="central"
          fill="rgba(255,255,255,0.35)"
          fontSize={16}
          fontFamily="var(--font-mono)"
        >
          {timeStr}
        </text>
      </svg>
    </div>
  );
}
