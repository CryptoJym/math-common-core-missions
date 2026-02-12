"""
Tests for the build output of Math Hunter Academy.
Verifies that all generated HTML files include the required auth and progress
integration, that auth pages exist and are well-formed, and that the JS modules
contain the expected exports.
"""

import os
import glob
import pytest
from bs4 import BeautifulSoup

DIST_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "dist")
STATIC_AUTH_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static_auth")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def read_file(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def parse_html(path):
    return BeautifulSoup(read_file(path), "html.parser")


def get_mission_pages():
    """Return sorted list of mission HTML file paths."""
    pages = glob.glob(os.path.join(DIST_DIR, "mission_*.html"))
    return sorted(pages)


# ---------------------------------------------------------------------------
# Test: dist directory structure
# ---------------------------------------------------------------------------

class TestDistStructure:
    def test_dist_directory_exists(self):
        assert os.path.isdir(DIST_DIR), "dist/ directory must exist"

    def test_index_html_exists(self):
        assert os.path.isfile(os.path.join(DIST_DIR, "index.html"))

    def test_all_15_mission_pages_exist(self):
        for i in range(1, 16):
            path = os.path.join(DIST_DIR, f"mission_{i:02d}.html")
            assert os.path.isfile(path), f"mission_{i:02d}.html must exist"

    def test_login_page_exists(self):
        assert os.path.isfile(os.path.join(DIST_DIR, "login.html"))

    def test_signup_page_exists(self):
        assert os.path.isfile(os.path.join(DIST_DIR, "signup.html"))

    def test_js_directory_exists(self):
        assert os.path.isdir(os.path.join(DIST_DIR, "js"))

    def test_config_js_exists(self):
        assert os.path.isfile(os.path.join(DIST_DIR, "js", "config.js"))

    def test_auth_js_exists(self):
        assert os.path.isfile(os.path.join(DIST_DIR, "js", "auth.js"))

    def test_progress_js_exists(self):
        assert os.path.isfile(os.path.join(DIST_DIR, "js", "progress.js"))

    def test_brady_pages_exist(self):
        brady_dir = os.path.join(DIST_DIR, "brady")
        assert os.path.isdir(brady_dir), "dist/brady/ directory must exist"
        for name in ("index.html", "assignments.html", "daily.html", "reading.html", "assignment.html", "brady.css"):
            assert os.path.isfile(os.path.join(brady_dir, name)), f"dist/brady/{name} must exist"

    def test_brady_js_exists(self):
        js_dir = os.path.join(DIST_DIR, "js")
        for name in (
            "brady_access.js",
            "brady_assignments.js",
            "brady_assignments_ui.js",
            "brady_daily.js",
            "brady_dashboard.js",
            "brady_reading.js",
            "brady_quiz_bank.js",
            "brady_assignment_runner.js",
        ):
            assert os.path.isfile(os.path.join(js_dir, name)), f"dist/js/{name} must exist"


# ---------------------------------------------------------------------------
# Test: static_auth source directory (survives rebuilds)
# ---------------------------------------------------------------------------

class TestStaticAuthSource:
    def test_static_auth_directory_exists(self):
        assert os.path.isdir(STATIC_AUTH_DIR), "static_auth/ must exist"

    def test_static_auth_has_login(self):
        assert os.path.isfile(os.path.join(STATIC_AUTH_DIR, "login.html"))

    def test_static_auth_has_signup(self):
        assert os.path.isfile(os.path.join(STATIC_AUTH_DIR, "signup.html"))

    def test_static_auth_has_js_files(self):
        js_dir = os.path.join(STATIC_AUTH_DIR, "js")
        assert os.path.isdir(js_dir)
        for name in ("config.js", "auth.js", "progress.js"):
            assert os.path.isfile(os.path.join(js_dir, name)), f"static_auth/js/{name} must exist"

    def test_static_auth_has_brady_pages(self):
        brady_dir = os.path.join(STATIC_AUTH_DIR, "brady")
        assert os.path.isdir(brady_dir), "static_auth/brady/ directory must exist"
        for name in ("index.html", "assignments.html", "daily.html", "reading.html", "assignment.html", "brady.css"):
            assert os.path.isfile(os.path.join(brady_dir, name)), f"static_auth/brady/{name} must exist"

    def test_static_auth_has_brady_js_files(self):
        js_dir = os.path.join(STATIC_AUTH_DIR, "js")
        for name in (
            "brady_access.js",
            "brady_assignments.js",
            "brady_assignments_ui.js",
            "brady_daily.js",
            "brady_dashboard.js",
            "brady_reading.js",
            "brady_quiz_bank.js",
            "brady_assignment_runner.js",
        ):
            assert os.path.isfile(os.path.join(js_dir, name)), f"static_auth/js/{name} must exist"


