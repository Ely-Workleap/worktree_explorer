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
import { Label } from "@/components/ui/label";
import { useDeleteStack } from "@/hooks/use-stacks";
import type { StackInfo } from "@/types";

interface DeleteStackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoPath: string;
  stack: StackInfo;
}

export function DeleteStackDialog({ open, onOpenChange, repoPath, stack }: DeleteStackDialogProps) {
  const [deleteWorktrees, setDeleteWorktrees] = useState(false);
  const deleteMutation = useDeleteStack();

  const handleDelete = () => {
    deleteMutation.mutate(
      { repoPath, stackName: stack.name, deleteWorktrees },
      {
        onSuccess: () => {
          onOpenChange(false);
          setDeleteWorktrees(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Stack</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete the stack <strong>{stack.name}</strong>?
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            This stack contains {stack.branches.length} branch{stack.branches.length !== 1 ? "es" : ""}:
          </p>
          <ul className="ml-4 list-disc text-sm text-muted-foreground">
            {stack.branches.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={deleteWorktrees}
              onChange={(e) => setDeleteWorktrees(e.target.checked)}
              className="rounded border-input"
            />
            <Label className="font-normal cursor-pointer">Also delete all worktrees</Label>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? "Deleting..." : "Delete Stack"}
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
