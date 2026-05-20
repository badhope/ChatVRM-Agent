import graphlib from 'graphlib';
import type { Graph as GraphType } from 'graphlib';
const { Graph, alg } = graphlib;

/**
 * 图节点属性类型
 */
export type NodeAttributes = Record<string, unknown>;

/**
 * 图边属性类型
 */
export type EdgeAttributes = Record<string, unknown>;

/**
 * 边对象
 */
export interface Edge {
  v: string;  // 起始节点
  w: string;  // 目标节点
  name?: string;  // 边名称（可选）
}

/**
 * Dijkstra 结果
 */
export interface DijkstraResult {
  distance: number;
  predecessor?: string;
}

/** graphlib 内部边类型 */
interface GraphlibEdge {
  v: string;
  w: string;
  name?: string;
}

/** graphlib dijkstra 返回的结果类型 */
interface DijkstraInfo {
  distance: number;
  predecessor?: string;
}

/**
 * 统一的图包装器
 * 基于 graphlib 提供清晰的图操作 API
 */
export class GraphWrapper {
  private graph: GraphType;

  /**
   * 创建图实例
   * @param directed 是否为有向图，默认 true
   * @param compound 是否支持复合节点，默认 false
   */
  constructor(directed = true, compound = false) {
    this.graph = new Graph({ directed, compound, multigraph: false });
  }

  // ============================================================
  // 基本节点操作
  // ============================================================

  /**
   * 添加节点
   * @param id 节点 ID
   * @param attrs 节点属性
   */
  addNode(id: string, attrs?: NodeAttributes): void {
    this.graph.setNode(id, attrs ?? {});
  }

  /**
   * 删除节点
   * @param id 节点 ID
   * @returns 是否删除成功
   */
  removeNode(id: string): boolean {
    if (!this.graph.hasNode(id)) return false;
    this.graph.removeNode(id);
    return true;
  }

  /**
   * 检查节点是否存在
   * @param id 节点 ID
   */
  hasNode(id: string): boolean {
    return this.graph.hasNode(id);
  }

  /**
   * 获取节点属性
   * @param id 节点 ID
   */
  getNodeAttrs<T = NodeAttributes>(id: string): T | undefined {
    return this.graph.node(id) as T | undefined;
  }

  /**
   * 设置节点属性
   * @param id 节点 ID
   * @param attrs 节点属性
   */
  setNodeAttrs(id: string, attrs: NodeAttributes): void {
    this.graph.setNode(id, attrs);
  }

  // ============================================================
  // 基本边操作
  // ============================================================

  /**
   * 添加边
   * @param from 起始节点 ID
   * @param to 目标节点 ID
   * @param attrs 边属性
   */
  addEdge(from: string, to: string, attrs?: EdgeAttributes): void {
    this.graph.setEdge(from, to, attrs ?? {});
  }

  /**
   * 删除边
   * @param from 起始节点 ID
   * @param to 目标节点 ID
   * @returns 是否删除成功
   */
  removeEdge(from: string, to: string): boolean {
    if (!this.graph.hasEdge(from, to)) return false;
    this.graph.removeEdge(from, to);
    return true;
  }

  /**
   * 检查边是否存在
   * @param from 起始节点 ID
   * @param to 目标节点 ID
   */
  hasEdge(from: string, to: string): boolean {
    return this.graph.hasEdge(from, to);
  }

  /**
   * 获取边属性
   * @param from 起始节点 ID
   * @param to 目标节点 ID
   */
  getEdgeAttrs<T = EdgeAttributes>(from: string, to: string): T | undefined {
    return this.graph.edge(from, to) as T | undefined;
  }

  /**
   * 设置边属性
   * @param from 起始节点 ID
   * @param to 目标节点 ID
   * @param attrs 边属性
   */
  setEdgeAttrs(from: string, to: string, attrs: EdgeAttributes): void {
    this.graph.setEdge(from, to, attrs);
  }

  // ============================================================
  // 邻接查询
  // ============================================================

  /**
   * 获取节点的邻居节点（无向图：所有相连节点）
   * @param id 节点 ID
   */
  neighbors(id: string): string[] {
    return this.graph.neighbors(id) ?? [];
  }

  /**
   * 获取节点的前驱节点（有向图：指向该节点的节点）
   * @param id 节点 ID
   */
  predecessors(id: string): string[] {
    return this.graph.predecessors(id) ?? [];
  }

  /**
   * 获取节点的后继节点（有向图：该节点指向的节点）
   * @param id 节点 ID
   */
  successors(id: string): string[] {
    return this.graph.successors(id) ?? [];
  }

  // ============================================================
  // 批量查询
  // ============================================================

  /**
   * 获取所有节点 ID
   */
  nodes(): string[] {
    return this.graph.nodes();
  }

  /**
   * 获取所有边
   */
  edges(): Edge[] {
    const graphEdges = this.graph.edges() as GraphlibEdge[];
    return graphEdges.map((e) => ({ v: e.v, w: e.w }));
  }