# ---------------------------------------------------------------------------
# Test: Index page includes auth integration
# ---------------------------------------------------------------------------

class TestIndexPage:
    @pytest.fixture(autouse=True)
    def setup(self):
        self.path = os.path.join(DIST_DIR, "index.html")
        self.content = read_file(self.path)
        self.soup = parse_html(self.path)

    def test_includes_supabase_sdk(self):
        scripts = [s.get("src", "") for s in self.soup.find_all("script")]
        assert any("supabase" in src for src in scripts), \
            "index.html must include the Supabase JS SDK"

    def test_includes_config_js(self):
        scripts = [s.get("src", "") for s in self.soup.find_all("script")]
        assert any("config.js" in src for src in scripts)

    def test_includes_auth_js(self):
        scripts = [s.get("src", "") for s in self.soup.find_all("script")]
        assert any("auth.js" in src for src in scripts)

    def test_includes_progress_js(self):
        scripts = [s.get("src", "") for s in self.soup.find_all("script")]
        assert any("progress.js" in src for src in scripts)

    def test_calls_initAuthUI(self):
        assert "initAuthUI" in self.content, \
            "index.html must call initAuthUI"

    def test_calls_initIndexProgress(self):
        assert "initIndexProgress" in self.content, \
            "index.html must call initIndexProgress to show completion badges"

    def test_has_15_gate_cards(self):
        cards = self.soup.find_all("a", class_="gate-card")
        assert len(cards) == 15, f"Expected 15 gate cards, got {len(cards)}"

    def test_gate_cards_link_to_missions(self):
        cards = self.soup.find_all("a", class_="gate-card")
        hrefs = [c.get("href", "") for c in cards]
        for i in range(1, 16):
            expected = f"mission_{i:02d}.html"
            assert expected in hrefs, f"Missing link to {expected}"


# ---------------------------------------------------------------------------
# Test: Mission pages include auth and progress integration
# ---------------------------------------------------------------------------

class TestMissionPages:
    @pytest.fixture(params=list(range(1, 16)))
    def mission(self, request):
        num = request.param
        path = os.path.join(DIST_DIR, f"mission_{num:02d}.html")
        content = read_file(path)
        soup = parse_html(path)
        return num, content, soup

    def test_includes_supabase_sdk(self, mission):
        num, content, soup = mission
        scripts = [s.get("src", "") for s in soup.find_all("script")]
        assert any("supabase" in src for src in scripts), \
            f"mission_{num:02d}.html must include Supabase SDK"

    def test_includes_config_js(self, mission):
        num, content, soup = mission
        scripts = [s.get("src", "") for s in soup.find_all("script")]
        assert any("config.js" in src for src in scripts), \
            f"mission_{num:02d}.html must include config.js"

    def test_includes_auth_js(self, mission):
        num, content, soup = mission
        scripts = [s.get("src", "") for s in soup.find_all("script")]
        assert any("auth.js" in src for src in scripts), \
            f"mission_{num:02d}.html must include auth.js"

    def test_includes_progress_js(self, mission):
        num, content, soup = mission
        scripts = [s.get("src", "") for s in soup.find_all("script")]
        assert any("progress.js" in src for src in scripts), \
            f"mission_{num:02d}.html must include progress.js"

    def test_calls_initAuthUI(self, mission):
        num, content, soup = mission
        assert "initAuthUI" in content, \
            f"mission_{num:02d}.html must call initAuthUI"

    def test_calls_initMissionProgress_with_correct_number(self, mission):
        num, content, soup = mission
        assert f"initMissionProgress({num})" in content, \
            f"mission_{num:02d}.html must call initMissionProgress({num})"

    def test_has_back_link_to_index(self, mission):
        num, content, soup = mission
        links = soup.find_all("a")
        hrefs = [l.get("href", "") for l in links]
        assert "index.html" in hrefs, \
            f"mission_{num:02d}.html must link back to index.html"


# ---------------------------------------------------------------------------
# Test: Brady pages include auth + gating integration
# ---------------------------------------------------------------------------

