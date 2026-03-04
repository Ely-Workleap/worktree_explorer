import { useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BranchCombobox } from "./BranchCombobox";
import { useBranches } from "@/hooks/use-branches";
import { useCreateWorktree } from "@/hooks/use-worktrees";

interface ProgressEvent {
  step: number;
  total: number;
  message: string;
}

interface CreateWorktreeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoPath: string;
  onCreated?: (name: string) => void;
}

export function CreateWorktreeDialog({
  open,
  onOpenChange,
  repoPath,
  onCreated,
}: CreateWorktreeDialogProps) {
  const [name, setName] = useState("");
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false);
  const [branchMode, setBranchMode] = useState<"existing" | "new">("new");
  const [selectedBranch, setSelectedBranch] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [baseBranch, setBaseBranch] = useState("");

  // Derive a worktree name from a branch name: "feature/my-thing" -> "my-thing"
  const deriveNameFromBranch = (branch: string) => {
    const lastSegment = branch.split("/").pop() ?? branch;
    return lastSegment;
  };

  const handleBranchChange = (branch: string, setter: (v: string) => void) => {
    setter(branch);
    if (!nameManuallyEdited) {
      setName(deriveNameFromBranch(branch));
    }
  };

  const [progress, setProgress] = useState<ProgressEvent | null>(null);

  const { data: branches } = useBranches(open ? repoPath : null);
  const createMutation = useCreateWorktree();

  const localBranches = branches?.filter((b) => !b.is_remote) ?? [];
  const allBranches = branches ?? [];

  // Default base branch to master or main
  const defaultBaseBranch = useMemo(() => {
    const names = localBranches.map((b) => b.name);
    if (names.includes("master")) return "master";
    if (names.includes("main")) return "main";
    return "";
  }, [localBranches]);

  useEffect(() => {
    if (open && !baseBranch) {
      setBaseBranch(defaultBaseBranch);
    }
  }, [open, defaultBaseBranch]);

  // Listen for progress events from the backend
  useEffect(() => {
    if (!createMutation.isPending) {
      setProgress(null);
      return;
    }
    const unlisten = listen<ProgressEvent>("create-worktree-progress", (event) => {
      setProgress(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [createMutation.isPending]);

  const resetForm = () => {
    setName("");
    setNameManuallyEdited(false);
    setSelectedBranch("");
    setNewBranchName("");
    setBaseBranch(defaultBaseBranch);
  };

  const handleCreate = () => {
    const branch = branchMode === "existing" ? selectedBranch : newBranchName;
    if (!name || !branch) return;

    createMutation.mutate(
      {
        repo_path: repoPath,
        name,
        branch,
        create_branch: branchMode === "new",
        base_branch: branchMode === "new" && baseBranch ? baseBranch : null,
      },
      {
        onSuccess: () => {
          onCreated?.(name);
          onOpenChange(false);
          resetForm();
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Worktree</DialogTitle>
          <DialogDescription>
            Create a new worktree for this repository.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="wt-name">Worktree Name</Label>
            <Input
              id="wt-name"
              placeholder="e.g., feature-auth"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameManuallyEdited(true);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>Branch</Label>
            <Select
              value={branchMode}
              onValueChange={(v) => setBranchMode(v as "existing" | "new")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">Create new branch</SelectItem>
                <SelectItem value="existing">
                  Use existing branch
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {branchMode === "new" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="new-branch">New Branch Name</Label>
                <Input
                  id="new-branch"
                  placeholder="e.g., feature/my-feature"
                  value={newBranchName}
                  onChange={(e) => handleBranchChange(e.target.value, setNewBranchName)}
                />
              </div>
              <div className="space-y-2">
                <Label>Base Branch</Label>
                <BranchCombobox
                  branches={allBranches}
                  value={baseBranch}
                  onValueChange={setBaseBranch}
                  placeholder="HEAD (default)"
                />
                <p className="text-xs text-muted-foreground">
                  The new branch will be created from this branch. Defaults to
                  HEAD if not selected.
                </p>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Label>Select Branch</Label>
              <BranchCombobox
                branches={allBranches}
                value={selectedBranch}
                onValueChange={(v) => handleBranchChange(v, setSelectedBranch)}
                placeholder="Choose a branch..."
              />
            </div>
          )}
        </div>
        {createMutation.isPending && progress && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{progress.message}</span>
              <span className="text-muted-foreground">
                {progress.step}/{progress.total}
              </span>
            </div>
            <Progress value={progress.step} max={progress.total} />
          </div>
        )}
        {createMutation.isError && (
          <p className="text-sm text-destructive">
            {createMutation.error instanceof Error
              ? createMutation.error.message
              : String(createMutation.error)}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={createMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={
              createMutation.isPending ||
              !name ||
              (branchMode === "new" ? !newBranchName : !selectedBranch)
            }
          >
            {createMutation.isPending ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
