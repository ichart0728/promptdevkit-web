# Requirements Document

## Introduction

Prompt drafting is a core workflow for members collaborating in PromptDevKit workspaces. A dedicated prompts CRUD module lets teams capture, iterate on, and operationalize reusable prompts without leaving the app. The feature must streamline discovery and editing while keeping auditability and guardrails that match each workspace's subscription plan.

## Alignment with Product Vision

While a formal product charter is not yet documented, the platform consistently aims to help teams build dependable prompt workflows quickly. Providing first-class CRUD capabilities inside the prompts domain keeps authoring inside our secure workspace context, reinforces Supabase-backed RLS protections, and reduces friction compared with juggling external documents or ad hoc storage.

## Requirements

### Requirement 1

**User Story:** As a workspace collaborator, I want to browse the shared prompts library so that I can reuse proven prompts without recreating them from scratch.

#### Acceptance Criteria

1. WHEN I open the prompts dashboard THEN the system SHALL list prompts scoped to my active workspace ordered by most recently updated.
2. WHEN I filter by search text or tags THEN the system SHALL refresh the list client-side only after receiving matching rows from Supabase with those filters applied server-side.
3. IF I lack read access to prompts in a workspace due to RLS rules THEN the system SHALL surface an authorization error state without leaking prompt metadata.

### Requirement 2

**User Story:** As a prompt author, I want to create and edit prompts with structured metadata so that my teammates can understand and adapt them quickly.

#### Acceptance Criteria

1. WHEN I submit the create form with a title and body THEN the system SHALL persist the prompt via Supabase `prompts` insert and display it immediately in the list with optimistic feedback.
2. WHEN I edit an existing prompt THEN the system SHALL validate required fields client-side, persist changes through Supabase update, and display the updated prompt content without a full page reload.
3. IF the create or update action violates plan limits (e.g., prompt count cap) THEN the system SHALL block the mutation and surface an upgrade dialog explaining the quota.

### Requirement 3

**User Story:** As a workspace member, I want safe deletion workflows so that I can clean up prompts while retaining the option to restore them if needed.

#### Acceptance Criteria

1. WHEN I choose to delete a prompt THEN the system SHALL soft-delete it by setting `deleted_at` (no hard deletes) and remove it from the active list.
2. WHEN I view the trash tab THEN the system SHALL show soft-deleted prompts with metadata necessary to restore or purge them.
3. WHEN I restore a trashed prompt THEN the system SHALL clear `deleted_at`, rehydrate it into the active list, and keep existing version history intact.
4. IF I purge a prompt or empty the trash THEN the system SHALL require explicit confirmation before permanently removing the records.

### Requirement 4

**User Story:** As a power user, I want collaboration affordances such as duplication, favorites, and clipboard copy so that I can adapt prompts quickly and surface high-value ones.

#### Acceptance Criteria

1. WHEN I duplicate a prompt THEN the system SHALL create a new prompt prefilled with the source content while attributing me as the author and surfacing it optimistically.
2. WHEN I mark a prompt as a favorite THEN the system SHALL persist the association per user-workspace pair and reflect the state across sessions.
3. WHEN I copy a prompt body to the clipboard THEN the system SHALL confirm success or surface a helpful error if the clipboard API is unavailable.

## Non-Functional Requirements

### Code Architecture and Modularity
- **Single Responsibility Principle**: Separate modules for data fetching (TanStack Query), form validation (Zod + RHF), and presentation components.
- **Modular Design**: Reuse shared prompt list items, editor dialogs, and plan-limit helpers across personal and team workspaces.
- **Dependency Management**: Encapsulate Supabase interactions in `domains/prompts/api` with documented query keys; UI layers must depend on those abstractions only.
- **Clear Interfaces**: Type definitions must flow from generated Supabase types through lightweight domain models to maintain compile-time checks.

### Performance
- List views SHALL paginate or batch fetch to avoid loading more than 50 prompts at once.
- Mutations SHALL use optimistic updates and background refetches to keep latency under 200 ms perceived when network allows.

### Security
- All CRUD operations SHALL rely on Supabase RLS policies—no client-only gating.
- Sensitive metadata (e.g., author IDs) SHALL be scoped to the active workspace and never exposed across tenants.

### Reliability
- Error states SHALL provide actionable messages and retry paths for fetch and mutation failures.
- Critical mutations (create, update, delete, restore, purge) SHALL surface toast notifications confirming success or failure.

### Usability
- Forms SHALL validate required fields inline with clear copy.
- Empty, loading, and error states SHALL guide users toward the next action (e.g., “Create your first prompt”).
- Keyboard focus SHALL move to dialogs and return to the triggering element on close.
