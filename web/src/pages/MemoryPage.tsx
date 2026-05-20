import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Tabs } from '@/components/ui/Tabs';
import { Brain, Database, Search, FileText, Link2, Inbox } from 'lucide-react';
import { useState } from 'react';

const stats = [
  { label: 'Total Memories', value: '1,284', icon: <Database size={16} /> },
  { label: 'Knowledge Graphs', value: '12', icon: <Link2 size={16} /> },
  { label: 'Documents', value: '56', icon: <FileText size={16} /> },
  { label: 'Active Sessions', value: '3', icon: <Brain size={16} /> },
];

const placeholderMemories = [
  { id: 1, title: 'Auth module architecture', type: 'knowledge', tags: ['auth', 'architecture'] },
  { id: 2, title: 'API endpoint patterns', type: 'pattern', tags: ['api', 'rest'] },
  { id: 3, title: 'Database schema v2', type: 'knowledge', tags: ['db', 'schema'] },
  { id: 4, title: 'Error handling best practices', type: 'pattern', tags: ['error', 'best-practice'] },
  { id: 5, title: 'Component design system', type: 'knowledge', tags: ['ui', 'components'] },
];

export default function MemoryPage() {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredMemories = searchQuery.trim()
    ? placeholderMemories.filter(
        (m) =>
          m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase())),
      )
    : placeholderMemories;

  return (
    <div className="flex h-full flex-col gap-4 p-4 md:p-6">
      {/* Stats - responsive grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((stat) => (
          <Card key={stat.label} hoverable>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary">
                {stat.icon}
              </div>
              <div>
                <p className="text-lg font-bold text-text">{stat.value}</p>
                <p className="text-xs text-text-muted">{stat.label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Search */}
      <Input
        placeholder="Search memories..."
        prefix={<Search size={14} />}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      {/* Tabs */}
      <Tabs
        tabs={[
          { key: 'all', label: 'All' },
          { key: 'knowledge', label: 'Knowledge' },
          { key: 'patterns', label: 'Patterns' },
          { key: 'graphs', label: 'Graphs' },
        ]}
      />

      {/* Memory list + graph - stack on mobile */}
      <div className="flex-1 flex flex-col md:flex-row gap-4 min-h-0">
        {/* Memory list */}
        <Card className="md:w-80 shrink-0 overflow-y-auto">
          {filteredMemories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Inbox size={32} className="text-text-muted" />
              <p className="text-sm text-text-muted">No memories found</p>
              <p className="text-xs text-text-muted">Try a different search term</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredMemories.map((mem) => (
                <div
                  key={mem.id}
                  className="rounded-lg px-3 py-2.5 bg-bg-secondary cursor-pointer hover:bg-bg-tertiary transition-colors"
                >
                  <p className="text-sm font-medium text-text">{mem.title}</p>
                  <div className="mt-1.5 flex gap-1">
                    {mem.tags.map((tag) => (
                      <Badge key={tag}>{tag}</Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Knowledge graph visualization placeholder */}
        <Card className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Brain size={48} className="mx-auto text-text-muted mb-3" />
            <p className="text-sm text-text-muted">Knowledge Graph Visualization</p>
            <p className="text-xs text-text-muted mt-1">Select a memory to explore connections</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