  /**
   * 获取节点数量
   */
  nodeCount(): number {
    return this.graph.nodeCount();
  }

  /**
   * 获取边数量
   */
  edgeCount(): number {
    return this.graph.edgeCount();
  }

  // ============================================================
  // 图算法
  // ============================================================

  /**
   * Dijkstra 最短路径算法
   * @param source 起始节点 ID
   * @param weightFunc 权重函数，默认边权重为 1
   * @returns 每个节点到源节点的最短距离和前驱
   */
  dijkstra(
    source: string,
    weightFunc?: (e: Edge) => number,
  ): Record<string, DijkstraResult> {
    const weight = weightFunc ?? ((): number => 1);
    const result = alg.dijkstra(this.graph, source, weight) as Record<string, DijkstraInfo>;

    const mapped: Record<string, DijkstraResult> = {};
    for (const node of Object.keys(result)) {
      const info = result[node];
      mapped[node] = {
        distance: info.distance,
        predecessor: info.predecessor,
      };
    }
    return mapped;
  }

  /**
   * 查找两节点间的最短路径
   * @param from 起始节点 ID
   * @param to 目标节点 ID
   * @param weightFunc 权重函数，默认边权重为 1
   * @returns 最短路径节点列表，不存在则返回空数组
   */
  shortestPath(
    from: string,
    to: string,
    weightFunc?: (e: Edge) => number,
  ): string[] {
    if (!this.hasNode(from) || !this.hasNode(to)) return [];
    if (from === to) return [from];

    const result = this.dijkstra(from, weightFunc);
    const targetInfo = result[to];

    if (targetInfo.distance === Infinity) return [];

    // 回溯路径
    const path: string[] = [to];
    let current: string | undefined = to;

    while (current && current !== from) {
      const info: DijkstraResult | undefined = result[current];
      if (!info || !info.predecessor) break;
      path.unshift(info.predecessor);
      current = info.predecessor;
    }

    return path[0] === from ? path : [];
  }

  /**
   * 检测图中的环
   * @returns 所有环（每个环是节点 ID 数组）
   */
  findCycles(): string[][] {
    return alg.findCycles(this.graph);
  }

  /**
   * 检查图是否有环
   */
  hasCycles(): boolean {
    return this.findCycles().length > 0;
  }

  /**
   * 拓扑排序
   * @returns 拓扑排序结果，有环时返回 null
   */
  topsort(): string[] | null {
    try {
      return alg.topsort(this.graph);
    } catch {
      return null;
    }
  }

  /**
   * 检查图是否为有向无环图 (DAG)
   */
  isAcyclic(): boolean {
    return alg.isAcyclic(this.graph);
  }

  // ============================================================
  // 图属性
  // ============================================================

  /**
   * 检查是否为有向图
   */
  isDirected(): boolean {
    return this.graph.isDirected();
  }

  /**
   * 获取图的源节点（无入边的节点）
   */
  sources(): string[] {
    return this.graph.sources();
  }

  /**
   * 获取图的汇节点（无出边的节点）
   */
  sinks(): string[] {
    return this.graph.sinks();
  }

  // ============================================================
  // 导入导出
  // ============================================================

  /**
   * 导出为 JSON 格式
   */
  toJSON(): { nodes: { v: string; value: unknown }[]; edges: { v: string; w: string; value: unknown }[]; options: { directed: boolean; multigraph: boolean; compound: boolean } } {
    const nodeEntries: { v: string; value: unknown }[] = [];
    const edgeEntries: { v: string; w: string; value: unknown }[] = [];

    for (const v of this.graph.nodes()) {
      nodeEntries.push({ v, value: this.graph.node(v) });
    }

    for (const e of this.graph.edges() as GraphlibEdge[]) {
      edgeEntries.push({ v: e.v, w: e.w, value: this.graph.edge(e.v, e.w) });
    }

    return {
      nodes: nodeEntries,
      edges: edgeEntries,
      options: {
        directed: this.graph.isDirected(),
        multigraph: false,
        compound: this.graph.isCompound(),
      },
    };
  }

  /**
   * 从 JSON 格式导入
   * @param json JSON 数据
   */
  static fromJSON(json: { nodes: { v: string; value: unknown }[]; edges: { v: string; w: string; value: unknown }[]; options: { directed: boolean; multigraph: boolean; compound: boolean } }): GraphWrapper {
    const { options, nodes, edges } = json;
    const wrapper = new GraphWrapper(options.directed, options.compound);

    for (const n of nodes) {
      wrapper.graph.setNode(n.v, n.value);
    }

    for (const e of edges) {
      wrapper.graph.setEdge(e.v, e.w, e.value);
    }

    return wrapper;
  }

  /**
   * 获取底层 graphlib 实例（高级用法）
   */
  getUnderlyingGraph(): GraphType {
    return this.graph;
  }

  /**
   * 清空图
   */
  clear(): void {
    for (const node of this.nodes()) {
      this.graph.removeNode(node);
    }
  }
}
