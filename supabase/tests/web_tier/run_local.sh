#!/usr/bin/env bash
# Applies the Web chat migrations to a THROWAWAY LOCAL PostgreSQL database and runs the assertions,
# including a real concurrency test (parallel sessions racing for the last Paw Go messages).
#
# NEVER point this at production or staging Supabase. It needs a plain local PostgreSQL 15+:
#   PAWOS_LOCAL_SCRATCH_DB=1 PGHOST=/path/to/socket PGPORT=55432 PGUSER=postgres \
#     bash supabase/tests/web_tier/run_local.sh
# It creates and drops the database named below.
set -euo pipefail

if [[ "${PAWOS_LOCAL_SCRATCH_DB:-}" != "1" ]]; then
  echo "Refusing to run: set PAWOS_LOCAL_SCRATCH_DB=1 to confirm PGHOST is a throwaway local PostgreSQL." >&2
  exit 2
fi
case "${PGHOST:-}" in
  *supabase.co*|*supabase.com*|*pooler*) echo "Refusing to run against a hosted Supabase host." >&2; exit 2 ;;
esac

HERE="$(cd "$(dirname "$0")" && pwd)"
MIGRATIONS="$HERE/../../migrations"
DB="pawos_web_tier_test"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DB")

dropdb --if-exists "$DB"
createdb "$DB"
trap 'dropdb --if-exists "$DB" >/dev/null 2>&1 || true' EXIT

"${PSQL[@]}" -f "$HERE/local_stub.sql"
"${PSQL[@]}" -f "$MIGRATIONS/20261004010000_web_chat.sql"
"${PSQL[@]}" -f "$HERE/seed_before.sql"
"${PSQL[@]}" -f "$MIGRATIONS/20261004020000_web_tier_architecture.sql"
# Applying it twice must be harmless.
"${PSQL[@]}" -f "$MIGRATIONS/20261004020000_web_tier_architecture.sql"
"${PSQL[@]}" -f "$HERE/web_tier.test.sql" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //'
"${PSQL[@]}" -f "$MIGRATIONS/20261004030000_web_repository_selection.sql"
"${PSQL[@]}" -f "$MIGRATIONS/20261004030000_web_repository_selection.sql"
"${PSQL[@]}" -f "$HERE/repository_selection.test.sql" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //'
"${PSQL[@]}" -f "$MIGRATIONS/20261004040000_web_code_changes.sql"
"${PSQL[@]}" -f "$MIGRATIONS/20261004040000_web_code_changes.sql"
"${PSQL[@]}" -f "$HERE/code_changes.test.sql" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //'
"${PSQL[@]}" -f "$MIGRATIONS/20261004050000_account_chats.sql"
"${PSQL[@]}" -f "$MIGRATIONS/20261004050000_account_chats.sql"
"${PSQL[@]}" -f "$HERE/account_chats.test.sql" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //'

# ── Concurrency: 12 sessions race to claim messages for one Paw Go account at the same moment.
"${PSQL[@]}" -c "insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000cc', 'race@example.com')"
pids=()
for i in $(seq -w 1 12); do
  psql -X -q -At -d "$DB" -c "
    set role service_role; set request.jwt.claim.role = 'service_role';
    select pg_sleep(0.3);
    select public.web_chat_begin_request('00000000-0000-0000-0000-0000000000cc', 'race-req-00$i', null, 4)->>'status';
  " > "/tmp/pawos-race-$i.out" 2>&1 &
  pids+=($!)
done
for pid in "${pids[@]}"; do wait "$pid" || true; done
claimed=$(cat /tmp/pawos-race-*.out | grep -c '^claimed$' || true)
refused=$(cat /tmp/pawos-race-*.out | grep -c 'message_limit_reached' || true)
rm -f /tmp/pawos-race-*.out
if [[ "$claimed" != "4" || "$refused" != "8" ]]; then
  echo "FAIL  concurrency: $claimed claimed, $refused refused (expected 4 and 8)" >&2
  exit 1
fi
echo "PASS  concurrency: 12 parallel sends for a Paw Go account → exactly 4 claimed, 8 refused"

# Racing stores (no claims) for the same account: still never a fifth message.
"${PSQL[@]}" -c "insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000dd', 'race2@example.com')"
pids=()
for i in $(seq -w 1 10); do
  psql -X -q -At -d "$DB" -c "
    set role service_role; set request.jwt.claim.role = 'service_role';
    select pg_sleep(0.3);
    select public.web_chat_append_exchange('00000000-0000-0000-0000-0000000000dd', null, 'q$i', 'a$i', 4, 'race2-req-00$i')->>'messagesUsed';
  " > /dev/null 2>&1 &
  pids+=($!)
done
for pid in "${pids[@]}"; do wait "$pid" || true; done
stored=$("${PSQL[@]}" -At -c "select count(*) from public.web_chat_messages where user_id = '00000000-0000-0000-0000-0000000000dd' and role = 'user'")
if [[ "$stored" != "4" ]]; then
  echo "FAIL  concurrency: $stored messages stored for a Paw Go account (expected 4)" >&2
  exit 1
fi
echo "PASS  concurrency: 10 parallel stores for a Paw Go account → exactly 4 messages"
# Racing fix claims: 10 sessions claim the same failed change at once — exactly one may fix it.
"${PSQL[@]}" -c "insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000ee', 'fixrace@example.com');
  insert into public.web_code_changes (id, user_id, request_id, repository, scope, state, commit_sha)
  values ('00000000-0000-0000-0000-00000000ce01', '00000000-0000-0000-0000-0000000000ee', 'fix-race-0001', 'acme/shop', 'full', 'pushed', 'abc')"
pids=()
for i in $(seq -w 1 10); do
  psql -X -q -At -d "$DB" -c "
    set role service_role; set request.jwt.claim.role = 'service_role';
    select pg_sleep(0.3);
    select public.web_code_change_claim_fix('00000000-0000-0000-0000-00000000ce01', '00000000-0000-0000-0000-0000000000ee', 2, 180);
  " > "/tmp/pawos-fix-$i.out" 2>&1 &
  pids+=($!)
done
for pid in "${pids[@]}"; do wait "$pid" || true; done
won=$(cat /tmp/pawos-fix-*.out | grep -c '^t$' || true)
rm -f /tmp/pawos-fix-*.out
if [[ "$won" != "1" ]]; then
  echo "FAIL  concurrency: $won fix claims succeeded (expected 1)" >&2
  exit 1
fi
echo "PASS  concurrency: 10 parallel fix claims for one change → exactly 1"
echo "All Web tier database checks passed."
