# Requirements Document

## Introduction

Authentication is the gateway into PromptDevKit, enabling secure access to prompts, teams, and workspaces. An auth CRUD module must cover sign-up, sign-in, session management, password resets, and profile updates using Supabase Auth. Delivering a cohesive auth experience keeps users in flow, protects data through RLS policies, and ensures plan-gated features only activate for authorized accounts.

## Alignment with Product Vision

PromptDevKit aims to provide secure, plan-aware collaboration for prompt builders. Robust authentication is foundational: without trustworthy auth flows, downstream modules like prompts CRUD or dashboards cannot rely on accurate user identity. The auth module must therefore integrate tightly with Supabase, surface meaningful error states, and streamline onboarding from first-time signup through ongoing account management.

## Requirements

### Requirement 1

**User Story:** As a prospective user, I want to create an account so that I can start building prompts in PromptDevKit.

#### Acceptance Criteria

1. WHEN I submit the signup form with email and password THEN the system SHALL call Supabase Auth `signUp` with email confirmation support and display a success screen instructing me to verify my email.
2. WHEN Supabase requires email confirmation THEN the system SHALL prevent access to authenticated routes until the email is verified, showing a resend verification flow.
3. IF signup fails (invalid password, email already registered) THEN the system SHALL surface Supabase error messages inline without exposing implementation details.

### Requirement 2

**User Story:** As a returning user, I want to sign in and maintain a session so that I can access my workspaces seamlessly.

#### Acceptance Criteria

1. WHEN I sign in with email and password THEN the system SHALL call `signInWithPassword`, store the Supabase session, and redirect me to the dashboard.
2. WHEN my session expires THEN the system SHALL detect it via Supabase auth events, clear cached data (workspaces, prompts), and prompt me to reauthenticate.
3. IF sign-in fails due to invalid credentials or RLS restrictions THEN the system SHALL surface an error toast and keep me on the sign-in screen.

### Requirement 3

**User Story:** As a user, I want to manage my credentials (password reset) so that I can recover access if I forget them.

#### Acceptance Criteria

1. WHEN I request a password reset THEN the system SHALL call Supabase Auth `resetPasswordForEmail` and display confirmation that an email was sent.
2. WHEN I follow the reset link THEN the system SHALL present a secure form to set a new password, leveraging Supabase session recovery to update credentials.
3. IF the reset token is invalid or expired THEN the system SHALL display an error with instructions to restart the reset flow.

### Requirement 4

**User Story:** As an authenticated user, I want to update my profile (name, avatar) so that my collaborators recognize me.

#### Acceptance Criteria

1. WHEN I change my profile details THEN the system SHALL update Supabase Auth user metadata and persist related fields in the `users` table via Supabase RPC or update call.
2. WHEN the profile update succeeds THEN the system SHALL refresh cached user data (session queries) and show a success toast.
3. IF the update fails due to validation or Supabase errors THEN the system SHALL revert optimistic updates and display clear error messaging.

### Requirement 5

**User Story:** As a security-conscious admin, I want all auth flows to honor Supabase security policies so that unauthorized access is prevented.

#### Acceptance Criteria

1. WHEN a user signs out THEN the system SHALL call Supabase Auth `signOut`, clear all cached queries, and redirect to the sign-in page.
2. WHEN a session is invalidated server-side (e.g., password change) THEN the client SHALL detect the change via auth state listener and force reauthentication.
3. IF the client is offline during authentication THEN the system SHALL queue necessary operations or show an offline notice without attempting to bypass Supabase checks.

## Non-Functional Requirements

### Code Architecture and Modularity
- **Single Responsibility Principle**: Keep Supabase auth calls in `domains/auth/api`, session state hooks in `domains/auth/hooks`, and presentation in dedicated components.
- **Modular Design**: Reuse form inputs and validation schemas across signup/sign-in/reset flows, sharing error handling utilities.
- **Dependency Management**: Centralize session query keys and context providers so downstream modules (prompts, dashboard) can subscribe without duplication.
- **Clear Interfaces**: Define TypeScript types around Supabase `Session`, `User`, and error objects; avoid `any`.

### Performance
- Session detection SHALL use Supabase auth listeners to avoid polling.
- Forms SHALL debounce submissions and disable buttons while requests are in flight.
- Client SHALL memoize auth-dependent providers to prevent unnecessary rerenders.

### Security
- Never expose Supabase service-role keys in the client; rely solely on anon/public keys.
- Ensure email/password inputs use secure form controls and avoid logging sensitive values.
- Enforce password complexity via client validation matching Supabase constraints.

### Reliability
- All auth mutations SHALL show toasts for success/failure and allow retry.
- Offline states SHALL clearly indicate inability to reach Supabase and prompt the user to reconnect.
- Auth listeners SHALL include cleanup to prevent memory leaks in SPA context.

### Usability
- Auth forms SHALL support keyboard navigation, inline validation, and accessible labels.
- Error states SHALL use friendly copy (e.g., “Check your password”) rather than raw error codes.
- Post-auth redirects SHALL respect the intended path (e.g., deep links) using stateful routing.
