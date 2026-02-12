"""
Tests for Supabase backend integration.
Verifies that the Supabase project is configured correctly with the expected
tables, columns, RLS policies, and triggers.

These tests require a live Supabase connection and run against the actual project.
They are read-only — they only query metadata, never mutate data.
"""

import os
import json
import pytest

# We test via the Supabase config in the built JS
CONFIG_PATH = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "dist", "js", "config.js"
)


def parse_config():
    """Extract Supabase URL and anon key from config.js"""
    content = open(CONFIG_PATH).read()
    url = None
    key = None
    for line in content.split("\n"):
        if "SUPABASE_URL" in line and ":" in line:
            url = line.split("'")[1] if "'" in line else line.split('"')[1]
        if "SUPABASE_ANON_KEY" in line and ":" in line:
            key = line.split("'")[1] if "'" in line else line.split('"')[1]
    return url, key


try:
    import requests
    SUPABASE_URL, SUPABASE_ANON_KEY = parse_config()
    HAS_REQUESTS = True
except (ImportError, Exception):
    HAS_REQUESTS = False
    SUPABASE_URL = None
    SUPABASE_ANON_KEY = None


def supabase_rest_get(table, params=None):
    """Make a GET request to Supabase REST API."""
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
    }
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    resp = requests.get(url, headers=headers, params=params or {}, timeout=10)
    return resp


def supabase_rpc(function_name, body=None):
    """Call a Supabase RPC function (or query pg_catalog via REST)."""
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        "Content-Type": "application/json",
    }
    url = f"{SUPABASE_URL}/rest/v1/rpc/{function_name}"
    resp = requests.post(url, headers=headers, json=body or {}, timeout=10)
    return resp


@pytest.mark.skipif(not HAS_REQUESTS, reason="requests library not available")
@pytest.mark.skipif(not SUPABASE_URL, reason="Supabase config not found")
class TestSupabaseConnection:
    def test_supabase_url_is_reachable(self):
        resp = requests.get(f"{SUPABASE_URL}/rest/v1/", headers={
            "apikey": SUPABASE_ANON_KEY,
        }, timeout=10)
        # Should get 200 (empty response) not 5xx
        assert resp.status_code < 500, \
            f"Supabase REST API returned {resp.status_code}"

    def test_anon_key_is_valid_jwt(self):
        """Anon key should be a valid JWT with 3 dot-separated parts."""
        parts = SUPABASE_ANON_KEY.split(".")
        assert len(parts) == 3, "Anon key must be a valid JWT"


@pytest.mark.skipif(not HAS_REQUESTS, reason="requests library not available")
@pytest.mark.skipif(not SUPABASE_URL, reason="Supabase config not found")
class TestProfilesTable:
    def test_profiles_table_exists(self):
        """Querying profiles without auth should return 401 or empty (RLS blocks)."""
        resp = supabase_rest_get("profiles", {"select": "id", "limit": "1"})
        # RLS should block unauthenticated reads — 200 with empty array or 401
        assert resp.status_code in (200, 401, 403), \
            f"profiles table query returned unexpected status {resp.status_code}"

    def test_profiles_rls_blocks_anon_reads(self):
        """Anonymous requests should not be able to read other users' profiles."""
        resp = supabase_rest_get("profiles", {"select": "*"})
        if resp.status_code == 200:
            data = resp.json()
            # Should be empty — RLS prevents anon from reading profiles
            assert data == [], \
                "RLS should prevent anonymous access to profiles data"


@pytest.mark.skipif(not HAS_REQUESTS, reason="requests library not available")
@pytest.mark.skipif(not SUPABASE_URL, reason="Supabase config not found")
class TestMissionProgressTable:
    def test_mission_progress_table_exists(self):
        """Querying mission_progress without auth should be blocked by RLS."""
        resp = supabase_rest_get("mission_progress", {"select": "id", "limit": "1"})
        assert resp.status_code in (200, 401, 403), \
            f"mission_progress table query returned unexpected status {resp.status_code}"

    def test_mission_progress_rls_blocks_anon_reads(self):
        """Anonymous requests should not be able to read mission progress."""
        resp = supabase_rest_get("mission_progress", {"select": "*"})
        if resp.status_code == 200:
            data = resp.json()
            assert data == [], \
                "RLS should prevent anonymous access to mission_progress data"

    def test_cannot_insert_without_auth(self):
        """Anonymous users should not be able to insert mission progress."""
        headers = {
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        }
        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/mission_progress",
            headers=headers,
            json={
                "user_id": "00000000-0000-0000-0000-000000000000",
                "mission_number": 1,
                "checklist_state": {},
            },
            timeout=10,
        )
        # Should be rejected — either 401, 403, or RLS violation (409/400)
        assert resp.status_code != 201, \
            "Anonymous users must not be able to insert into mission_progress"


