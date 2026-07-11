import os
import shutil
import subprocess
from typing import Any
from git import Repo

import anthropic
import database
import redis_cache

# Ensure anthropic API key is available
anthropic_api_key = os.getenv("ANTHROPIC_API_KEY")
client = anthropic.Anthropic(api_key=anthropic_api_key) if anthropic_api_key else None


def _get_branch_head_sha(repo_url: str, branch_name: str) -> str | None:
    """Fetch the branch HEAD SHA without cloning, useful for cache key."""
    try:
        output = subprocess.check_output(
            ["git", "ls-remote", repo_url, f"refs/heads/{branch_name}"],
            text=True,
            timeout=10
        )
        if output:
            return output.split()[0]
    except Exception:
        pass
    return None


def _get_branch_diff_and_commits(repo_url: str, branch_name: str, base_branch: str = "main") -> tuple[list[str], list[str]]:
    """Clone repo, get touched files and commit messages between base_branch and branch_name."""
    import tempfile
    tmp_dir = tempfile.mkdtemp(prefix="telemetryx_branch_")
    
    try:
        # Use a blobless clone to fetch full commit graph (prevent diff failures) but no files
        repo = Repo.clone_from(repo_url, tmp_dir, filter="blob:none")
        
        # If the remote branches exist, we can diff them
        try:
            target_ref = f"origin/{branch_name}"
            base_ref = f"origin/{base_branch}"
            
            # Get touched files
            diff_str = repo.git.diff(f"{base_ref}...{target_ref}", name_only=True)
            touched_files = [f.strip() for f in diff_str.splitlines() if f.strip()]
            
            # Get commit messages safely
            commits = list(repo.iter_commits(f"{base_ref}..{target_ref}"))
            commit_messages = [c.message.strip() for c in commits if c.message]
            
            return touched_files, commit_messages
        except Exception as e:
            # Fallback if origin/main doesn't exist, try origin/master
            if base_branch == "main" and "origin/main" in str(e):
                return _get_branch_diff_and_commits(repo_url, branch_name, base_branch="master")
            raise ValueError(f"Could not diff branches: {e}")
            
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

def analyze_branch_noise(repo_url: str, branch_name: str) -> dict[str, Any]:
    """Analyzes a branch for noise by cross-referencing touched files with existing architectural findings."""
    
    if not client:
        return {
            "branch": branch_name,
            "status": "error",
            "summary": "Anthropic API key is not configured. Cannot generate branch summary.",
            "touched_unstable_files": [],
        }

    # 1. Check Cache First
    head_sha = _get_branch_head_sha(repo_url, branch_name)
    if head_sha:
        cached = redis_cache.get_cached_branch_noise(repo_url, head_sha)
        if cached:
            return cached
    
    # 2. Get diff files and commits
    touched_files, commit_messages = _get_branch_diff_and_commits(repo_url, branch_name)
    
    if not touched_files:
        result = {
            "branch": branch_name,
            "status": "clean",
            "summary": "This branch does not modify any files compared to the base branch.",
            "touched_unstable_files": [],
        }
        if head_sha:
            redis_cache.set_cached_branch_noise(repo_url, head_sha, result)
        return result
    
    # 3. Get the latest analysis job for this repo
    latest_job = database.get_last_completed_job_for_repo(repo_url)
    if not latest_job:
        result = {
            "branch": branch_name,
            "status": "no_baseline",
            "summary": "No completed baseline analysis found for this repository. Run a full scan first.",
            "touched_unstable_files": [],
        }
        if head_sha:
            redis_cache.set_cached_branch_noise(repo_url, head_sha, result)
        return result
        
    job_id = latest_job["id"]
    
    # 4. Retrieve open findings for the touched files
    all_modules = database.get_job_modules(job_id)
    mod_by_path = {m["file_path"]: m for m in all_modules}
    
    unstable_files = []
    llm_findings_context = []
    
    for fpath in touched_files:
        m = mod_by_path.get(fpath)
        if m and m.get("narrative"):
            narrative = m["narrative"]
            # Filter for critical or warning sections
            risks = [sec for sec in narrative if sec.get("severity") in ("critical", "warning")]
            if risks:
                unstable_files.append({
                    "file_path": fpath,
                    "risk_level": m.get("risk_level"),
                    "debt_score": m.get("debt_score"),
                    "findings": [r.get("title") for r in risks]
                })
                
                # Format for LLM context
                findings_str = "; ".join([r.get("title", "") for r in risks])
                llm_findings_context.append(f"- {fpath}: {findings_str}")
    
    # 5. Use LLM to summarize the noise and overlap
    if unstable_files:
        commits_text = "\n".join(f"- {msg}" for msg in commit_messages[:50]) # cap at 50 commits
        findings_text = "\n".join(llm_findings_context)
        
        prompt = f"""You are an expert engineering manager reviewing a branch's potential impact on code quality.
We are analyzing branch: '{branch_name}'

COMMIT MESSAGES ON THIS BRANCH:
{commits_text}

UNSTABLE FILES TOUCHED BY THIS BRANCH AND THEIR KNOWN ISSUES:
{findings_text}

Provide a concise, 2-3 sentence summary of what this branch is trying to achieve (based on the commit messages), and highlight how it interacts with the already-unstable files. For example: "This PR touches 3 already-unstable files and overlaps with what feature X was doing." 
Do NOT mention that you are an AI or that you are analyzing commits. Speak directly to the client as an automated code health assistant.
"""
        try:
            response = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=150,
                temperature=0.3,
                messages=[
                    {"role": "user", "content": prompt}
                ]
            )
            llm_summary = response.content[0].text.strip()
            status = "analyzed"
        except Exception as e:
            llm_summary = "An error occurred while generating the summary. Please review the unstable files manually."
            status = "error"
    else:
        llm_summary = "This branch touches files that have no major architectural warnings."
        status = "analyzed"
        
    result = {
        "branch": branch_name,
        "status": status,
        "summary": llm_summary,
        "touched_file_count": len(touched_files),
        "touched_unstable_files": unstable_files
    }
    
    if head_sha:
        redis_cache.set_cached_branch_noise(repo_url, head_sha, result)
        
    return result
