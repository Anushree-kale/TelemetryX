import sys
import json
from dfg_analyzer import analyze_dataflow
from call_graph import CallGraph
import tempfile
from pathlib import Path

# Test DFG
print("--- Phase A.5: Data Flow Graph ---")
source_dfg = """
def test():
    a = 5
    a = 6
    print(a)
    
def test2():
    password = input()
    authenticate(password)
"""
dfg_issues = analyze_dataflow(source_dfg)
print(json.dumps(dfg_issues, indent=2))


# Test Dead Functions and Impact Analysis
print("\n--- Phase A.6 & A.7: Dead Functions & Impact Analysis ---")
source_cg = """
def helper():
    pass

def invoice():
    pass
    
def analytics():
    pass

def calculateRefund():
    invoice()
    analytics()

def payment():
    calculateRefund()

def checkout():
    payment()

def main():
    checkout()
"""
with tempfile.TemporaryDirectory() as tmpdir:
    p = Path(tmpdir) / "test_script.py"
    p.write_text(source_cg)
    
    cg = CallGraph(tmpdir)
    dead = cg.get_dead_functions()
    print("Dead Functions (in-degree 0):", dead)
    
    impacted = cg.impact_analysis("calculateRefund")
    print("Impact Analysis for 'calculateRefund':", impacted)
