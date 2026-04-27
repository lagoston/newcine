import React from 'react';
import { useTranslation } from 'react-i18next';

interface PentagonGraphProps {
  points: { e: number; i: number; c: number; s: number; r: number };
  subcategoryId: string;
}

const getSubcategoryColor = (id: string): string => {
  if (!id) return '#3b82f6';
  const thirdLetter = id?.charAt(2);
  const colors: Record<string, string> = {
    'A': '#fbbf24',
    'B': '#8b5cf6',
    'K': '#ef4444',
    'X': '#3b82f6',
    'D': '#6b7280',
    'L': '#10b981',
  };
  return colors[thirdLetter] || '#3b82f6';
};

const PentagonGraph: React.FC<PentagonGraphProps> = ({ points, subcategoryId }) => {
  const { t } = useTranslation();
  const size = 280;
  const center = size / 2;
  const radius = size / 2 - 40;

  const maxPoint = Math.max(points.e, points.i, points.c, points.s, points.r, 1);
  const normalized = {
    e: (points.e / maxPoint) * 100,
    i: (points.i / maxPoint) * 100,
    c: (points.c / maxPoint) * 100,
    s: (points.s / maxPoint) * 100,
    r: (points.r / maxPoint) * 100,
  };

  const color = getSubcategoryColor(subcategoryId);
  const angle = (Math.PI * 2) / 5;
  const labels = ['E', 'I', 'C', 'S', 'R'];
  const labelNames: Record<string, string> = {
    'E': t('oracle.spectrum.E'),
    'I': t('oracle.spectrum.I'),
    'C': t('oracle.spectrum.C'),
    'S': t('oracle.spectrum.S'),
    'R': t('oracle.spectrum.R'),
  };
  const values = [normalized.e, normalized.i, normalized.c, normalized.s, normalized.r];

  const getPoint = (index: number, value: number) => {
    const pointRadius = (radius * value) / 100;
    const x = center + pointRadius * Math.sin(angle * index - Math.PI / 2);
    const y = center - pointRadius * Math.cos(angle * index - Math.PI / 2);
    return { x, y };
  };

  const getLabelPoint = (index: number) => {
    const labelRadius = radius + 25;
    const x = center + labelRadius * Math.sin(angle * index - Math.PI / 2);
    const y = center - labelRadius * Math.cos(angle * index - Math.PI / 2);
    return { x, y };
  };

  const dataPoints = values.map((value, i) => getPoint(i, value));
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
  const gridLevels = [20, 40, 60, 80, 100];

  return (
    <svg width={size} height={size} className="drop-shadow-lg">
      {gridLevels.map((level) => {
        const gridPoints = labels.map((_, i) => getPoint(i, level));
        const gridPath = gridPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
        return (
          <path key={level} d={gridPath} fill="none" stroke="#ffffff15" strokeWidth="1" />
        );
      })}
      {labels.map((_, i) => {
        const point = getPoint(i, 100);
        return (
          <line key={`axis-${i}`} x1={center} y1={center} x2={point.x} y2={point.y} stroke="#ffffff15" strokeWidth="1" />
        );
      })}
      <path d={dataPath} fill={`${color}40`} stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
      {dataPoints.map((point, i) => (
        <circle key={`point-${i}`} cx={point.x} cy={point.y} r="4" fill={color} stroke="#fff" strokeWidth="2" />
      ))}
      {labels.map((label, i) => {
        const labelPoint = getLabelPoint(i);
        return (
          <g key={`label-${i}`} className="cursor-help">
            <title>{labelNames[label]}</title>
            <text
              x={labelPoint.x}
              y={labelPoint.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="text-lg font-bold fill-white"
              style={{ pointerEvents: 'all' }}
            >
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

export default PentagonGraph;
