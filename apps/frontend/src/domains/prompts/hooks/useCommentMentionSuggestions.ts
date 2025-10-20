import { useQuery } from '@tanstack/react-query';

import {
  commentMentionSuggestionsQueryKey,
  fetchCommentMentionSuggestions,
  type CommentMentionSuggestion,
} from '../api/commentMentions';

export type UseCommentMentionSuggestionsParams = {
  workspaceId?: string | null;
  search?: string | null;
  limit?: number;
  enabled?: boolean;
};

export const useCommentMentionSuggestions = ({
  workspaceId,
  search,
  limit,
  enabled,
}: UseCommentMentionSuggestionsParams = {}) => {
  const normalizedWorkspaceId = workspaceId ?? null;
  const isEnabled = Boolean(normalizedWorkspaceId) && (enabled ?? true);

  return useQuery<CommentMentionSuggestion[]>({
    queryKey: commentMentionSuggestionsQueryKey(normalizedWorkspaceId, search, limit),
    queryFn: ({ signal }) => {
      if (!normalizedWorkspaceId) {
        return Promise.resolve<CommentMentionSuggestion[]>([]);
      }

      return fetchCommentMentionSuggestions({
        workspaceId: normalizedWorkspaceId,
        search,
        limit,
      }, { signal });
    },
    enabled: isEnabled,
    staleTime: 30_000,
  });
};
