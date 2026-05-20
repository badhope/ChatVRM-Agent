import type { Entity, Relationship, EntityType, RelationshipType, PathNode } from './types.js';

// ============================================================
// 路径查找器
// ============================================================

/**
 * 构建邻接表
 */
function buildAdjacency(
  entities: Record<string, Entity>,
  relationships: Relationship[],
): Map<string, Array<{ neighborId: string; relType: RelationshipType }>> {
  const adjacency = new Map<string, Array<{ neighborId: string; relType: RelationshipType }>>();

  for (const rel of relationships) {
    // 双向添加
    const fromNeighbors = adjacency.get(rel.fromId);
    const toNeighbors = adjacency.get(rel.toId);

    if (fromNeighbors) {
      fromNeighbors.push({ neighborId: rel.toId, relType: rel.type });
    } else {
      adjacency.set(rel.fromId, [{ neighborId: rel.toId, relType: rel.type }]);
    }

    if (toNeighbors) {
      toNeighbors.push({ neighborId: rel.fromId, relType: rel.type });
    } else {
      adjacency.set(rel.toId, [{ neighborId: rel.fromId, relType: rel.type }]);
    }
  }

  return adjacency;
}

/**
 * 查找与指定实体直接相连的所有实体
 */
export function findAllConnected(
  entities: Record<string, Entity>,
  relationships: Relationship[],
  entityId: string,
): Array<{ entity: Entity; relationship: Relationship }> {
  const results: Array<{ entity: Entity; relationship: Relationship }> = [];

  for (const rel of relationships) {
    let targetId: string | undefined;

    if (rel.fromId === entityId) {
      targetId = rel.toId;
    } else if (rel.toId === entityId) {
      targetId = rel.fromId;
    }

    if (targetId && entities[targetId]) {
      results.push({
        entity: entities[targetId],
        relationship: rel,
      });
    }
  }

  return results;
}

/**
 * 使用 DFS 查找两个实体之间的所有路径
 *
 * @param entities      实体字典
 * @param relationships 关系数组
 * @param fromId        起始实体 ID
 * @param toId          目标实体 ID
 * @param maxDepth      最大搜索深度，默认 5
 * @returns 路径数组（每条路径是一系列 PathNode），找不到则返回空数组
 */
export function findPath(
  entities: Record<string, Entity>,
  relationships: Relationship[],
  fromId: string,
  toId: string,
  maxDepth = 5,
): PathNode[][] {
  if (!entities[fromId] || !entities[toId]) return [];
  if (fromId === toId) return [];

  const allPaths: PathNode[][] = [];

  // 构建邻接表
  const adjacency = buildAdjacency(entities, relationships);

  // DFS
  const visited = new Set<string>();
  const currentPath: PathNode[] = [];

  const startEntity = entities[fromId];
  currentPath.push({
    entityId: fromId,
    label: startEntity.label,
    type: startEntity.type,
    relationshipType: 'related_to', // 起始节点无关系类型
  });

  const dfs = (nodeId: string, depth: number): void => {
    if (depth > maxDepth) return;
    if (nodeId === toId) {
      allPaths.push([...currentPath]);
      return;
    }

    visited.add(nodeId);
    const neighbors = adjacency.get(nodeId) || [];

    for (const { neighborId, relType } of neighbors) {
      if (visited.has(neighborId)) continue;

      const neighborEntity = entities[neighborId];
      if (!neighborEntity) continue;

      currentPath.push({
        entityId: neighborId,
        label: neighborEntity.label,
        type: neighborEntity.type,
        relationshipType: relType,
      });

      dfs(neighborId, depth + 1);

      currentPath.pop();
    }

    visited.delete(nodeId);
  };

  dfs(fromId, 0);

  // 按路径长度排序（短路径优先）
  allPaths.sort((a, b) => a.length - b.length);
  return allPaths;
}
