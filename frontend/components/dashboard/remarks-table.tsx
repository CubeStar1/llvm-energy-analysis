import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Remark } from "@/lib/types";

type RemarksTableProps = {
  remarks: Remark[];
};

export function RemarksTable({ remarks }: RemarksTableProps) {
  return (
    <ScrollArea className="h-[36rem] rounded-[1.4rem] border border-border/70 bg-background/85">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Pass</TableHead>
            <TableHead>Function</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Message</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {remarks.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                Run analysis to populate remarks.
              </TableCell>
            </TableRow>
          ) : (
            remarks.map((remark, index) => (
              <TableRow key={`${remark.function}-${remark.line}-${index}`}>
                <TableCell>
                  <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
                    {remark.pass}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono">{remark.function}</TableCell>
                <TableCell className="font-mono text-muted-foreground">
                  {remark.file ? `${remark.file}:${remark.line ?? "?"}` : "—"}
                </TableCell>
                <TableCell className="max-w-xl whitespace-normal text-sm leading-6">
                  {remark.message}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}
