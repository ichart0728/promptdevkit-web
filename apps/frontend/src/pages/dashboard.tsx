import { WorkspaceUsageCards } from '@/domains/dashboard/components/WorkspaceUsageCards';
import { WorkspaceEngagementCards } from '@/domains/dashboard/components/WorkspaceEngagementCards';

export const DashboardPage = () => {
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Start building your prompt workflows here.</p>
      </div>
      <WorkspaceUsageCards />
      <WorkspaceEngagementCards />
    </section>
  );
};
