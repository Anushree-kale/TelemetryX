import ast
from typing import Any

def analyze_reachability(source: str) -> list[dict[str, Any]]:
    """
    Constructs a structural representation (AST block traversal) similar to a CFG
    to analyze reachability and detect Dead Code and Unreachable Code.
    """
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return []

    issues = []

    class ReachabilityVisitor(ast.NodeVisitor):
        def __init__(self):
            self.issues = []
            
        def visit_FunctionDef(self, node: ast.FunctionDef):
            self.analyze_block(node.body)
            # Do not use generic_visit here to avoid duplicate traversal
            # since analyze_block recurses into the body.
            # But we should visit inner functions/classes manually if they exist.
            for stmt in node.body:
                if isinstance(stmt, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                    self.visit(stmt)

        def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef):
            self.analyze_block(node.body)
            for stmt in node.body:
                if isinstance(stmt, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                    self.visit(stmt)

        def visit_ClassDef(self, node: ast.ClassDef):
            self.analyze_block(node.body)
            for stmt in node.body:
                if isinstance(stmt, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                    self.visit(stmt)

        def visit_Module(self, node: ast.Module):
            self.analyze_block(node.body)
            for stmt in node.body:
                if isinstance(stmt, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                    self.visit(stmt)

        def analyze_block(self, body: list[ast.stmt]):
            reachable = True
            for stmt in body:
                if not reachable:
                    self.issues.append({
                        "line": getattr(stmt, "lineno", -1),
                        "type": "dead_code",
                        "reason": "Execution always exits before reaching this statement."
                    })
                    # To avoid spamming, we could just break after the first dead statement in a block,
                    # but we'll collect all for completeness.

                # Visit block inner structure
                if isinstance(stmt, (ast.Return, ast.Break, ast.Continue, ast.Raise)):
                    reachable = False

                elif isinstance(stmt, ast.If):
                    cond_val = self.evaluate_condition(stmt.test)
                    
                    if cond_val is True:
                        self.analyze_block(stmt.body)
                        if stmt.orelse:
                            self.issues.append({
                                "line": getattr(stmt.orelse[0], "lineno", -1),
                                "type": "unreachable_code",
                                "reason": "Condition always True."
                            })
                    elif cond_val is False:
                        self.issues.append({
                            "line": getattr(stmt.body[0], "lineno", -1) if stmt.body else getattr(stmt, "lineno", -1),
                            "type": "unreachable_code",
                            "reason": "Condition always False."
                        })
                        if stmt.orelse:
                            self.analyze_block(stmt.orelse)
                    else:
                        # We must check if both branches terminate to know if code after if is dead
                        body_terminates = self.does_terminate(stmt.body)
                        orelse_terminates = self.does_terminate(stmt.orelse) if stmt.orelse else False
                        
                        if body_terminates and orelse_terminates:
                            reachable = False
                        
                        self.analyze_block(stmt.body)
                        if stmt.orelse:
                            self.analyze_block(stmt.orelse)

                elif isinstance(stmt, ast.While):
                    cond_val = self.evaluate_condition(stmt.test)
                    if cond_val is False:
                        self.issues.append({
                            "line": getattr(stmt.body[0], "lineno", -1) if stmt.body else getattr(stmt, "lineno", -1),
                            "type": "unreachable_code",
                            "reason": "Loop condition always False."
                        })
                        if stmt.orelse:
                            self.analyze_block(stmt.orelse)
                    else:
                        self.analyze_block(stmt.body)
                        if stmt.orelse:
                            self.analyze_block(stmt.orelse)
                            
                        # If infinite loop `while True:` without breaks, subsequent code is dead
                        if cond_val is True and not self._has_break(stmt.body):
                            reachable = False

                elif isinstance(stmt, (ast.For, getattr(ast, "AsyncFor", type(None)))):
                    self.analyze_block(stmt.body)
                    if stmt.orelse:
                        self.analyze_block(stmt.orelse)

                elif isinstance(stmt, getattr(ast, "Try", type(None))) or (hasattr(ast, "TryStar") and isinstance(stmt, getattr(ast, "TryStar"))):
                    self.analyze_block(stmt.body)
                    for handler in stmt.handlers:
                        self.analyze_block(handler.body)
                    if stmt.orelse:
                        self.analyze_block(stmt.orelse)
                    if stmt.finalbody:
                        self.analyze_block(stmt.finalbody)
                        if self.does_terminate(stmt.finalbody):
                            reachable = False

                elif isinstance(stmt, getattr(ast, "With", type(None))) or isinstance(stmt, getattr(ast, "AsyncWith", type(None))):
                    self.analyze_block(stmt.body)

        def evaluate_condition(self, test_node: ast.expr) -> bool | None:
            if isinstance(test_node, ast.Constant):
                return bool(test_node.value)
            return None

        def does_terminate(self, body: list[ast.stmt]) -> bool:
            if not body:
                return False
            for stmt in body:
                if isinstance(stmt, (ast.Return, ast.Raise, ast.Break, ast.Continue)):
                    return True
                if isinstance(stmt, ast.If):
                    body_term = self.does_terminate(stmt.body)
                    orelse_term = self.does_terminate(stmt.orelse) if stmt.orelse else False
                    if body_term and orelse_term:
                        return True
                if hasattr(stmt, "finalbody") and stmt.finalbody and self.does_terminate(stmt.finalbody):
                    return True
            return False
            
        def _has_break(self, body: list[ast.stmt]) -> bool:
            # Check for a break statement that isn't masked by an inner loop
            class BreakFinder(ast.NodeVisitor):
                def __init__(self):
                    self.found = False
                def visit_Break(self, node):
                    self.found = True
                def visit_For(self, node):
                    pass # Ignore inner loops
                def visit_While(self, node):
                    pass # Ignore inner loops
                def visit_AsyncFor(self, node):
                    pass
            
            finder = BreakFinder()
            for stmt in body:
                finder.visit(stmt)
                if finder.found:
                    return True
            return False

    visitor = ReachabilityVisitor()
    visitor.visit(tree)
    
    # Deduplicate issues on the same line
    unique_issues = {}
    for issue in visitor.issues:
        key = (issue["line"], issue["type"])
        if key not in unique_issues:
            unique_issues[key] = issue

    return sorted(unique_issues.values(), key=lambda x: x["line"])
