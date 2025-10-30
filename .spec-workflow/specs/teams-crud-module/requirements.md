# Requirements Document

## Introduction

Teams power collaborative prompt development by letting multiple users share workspaces, permissions, and billing plans. A dedicated teams CRUD module must let workspace owners create teams, manage membership, and keep access synchronized with Supabase-backed policies. The goal is to give administrators transparent control over membership while ensuring editors and viewers have the right level of access where they work every day.

## Alignment with Product Vision

PromptDevKit emphasizes secure, plan-aware collaboration. Delivering a complete teams CRUD experience keeps workspace governance inside the product instead of relying on external tooling. The module reinforces row-level security rules, makes plan usage legible, and supports growth from personal workspaces to fully-managed team environments.

## Requirements

### Requirement 1

**User Story:** As a workspace owner, I want to create and configure a team so that my organization can collaborate under a shared plan.

#### Acceptance Criteria

1. WHEN I submit the create team form with a unique name THEN the system SHALL call a Supabase RPC or insert to persist the team record, associate me as admin, and redirect to the team dashboard.
2. WHEN I rename a team THEN the system SHALL validate that the new name is non-empty, persist it via Supabase update, and refresh the team header without a full page reload.
3. IF creation or rename fails due to Supabase constraints (e.g., duplicate name per owner) THEN the system SHALL surface the server error in-line without creating partial records.

### Requirement 2

**User Story:** As a team admin, I want to invite and manage members so that collaborators have the right level of access.

#### Acceptance Criteria

1. WHEN I invite a member by email and role THEN the system SHALL resolve the Supabase user, enqueue the invite or add membership, and display the pending member with status feedback.
2. WHEN I change a member’s role THEN the system SHALL persist the new role through Supabase update and immediately reflect the change in the member list and audit timeline.
3. WHEN I remove a member THEN the system SHALL soft-delete or deactivate the membership row, broadcast an audit event, and remove the member from active listings while keeping history.
4. IF the invite target email is unknown to Supabase auth THEN the system SHALL block the invite and present a clear “user not found” message.

### Requirement 3

**User Story:** As a team member, I want visibility into membership history so that I can understand changes that affect access.

#### Acceptance Criteria

1. WHEN I open the activity tab THEN the system SHALL fetch membership events (join, leave, role updates) ordered by newest first and display actor and target metadata where allowed by RLS.
2. WHEN no events exist THEN the system SHALL show an empty state that explains what will appear once activity occurs.
3. IF fetching events fails due to authorization THEN the system SHALL show an error callout without revealing restricted event details.

### Requirement 4

**User Story:** As a team admin, I want to respect subscription limits so that we stay within our plan entitlements.

#### Acceptance Criteria

1. WHEN I attempt to invite or add members beyond the current plan’s member limit THEN the system SHALL block the mutation and surface an upgrade prompt referencing the specific plan limit key.
2. WHEN I view the team settings THEN the system SHALL show current member count relative to plan limits using data fetched from plan limit APIs.
3. IF plan limit evaluation fails THEN the system SHALL display a fallback warning and prevent destructive actions until limits can be confirmed.

### Requirement 5

**User Story:** As any authenticated member, I want my access to align with Supabase RLS so that unauthorized operations are impossible.

#### Acceptance Criteria

1. WHEN a non-admin attempts admin-only actions (create team, rename team, manage membership) THEN the system SHALL receive a Supabase 403/permission denied response and surface a “not authorized” error.
2. WHEN an admin performs supported actions THEN the system SHALL pass explicit workspace and user IDs to Supabase queries, ensuring RLS policies enforce tenant boundaries.
3. IF the client loses session state THEN the system SHALL halt team mutations until a valid session is restored.

## Non-Functional Requirements

### Code Architecture and Modularity
- **Single Responsibility Principle**: Keep Supabase data access inside `domains/teams/api`, presentation in `domains/teams/components`, and form logic in dedicated hooks.
- **Modular Design**: Expose reusable hooks and UI components for invites, member tables, and activity feeds that other routes (e.g., billing) can embed.
- **Dependency Management**: Share query keys and plan limit evaluators with existing prompts module patterns to maintain consistency.
- **Clear Interfaces**: Ensure TypeScript types flow from generated Supabase definitions to domain models; avoid ad hoc `any` usage.

### Performance
- List queries SHALL paginate or lazy-load when members exceed 50 to avoid large payloads.
- Optimistic updates SHALL be used for membership mutations to keep perceived latency under 200 ms while background refetches confirm persistence.

### Security
- All mutations SHALL rely on Supabase RLS; no client-only authorization bypasses.
- Audit timelines SHALL omit or redact user metadata when RLS denies access.
- Invitations SHALL never expose Supabase service-role keys or bypass policies.

### Reliability
- Mutation and fetch failures SHALL present actionable toasts or inline errors with retry paths.
- Forms SHALL debounce duplicate submissions to prevent accidental duplicate invites.
- Critical actions (removal, role downgrade) SHALL require explicit confirmation dialogs.

### Usability
- User-facing copy SHALL clearly differentiate roles (admin, editor, viewer) with tooltips describing permissions.
- Empty, loading, and error states SHALL guide admins toward next steps (invite members, retry, contact support).
- Keyboard and screen-reader users SHALL be able to manage membership via accessible controls and focus management in dialogs.
