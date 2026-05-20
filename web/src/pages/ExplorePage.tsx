import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  MessageSquare,
  Bot,
  Code2,
  Brain,
  GitBranch,
  Sparkles,
  ArrowRight,
  BookOpen,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const features = [
  {
    title: 'AI Chat',
    description: 'Conversational interface for natural language interactions with your codebase.',
    icon: <MessageSquare size={24} />,
    path: '/chat',
    badge: 'Core',
  },
  {
    title: 'Autonomous Agent',
    description: 'Let the agent autonomously analyze, plan, and execute complex tasks.',
    icon: <Bot size={24} />,
    path: '/agent',
    badge: 'Core',
  },
  {
    title: 'Code Review',
    description: 'Automated code review with intelligent issue detection and suggestions.',
    icon: <Code2 size={24} />,
    path: '/review',
    badge: 'AI',
  },
  {
    title: 'Memory System',
    description: 'Persistent knowledge base that learns from your project patterns.',
    icon: <Brain size={24} />,
    path: '/memory',
    badge: 'New',
  },
  {
    title: 'Git Integration',
    description: 'Seamless Git workflow with intelligent commit analysis and branch management.',
    icon: <GitBranch size={24} />,
    path: '/git',
    badge: 'VCS',
  },
  {
    title: 'Tool Marketplace',
    description: 'Extend agent capabilities with community and custom tools.',
    icon: <Sparkles size={24} />,
    path: '/tools',
    badge: 'Extend',
  },
];

const quickStartSteps = [
  'Connect your API key in Settings',
  'Open a chat and describe your task',
  'Let the agent analyze your codebase',
  'Review and apply suggested changes',
];

export default function ExplorePage() {
  const navigate = useNavigate();

  return (
    <div className="flex h-full flex-col gap-6 p-4 md:p-6 overflow-y-auto">
      {/* Hero */}
      <div className="text-center py-6 md:py-8">
        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 text-primary mx-auto mb-4">
          <Sparkles size={32} />
        </div>
        <h2 className="text-2xl font-bold text-text">Welcome to DevFlow Agent</h2>
        <p className="text-sm text-text-secondary mt-2 max-w-md mx-auto">
          Your AI-powered development assistant. Explore the features below to get started.
        </p>
      </div>

      {/* Feature cards - responsive grid */}
      <div>
        <h3 className="text-sm font-semibold text-text-secondary mb-3 uppercase tracking-wider">Features</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {features.map((feature) => (
            <Card key={feature.title} hoverable>
              <div className="flex items-start justify-between">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary">
                  {feature.icon}
                </div>
                <Badge>{feature.badge}</Badge>
              </div>
              <h4 className="text-sm font-semibold text-text mt-3">{feature.title}</h4>
              <p className="text-xs text-text-muted mt-1 leading-relaxed">{feature.description}</p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-3 px-0"
                onClick={() => navigate(feature.path)}
              >
                Explore <ArrowRight size={12} />
              </Button>
            </Card>
          ))}
        </div>
      </div>

      {/* Quick start - responsive grid */}
      <Card>
        <h3 className="text-sm font-semibold text-text mb-4 flex items-center gap-2">
          <BookOpen size={14} className="text-primary" />
          Quick Start Guide
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {quickStartSteps.map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-white text-xs font-bold shrink-0">
                {i + 1}
              </div>
              <p className="text-sm text-text-secondary">{step}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
