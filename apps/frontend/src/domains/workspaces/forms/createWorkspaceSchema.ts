import { z } from 'zod';

export const createWorkspaceSchema = z
  .object({
    name: z.string().min(1, 'Workspace name is required'),
    type: z.enum(['personal', 'team'], { required_error: 'Select a workspace type' }),
    teamId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'team' && !data.teamId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['teamId'],
        message: 'Select a team to link this workspace to.',
      });
    }
  });

export type CreateWorkspaceFormValues = z.infer<typeof createWorkspaceSchema>;
