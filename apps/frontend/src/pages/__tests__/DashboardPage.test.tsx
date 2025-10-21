import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { DashboardPage } from '../dashboard';

vi.mock('@/domains/dashboard/components/WorkspaceUsageCards', () => ({
  WorkspaceUsageCards: () => <div data-testid="workspace-usage-cards" />,
}));

vi.mock('@/domains/dashboard/components/WorkspaceEngagementCards', () => ({
  WorkspaceEngagementCards: () => <div data-testid="workspace-engagement-cards" />,
}));

vi.mock('@/domains/dashboard/components/WorkspacePromptActivity', () => ({
  WorkspacePromptActivity: () => <div data-testid="workspace-prompt-activity" />,
}));

describe('DashboardPage', () => {
  it('renders the dashboard heading and sections', () => {
    render(<DashboardPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(
      screen.getByText('Stay on top of prompt activity, usage, and engagement across your workspaces.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('workspace-prompt-activity')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-usage-cards')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-engagement-cards')).toBeInTheDocument();
  });
});
