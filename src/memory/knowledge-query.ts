import type {
  EntityType,
  RelationshipType,
  Entity,
  Relationship,
  PathNode,
} from './knowledge-types.js';

/**
 * 知识图谱查询方法
 * 从 KnowledgeGraph 类中提取的查询相关方法，以独立函数形式提供。
 * 这些方法接收图谱数据作为参数，不依赖类实例。
 */

/**
 * 获取与指定实体相关的实体
 * @param entities       实体字典
 * @param relationships  关系数组
 * @param entityId       实体 ID
 * @param type           可选，按关系类型过滤
 * @returns 相关实体列表（附带关系信息）
 */
export function getRelated(
  entities: Record<string, Entity>,
  relationships: Relationship[],
  entityId: string,
  type?: RelationshipType,
): Array<{ entity: Entity; relationship: Relationship }> {
  const results: Array<{ entity: Entity; relationship: Relationship }> = [];

  for (const rel of relationships) {
    if (type && rel.type !== type) continue;

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
 * 多条件查询实体
 * @param entities   实体字典
 * @param type       可选，按实体类型过滤
 * @param attributes 可选，按属性键值对过滤（全部匹配）
 * @returns 匹配的实体列表
 */
export function query(
  entities: Record<string, Entity>,
  type?: EntityType,
  attributes?: Record<string, string>,
): Entity[] {
  let results = Object.values(entities);

  if (type) {
    results = results.filter((e) => e.type === type);
  }

  if (attributes) {
    results = results.filter((e) => {
      for (const [key, value] of Object.entries(attributes)) {
        if (e.attributes[key] !== value) return false;
      }
      return true;
    });
  }

  return results;
}

/**
 * DFS 路径搜索：查找两个实体之间的路径
 * @param entities      实体字典
 * @param relationships 关系数组
 * @param fromId        起始实体 ID
 * @param toId          目标实体 ID
 * @param maxDepth      最大搜索深度，默认 5
 * @returns 路径数组（每条路径是一系列 PathNode），找不到则返回空数组
 */
export function findPaths(
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
