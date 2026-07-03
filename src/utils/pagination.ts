import { Request } from "express";

export interface Pagination {
  page: number;
  limit: number;
  from: number;
  to: number;
}

export const getPagination = (req: Request): Pagination => {
  const page = Math.max(parseInt(String(req.query.page ?? "1"), 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "20"), 10) || 20, 1), 100);
  const from = (page - 1) * limit;
  return { page, limit, from, to: from + limit - 1 };
};
