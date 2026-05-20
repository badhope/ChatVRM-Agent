import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { Input } from '@/components/ui/Input';
import {
  Terminal,
  FileSearch,
  GitBranch,
  Database,
  Globe,
  Shield,
  Power,
  Settings2,
  Search,
} from 'lucide-react';
import { useState } from 'react';

const tools = [
  { id: 1, name: 'Terminal', icon: <Terminal size={20} />, description: 'Execute shell commands', enabled: true, category: 'system' },
  { id: 2, name: 'File Search', icon: <FileSearch size={20} />, description: 'Search and read files', enabled: true, category: 'system' },
  { id: 3, name: 'Git', icon: <GitBranch size={20} />, description: 'Git operations', enabled: true, category: 'vcs' },
  { id: 4, name: 'Database', icon: <Database size={20} />, description: 'Database queries and management', enabled: false, category: 'data' },
  { id: 5, name: 'Web Fetch', icon: <Globe size={20} />, description: 'Fetch web content and APIs', enabled: true, category: 'network' },
  { id: 6, name: 'Security Scan', icon: <Shield size={20} />, description: 'Security vulnerability scanning', enabled: false, category: 'security' },
];

export default function ToolsPage() {
  const [filter, setFilter] = useState('');

  const filteredTools = filter.trim()
    ? tools.filter(
        (t) =>
          t.name.toLowerCase().includes(filter.toLowerCase()) ||
          t.description.toLowerCase().includes(filter.toLowerCase()),
      )
    : tools;

  return (
    <div className="flex h-full flex-col gap-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text">Available Tools</h2>
          <p className="text-sm text-text-muted mt-0.5">Manage and configure agent tools</p>
        </div>
        <Button size="sm" icon={<Settings2 size={14} />}>Configure</Button>
      </div>

      {/* Search / Filter */}
      <Input
        placeholder="Search tools..."
        prefix={<Search size={14} />}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      {/* Tabs */}
      <Tabs
        tabs={[
          { key: 'all', label: 'All Tools' },
          { key: 'system', label: 'System' },
          { key: 'vcs', label: 'Version Control' },
          { key: 'data', label: 'Data' },
          { key: 'network', label: 'Network' },
        ]}
      />

      {/* Tool grid - responsive */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 flex-1 overflow-y-auto content-start">
        {filteredTools.map((tool) => (
          <Card key={tool.id} hoverable>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary">
                  {tool.icon}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-text">{tool.name}</h3>
                  <p className="text-xs text-text-muted mt-0.5">{tool.description}</p>
                </div>
              </div>
              <Badge variant={tool.enabled ? 'success' : 'default'}>
                {tool.enabled ? 'Active' : 'Disabled'}
              </Badge>
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="ghost" className="flex-1">Details</Button>
              <Button size="sm" variant={tool.enabled ? 'secondary' : 'primary'} className="flex-1">
                {tool.enabled ? <><Power size={12} /> Disable</> : <><Power size={12} /> Enable</>}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
