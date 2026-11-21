import os
import tempfile
import unittest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from luna.app import app

class TestApiSettings(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        # The settings endpoints rewrite .env, so point them away from the developer's real file.
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.env_path = os.path.join(tmp.name, ".env")
        base_dir = patch("luna.app.BASE_DIR", tmp.name)
        base_dir.start()
        self.addCleanup(base_dir.stop)
        environ = patch.dict(os.environ)
        environ.start()
        self.addCleanup(environ.stop)

    @patch("requests.get")
    def test_groq_key_test_does_not_save_until_settings_are_saved(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_get.return_value = mock_resp

        new_test_key = "gsk_auto_save_verified_test_12345"
        res = self.client.post("/api/settings/test-key", json={
            "provider": "groq",
            "api_key": new_test_key
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data.get("valid"))
        self.assertFalse(data.get("saved", False))

        # Testing validates the candidate without replacing the configured key.
        self.assertNotEqual(os.environ.get("GROQ_API_KEY"), new_test_key)
        saved = self.client.post("/api/settings", json={"groq_api_key": new_test_key})
        self.assertEqual(saved.status_code, 200)

        # Verify in memory os.environ after explicit save.
        self.assertEqual(os.environ.get("GROQ_API_KEY"), new_test_key)
        from luna.clipper.config import require_groq_key
        self.assertEqual(require_groq_key(), new_test_key)

        # Verify in .env file
        with open(self.env_path, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn(f"GROQ_API_KEY={new_test_key}", content)

    def test_env_write_survives_a_bind_mounted_file(self):
        """.env is bind-mounted in Docker, where os.replace fails with EBUSY.

        The save must fall back to writing through the file instead of raising 500.
        """
        with open(self.env_path, "w", encoding="utf-8") as f:
            f.write("OPENAI_MODEL=gpt-4o-mini\n")

        with patch("luna.app.os.replace", side_effect=OSError(16, "Device or resource busy")):
            res = self.client.post("/api/settings", json={"openai_model": "gpt-4.1"})

        self.assertEqual(res.status_code, 200)
        with open(self.env_path, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn("OPENAI_MODEL=gpt-4.1", content)

    def test_env_write_falls_back_when_app_dir_is_not_writable(self):
        """Compose runs the container as LUNA_UID, which may not own the mounted /app.

        Staging .env.tmp then fails with EACCES even though .env itself is writable,
        so the save must write through the file instead of returning 500.
        """
        with open(self.env_path, "w", encoding="utf-8") as f:
            f.write("OPENAI_MODEL=gpt-4o-mini\n")

        with patch("luna.app.os.access", return_value=False):
            res = self.client.post("/api/settings", json={"openai_model": "gpt-4.1"})

        self.assertEqual(res.status_code, 200)
        with open(self.env_path, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn("OPENAI_MODEL=gpt-4.1", content)

    @patch("subprocess.Popen")
    def test_open_folder_calls_explorer_on_windows(self, mock_popen):
        res = self.client.post("/api/vault/open-folder")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data.get("status"), "success")
        mock_popen.assert_called_once()

    @patch("subprocess.run")
    def test_browse_folder_endpoint(self, mock_subproc):
        mock_res = MagicMock()
        mock_res.stdout = "D:\\SelectedFolder\n"
        mock_subproc.return_value = mock_res

        with patch("os.path.exists", return_value=True):
            res = self.client.post("/api/settings/browse-folder")
            self.assertEqual(res.status_code, 200)
            data = res.json()
            self.assertEqual(data.get("status"), "success")
            self.assertTrue(data.get("path").endswith("SelectedFolder"))

    def test_storage_migration(self):
        import shutil
        old_dir = tempfile.mkdtemp()
        new_dir = tempfile.mkdtemp()

        try:
            # Create dummy media file in old_dir
            clip_dir = os.path.join(old_dir, "01-AI-Clips")
            os.makedirs(clip_dir, exist_ok=True)
            dummy_file = os.path.join(clip_dir, "test_clip.mp4")
            with open(dummy_file, "w") as f:
                f.write("dummy video data")

            with patch.dict(os.environ, {"MEDIA_STORAGE_DIR": old_dir}):
                res = self.client.post("/api/settings", json={
                    "storage_dir": new_dir,
                    "migrate_files": True
                })
                self.assertEqual(res.status_code, 200)
                data = res.json()
                self.assertEqual(data.get("status"), "saved")
                self.assertIsNotNone(data.get("migrated"))

                # Verify file was moved to new_dir
                migrated_file = os.path.join(new_dir, "01-AI-Clips", "test_clip.mp4")
                self.assertTrue(os.path.exists(migrated_file))
        finally:
            shutil.rmtree(old_dir, ignore_errors=True)
            shutil.rmtree(new_dir, ignore_errors=True)

    def test_clip_language_setting_roundtrip_and_validation(self):
        from luna.app import ProcessRequest

        os.environ.pop("CLIP_OUTPUT_LANGUAGE", None)
        self.assertEqual(self.client.get("/api/settings").json().get("clip_language"), "en")

        res = self.client.post("/api/settings", json={"clip_language": "ru"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self.client.get("/api/settings").json().get("clip_language"), "ru")
        with open(self.env_path, "r", encoding="utf-8") as f:
            self.assertIn("CLIP_OUTPUT_LANGUAGE=ru", f.read())

        bad = self.client.post("/api/settings", json={"clip_language": "th"})
        self.assertEqual(bad.status_code, 400)

        req = ProcessRequest(url="https://www.youtube.com/watch?v=dQw4w9WgXcQ", action="type_yt_ai_clip", clip_language="English")
        self.assertEqual(req.clip_language, "en")
        ru_req = ProcessRequest(url="https://www.youtube.com/watch?v=dQw4w9WgXcQ", action="type_yt_ai_clip", clip_language="русский")
        self.assertEqual(ru_req.clip_language, "ru")
        with self.assertRaises(ValueError):
            ProcessRequest(url="https://www.youtube.com/watch?v=dQw4w9WgXcQ", action="type_yt_ai_clip", clip_language="ml")

    def test_studio_background_setting_roundtrip_and_validation(self):
        os.environ.pop("STUDIO_BACKGROUND", None)
        self.assertEqual(self.client.get("/api/settings").json().get("studio_background"), "obsidian")

        for preset in ("lunar-waves", "crimson-horizon", "prismatic-aurora", "obsidian"):
            res = self.client.post("/api/settings", json={"studio_background": preset})
            self.assertEqual(res.status_code, 200)
            self.assertEqual(self.client.get("/api/settings").json().get("studio_background"), preset)
            with open(self.env_path, "r", encoding="utf-8") as f:
                self.assertIn(f"STUDIO_BACKGROUND={preset}", f.read())

        bad = self.client.post("/api/settings", json={"studio_background": "invalid-theme"})
        self.assertEqual(bad.status_code, 400)

    @patch("luna.app._open_windows_explorer")
    def test_open_folder_invokes_foreground_explorer_helper_on_windows(self, mock_open):
        with patch("luna.app.sys.platform", "win32"):
            res = self.client.post("/api/vault/open-folder")
        self.assertEqual(res.status_code, 200)
        mock_open.assert_called_once()

    def test_check_system_contract_schema(self):
        res = self.client.post("/api/settings/check-system")
        self.assertEqual(res.status_code, 200)
        self.assertIn("application/json", res.headers.get("content-type", ""))
        data = res.json()
        expected_keys = {
            "status",
            "ffmpeg",
            "ffmpeg_version",
            "ytdlp",
            "js_runtime",
            "opencv",
            "opencv_version",
            "storage",
            "storage_path",
            "cookies",
        }
        self.assertEqual(set(data.keys()), expected_keys)
        self.assertEqual(data["status"], "success")
        self.assertIsInstance(data["ffmpeg"], bool)
        self.assertIsInstance(data["js_runtime"], bool)
        self.assertIsInstance(data["opencv"], bool)
        self.assertIsInstance(data["storage"], bool)
        self.assertIsInstance(data["ytdlp"], str)
        self.assertEqual(set(data["cookies"].keys()), {"exists", "name", "size"})
        self.assertIsInstance(data["cookies"]["exists"], bool)

    def test_upload_cookies_happy_path_and_validation_errors(self):
        sample = "# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t0\tSID\ttest_val\n"
        res = self.client.post(
            "/api/settings/upload-cookies",
            json={"filename": "my_cookies.txt", "content": sample},
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "uploaded")
        self.assertEqual(data["filename"], "my_cookies.txt")
        self.assertTrue(data["size"].endswith(" KB"))

        cookie_path = os.path.join(os.path.dirname(self.env_path), "cookies.txt")
        with open(cookie_path, "r", encoding="utf-8") as f:
            self.assertEqual(f.read(), sample)

        binary_res = self.client.post(
            "/api/settings/upload-cookies",
            json={"filename": "bad.txt", "content": "abc\x00def"},
        )
        self.assertEqual(binary_res.status_code, 422)

        oversized_res = self.client.post(
            "/api/settings/upload-cookies",
            json={"filename": "huge.txt", "content": "a" * (5 * 1024 * 1024 + 1)},
        )
        self.assertEqual(oversized_res.status_code, 422)

    def test_download_zip_happy_path_and_error_paths(self):
        import io
        import zipfile
        import luna.app as app_module

        # Missing job returns 400
        missing = self.client.get("/api/download-zip/nonexistent_job_id")
        self.assertEqual(missing.status_code, 400)

        job_id = "zip_contract_test_job"
        job_dir = os.path.join(os.path.dirname(self.env_path), "output", job_id)
        os.makedirs(job_dir, exist_ok=True)
        clip_path = os.path.join(job_dir, "clip_01.mp4")
        with open(clip_path, "wb") as f:
            f.write(b"fake-mp4-bytes")

        with patch.object(app_module, "OUTPUT_DIR", os.path.join(os.path.dirname(self.env_path), "output")):
            try:
                # Non-completed job returns 400
                app_module.jobs[job_id] = {"id": job_id, "status": "processing", "results": []}
                in_progress = self.client.get(f"/api/download-zip/{job_id}")
                self.assertEqual(in_progress.status_code, 400)

                # Completed job streams a valid ZIP archive containing only safe output files
                app_module.jobs[job_id] = {
                    "id": job_id,
                    "status": "completed",
                    "results": [
                        {"filename": "clip_01.mp4"},
                        {"filename": "../escape.txt"},
                    ],
                }
                res = self.client.get(f"/api/download-zip/{job_id}")
                self.assertEqual(res.status_code, 200)
                self.assertIn("application/zip", res.headers.get("content-type", ""))
                self.assertIn(f"media_{job_id}.zip", res.headers.get("content-disposition", ""))

                with zipfile.ZipFile(io.BytesIO(res.content), "r") as zf:
                    self.assertEqual(zf.namelist(), ["clip_01.mp4"])
                    self.assertEqual(zf.read("clip_01.mp4"), b"fake-mp4-bytes")
            finally:
                app_module.jobs.pop(job_id, None)

if __name__ == "__main__":
    unittest.main()
