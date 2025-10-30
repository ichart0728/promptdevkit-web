# Requirements Document

## Introduction

Notifications keep PromptDevKit users aligned on prompt discussions, team changes, and plan usage. A notifications CRUD module must let users configure which events they receive, manage delivery channels (in-app, email, digest), and review recent notifications. By centralizing preferences and history, the module prevents noisy inboxes while ensuring critical updates reach the right audiences.

## Alignment with Product Vision

PromptDevKit emphasizes reliable, collaborative workflows. Rich notification controls help teams stay responsive without leaving the platform, reinforcing trust in Supabase-backed data and keeping attention focused on meaningful prompt and team activity. The module must respect RLS policies, use Supabase functions for upserts, and surface plan-aware limits on advanced delivery features.

## Requirements

### Requirement 1

**User Story:** As an authenticated user, I want to configure notification preferences so that I only receive updates that matter to me.

#### Acceptance Criteria

1. WHEN I open the notification settings screen THEN the system SHALL fetch my preferences via Supabase (using `notification_preferences` or defaults) and populate the form.
2. WHEN I toggle mention notifications or digest delivery THEN the system SHALL call the `set_notification_preferences` RPC with the updated values and reflect changes optimistically while awaiting confirmation.
3. IF updating preferences fails (network error, Supabase error) THEN the system SHALL revert the optimistic state, display a toast explaining the issue, and allow me to retry.

### Requirement 2

**User Story:** As a user, I want to control email digest scheduling so that I receive summaries at a convenient time.

#### Acceptance Criteria

1. WHEN I enable email digests THEN the system SHALL require a valid UTC hour selection and persist it via `set_notification_preferences`.
2. WHEN I change the digest hour THEN the system SHALL validate input ranges client-side (0–23) and surface validation errors inline before hitting Supabase.
3. IF my plan does not allow digests THEN the system SHALL prevent enabling the toggle, show an upgrade prompt, and avoid calling the RPC.

### Requirement 3

**User Story:** As a product user, I want to review my recent notifications so that I can catch up on activity I missed.

#### Acceptance Criteria

1. WHEN I open the notifications inbox THEN the system SHALL fetch the latest N notifications scoped to my user via Supabase and display them ordered descending by created date.
2. WHEN I mark a notification as read or dismissed THEN the system SHALL update the Supabase record (soft-delete or read flag) and hide it from the unread list with optimistic feedback.
3. IF fetching notifications fails due to authorization or network issues THEN the system SHALL display an error state with retry, without exposing details of notifications I am not authorized to view.

### Requirement 4

**User Story:** As a team admin, I want to define workspace-level notification defaults so that new members inherit sensible settings.

#### Acceptance Criteria

1. WHEN I adjust workspace defaults (e.g., mandatory mention alerts) THEN the system SHALL persist the settings via a Supabase RPC or table dedicated to workspace notification policies.
2. WHEN a new member joins the workspace THEN the system SHALL apply the workspace defaults to their profile unless they already have explicit overrides.
3. IF I am not authorized to change workspace defaults THEN Supabase SHALL reject the mutation (403) and the UI SHALL display a not-authorized message.

### Requirement 5

**User Story:** As a power user, I want fine-grained control over channels and event types so that I can tailor how I’m alerted.

#### Acceptance Criteria

1. WHEN I edit channel preferences (in-app vs email) for specific event groups (prompts, comments, team membership) THEN the system SHALL persist each change via Supabase while keeping form state in sync.
2. WHEN I disable all channels for an event that is marked mandatory (e.g., billing alerts) THEN the system SHALL prevent the change and explain the policy.
3. WHEN I reset preferences to defaults THEN the system SHALL restore system defaults and refresh the UI using most recent Supabase values.

## Non-Functional Requirements

### Code Architecture and Modularity
- **Single Responsibility Principle**: Isolate Supabase access in `domains/notifications/api`, React hooks for state management in `domains/notifications/hooks`, and UI components in `domains/notifications/components`.
- **Modular Design**: Reuse shared form controls (toggles, select inputs) and plan limit dialogs found in prompts/teams modules.
- **Dependency Management**: Centralize notification query keys at module roots and reuse Supabase helper utilities to avoid duplicate RPC wiring.
- **Clear Interfaces**: Ensure TypeScript models derive from Supabase-generated types and avoid `any` or inconsistent naming.

### Performance
- Preference fetches SHALL cache per user for at least 60 seconds to minimize redundant reads.
- Notification list fetches SHALL paginate (e.g., 20 items) and lazy-load older history on demand.
- Mutation handlers SHALL be resilient over slow connections—use optimistic UI but reconcile with server responses.

### Security
- All Supabase interactions SHALL run under authenticated contexts honoring RLS; no service-role keys in the browser.
- Preference updates SHALL only target the current user, preventing modification of other users’ settings.
- Workspace defaults SHALL enforce admin-only access per RLS policies.

### Reliability
- RPC failures SHALL surface descriptive toasts and logs for observability.
- Forms SHALL guard against rapid repeat submissions through loading states and disabled buttons.
- In-app notifications SHALL degrade gracefully offline (cache last known state and queue dismissals).

### Usability
- Settings forms SHALL provide inline validation, accessible labels, and keyboard-friendly controls.
- Empty and error states SHALL guide users to enable notifications or retry fetches.
- Digest scheduling SHALL display local time equivalents to aid user understanding.
