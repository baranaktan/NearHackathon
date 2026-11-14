import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../lib/theme';
import { IconButton } from '../ui/IconButton';

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  return (
    <IconButton
      label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      icon={theme === 'dark' ? <Sun aria-hidden className="size-4.5" /> : <Moon aria-hidden className="size-4.5" />}
      onClick={toggle}
      className={className}
    />
  );
}
