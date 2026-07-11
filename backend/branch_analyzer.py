import os
import shutil
from typing import Any
from git import Repo

import anthropic
import database

# Ensure anthropic API key is available
anthropic_api_key = os.getenv("ANTHROPIC_API_KEY")
client = anthropic.Anthropic(api_key=anthropic_api_key) if anthropic_api_key else None

def _get_branch_diff_and_commits(repo_url: str, branch_name: str, base_branch: str = "main") -> tuple[list[str], list[str]]:
    """Clone repo, get touched files and commit messages between base_branch and branch_name."""
    import tempfile
    tmp_dir = tempfile.mkdtemp(prefix="telemetryx_branch_")
    
    try:
        # Clone without checkout to save time
        repo = Repo.clone_from(repo_url, tmp_dir, no_checkout=True)
        
        # Make sure both branches are fetched
        for remote in repo.remotes:
            remote.fetch()
        
        # If the remote branches exist, we can diff them
        try:
            target_ref = f"origin/{branch_name}"
            base_ref = f"origin/{base_branch}"
            
            # Get touched files
            diff_str = repo.git.diff(f"{base_ref}...{target_ref}", name_only=True)
            touched_files = [f.strip() for f in diff_str.splitlines() if f.strip()]
            
            # Get commit messages
            log_str = repo.git.log(f"{base_ref}..{target_ref}", format="%s%n%b")
            commit_messages = [msg.strip() for msg in log_str.splitlines() if msg.strip()]
            
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
        raise RuntimeError("ANTHROPIC_API_KEY is not configured in the environment.")
    
    # 1. Get diff files and commits
    touched_files, commit_messages = _get_branch_diff_and_commits(repo_url, branch_name)
    
    if not touched_files:
        return {
            "branch": branch_name,
            "status": "clean",
            "summary": "This branch does not modify any files compared to the base branch.",
            "touched_unstable_files": [],
        }
    
    # 2. Get the latest analysis job for this repo
    latest_job = database.get_last_completed_job_for_repo(repo_url)
    if not latest_job:
        return {
            "branch": branch_name,
            "status": "no_baseline",
            "summary": "No completed baseline analysis found for this repository. Run a full scan first.",
            "touched_unstable_files": [],
        }
        
    job_id = latest_job["id"]
    
    # 3. Retrieve open findings for the touched files
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
    
    # 4. Use LLM to summarize the noise and overlap
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
                model="claude-3-5-sonnet-20241022",
                max_tokens=150,
                temperature=0.3,
                messages=[
                    {"role": "user", "content": prompt}
                ]
            )
            llm_summary = response.content[0].text.strip()
        except Exception as e:
            llm_summary = f"Error generating summary from LLM: {str(e)}"
    else:
        llm_summary = "This branch touches files that have no major architectural warnings."
        
    return {
        "branch": branch_name,
        "status": "analyzed",
        "summary": llm_summary,
        "touched_file_count": len(touched_files),
        "touched_unstable_files": unstable_files
    }
