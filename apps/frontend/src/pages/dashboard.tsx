import { WorkspaceUsageCards } from '@/domains/dashboard/components/WorkspaceUsageCards';
import { WorkspaceEngagementCards } from '@/domains/dashboard/components/WorkspaceEngagementCards';
import { WorkspacePromptActivity } from '@/domains/dashboard/components/WorkspacePromptActivity';

export const DashboardPage = () => {
  return (
    <section className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Stay on top of prompt activity, usage, and engagement across your workspaces.
        </p>
      </header>
      <div className="space-y-8">
        <WorkspacePromptActivity />
        <div className="grid gap-6 lg:grid-cols-2">
          <WorkspaceUsageCards />
          <WorkspaceEngagementCards />
        </div>
      </div>
    </section>
  );
};
