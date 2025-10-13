import { type IntegerPlanLimitEvaluation } from '@/lib/limits';

export const MEMBERS_PER_TEAM_LIMIT_KEY = 'members_per_team';

const pluralize = (count: number, singular: string, plural: string) =>
  count === 1 ? singular : plural;

export type TeamSeatUsageStatus =
  | 'unavailable'
  | 'loading'
  | 'error'
  | 'available'
  | 'last-seat'
  | 'at-capacity';

type FormatTeamLimitMessageInput = {
  planId: string | null;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  evaluation: IntegerPlanLimitEvaluation | null;
  currentMembers: number;
};

export const formatTeamLimitMessage = ({
  planId,
  isLoading,
  isError,
  errorMessage,
  evaluation,
  currentMembers,
}: FormatTeamLimitMessageInput) => {
  if (!planId) {
    return 'Plan information is unavailable for this team. Invites may be restricted.';
  }

  if (isLoading) {
    return 'Checking plan capacity…';
  }

  if (isError) {
    const baseMessage = 'Failed to load plan limits. Invites may be restricted.';
    return errorMessage ? `${baseMessage} ${errorMessage}` : baseMessage;
  }

  if (!evaluation) {
    return 'Plan limit data is unavailable. Invites may be restricted until the limit is confirmed.';
  }

  if (evaluation.status === 'missing-limit') {
    return 'This plan does not define a member limit. Contact support to confirm upgrade options before inviting more teammates.';
  }

  if (evaluation.limitValue === null) {
    return `This team currently has ${currentMembers.toLocaleString()} ${pluralize(currentMembers, 'member', 'members')}. Your plan allows unlimited members.`;
  }

  if (!evaluation.allowed) {
    return `This team has reached the limit of ${evaluation.limitValue.toLocaleString()} ${pluralize(
      evaluation.limitValue,
      'member',
      'members',
    )}. Remove members or upgrade the plan to invite more.`;
  }

  if (evaluation.status === 'limit-reached') {
    return `Inviting one more teammate will use the remaining seat on your plan (${evaluation.limitValue.toLocaleString()} total).`;
  }

  return `This team is using ${currentMembers.toLocaleString()} of ${evaluation.limitValue.toLocaleString()} ${pluralize(
    evaluation.limitValue,
    'member seat',
    'member seats',
  )}.`;
};

export const formatTeamUpgradeMessage = (evaluation: IntegerPlanLimitEvaluation | null) => {
  if (!evaluation) {
    return 'Upgrade your plan to unlock more seats for your team.';
  }

  if (evaluation.limitValue === null) {
    return 'Consider upgrading your plan to unlock additional team features.';
  }

  if (!evaluation.allowed) {
    return `You have used all ${evaluation.limitValue.toLocaleString()} seats on this plan. Remove members or upgrade to add more.`;
  }

  if (evaluation.status === 'limit-reached') {
    return `Adding one more teammate will consume the final seat (${evaluation.limitValue.toLocaleString()} total). Upgrading ensures continued growth.`;
  }

  return `You are using ${evaluation.currentUsage.toLocaleString()} of ${evaluation.limitValue.toLocaleString()} seats. Upgrade to increase the limit.`;
};

type GetTeamSeatUsageStatusInput = {
  planId: string | null;
  isLoading: boolean;
  isError: boolean;
  evaluation: IntegerPlanLimitEvaluation | null;
};

export const getTeamSeatUsageStatus = ({
  planId,
  isLoading,
  isError,
  evaluation,
}: GetTeamSeatUsageStatusInput): TeamSeatUsageStatus => {
  if (!planId) {
    return 'unavailable';
  }

  if (isLoading) {
    return 'loading';
  }

  if (isError) {
    return 'error';
  }

  if (!evaluation) {
    return 'unavailable';
  }

  if (evaluation.limitValue === null) {
    return 'available';
  }

  if (!evaluation.allowed) {
    return 'at-capacity';
  }

  if (evaluation.status === 'limit-reached') {
    return 'last-seat';
  }

  return 'available';
};
