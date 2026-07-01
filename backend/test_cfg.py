import sys
import json
from cfg_analyzer import analyze_reachability

source = """
def test(x):
    if x>5:
        print("A")
    else:
        print("B")
    print("Done")
    return
    print("hello")  # Line 8: dead code

if False:
    dangerous()  # Line 11: unreachable code
"""

res = analyze_reachability(source)
print(json.dumps(res, indent=2))
