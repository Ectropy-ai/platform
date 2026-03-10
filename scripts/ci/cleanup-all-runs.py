#!/usr/bin/env python3
import subprocess
import json
from concurrent.futures import ThreadPoolExecutor, as_completed


def delete_run(repo: str, run_id: str) -> str:
    try:
        cmd = [
            "gh",
            "api",
            "-X",
            "DELETE",
            f"repos/{repo}/actions/runs/{run_id}",
        ]
        subprocess.run(cmd, capture_output=True, check=False, timeout=5)
        return f"\u2713 Deleted {run_id}"
    except Exception as exc:  # pragma: no cover - best effort cleanup
        return f"\u2717 Failed {run_id}: {exc}"


def main() -> None:
    repo = "luhtech/Ectropy"
    print(f"Cleaning workflow runs for {repo}...")

    workflows_cmd = ["gh", "api", f"repos/{repo}/actions/workflows", "--paginate"]
    workflows = json.loads(subprocess.check_output(workflows_cmd))

    total_deleted = 0
    for workflow in workflows.get("workflows", []):
        print(f"\nProcessing: {workflow['name']} (ID: {workflow['id']})")

        runs_cmd = [
            "gh",
            "api",
            f"repos/{repo}/actions/workflows/{workflow['id']}/runs",
            "--paginate",
            "--jq",
            ".workflow_runs[].id",
        ]
        run_ids = subprocess.check_output(runs_cmd).decode().strip().split("\n")
        run_ids = [run_id for run_id in run_ids if run_id]

        if not run_ids:
            print("  No runs to delete")
            continue

        print(f"  Found {len(run_ids)} runs to delete")

        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(delete_run, repo, run_id) for run_id in run_ids]
            for future in as_completed(futures):
                result = future.result()
                if "\u2713" in result:
                    total_deleted += 1
                if total_deleted and total_deleted % 100 == 0:
                    print(f"  Progress: {total_deleted} deleted...")

    print(f"\n\u2705 Total runs deleted: {total_deleted}")


if __name__ == "__main__":
    main()
