import React from 'react';
import type { DimensionNode } from '../types';

interface Props {
  skillsPressure: { dimensionNodeId: string; name: string; openCount: number }[];
  dimensionNodes: DimensionNode[];
  onNodeClick?: (nodeId: string, nodeName: string) => void;
}

function demandColor(count: number): { dot: string; bar: string; badge: string } {
  if (count === 0) return { dot: 'bg-green-400', bar: 'bg-green-200', badge: 'bg-green-100 text-green-700' };
  if (count <= 2) return { dot: 'bg-amber-400', bar: 'bg-amber-200', badge: 'bg-amber-100 text-amber-700' };
  return { dot: 'bg-rose-500', bar: 'bg-rose-300', badge: 'bg-rose-100 text-rose-700' };
}

const SkillsPressureMap: React.FC<Props> = ({ skillsPressure, dimensionNodes, onNodeClick }) => {
  if (dimensionNodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-gray-400">
        <p className="text-sm">No capability data available.</p>
      </div>
    );
  }

  const pressureMap = Object.fromEntries(
    skillsPressure.map((p) => [p.dimensionNodeId, p.openCount])
  );

  const maxCount = Math.max(1, ...skillsPressure.map((p) => p.openCount));

  const topLevel = dimensionNodes.filter((n) => n.parentId === null);
  const children = (parentId: string) => dimensionNodes.filter((n) => n.parentId === parentId);

  return (
    <div className="space-y-6">
      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-400" /> No demand</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Moderate (1–2)</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> High (3+)</span>
      </div>

      {topLevel.sort((a, b) => a.orderIndex - b.orderIndex).map((parent) => {
        const childNodes = children(parent.id).sort((a, b) => a.orderIndex - b.orderIndex);

        return (
          <div key={parent.id}>
            <h4 className="text-sm font-semibold text-gray-700 mb-2 pb-1 border-b border-gray-100">{parent.name}</h4>
            <div className="space-y-1.5">
              {childNodes.length === 0 ? (
                (() => {
                  const count = pressureMap[parent.id] ?? 0;
                  const colors = demandColor(count);
                  const barWidth = count > 0 ? Math.max(4, (count / maxCount) * 100) : 0;
                  const clickable = count > 0 && onNodeClick;
                  return (
                    <div
                      key={parent.id}
                      className={`flex items-center gap-3 py-1.5 px-2 rounded-lg ${clickable ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                      onClick={clickable ? () => onNodeClick(parent.id, parent.name) : undefined}
                    >
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${colors.dot}`} />
                      <span className="text-sm text-gray-700 w-36 truncate">{parent.name}</span>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-2 rounded-full ${colors.bar} transition-all`} style={{ width: `${barWidth}%` }} />
                      </div>
                      {count > 0 && (
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${colors.badge}`}>{count}</span>
                      )}
                    </div>
                  );
                })()
              ) : (
                childNodes.map((node) => {
                  const count = pressureMap[node.id] ?? 0;
                  const colors = demandColor(count);
                  const barWidth = count > 0 ? Math.max(4, (count / maxCount) * 100) : 0;
                  const clickable = count > 0 && onNodeClick;
                  return (
                    <div
                      key={node.id}
                      className={`flex items-center gap-3 py-1.5 px-2 rounded-lg ${clickable ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                      onClick={clickable ? () => onNodeClick(node.id, node.name) : undefined}
                    >
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${colors.dot}`} />
                      <span className="text-sm text-gray-700 w-36 truncate">{node.name}</span>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-2 rounded-full ${colors.bar} transition-all`} style={{ width: `${barWidth}%` }} />
                      </div>
                      {count > 0 && (
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${colors.badge}`}>{count}</span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default SkillsPressureMap;
