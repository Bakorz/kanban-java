import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("run_backend", Path(__file__).with_name("run-backend.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PrivateEnvironmentTest(unittest.TestCase):
    def config(self, content, mode=0o600):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        path = Path(temporary.name) / "private.env"
        path.write_text(content, encoding="utf-8")
        path.chmod(mode)
        return path

    def test_values_remain_literal_without_shell_execution(self):
        path = self.config('DB_PASSWORD="$(echo never-execute)"\nDB_USERNAME=kanban_runtime\n')
        self.assertEqual('$(echo never-execute)', module.load_config(path)['DB_PASSWORD'])

    def test_comments_quotes_and_empty_values(self):
        path = self.config('# comment\nDB_PASSWORD="a # b"\nDB_SSL_ROOT_CERT=\n')
        self.assertEqual({'DB_PASSWORD': 'a # b', 'DB_SSL_ROOT_CERT': ''}, module.load_config(path))

    def test_unknown_duplicate_and_malformed_lines_rejected(self):
        for content in ('SECRET=private', 'DB_USERNAME=a\nDB_USERNAME=b', 'export DB_USERNAME=a', 'DB_PASSWORD="bad'):
            with self.subTest(content=content):
                with self.assertRaises(ValueError):
                    module.load_config(self.config(content))

    def test_private_permissions_required(self):
        with self.assertRaises(ValueError):
            module.load_config(self.config('DB_USERNAME=test', mode=0o644))


if __name__ == '__main__':
    unittest.main()
