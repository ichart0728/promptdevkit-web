import { WorkspacePromptActivityContent } from '../WorkspacePromptActivity';
import type { WorkspacePromptActivity } from '../../api/promptActivity';

const sampleActivity: WorkspacePromptActivity[] = [
  {
    workspaceId: 'workspace-1',
    workspaceName: 'Personal Lab',
    activityDate: '2024-03-25',
    promptUpdateCount: 3,
  },
  {
    workspaceId: 'workspace-2',
    workspaceName: 'Prompt Builders HQ',
    activityDate: '2024-03-25',
    promptUpdateCount: 5,
  },
  {
    workspaceId: 'workspace-1',
    workspaceName: 'Personal Lab',
    activityDate: '2024-03-26',
    promptUpdateCount: 1,
  },
  {
    workspaceId: 'workspace-2',
    workspaceName: 'Prompt Builders HQ',
    activityDate: '2024-03-27',
    promptUpdateCount: 4,
  },
];

export default {
  title: 'Dashboard/WorkspacePromptActivity',
};

export const Default = () => (
  <div className="max-w-4xl space-y-6 p-6">
    <WorkspacePromptActivityContent activity={sampleActivity} />
  </div>
);
