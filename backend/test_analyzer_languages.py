import tempfile
import unittest
from pathlib import Path

from analyzer import (
    ENTERPRISE_SOURCE_EXTENSIONS,
    analyze_source_files,
    detect_language,
    supported_languages_summary,
)


class TestAnalyzerLanguages(unittest.TestCase):
    def test_enterprise_extensions_present(self):
        self.assertIn(".java", ENTERPRISE_SOURCE_EXTENSIONS)
        self.assertIn(".go", ENTERPRISE_SOURCE_EXTENSIONS)
        self.assertIn(".ts", ENTERPRISE_SOURCE_EXTENSIONS)
        self.assertIn(".js", ENTERPRISE_SOURCE_EXTENSIONS)

    def test_detect_language(self):
        self.assertEqual(detect_language("src/main.java"), "java")
        self.assertEqual(detect_language("pkg/main.go"), "go")
        self.assertEqual(detect_language("web/app.tsx"), "typescript")
        self.assertEqual(detect_language("web/util.js"), "javascript")
        self.assertEqual(detect_language("app/main.py"), "python")

    def test_analyze_multilanguage_repo(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "app.py").write_text(
                "def foo():\n    if True:\n        return 1\n",
                encoding="utf-8",
            )
            (root / "main.java").write_text(
                "public class Main {\n  public int bar() { if (true) return 1; return 0; }\n}\n",
                encoding="utf-8",
            )
            (root / "main.go").write_text(
                "package main\nfunc Baz() int {\n\tif true { return 1 }\n\treturn 0\n}\n",
                encoding="utf-8",
            )
            (root / "util.ts").write_text(
                "export function qux(): number {\n  if (true) return 1;\n  return 0;\n}\n",
                encoding="utf-8",
            )

            modules, _ = analyze_source_files(str(root), git_repo=None)
            langs = {m["language"] for m in modules}
            paths = {m["file_path"] for m in modules}

            self.assertIn("python", langs)
            self.assertIn("java", langs)
            self.assertIn("go", langs)
            self.assertIn("typescript", langs)
            self.assertEqual(len(modules), 4)
            self.assertIn("app.py", paths)
            self.assertIn("main.java", paths)
            self.assertIn("main.go", paths)
            self.assertIn("util.ts", paths)

            for m in modules:
                self.assertGreater(m["lines_of_code"], 0)
                self.assertGreaterEqual(m["cyclomatic_complexity"], 0)

    def test_supported_languages_summary(self):
        summary = supported_languages_summary()
        self.assertIn("enterprise", summary)
        self.assertIn("java", summary["enterprise"])


if __name__ == "__main__":
    unittest.main()
