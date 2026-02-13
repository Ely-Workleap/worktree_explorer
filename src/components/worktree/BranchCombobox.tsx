import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { BranchInfo } from "@/types";

interface BranchComboboxProps {
  branches: BranchInfo[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
}

export function BranchCombobox({
  branches,
  value,
  onValueChange,
  placeholder = "Select branch...",
}: BranchComboboxProps) {
  const [open, setOpen] = useState(false);

  const selectedBranch = branches.find((b) => b.name === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">
            {selectedBranch
              ? `${selectedBranch.name}${selectedBranch.is_head ? " (HEAD)" : ""}`
              : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0">
        <Command>
          <CommandInput placeholder="Search branches..." />
          <CommandList>
            <CommandEmpty>No branch found.</CommandEmpty>
            <CommandGroup>
              {branches.map((b) => (
                <CommandItem
                  key={b.name}
                  value={b.name}
                  onSelect={(currentValue) => {
                    onValueChange(currentValue === value ? "" : currentValue);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === b.name ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {b.name}
                  {b.is_head ? " (HEAD)" : ""}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
