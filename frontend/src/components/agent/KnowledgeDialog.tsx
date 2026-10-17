import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createKnowledge, deleteKnowledge, updateKnowledge } from "@/lib/api";
import type { KnowledgeItem } from "@/types";

const SOURCES: { value: KnowledgeItem["source"]; label: string }[] = [
  { value: "staff", label: "Added by staff" },
  { value: "document", label: "From a document" },
  { value: "faq", label: "From the FAQs" },
];

export function KnowledgeDialog({
  open,
  onOpenChange,
  editing,
  seed,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: KnowledgeItem | null;
  /** pre-fills a new entry when the user teaches the agent from a call */
  seed?: { title: string; body: string } | null;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [source, setSource] = useState<KnowledgeItem["source"]>("staff");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(editing?.title ?? seed?.title ?? "");
    setBody(editing?.body ?? seed?.body ?? "");
    setSource(editing?.source ?? "staff");
    setError("");
  }, [open, editing, seed]);

  const mutation = useMutation({
    mutationFn: () =>
      editing
        ? updateKnowledge(editing.id, { title, body, source })
        : createKnowledge({ title, body, source }),
    onSuccess: () => {
      toast.success(editing ? "Knowledge updated" : "Added to the knowledge base", {
        description: "The agent will use this on the next call.",
      });
      qc.invalidateQueries({ queryKey: ["knowledge"] });
      onOpenChange(false);
    },
    onError: () => toast.error("Couldn't save this entry."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit knowledge" : "Teach the agent"}</DialogTitle>
          <DialogDescription>
            Anything here can be quoted by the agent when a caller asks about it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="kb-title">Title</Label>
            <Input
              id="kb-title"
              className="mt-1.5"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Insurance and TPA accepted"
            />
          </div>
          <div>
            <Label htmlFor="kb-body">What the agent should know</Label>
            <Textarea
              id="kb-body"
              className="mt-1.5 min-h-[120px]"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="We accept Star Health, HDFC Ergo and Care Health."
            />
          </div>
          <div>
            <Label htmlFor="kb-source">Source</Label>
            <Select value={source} onValueChange={(v) => setSource(v as KnowledgeItem["source"])}>
              <SelectTrigger id="kb-source" className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-[12px] font-medium text-signal">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={mutation.isPending}
            onClick={() => {
              if (!title.trim() || !body.trim()) {
                setError("Both a title and a body are needed.");
                return;
              }
              mutation.mutate();
            }}
          >
            {mutation.isPending ? "Saving" : editing ? "Save changes" : "Add to knowledge"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteKnowledgeDialog({
  item,
  onOpenChange,
}: {
  item: KnowledgeItem | null;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (id: string) => deleteKnowledge(id),
    onSuccess: () => {
      toast.success("Removed from the knowledge base");
      qc.invalidateQueries({ queryKey: ["knowledge"] });
      onOpenChange(false);
    },
    onError: () => toast.error("Couldn't remove this entry."),
  });

  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remove this entry?</DialogTitle>
          <DialogDescription>
            {item?.title} will no longer be available to the agent on calls.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Keep it
          </Button>
          <Button
            variant="signal"
            disabled={mutation.isPending}
            onClick={() => item && mutation.mutate(item.id)}
          >
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