class TestBradyPages:
    @pytest.fixture(params=["index.html", "assignments.html", "daily.html", "reading.html", "assignment.html"])
    def page(self, request):
        name = request.param
        path = os.path.join(DIST_DIR, "brady", name)
        content = read_file(path)
        soup = parse_html(path)
        return name, content, soup

    def test_includes_supabase_sdk(self, page):
        name, content, soup = page
        scripts = [s.get("src", "") for s in soup.find_all("script")]
        assert any("supabase" in src for src in scripts), \
            f"brady/{name} must include Supabase SDK"

    def test_includes_config_js(self, page):
        name, content, soup = page
        scripts = [s.get("src", "") for s in soup.find_all("script")]
        assert any("config.js" in src for src in scripts), \
            f"brady/{name} must include config.js"

    def test_includes_auth_js(self, page):
        name, content, soup = page
        scripts = [s.get("src", "") for s in soup.find_all("script")]
        assert any("auth.js" in src for src in scripts), \
            f"brady/{name} must include auth.js"

    def test_includes_brady_access_js(self, page):
        name, content, soup = page
        scripts = [s.get("src", "") for s in soup.find_all("script")]
        assert any("brady_access.js" in src for src in scripts), \
            f"brady/{name} must include brady_access.js"

# ---------------------------------------------------------------------------
# Test: Login page structure
# ---------------------------------------------------------------------------

class TestLoginPage:
    @pytest.fixture(autouse=True)
    def setup(self):
        self.path = os.path.join(DIST_DIR, "login.html")
        self.content = read_file(self.path)
        self.soup = parse_html(self.path)

    def test_has_email_input(self):
        email_input = self.soup.find("input", {"type": "email"})
        assert email_input is not None, "Login page must have an email input"

    def test_has_password_input(self):
        pwd_input = self.soup.find("input", {"type": "password"})
        assert pwd_input is not None, "Login page must have a password input"

    def test_has_submit_button(self):
        btn = self.soup.find("button", {"type": "submit"})
        assert btn is not None, "Login page must have a submit button"

    def test_has_link_to_signup(self):
        links = [a.get("href", "") for a in self.soup.find_all("a")]
        assert "signup.html" in links, "Login page must link to signup"

    def test_has_guest_access_link(self):
        links = [a.get("href", "") for a in self.soup.find_all("a")]
        assert "index.html" in links, "Login page must have guest access link to index"

    def test_includes_supabase_sdk(self):
        scripts = [s.get("src", "") for s in self.soup.find_all("script")]
        assert any("supabase" in src for src in scripts)

    def test_includes_auth_js(self):
        scripts = [s.get("src", "") for s in self.soup.find_all("script")]
        assert any("auth.js" in src for src in scripts)

    def test_calls_signIn(self):
        assert "signIn" in self.content or "handleLogin" in self.content


# ---------------------------------------------------------------------------
# Test: Signup page structure
# ---------------------------------------------------------------------------

class TestSignupPage:
    @pytest.fixture(autouse=True)
    def setup(self):
        self.path = os.path.join(DIST_DIR, "signup.html")
        self.content = read_file(self.path)
        self.soup = parse_html(self.path)

    def test_has_display_name_input(self):
        name_input = self.soup.find("input", {"id": "displayName"})
        assert name_input is not None, "Signup page must have a display name input"

    def test_has_email_input(self):
        email_input = self.soup.find("input", {"type": "email"})
        assert email_input is not None, "Signup page must have an email input"

    def test_has_password_input(self):
        pwd_inputs = self.soup.find_all("input", {"type": "password"})
        assert len(pwd_inputs) >= 2, "Signup page must have password and confirm password inputs"

    def test_has_submit_button(self):
        btn = self.soup.find("button", {"type": "submit"})
        assert btn is not None, "Signup page must have a submit button"

    def test_has_link_to_login(self):
        links = [a.get("href", "") for a in self.soup.find_all("a")]
        assert "login.html" in links, "Signup page must link to login"

    def test_includes_supabase_sdk(self):
        scripts = [s.get("src", "") for s in self.soup.find_all("script")]
        assert any("supabase" in src for src in scripts)

    def test_calls_signUp(self):
        assert "signUp" in self.content or "handleSignup" in self.content

    def test_password_confirmation_validation(self):
        assert "confirmPassword" in self.content, \
            "Signup must validate password confirmation"


# ---------------------------------------------------------------------------
# Test: JavaScript module contents
# ---------------------------------------------------------------------------

