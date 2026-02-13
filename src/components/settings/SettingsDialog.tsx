import { useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { FolderOpen } from "lucide-react";
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

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rootPath: string | null;
  onSave: (path: string) => void;
}

export function SettingsDialog({
  open,
  onOpenChange,
  rootPath,
  onSave,
}: SettingsDialogProps) {
  const [path, setPath] = useState(rootPath ?? "");

  const handleBrowse = async () => {
    const selected = await openDialog({
      directory: true,
      title: "Select Root Folder",
    });
    if (selected) {
      setPath(selected);
    }
  };

  const handleSave = () => {
    if (path) {
      onSave(path);
      onOpenChange(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (val) setPath(rootPath ?? "");
        onOpenChange(val);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure the root folder to scan for git repositories with
            worktrees.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Root Folder</Label>
          <div className="flex gap-2">
            <Input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="C:\Users\..."
            />
            <Button variant="outline" size="icon" onClick={handleBrowse}>
              <FolderOpen className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            The app will recursively scan this folder for git repositories that
            have worktrees.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!path}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
