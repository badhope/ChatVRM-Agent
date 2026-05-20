import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Tabs } from '@/components/ui/Tabs';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';
import {
  Key,
  Cpu,
  Palette,
  Bell,
  Shield,
  Save,
  RotateCcw,
} from 'lucide-react';

function Toggle({ defaultChecked = false, label, description }: { defaultChecked?: boolean; label: string; description: string }) {
  return (
    <label className="flex items-center justify-between cursor-pointer group">
      <div>
        <p className="text-sm text-text group-hover:text-text-primary transition-colors">{label}</p>
        <p className="text-xs text-text-muted">{description}</p>
      </div>
      <div className="relative">
        <input type="checkbox" defaultChecked={defaultChecked} className="sr-only peer" />
        <span
          className={cn(
            'block w-10 h-6 rounded-full transition-colors',
            'bg-bg-tertiary peer-checked:bg-primary',
          )}
        />
        <span
          className={cn(
            'absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform',
            'peer-checked:translate-x-4',
          )}
        />
      </div>
    </label>
  );
}

export default function SettingsPage() {
  return (
    <div className="flex h-full flex-col gap-4 p-4 md:p-6">
      <div>
        <h2 className="text-lg font-semibold text-text">Settings</h2>
        <p className="text-sm text-text-muted mt-0.5">Configure your DevFlow Agent preferences</p>
      </div>

      <Tabs
        tabs={[
          { key: 'api', label: 'API Config', icon: <Key size={14} /> },
          { key: 'model', label: 'Model', icon: <Cpu size={14} /> },
          { key: 'preferences', label: 'Preferences', icon: <Palette size={14} /> },
          { key: 'notifications', label: 'Notifications', icon: <Bell size={14} /> },
          { key: 'security', label: 'Security', icon: <Shield size={14} /> },
        ]}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl space-y-4">
          {/* API Configuration */}
          <Card>
            <h3 className="text-sm font-semibold text-text mb-4 flex items-center gap-2">
              <Key size={14} className="text-primary" />
              API Configuration
            </h3>
            <div className="space-y-4">
              <Input label="API Endpoint" placeholder="http://localhost:3100" />
              <Input label="API Key" type="password" placeholder="Enter your API key..." />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-text">Connection Status</p>
                  <p className="text-xs text-text-muted">Test your API connection</p>
                </div>
                <Badge variant="success">Connected</Badge>
              </div>
            </div>
          </Card>

          {/* Model Selection */}
          <Card>
            <h3 className="text-sm font-semibold text-text mb-4 flex items-center gap-2">
              <Cpu size={14} className="text-primary" />
              Model Selection
            </h3>
            <div className="space-y-3">
              {[
                { name: 'GPT-4o', desc: 'Most capable, best for complex tasks' },
                { name: 'GPT-4o-mini', desc: 'Fast and cost-effective' },
                { name: 'Claude 3.5 Sonnet', desc: 'Excellent for code generation' },
              ].map((model) => (
                <div
                  key={model.name}
                  className="flex items-center justify-between rounded-lg border border-border px-4 py-3 cursor-pointer hover:border-primary/50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-text">{model.name}</p>
                    <p className="text-xs text-text-muted">{model.desc}</p>
                  </div>
                  <input type="radio" name="model" defaultChecked={model.name === 'GPT-4o'} className="accent-primary" />
                </div>
              ))}
            </div>
          </Card>

          {/* Preferences */}
          <Card>
            <h3 className="text-sm font-semibold text-text mb-4 flex items-center gap-2">
              <Palette size={14} className="text-primary" />
              Preferences
            </h3>
            <div className="space-y-4">
              <Input label="Default Workspace" placeholder="/path/to/workspace" />
              <Input label="Max Tokens" type="number" placeholder="4096" />
              <Input label="Temperature" type="number" placeholder="0.7" />
              <Toggle
                defaultChecked
                label="Auto Checkpoint"
                description="Automatically save checkpoints before changes"
              />
              <Toggle
                defaultChecked={false}
                label="Verbose Logging"
                description="Enable detailed agent logging output"
              />
            </div>
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" icon={<RotateCcw size={14} />}>Reset</Button>
            <Button icon={<Save size={14} />}>Save Changes</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
