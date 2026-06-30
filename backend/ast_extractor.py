import ast
import json
from typing import Any

class MetadataExtractor(ast.NodeVisitor):
    def __init__(self):
        self.metadata = {
            "functions": [],
            "classes": [],
            "variables": [],
            "assignments": [],
            "ifs": [],
            "fors": [],
            "whiles": [],
            "trys": [],
            "raises": [],
            "imports": [],
            "calls": [],
            "decorators": []
        }
        self.current_function = None
        self.current_class = None

    def visit_ClassDef(self, node: ast.ClassDef):
        class_info = {
            "name": node.name,
            "start": getattr(node, "lineno", -1),
            "end": getattr(node, "end_lineno", -1),
            "methods": [],
            "decorators": [self._get_name(d) for d in node.decorator_list if self._get_name(d)]
        }
        self.metadata["classes"].append(class_info)
        if class_info["decorators"]:
            self.metadata["decorators"].extend(class_info["decorators"])

        old_class = self.current_class
        self.current_class = class_info
        self.generic_visit(node)
        self.current_class = old_class

    def visit_FunctionDef(self, node: ast.FunctionDef | ast.AsyncFunctionDef):
        args = []
        if getattr(node, "args", None):
            args = [arg.arg for arg in node.args.args]
            if getattr(node.args, "vararg", None):
                args.append(f"*{node.args.vararg.arg}")
            if getattr(node.args, "kwarg", None):
                args.append(f"**{node.args.kwarg.arg}")

        func_info = {
            "name": node.name,
            "start": getattr(node, "lineno", -1),
            "end": getattr(node, "end_lineno", -1),
            "arguments": args,
            "returns": [],
            "calls": [],
            "decorators": [self._get_name(d) for d in getattr(node, "decorator_list", []) if self._get_name(d)]
        }
        
        self.metadata["functions"].append(func_info)
        if self.current_class:
            self.current_class["methods"].append(func_info["name"])
        
        if func_info["decorators"]:
            self.metadata["decorators"].extend(func_info["decorators"])

        old_func = self.current_function
        self.current_function = func_info
        
        # We manually visit body so that Returns/Calls inside the function update current_function
        for child in node.body:
            self.visit(child)
            
        self.current_function = old_func

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef):
        self.visit_FunctionDef(node)

    def visit_Return(self, node: ast.Return):
        if self.current_function and node.value:
            val_name = self._get_name(node.value)
            if val_name:
                self.current_function["returns"].append(val_name)
        self.generic_visit(node)

    def visit_Call(self, node: ast.Call):
        call_name = self._get_name(node.func)
        if call_name:
            if self.current_function and call_name not in self.current_function["calls"]:
                self.current_function["calls"].append(call_name)
            if call_name not in self.metadata["calls"]:
                self.metadata["calls"].append(call_name)
        self.generic_visit(node)

    def visit_Assign(self, node: ast.Assign):
        for target in node.targets:
            name = self._get_name(target)
            if name:
                if name not in self.metadata["variables"]:
                    self.metadata["variables"].append(name)
                self.metadata["assignments"].append(name)
        self.generic_visit(node)

    def visit_AnnAssign(self, node: ast.AnnAssign):
        name = self._get_name(node.target)
        if name:
            if name not in self.metadata["variables"]:
                self.metadata["variables"].append(name)
            self.metadata["assignments"].append(name)
        self.generic_visit(node)

    def visit_If(self, node: ast.If):
        self.metadata["ifs"].append({"start": getattr(node, "lineno", -1), "end": getattr(node, "end_lineno", -1)})
        self.generic_visit(node)

    def visit_For(self, node: ast.For):
        self.metadata["fors"].append({"start": getattr(node, "lineno", -1), "end": getattr(node, "end_lineno", -1)})
        self.generic_visit(node)

    def visit_AsyncFor(self, node: ast.AsyncFor):
        self.metadata["fors"].append({"start": getattr(node, "lineno", -1), "end": getattr(node, "end_lineno", -1)})
        self.generic_visit(node)

    def visit_While(self, node: ast.While):
        self.metadata["whiles"].append({"start": getattr(node, "lineno", -1), "end": getattr(node, "end_lineno", -1)})
        self.generic_visit(node)

    def visit_Try(self, node: ast.Try):
        self.metadata["trys"].append({"start": getattr(node, "lineno", -1), "end": getattr(node, "end_lineno", -1)})
        self.generic_visit(node)
        
    def visit_TryStar(self, node: Any): # For python 3.11+
        self.metadata["trys"].append({"start": getattr(node, "lineno", -1), "end": getattr(node, "end_lineno", -1)})
        self.generic_visit(node)

    def visit_Raise(self, node: ast.Raise):
        self.metadata["raises"].append({"start": getattr(node, "lineno", -1), "end": getattr(node, "end_lineno", -1)})
        self.generic_visit(node)

    def visit_Import(self, node: ast.Import):
        for alias in node.names:
            if alias.name not in self.metadata["imports"]:
                self.metadata["imports"].append(alias.name)
        self.generic_visit(node)

    def visit_ImportFrom(self, node: ast.ImportFrom):
        if node.module:
            for alias in node.names:
                name = f"{node.module}.{alias.name}"
                if name not in self.metadata["imports"]:
                    self.metadata["imports"].append(name)
        self.generic_visit(node)

    def _get_name(self, node: ast.AST) -> str:
        if isinstance(node, ast.Name):
            return node.id
        elif isinstance(node, ast.Attribute):
            base = self._get_name(node.value)
            return f"{base}.{node.attr}" if base else node.attr
        elif isinstance(node, ast.Constant):
            return str(node.value)
        elif isinstance(node, ast.Call):
            return self._get_name(node.func)
        return ""

def extract_metadata(file_path: str, source: str = None) -> dict:
    if source is None:
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                source = f.read()
        except Exception as e:
            return {"file": file_path, "error": str(e)}

    try:
        tree = ast.parse(source)
    except SyntaxError as e:
        return {"file": file_path, "error": f"SyntaxError: {str(e)}"}

    extractor = MetadataExtractor()
    extractor.visit(tree)
    
    # Use just the basename or the full path depending on preference
    # The example had "payment.py", so we can use file_path directly.
    import os
    result = {"file": os.path.basename(file_path) if '/' in file_path or '\\' in file_path else file_path}
    result.update(extractor.metadata)
    return result

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        for arg in sys.argv[1:]:
            print(json.dumps(extract_metadata(arg), indent=2))
