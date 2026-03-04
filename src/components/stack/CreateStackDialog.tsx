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
import { BranchCombobox } from "@/components/worktree/BranchCombobox";
import { useBranches } from "@/hooks/use-branches";
import { useCreateStack } from "@/hooks/use-stacks";

interface ProgressEvent {
  step: number;
  total: number;
  message: string;
}

interface CreateStackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoPath: string;
}

export function CreateStackDialog({ open, onOpenChange, repoPath }: CreateStackDialogProps) {
  const [stackName, setStackName] = useState("");
  const [rootBranch, setRootBranch] = useState("");
  const [initialBranch, setInitialBranch] = useState("");
  const [worktreeName, setWorktreeName] = useState("");
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);

  const { data: branches } = useBranches(open ? repoPath : null);
  const createMutation = useCreateStack();

  const localBranches = branches?.filter((b) => !b.is_remote) ?? [];

  const defaultRoot = useMemo(() => {
    const names = localBranches.map((b) => b.name);
    if (names.includes("master")) return "master";
    if (names.includes("main")) return "main";
    return "";
  }, [localBranches]);

  useEffect(() => {
    if (open && !rootBranch) {
      setRootBranch(defaultRoot);
    }
  }, [open, defaultRoot]);

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

  const deriveWorktreeName = (branch: string) => {
    return branch.split("/").pop() ?? branch;
  };

  const handleBranchChange = (value: string) => {
    setInitialBranch(value);
    if (!nameManuallyEdited) {
      setWorktreeName(deriveWorktreeName(value));
    }
  };

  const resetForm = () => {
    setStackName("");
    setRootBranch(defaultRoot);
    setInitialBranch("");
    setWorktreeName("");
    setNameManuallyEdited(false);
  };

  const handleCreate = () => {
    if (!stackName || !rootBranch || !initialBranch || !worktreeName) return;
    createMutation.mutate(
      {
        repo_path: repoPath,
        stack_name: stackName,
        root_branch: rootBranch,
        initial_branch: initialBranch,
        worktree_name: worktreeName,
      },
      {
        onSuccess: () => {
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
          <DialogTitle>Create Stack</DialogTitle>
          <DialogDescription>
            Create a new stack of dependent branches.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="stack-name">Stack Name</Label>
            <Input
              id="stack-name"
              placeholder="e.g., auth-stack"
              value={stackName}
              onChange={(e) => setStackName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Root Branch</Label>
            <BranchCombobox
              branches={localBranches}
              value={rootBranch}
              onValueChange={setRootBranch}
              placeholder="master"
            />
            <p className="text-xs text-muted-foreground">
              The trunk branch this stack is based on.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="initial-branch">First Branch Name</Label>
            <Input
              id="initial-branch"
              placeholder="e.g., feature/auth-part1"
              value={initialBranch}
              onChange={(e) => handleBranchChange(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wt-name">Worktree Name</Label>
            <Input
              id="wt-name"
              placeholder="e.g., auth-part1"
              value={worktreeName}
              onChange={(e) => {
                setWorktreeName(e.target.value);
                setNameManuallyEdited(true);
              }}
            />
          </div>
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
              !stackName ||
              !rootBranch ||
              !initialBranch ||
              !worktreeName
            }
          >
            {createMutation.isPending ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
