import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useDeleteWorktree } from "@/hooks/use-worktrees";
import type { WorktreeInfo } from "@/types";

interface DeleteWorktreeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoPath: string;
  worktree: WorktreeInfo;
}

export function DeleteWorktreeDialog({
  open,
  onOpenChange,
  repoPath,
  worktree,
}: DeleteWorktreeDialogProps) {
  const deleteMutation = useDeleteWorktree();

  const handleDelete = () => {
    deleteMutation.mutate(
      { repoPath, worktreeName: worktree.name },
      {
        onSuccess: () => onOpenChange(false),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Worktree</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete the worktree{" "}
            <strong>{worktree.branch ?? worktree.name}</strong>? This will
            remove the worktree directory. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
        {deleteMutation.isError && (
          <p className="text-sm text-destructive">
            {(deleteMutation.error as Error).message}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
