import { useState } from "react";
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

interface CreateWorktreeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoPath: string;
}

export function CreateWorktreeDialog({
  open,
  onOpenChange,
  repoPath,
}: CreateWorktreeDialogProps) {
  const [name, setName] = useState("");
  const [branchMode, setBranchMode] = useState<"existing" | "new">("new");
  const [selectedBranch, setSelectedBranch] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [baseBranch, setBaseBranch] = useState("");

  const { data: branches } = useBranches(open ? repoPath : null);
  const createMutation = useCreateWorktree();

  const localBranches = branches?.filter((b) => !b.is_remote) ?? [];

  const resetForm = () => {
    setName("");
    setSelectedBranch("");
    setNewBranchName("");
    setBaseBranch("");
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
              onChange={(e) => setName(e.target.value)}
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
                  onChange={(e) => setNewBranchName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Base Branch</Label>
                <BranchCombobox
                  branches={localBranches}
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
                branches={localBranches}
                value={selectedBranch}
                onValueChange={setSelectedBranch}
                placeholder="Choose a branch..."
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
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
        {createMutation.isError && (
          <p className="text-sm text-destructive">
            {(createMutation.error as Error).message}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
