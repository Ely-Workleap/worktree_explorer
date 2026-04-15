import { useState } from "react";
import {
  IterationCcw,
  Plus,
  Trash2,
  Loader2,
  ArrowUpFromLine,
  GitPullRequest,
  Pencil,
  Check,
  X,
  Bot,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { StackBranchRow } from "./StackBranchRow";
import { AddBranchDialog } from "./AddBranchDialog";
import { DeleteStackDialog } from "./DeleteStackDialog";
import { useStackDetails, useCascadeRebase, useRenameStack, useRemoveBranchFromStack } from "@/hooks/use-stacks";
import { useRebaseAction } from "@/hooks/use-worktrees";
import { useGhAvailable, useStackPrStatuses, useCreateStackPrs, useUpdateStackPrBases, usePushStack } from "@/hooks/use-github";
import { openClaudeCascadeResolve } from "@/lib/tauri";
import { useBuildConfig } from "@/hooks/use-build";
import type { StackInfo, CascadeRebaseResult } from "@/types";

interface StackCardProps {
  stack: StackInfo;
  repoPath: string;
}

export function StackCard({ stack, repoPath }: StackCardProps) {
  const [addBranchOpen, setAddBranchOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(stack.name);
  const [rebaseResult, setRebaseResult] = useState<CascadeRebaseResult | null>(null);

  const { data: details } = useStackDetails(repoPath, stack.name);
  const { data: buildConfig } = useBuildConfig(repoPath);
  const { data: ghAvailable } = useGhAvailable();
  const { data: prStatuses } = useStackPrStatuses(
    ghAvailable ? repoPath : null,
    ghAvailable ? stack.name : null,
  );

  const cascadeRebaseMutation = useCascadeRebase();
  const renameMutation = useRenameStack();
  const removeBranchMutation = useRemoveBranchFromStack();
  const rebaseActionMutation = useRebaseAction();
  const createPrsMutation = useCreateStackPrs();
  const updatePrBasesMutation = useUpdateStackPrBases();
  const pushMutation = usePushStack();

  const isBusy =
    cascadeRebaseMutation.isPending ||
    createPrsMutation.isPending ||
    updatePrBasesMutation.isPending ||
    pushMutation.isPending;

  const handleCascadeRebase = () => {
    setRebaseResult(null);
    cascadeRebaseMutation.mutate(
      { repoPath, stackName: stack.name },
      {
        onSuccess: (result) => setRebaseResult(result),
      },
    );
  };

  const handleRename = () => {
    if (!newName || newName === stack.name) {
      setIsRenaming(false);
      setNewName(stack.name);
      return;
    }
    renameMutation.mutate(
      { repoPath, oldName: stack.name, newName },
      { onSuccess: () => setIsRenaming(false) },
    );
  };

  const handleRemoveBranch = (branch: string) => {
    removeBranchMutation.mutate({
      repoPath,
      stackName: stack.name,
      branch,
      deleteWorktree: false,
    });
  };

  return (
    <div className="rounded-lg border bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          {isRenaming ? (
            <div className="flex items-center gap-1">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-6 w-40 text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename();
                  if (e.key === "Escape") {
                    setIsRenaming(false);
                    setNewName(stack.name);
                  }
                }}
              />
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={handleRename}>
                <Check className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={() => {
                  setIsRenaming(false);
                  setNewName(stack.name);
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <button
              className="flex items-center gap-1 text-sm font-semibold hover:text-primary"
              onClick={() => setIsRenaming(true)}
            >
              {stack.name}
              <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100" />
            </button>
          )}
          <Badge variant="secondary" className="text-[10px]">
            {stack.root_branch}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {stack.branches.length} branch{stack.branches.length !== 1 ? "es" : ""}
          </Badge>
        </div>
      </div>

      {/* Branch chain */}
      <div className="space-y-0 px-3 py-2">
        {/* Root branch label */}
        <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-2 w-2 rounded-full bg-muted-foreground" />
          {stack.root_branch}
        </div>
        {details?.map((branch, i) => (
          <StackBranchRow
            key={branch.branch}
            branch={branch}
            isFirst={i === 0}
            isLast={i === details.length - 1}
            prStatus={prStatuses?.[branch.branch]}
            onRemove={() => handleRemoveBranch(branch.branch)}
            buildConfig={buildConfig}
          />
        ))}
      </div>

      {/* Rebase result */}
      {rebaseResult && (
        <div className="border-t px-3 py-2 space-y-1">
          {rebaseResult.results.map((step) => (
            <p
              key={step.branch}
              className={`text-xs ${step.success ? "text-green-600" : "text-destructive"}`}
            >
              {step.branch}: {step.message}
            </p>
          ))}
          {rebaseResult.stopped_at && (() => {
            const stoppedBranch = rebaseResult.stopped_at!;
            const stoppedStep = rebaseResult.results.find(
              (s) => s.branch === stoppedBranch,
            );
            const stoppedDetail = details?.find((d) => d.branch === stoppedBranch);

            return (
              <div className="flex items-center gap-2 pt-1">
                <p className="text-xs text-destructive font-medium">
                  Stopped at {stoppedBranch}
                </p>
                {stoppedStep?.has_conflicts && stoppedDetail?.worktree_path && stoppedDetail?.worktree_name && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 gap-1 px-2 text-xs"
                    onClick={() =>
                      openClaudeCascadeResolve(
                        stoppedDetail.worktree_path!,
                        stoppedDetail.worktree_name!,
                        repoPath,
                        stack.name,
                        stoppedBranch,
                      )
                    }
                  >
                    <Bot className="h-3 w-3" />
                    Resolve with Claude
                  </Button>
                )}
                {stoppedDetail?.worktree_path && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 gap-1 px-2 text-xs text-destructive hover:text-destructive"
                    onClick={() =>
                      rebaseActionMutation.mutate({
                        repoPath,
                        worktreePath: stoppedDetail.worktree_path!,
                        action: "abort",
                      })
                    }
                  >
                    <XCircle className="h-3 w-3" />
                    Abort
                  </Button>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-1 border-t px-3 py-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              disabled={isBusy}
              onClick={handleCascadeRebase}
            >
              {cascadeRebaseMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <IterationCcw className="h-3 w-3" />
              )}
              Cascade Rebase
            </Button>
          </TooltipTrigger>
          <TooltipContent>Rebase each branch onto its predecessor</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              disabled={isBusy}
              onClick={() =>
                pushMutation.mutate({ repoPath, stackName: stack.name, force: true })
              }
            >
              {pushMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <ArrowUpFromLine className="h-3 w-3" />
              )}
              Push All
            </Button>
          </TooltipTrigger>
          <TooltipContent>Force-push all branches</TooltipContent>
        </Tooltip>

        {ghAvailable && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  disabled={isBusy}
                  onClick={() =>
                    createPrsMutation.mutate({ repoPath, stackName: stack.name, isDraft: false })
                  }
                >
                  {createPrsMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <GitPullRequest className="h-3 w-3" />
                  )}
                  Create PRs
                </Button>
              </TooltipTrigger>
              <TooltipContent>Create GitHub PRs for branches without one</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  disabled={isBusy}
                  onClick={() =>
                    updatePrBasesMutation.mutate({ repoPath, stackName: stack.name })
                  }
                >
                  {updatePrBasesMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <GitPullRequest className="h-3 w-3" />
                  )}
                  Update Bases
                </Button>
              </TooltipTrigger>
              <TooltipContent>Update PR base branches to match stack order</TooltipContent>
            </Tooltip>
          </>
        )}

        <div className="ml-auto flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => setAddBranchOpen(true)}
              >
                <Plus className="h-3 w-3" />
                Add Branch
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add a new branch to the top of the stack</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete Stack</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <AddBranchDialog
        open={addBranchOpen}
        onOpenChange={setAddBranchOpen}
        repoPath={repoPath}
        stackName={stack.name}
      />
      <DeleteStackDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        repoPath={repoPath}
        stack={stack}
      />
    </div>
  );
}
