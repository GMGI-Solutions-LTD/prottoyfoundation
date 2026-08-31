import { useEffect, useState, ReactNode } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: ReactNode;
  confirmWord?: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
}

/**
 * Two-step delete confirmation: user must type the confirm word
 * (default "DELETE") before the destructive action becomes enabled.
 */
export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title = "Delete?",
  description,
  confirmWord = "DELETE",
  confirmLabel = "Delete",
  onConfirm,
}: Props) {
  const [text, setText] = useState("");
  useEffect(() => {
    if (!open) setText("");
  }, [open]);
  const enabled = text.trim().toUpperCase() === confirmWord.toUpperCase();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="confirm-word">
            Type <span className="font-mono font-semibold">{confirmWord}</span> to confirm
          </Label>
          <Input
            id="confirm-word"
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoComplete="off"
            autoFocus
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!enabled}
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
