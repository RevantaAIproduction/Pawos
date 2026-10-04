-- PawOS Web — the repository an account has selected for frontend changes made from the web.
--
-- PawOS Web (paid plans) can make frontend changes in a GitHub repository: it reads the files
-- through the account's existing GitHub connection (connectivity_credentials, read on the server
-- with read_connectivity_credential() under the user's own session), and proposes the change as a
-- pull request on a new branch. It needs a repository to work in; this table remembers which one.
--
-- One row per account. Written only by pawos-web's server (service role), after it has checked
-- with GitHub that the account can push to the repository. The owner can read their own row.
-- Nothing here is a credential: it is a repository name and its default branch.
--
-- Run AFTER 20261004020000_web_tier_architecture.sql (order between the two does not matter for
-- correctness; neither depends on the other).

create table if not exists public.web_repository_selection (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null default 'github' check (provider in ('github')),
  -- "owner/name", exactly as GitHub reports it.
  full_name text not null check (full_name ~ '^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$'),
  default_branch text not null check (char_length(default_branch) between 1 and 255),
  selected_at timestamptz not null default now()
);

alter table public.web_repository_selection enable row level security;

drop policy if exists web_repository_selection_select_own on public.web_repository_selection;
create policy web_repository_selection_select_own on public.web_repository_selection
  for select using (user_id = auth.uid());
-- No insert/update/delete policies: signed-in users cannot write it directly; pawos-web's server
-- writes it with the service role after verifying push access.
