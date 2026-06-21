import { useState } from "react";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from "../ui/pagination";

export const meta = {
  title: "Pagination",
  description: "Page links as ghost-glass tiles; the active page glows like a secondary button.",
  minH: "min-h-[130px]",
};

const TOTAL = 10;

export default function Demo() {
  const [page, setPage] = useState(4);
  const go = (p: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    setPage(Math.min(TOTAL, Math.max(1, p)));
  };

  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious href="#" onClick={go(page - 1)} />
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#" size="sm" isActive={page === 1} onClick={go(1)}>
            1
          </PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationEllipsis />
        </PaginationItem>
        {[page - 1, page, page + 1]
          .filter((p) => p > 1 && p < TOTAL)
          .map((p) => (
            <PaginationItem key={p}>
              <PaginationLink href="#" size="sm" isActive={page === p} onClick={go(p)}>
                {p}
              </PaginationLink>
            </PaginationItem>
          ))}
        <PaginationItem>
          <PaginationEllipsis />
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#" size="sm" isActive={page === TOTAL} onClick={go(TOTAL)}>
            {TOTAL}
          </PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationNext href="#" onClick={go(page + 1)} />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