class TestConfigJS:
    @pytest.fixture(autouse=True)
    def setup(self):
        self.content = read_file(os.path.join(DIST_DIR, "js", "config.js"))

    def test_contains_supabase_url(self):
        assert "SUPABASE_URL" in self.content
        assert "supabase.co" in self.content

    def test_contains_anon_key(self):
        assert "SUPABASE_ANON_KEY" in self.content
        assert "eyJ" in self.content  # JWT prefix

    def test_sets_window_mha_config(self):
        assert "window.MHA_CONFIG" in self.content


class TestAuthJS:
    @pytest.fixture(autouse=True)
    def setup(self):
        self.content = read_file(os.path.join(DIST_DIR, "js", "auth.js"))

    def test_exports_getSession(self):
        assert "getSession" in self.content

    def test_exports_signIn(self):
        assert "signIn" in self.content

    def test_exports_signUp(self):
        assert "signUp" in self.content

    def test_exports_signOut(self):
        assert "signOut" in self.content

    def test_exports_initAuthUI(self):
        assert "initAuthUI" in self.content

    def test_exposes_MHA_Auth_global(self):
        assert "window.MHA_Auth" in self.content

    def test_creates_supabase_client(self):
        assert "createClient" in self.content

    def test_shows_login_signup_links_for_anonymous_users(self):
        assert "login.html" in self.content, \
            "auth.js must show a login link for anonymous users"
        assert "signup.html" in self.content, \
            "auth.js must show a signup link for anonymous users"
        assert "GUEST" in self.content, \
            "auth.js must show GUEST badge for anonymous users"

    def test_reads_config(self):
        assert "MHA_CONFIG" in self.content


class TestProgressJS:
    @pytest.fixture(autouse=True)
    def setup(self):
        self.content = read_file(os.path.join(DIST_DIR, "js", "progress.js"))

    def test_exports_saveChecklistState(self):
        assert "saveChecklistState" in self.content

    def test_exports_loadChecklistState(self):
        assert "loadChecklistState" in self.content

    def test_exports_loadAllProgress(self):
        assert "loadAllProgress" in self.content

    def test_exports_initMissionProgress(self):
        assert "initMissionProgress" in self.content

    def test_exports_initIndexProgress(self):
        assert "initIndexProgress" in self.content

    def test_exposes_MHA_Progress_global(self):
        assert "window.MHA_Progress" in self.content

    def test_has_localStorage_fallback(self):
        assert "localStorage" in self.content, \
            "progress.js must fall back to localStorage for anonymous users"

    def test_uses_mission_progress_table(self):
        assert "mission_progress" in self.content

    def test_has_xp_system(self):
        assert "getXPForMission" in self.content
        assert "updateXP" in self.content

    def test_upserts_on_conflict(self):
        assert "onConflict" in self.content or "upsert" in self.content, \
            "progress.js must use upsert to avoid duplicate rows"

    def test_xp_only_awarded_on_first_completion(self):
        assert "wasAlreadyCompleted" in self.content, \
            "progress.js must check if mission was already completed before awarding XP"
        assert "!wasAlreadyCompleted" in self.content, \
            "progress.js must guard XP award with !wasAlreadyCompleted"


# ---------------------------------------------------------------------------
# Test: Build script integration
# ---------------------------------------------------------------------------

class TestBuildScript:
    @pytest.fixture(autouse=True)
    def setup(self):
        build_path = os.path.join(
            os.path.dirname(os.path.dirname(__file__)),
            "build_solo_leveling_site.py"
        )
        self.content = read_file(build_path)

    def test_imports_shutil(self):
        assert "import shutil" in self.content, \
            "Build script must import shutil for copying static assets"

    def test_has_copy_static_assets_function(self):
        assert "def copy_static_assets" in self.content

    def test_main_calls_copy_static_assets(self):
        assert "copy_static_assets()" in self.content

    def test_templates_include_supabase_sdk(self):
        assert "cdn.jsdelivr.net/npm/@supabase/supabase-js" in self.content

    def test_templates_include_config_js(self):
        assert "js/config.js" in self.content

    def test_templates_include_auth_js(self):
        assert "js/auth.js" in self.content

    def test_templates_include_progress_js(self):
        assert "js/progress.js" in self.content

    def test_css_has_user_nav_styles(self):
        assert ".user-nav" in self.content, \
            "CSS must include user nav bar styles"

    def test_css_has_completion_badge_styles(self):
        assert ".completion-badge" in self.content, \
            "CSS must include completion badge styles"