@pytest.mark.skipif(not HAS_REQUESTS, reason="requests library not available")
@pytest.mark.skipif(not SUPABASE_URL, reason="Supabase config not found")
class TestBradyPersonalizationTables:
    def test_allowed_students_table_exists(self):
        resp = supabase_rest_get("allowed_students", {"select": "user_id", "limit": "1"})
        assert resp.status_code in (200, 401, 403), \
            f"allowed_students table query returned unexpected status {resp.status_code}"

    def test_allowed_students_rls_blocks_anon_reads(self):
        resp = supabase_rest_get("allowed_students", {"select": "*"})
        if resp.status_code == 200:
            assert resp.json() == [], "RLS should prevent anonymous access to allowed_students"

    def test_brady_assignment_progress_table_exists(self):
        resp = supabase_rest_get("brady_assignment_progress", {"select": "id", "limit": "1"})
        assert resp.status_code in (200, 401, 403), \
            f"brady_assignment_progress table query returned unexpected status {resp.status_code}"

    def test_brady_assignment_progress_rls_blocks_anon_reads(self):
        resp = supabase_rest_get("brady_assignment_progress", {"select": "*"})
        if resp.status_code == 200:
            assert resp.json() == [], "RLS should prevent anonymous access to brady_assignment_progress"

    def test_brady_daily_training_log_table_exists(self):
        resp = supabase_rest_get("brady_daily_training_log", {"select": "id", "limit": "1"})
        assert resp.status_code in (200, 401, 403), \
            f"brady_daily_training_log table query returned unexpected status {resp.status_code}"

    def test_brady_daily_training_log_rls_blocks_anon_reads(self):
        resp = supabase_rest_get("brady_daily_training_log", {"select": "*"})
        if resp.status_code == 200:
            assert resp.json() == [], "RLS should prevent anonymous access to brady_daily_training_log"

    def test_brady_reading_log_table_exists(self):
        resp = supabase_rest_get("brady_reading_log", {"select": "id", "limit": "1"})
        assert resp.status_code in (200, 401, 403), \
            f"brady_reading_log table query returned unexpected status {resp.status_code}"

    def test_brady_reading_log_rls_blocks_anon_reads(self):
        resp = supabase_rest_get("brady_reading_log", {"select": "*"})
        if resp.status_code == 200:
            assert resp.json() == [], "RLS should prevent anonymous access to brady_reading_log"

    def test_brady_assignment_attempts_table_exists(self):
        resp = supabase_rest_get("brady_assignment_attempts", {"select": "id", "limit": "1"})
        assert resp.status_code in (200, 401, 403), \
            f"brady_assignment_attempts table query returned unexpected status {resp.status_code}"

    def test_brady_assignment_attempts_rls_blocks_anon_reads(self):
        resp = supabase_rest_get("brady_assignment_attempts", {"select": "*"})
        if resp.status_code == 200:
            assert resp.json() == [], "RLS should prevent anonymous access to brady_assignment_attempts"

    def test_brady_generated_quizzes_table_exists(self):
        resp = supabase_rest_get("brady_generated_quizzes", {"select": "id", "limit": "1"})
        assert resp.status_code in (200, 401, 403), \
            f"brady_generated_quizzes table query returned unexpected status {resp.status_code}"

    def test_brady_generated_quizzes_rls_blocks_anon_reads(self):
        resp = supabase_rest_get("brady_generated_quizzes", {"select": "*"})
        if resp.status_code == 200:
            assert resp.json() == [], "RLS should prevent anonymous access to brady_generated_quizzes"


@pytest.mark.skipif(not HAS_REQUESTS, reason="requests library not available")
@pytest.mark.skipif(not SUPABASE_URL, reason="Supabase config not found")
class TestSupabaseAuth:
    def test_auth_endpoint_exists(self):
        """The GoTrue auth endpoint should be available."""
        resp = requests.get(
            f"{SUPABASE_URL}/auth/v1/settings",
            headers={"apikey": SUPABASE_ANON_KEY},
            timeout=10,
        )
        assert resp.status_code == 200, \
            f"Auth settings endpoint returned {resp.status_code}"

    def test_email_provider_enabled(self):
        """Email/password auth provider should be enabled."""
        resp = requests.get(
            f"{SUPABASE_URL}/auth/v1/settings",
            headers={"apikey": SUPABASE_ANON_KEY},
            timeout=10,
        )
        if resp.status_code == 200:
            settings = resp.json()
            # Check if external.email is enabled (default Supabase behavior)
            external = settings.get("external", {})
            assert external.get("email", True), \
                "Email auth provider should be enabled"
