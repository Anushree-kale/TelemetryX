import json
from pathlib import Path
from typing import Dict, List
from ast_extractor import extract_metadata

class CallGraph:
    def __init__(self, repo_path: str):
        self.repo_path = Path(repo_path)
        self.graph: Dict[str, List[str]] = {}
        self._build_graph()

    def _build_graph(self):
        """Builds a function-to-function call graph across all Python files in the repo."""
        for py_file in self.repo_path.rglob("*.py"):
            # Skip virtual environments and caches
            if any(part.startswith(".") or part in ("venv", "env", "__pycache__", "node_modules") for part in py_file.parts):
                continue
                
            metadata = extract_metadata(str(py_file))
            
            for func in metadata.get("functions", []):
                func_name = func.get("name")
                if not func_name:
                    continue
                
                # Extract calls made within this function
                raw_calls = func.get("calls", [])
                
                # Clean up calls (e.g., transform 'self.validate' -> 'validate' or 'db.commit' -> 'commit')
                # to build a simplified call mapping as requested.
                cleaned_calls = []
                for call in raw_calls:
                    if call:
                        # Taking the last part handles objects/module prefixes
                        base_call = call.split(".")[-1]
                        cleaned_calls.append(base_call)
                
                # Store in graph
                if func_name not in self.graph:
                    self.graph[func_name] = []
                self.graph[func_name].extend(cleaned_calls)
                
                # Deduplicate
                self.graph[func_name] = sorted(list(set(self.graph[func_name])))

    def save_to_file(self, output_file: str = "call_graph.json"):
        """Stores the graph in a JSON file."""
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(self.graph, f, indent=2)

    def who_calls(self, target_function: str) -> List[str]:
        """Returns a list of all functions that call the target function."""
        callers = []
        for caller_func, calls in self.graph.items():
            if target_function in calls:
                callers.append(caller_func)
        return callers

    def what_breaks(self, target_function: str) -> List[str]:
        """
        If you remove a function, everything that calls it directly breaks.
        We can also expand this to a recursive breakdown if needed, 
        but direct callers are the immediate breakages.
        """
        return self.who_calls(target_function)

if __name__ == "__main__":
    import sys
    repo_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    
    print(f"Building call graph for {repo_dir}...")
    cg = CallGraph(repo_dir)
    cg.save_to_file("call_graph.json")
    print("Graph saved to call_graph.json\n")
    
    # Interactive query loop for testing
    print("Test Queries (type 'exit' to quit):")
    while True:
        try:
            func = input("Enter function name to analyze: ").strip()
            if func.lower() == 'exit':
                break
            if not func:
                continue
                
            callers = cg.who_calls(func)
            if callers:
                print(f"-> Who calls '{func}'? {', '.join(callers)}")
                print(f"-> If '{func}' is removed, these functions will break: {', '.join(callers)}\n")
            else:
                print(f"-> No functions found calling '{func}'.\n")
        except (EOFError, KeyboardInterrupt):
            break
