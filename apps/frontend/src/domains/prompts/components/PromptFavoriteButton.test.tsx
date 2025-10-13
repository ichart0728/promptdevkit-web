import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';

import { PromptFavoriteButton, type PromptListItemData, type PromptFavoritesMap } from './PromptFavoriteButton';
import { togglePromptFavorite } from '../api/promptFavorites';
import { fetchPlanLimits, fetchUserPlanId } from '../api/planLimits';
import { PlanLimitError, type IntegerPlanLimitEvaluation, type PlanLimitMap } from '@/lib/limits';
import type { PromptFavorite } from '../api/promptFavorites';
import type * as ToastModule from '@/components/common/toast';

type TogglePromptFavoriteFn = typeof togglePromptFavorite;
type FetchUserPlanIdFn = typeof fetchUserPlanId;
type FetchPlanLimitsFn = typeof fetchPlanLimits;

vi.mock('../api/promptFavorites', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown> & {
    togglePromptFavorite: TogglePromptFavoriteFn;
  };

  return {
    ...actual,
    togglePromptFavorite: vi.fn<
      Parameters<TogglePromptFavoriteFn>,
      ReturnType<TogglePromptFavoriteFn>
    >(),
  };
});

vi.mock('../api/planLimits', () => ({
  fetchUserPlanId: vi.fn<Parameters<FetchUserPlanIdFn>, ReturnType<FetchUserPlanIdFn>>(),
  fetchPlanLimits: vi.fn<Parameters<FetchPlanLimitsFn>, ReturnType<FetchPlanLimitsFn>>(),
  userPlanQueryKey: (userId: string | null) => ['user-plan', userId] as const,
  planLimitsQueryKey: (planId: string) => ['plan-limits', planId] as const,
}));

const toastMock = vi.fn();

vi.mock('@/components/common/toast', () => ({
  toast: (...args: Parameters<typeof ToastModule.toast>) => toastMock(...args),
}));

vi.mock('@/components/common/UpgradeDialog', () => ({
  UpgradeDialog: ({
    open,
    evaluation,
    onOpenChange,
    onResetEvaluation,
  }: {
    open: boolean;
    evaluation?: IntegerPlanLimitEvaluation | null;
    onOpenChange: (open: boolean) => void;
    onResetEvaluation?: () => void;
  }) => {
    if (!open) {
      return null;
    }

    return (
      <div data-testid="upgrade-dialog">
        <span data-testid="evaluation-key">{evaluation?.key ?? 'none'}</span>
        <span data-testid="evaluation-current">{evaluation?.currentUsage ?? 'n/a'}</span>
        <button
          type="button"
          onClick={() => {
            onResetEvaluation?.();
            onOpenChange(false);
          }}
        >
          Close
        </button>
      </div>
    );
  },
}));

const togglePromptFavoriteMock = vi.mocked(togglePromptFavorite);
const fetchUserPlanIdMock = vi.mocked(fetchUserPlanId);
const fetchPlanLimitsMock = vi.mocked(fetchPlanLimits);

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

type RenderOptions = {
  prompt?: PromptListItemData;
  userId?: string | null;
  workspaceId?: string | null;
  favoritesMap?: PromptFavoritesMap;
  planLimits?: PlanLimitMap;
};

const basePrompt: PromptListItemData = {
  id: 'prompt-1',
  title: 'Example prompt',
  body: 'Prompt body',
  tags: [],
  note: null,
  isFavorite: false,
};

const planLimitsFixture: PlanLimitMap = {
  favorites_per_user: {
    key: 'favorites_per_user',
    value_int: 50,
    value_str: null,
    value_json: null,
  },
};

const renderButton = ({
  prompt = basePrompt,
  userId = 'user-1',
  workspaceId = 'workspace-1',
  favoritesMap = { 'prompt-1': false },
  planLimits = planLimitsFixture,
}: RenderOptions = {}) => {
  const queryClient = createTestQueryClient();
  const user = userEvent.setup();

  const promptsKey = ['prompts', workspaceId];
  const favoritesKey = ['prompt-favorites', `${workspaceId}:${userId}`];

  queryClient.setQueryData(promptsKey, [prompt]);
  queryClient.setQueryData(favoritesKey, favoritesMap);

  fetchUserPlanIdMock.mockResolvedValue('plan_free');
  fetchPlanLimitsMock.mockResolvedValue(planLimits);

  const view = render(
    <QueryClientProvider client={queryClient}>
      <PromptFavoriteButton
        prompt={prompt}
        userId={userId}
        workspaceId={workspaceId}
        promptsQueryKey={promptsKey}
        favoritesQueryKey={favoritesKey}
      />
    </QueryClientProvider>,
  );

  return { queryClient, user, promptsKey, favoritesKey, view };
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('PromptFavoriteButton', () => {
  it('keeps optimistic updates intact on successful favorite toggle', async () => {
    const favorite: PromptFavorite = {
      id: 'favorite-1',
      promptId: 'prompt-1',
      userId: 'user-1',
      createdAt: new Date().toISOString(),
    };

    togglePromptFavoriteMock.mockResolvedValue(favorite);

    const { user, queryClient, promptsKey, favoritesKey } = renderButton();

    await user.click(screen.getByRole('button', { name: /toggle favorite/i }));

    await waitFor(() => {
      expect(togglePromptFavoriteMock).toHaveBeenCalledWith({
        promptId: 'prompt-1',
        userId: 'user-1',
        shouldFavorite: true,
      });
    });

    await waitFor(() => {
      const favorites = queryClient.getQueryData<PromptFavoritesMap>(favoritesKey);
      expect(favorites?.['prompt-1']).toBe(true);
    });

    await waitFor(() => {
      const prompts = queryClient.getQueryData<PromptListItemData[]>(promptsKey);
      expect(prompts?.[0]?.isFavorite).toBe(true);
    });
  });

  it('opens the upgrade dialog with evaluation details when plan limit is exceeded', async () => {
    const evaluation: IntegerPlanLimitEvaluation = {
      key: 'favorites_per_user',
      currentUsage: 50,
      delta: 1,
      nextUsage: 51,
      limitValue: 50,
      status: 'limit-exceeded',
      allowed: false,
      shouldRecommendUpgrade: true,
    };

    togglePromptFavoriteMock.mockRejectedValue(new PlanLimitError(evaluation));

    const { user, queryClient, favoritesKey } = renderButton({
      favoritesMap: { 'prompt-1': false },
    });

    await user.click(screen.getByRole('button', { name: /toggle favorite/i }));

    await waitFor(() => {
      expect(screen.getByTestId('upgrade-dialog')).toBeInTheDocument();
    });

    expect(screen.getByTestId('evaluation-key')).toHaveTextContent('favorites_per_user');
    expect(screen.getByTestId('evaluation-current')).toHaveTextContent('50');

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Plan limit reached',
        description: expect.stringMatching(/favorites limit/i),
      }),
    );

    const favorites = queryClient.getQueryData<PromptFavoritesMap>(favoritesKey);
    expect(favorites?.['prompt-1']).toBe(false);
  });
});
