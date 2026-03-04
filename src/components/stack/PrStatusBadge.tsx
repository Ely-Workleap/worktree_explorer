import { ExternalLink } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { PrStatus } from "@/types";

interface PrStatusBadgeProps {
  pr: PrStatus;
}

function getPrColor(pr: PrStatus) {
  if (pr.state === "MERGED") return "border-purple-500/50 text-purple-600";
  if (pr.state === "CLOSED") return "border-gray-500/50 text-gray-500";
  if (pr.is_draft) return "border-gray-400/50 text-gray-500";
  if (pr.review_decision === "APPROVED") return "border-green-500/50 text-green-600";
  if (pr.review_decision === "CHANGES_REQUESTED") return "border-red-500/50 text-red-600";
  return "border-yellow-500/50 text-yellow-600";
}

function getChecksLabel(status: string | null) {
  if (!status) return null;
  if (status === "SUCCESS") return "Checks passing";
  if (status === "FAILURE") return "Checks failing";
  if (status === "PENDING") return "Checks running";
  return status;
}

export function PrStatusBadge({ pr }: PrStatusBadgeProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={`gap-1 cursor-pointer ${getPrColor(pr)}`}
          onClick={(e) => {
            e.stopPropagation();
            open(pr.url);
          }}
        >
          #{pr.number}
          <ExternalLink className="h-2.5 w-2.5" />
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <div className="space-y-1">
          <p className="font-medium">{pr.title}</p>
          <p className="text-xs">
            {pr.is_draft ? "Draft" : pr.state}{" "}
            {pr.review_decision && `\u00B7 ${pr.review_decision.replace(/_/g, " ").toLowerCase()}`}
          </p>
          {pr.checks_status && (
            <p className="text-xs">{getChecksLabel(pr.checks_status)}</p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
