import { z } from 'zod';

export const manageWorkspaceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Workspace name is required')
    .max(128, 'Workspace name must be 128 characters or fewer'),
});

export type ManageWorkspaceFormValues = z.infer<typeof manageWorkspaceSchema>;
