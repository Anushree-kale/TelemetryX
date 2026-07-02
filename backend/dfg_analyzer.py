import ast
from typing import Any

def analyze_dataflow(source: str) -> list[dict[str, Any]]:
    """
    Constructs a Data Flow Graph (DFG) proxy by tracking variable assignments and usages.
    Detects variables that are overwritten before being used.
    """
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return []

    class DFGVisitor(ast.NodeVisitor):
        def __init__(self):
            # List of scopes, each scope is a dict: var_name -> (line_assigned, is_used)
            self.scopes = [{}]
            self.issues = []

        def get_scope(self):
            return self.scopes[-1]

        def push_scope(self):
            self.scopes.append({})

        def pop_scope(self):
            scope = self.scopes.pop()
            # Flag variables that were assigned but never used before leaving scope.
            # Variables like `_` or conventionally ignored ones are skipped.
            for var, (line, used) in scope.items():
                if not used and not var.startswith("_"):
                    self.issues.append({
                        "variable": var,
                        "line": line,
                        "type": "unused_assignment",
                        "reason": f"Variable '{var}' assigned but never used before going out of scope."
                    })

        def record_assignment(self, name: str, line: int):
            if name == "_" or name.startswith("dummy"):
                return
            scope = self.get_scope()
            if name in scope:
                prev_line, used = scope[name]
                if not used:
                    self.issues.append({
                        "variable": name,
                        "line": prev_line,
                        "type": "overwritten_assignment",
                        "reason": f"Variable '{name}' overwritten before use (new assignment at line {line})."
                    })
            scope[name] = (line, False)

        def record_usage(self, name: str):
            for scope in reversed(self.scopes):
                if name in scope:
                    line, _ = scope[name]
                    scope[name] = (line, True)
                    return

        def visit_FunctionDef(self, node: ast.FunctionDef):
            self.push_scope()
            for arg in node.args.args:
                self.record_assignment(arg.arg, node.lineno)
            if node.args.vararg:
                self.record_assignment(node.args.vararg.arg, node.lineno)
            if node.args.kwarg:
                self.record_assignment(node.args.kwarg.arg, node.lineno)
            
            self.generic_visit(node)
            self.pop_scope()

        def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef):
            self.visit_FunctionDef(node)
            
        def visit_ClassDef(self, node: ast.ClassDef):
            self.push_scope()
            self.generic_visit(node)
            self.pop_scope()

        def visit_Assign(self, node: ast.Assign):
            self.visit(node.value)  # Visit RHS first to record usages
            for target in node.targets:
                self.extract_assignments(target)
                
        def visit_AnnAssign(self, node: ast.AnnAssign):
            if node.value:
                self.visit(node.value)
            self.extract_assignments(node.target)
            
        def visit_AugAssign(self, node: ast.AugAssign):
            self.visit(node.value)
            self.extract_usages(node.target)
            self.extract_assignments(node.target)

        def visit_Name(self, node: ast.Name):
            if isinstance(node.ctx, ast.Load):
                self.record_usage(node.id)

        def extract_assignments(self, node: ast.AST):
            if isinstance(node, ast.Name):
                self.record_assignment(node.id, getattr(node, "lineno", -1))
            elif isinstance(node, (ast.Tuple, ast.List)):
                for elt in node.elts:
                    self.extract_assignments(elt)
            elif isinstance(node, ast.Attribute):
                # Assigning to an attribute (e.g., self.x = 1), using the object
                self.visit(node.value)
            elif isinstance(node, ast.Subscript):
                self.visit(node.value)
                if getattr(node, "slice", None):
                    self.visit(node.slice)
                    
        def extract_usages(self, node: ast.AST):
            if isinstance(node, ast.Name):
                self.record_usage(node.id)
            elif isinstance(node, ast.Attribute):
                self.visit(node.value)
            elif isinstance(node, (ast.Tuple, ast.List)):
                for elt in node.elts:
                    self.extract_usages(elt)

    visitor = DFGVisitor()
    visitor.visit(tree)
    visitor.pop_scope()
    
    unique_issues = {}
    for issue in visitor.issues:
        key = (issue["line"], issue["variable"], issue["type"])
        if key not in unique_issues:
            unique_issues[key] = issue
            
    return sorted(unique_issues.values(), key=lambda x: x["line"])
