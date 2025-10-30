# Requirements Document

## Introduction

The dashboard is the command center for PromptDevKit users, surfacing workspace health, recent activity, and plan usage. A dashboard CRUD module must let users assemble, configure, and persist dashboard cards backed by Supabase metrics so that every workspace has an actionable overview. Building this module ensures admins and collaborators can tailor the experience, track outcomes, and quickly drill into prompts or teams that need attention.

## Alignment with Product Vision

PromptDevKit prioritizes secure, plan-aware collaboration anchored in Supabase. A configurable dashboard keeps critical signals in one place, reinforces RLS-backed data access, and encourages users to stay inside the platform instead of exporting metrics elsewhere. By allowing per-workspace dashboards, we empower teams to highlight prompt performance, comment activity, and plan consumption in line with the product’s goal of fast, dependable prompt operations.

## Requirements

### Requirement 1

**User Story:** As a workspace member, I want to view core metrics (prompt counts, recent activity, plan usage) so that I understand the health of the workspace at a glance.

#### Acceptance Criteria

1. WHEN I open the dashboard THEN the system SHALL fetch summary metrics (prompt totals, latest updates, comment counts) via Supabase and display them in cards ordered by workspace context.
2. WHEN metrics data is loading THEN the system SHALL show skeleton placeholders instead of blank space.
3. IF metrics retrieval fails (network, RLS denial) THEN the system SHALL present an inline error card with retry controls and no sensitive data leakage.

### Requirement 2

**User Story:** As a workspace admin, I want to customize which dashboard cards appear so that my team sees the most relevant information.

#### Acceptance Criteria

1. WHEN I create a new dashboard card (e.g., prompt activity chart) THEN the system SHALL persist card metadata (type, filters, layout position) via Supabase and render it immediately.
2. WHEN I update or reorder cards THEN the system SHALL store the new configuration per workspace and refresh the layout without reloading the page.
3. WHEN I delete a card THEN the system SHALL remove it after confirmation, persist the removal, and free the layout slot while offering an undo toast.

### Requirement 3

**User Story:** As a collaborator, I want to filter dashboard data by time range and workspace segments so that I can analyze trends.

#### Acceptance Criteria

1. WHEN I change the time range (e.g., 7, 30, 90 days) THEN the system SHALL refetch affected cards with the new filters applied server-side.
2. WHEN I focus on a specific workspace segment (personal vs team, tags, plan tiers) THEN the system SHALL apply the filter consistently across cards that support it, falling back gracefully for cards that do not.
3. IF no data matches the filters THEN the system SHALL show empty-state messaging explaining the absence of results and how to adjust filters.

### Requirement 4

**User Story:** As a plan-aware admin, I want dashboard features to respect subscription limits so that premium analytics remain gated.

#### Acceptance Criteria

1. WHEN I access advanced cards (e.g., comment analytics) under a plan that lacks the entitlement THEN the system SHALL hide or lock the card, displaying an upgrade prompt referencing the relevant plan limit key.
2. WHEN plan entitlements change (upgrade or downgrade) THEN the system SHALL refresh dashboard availability and re-enable or disable cards accordingly.
3. IF plan limit evaluation fails THEN the system SHALL fallback to a safe default (hide locked cards) and surface a warning banner to admins.

### Requirement 5

**User Story:** As a security-conscious product owner, I want dashboard data to honor Supabase RLS policies so that users only see what they are allowed to access.

#### Acceptance Criteria

1. WHEN a user without access attempts to load a card fed by restricted tables THEN the Supabase query SHALL return a 403 or empty dataset and the UI SHALL show a not-authorized state for that card.
2. WHEN dashboard configurations are stored THEN the system SHALL associate them with the workspace and user roles in Supabase, preventing cross-tenant leakage.
3. IF a user loses session state THEN the dashboard SHALL block further CRUD operations until the session is restored, while cached read-only data is clearly marked as stale.

## Non-Functional Requirements

### Code Architecture and Modularity
- **Single Responsibility Principle**: Keep Supabase fetch logic in `domains/dashboard/api`, card configuration state in hooks, and visual components in `domains/dashboard/components`.
- **Modular Design**: Implement cards as self-contained components that subscribe to shared query hooks, enabling reuse across personal and team dashboards.
- **Dependency Management**: Define dashboard query keys at module roots and reuse plan limit utilities from prompts/teams for consistency.
- **Clear Interfaces**: Derive TypeScript types from Supabase-generated definitions, avoiding `any` in card configuration schemas.

### Performance
- Metric queries SHALL batch or parallelize to keep initial load under 500 ms on typical connections.
- Dashboard layout updates SHALL debounce save operations to avoid excessive writes during drag-and-drop.
- Pagination or lazy-loading SHALL be used for activity feeds exceeding 50 items.

### Security
- All Supabase operations SHALL run under authenticated contexts honoring RLS; no service-role keys in the client.
- Card configurations SHALL never reference tables or columns the requester cannot access.
- Default dashboards SHALL avoid exposing aggregated data across tenants.

### Reliability
- CRUD operations SHALL provide optimistic updates with rollback on failure.
- Error handling SHALL include toast notifications and structured logging for observability.
- Autosave events SHALL confirm success or highlight failures without interrupting the user.

### Usability
- Dashboard customization controls SHALL be keyboard accessible and announce changes to screen readers.
- Empty, loading, and error states SHALL guide users with clear titles and secondary actions.
- Drag-and-drop interactions SHALL include grid snap feedback and accessible reorder alternatives.
