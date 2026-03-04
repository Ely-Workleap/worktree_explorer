import { useEffect, useState } from "react";
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
import { useAddBranchToStack } from "@/hooks/use-stacks";

interface ProgressEvent {
  step: number;
  total: number;
  message: string;
}

interface AddBranchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoPath: string;
  stackName: string;
}

export function AddBranchDialog({ open, onOpenChange, repoPath, stackName }: AddBranchDialogProps) {
  const [branchName, setBranchName] = useState("");
  const [worktreeName, setWorktreeName] = useState("");
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);

  const addMutation = useAddBranchToStack();

  useEffect(() => {
    if (!addMutation.isPending) {
      setProgress(null);
      return;
    }
    const unlisten = listen<ProgressEvent>("create-worktree-progress", (event) => {
      setProgress(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [addMutation.isPending]);

  const handleBranchChange = (value: string) => {
    setBranchName(value);
    if (!nameManuallyEdited) {
      setWorktreeName(value.split("/").pop() ?? value);
    }
  };

  const resetForm = () => {
    setBranchName("");
    setWorktreeName("");
    setNameManuallyEdited(false);
  };

  const handleAdd = () => {
    if (!branchName || !worktreeName) return;
    addMutation.mutate(
      {
        repo_path: repoPath,
        stack_name: stackName,
        branch_name: branchName,
        worktree_name: worktreeName,
        position: null,
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
          <DialogTitle>Add Branch to Stack</DialogTitle>
          <DialogDescription>
            Add a new branch to the top of <strong>{stackName}</strong>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="branch-name">Branch Name</Label>
            <Input
              id="branch-name"
              placeholder="e.g., feature/auth-part2"
              value={branchName}
              onChange={(e) => handleBranchChange(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wt-name">Worktree Name</Label>
            <Input
              id="wt-name"
              placeholder="e.g., auth-part2"
              value={worktreeName}
              onChange={(e) => {
                setWorktreeName(e.target.value);
                setNameManuallyEdited(true);
              }}
            />
          </div>
        </div>
        {addMutation.isPending && progress && (
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
        {addMutation.isError && (
          <p className="text-sm text-destructive">
            {addMutation.error instanceof Error
              ? addMutation.error.message
              : String(addMutation.error)}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={addMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleAdd}
            disabled={addMutation.isPending || !branchName || !worktreeName}
          >
            {addMutation.isPending ? "Adding..." : "Add Branch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
