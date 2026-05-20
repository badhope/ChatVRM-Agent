import { Button } from '@/components/ui/Button';
import { Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-primary animate-bounce">404</h1>
        <p className="text-lg text-text-secondary mt-4">Page not found</p>
        <p className="text-sm text-text-muted mt-2">
          The page you are looking for does not exist or has been moved.
        </p>
        <Button
          className="mt-6"
          icon={<Home size={16} />}
          onClick={() => navigate('/chat')}
        >
          Back to Home
        </Button>
      </div>
    </div>
  );
}
